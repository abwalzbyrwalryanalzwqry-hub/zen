-- موثوقية الإشعارات (مراجعة قسم الإشعارات كاملاً).
--
-- 1) save_native_push_token متكرّر الأمان: يستدعيه التطبيق عند كل تشغيل ليعيد تسجيل جهاز حذفه الخادم
--    (رد FCM بـ UNREGISTERED، أو تنظيف). صار التحديث لا يمسح last_success_at ولا created_at إلا عند تغيّر
--    صاحب الرمز، فلا تضيع «آخر وصول» عند كل فتح، ولا ينتقل وضع الخصوصية من حساب إلى آخر على الجهاز نفسه.
-- 2) اشتراكات الويب (push_subscriptions) لم يعد لها مُرسِل منذ انتقال التطبيق إلى FCM، لكنها كانت:
--    تجعل push_allowed صحيحاً لمستخدم بلا جهاز حقيقي فيُدرج صفوف لا تصل، وتمنع finish_push من إغلاق الصف
--    فيُعاد خمس مرات ثم يُعلَّم فاشلاً. صار المسار كله على native_push_tokens وحدها (الجدول باقٍ بلا مساس).
-- 3) claim_push_batch يعيد notification_id ليحمله الإشعار، فيُعلَّم مقروءاً حين ينقر المستخدم عليه في الجوال،
--    ويُسقط الصفوف المتأخرة أكثر من 12 ساعة (تذكير ورد الأمس أو تراكم أثناء عطل) بدل إغراق الجهاز بها دفعة.
-- 4) إرسال فوري: مشغّل على push_outbox يوقظ zen-push-dispatch عبر pg_net بالسرّين نفسيهما في Vault
--    (zen_push_dispatch_url و zen_push_dispatch_secret)، فلا تنتظر الإشعارات دورة المجدول (حتى دقيقة) ولا
--    تعتمد على أن يوقظها التطبيق. المشغّل لا يُفشل أي إدراج أبداً، ويُخمد نفسه 3 ثوانٍ بين إيقاظين،
--    والمجدول يبقى شبكة الأمان لما فات.

-- ─── 1) حفظ الرمز ───
CREATE OR REPLACE FUNCTION public.save_native_push_token(_token text, _platform text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;
  INSERT INTO public.native_push_tokens AS t (user_id, token, platform)
  VALUES (caller, _token, _platform)
  ON CONFLICT (token) DO UPDATE
     SET platform = EXCLUDED.platform,
         user_id = caller,
         created_at = CASE WHEN t.user_id = caller THEN t.created_at ELSE now() END,
         last_success_at = CASE WHEN t.user_id = caller THEN t.last_success_at ELSE NULL END,
         private_preview = CASE WHEN t.user_id = caller THEN t.private_preview ELSE false END;
END;
$$;
REVOKE ALL ON FUNCTION public.save_native_push_token(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_native_push_token(text, text) TO authenticated;

-- ─── 2) الأجهزة الأصلية وحدها ───
CREATE OR REPLACE FUNCTION public.push_allowed(_user uuid, _category text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.native_push_tokens t WHERE t.user_id = _user)
     AND COALESCE(
           (SELECT p.push_enabled AND COALESCE((p.categories ->> _category)::boolean, true)
              FROM public.notification_prefs p WHERE p.user_id = _user),
           true)
$$;
REVOKE ALL ON FUNCTION public.push_allowed(uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.finish_push(_id uuid, _delivered text[], _gone text[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  owner uuid;
BEGIN
  SELECT o.user_id INTO owner FROM public.push_outbox o WHERE o.id = _id;
  IF owner IS NULL THEN
    RETURN;
  END IF;
  DELETE FROM public.native_push_tokens t
   WHERE t.user_id = owner AND t.token = ANY (COALESCE(_gone, '{}'));
  UPDATE public.native_push_tokens t SET last_success_at = now()
   WHERE t.user_id = owner AND t.token = ANY (COALESCE(_delivered, '{}'));
  -- يُغلق الصف إن وصل إلى جهاز واحد على الأقل، أو لم يبقَ للمستخدم جهاز يُعاد إليه.
  IF COALESCE(array_length(_delivered, 1), 0) > 0
     OR NOT EXISTS (SELECT 1 FROM public.native_push_tokens t WHERE t.user_id = owner) THEN
    UPDATE public.push_outbox o SET sent_at = now() WHERE o.id = _id;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.finish_push(uuid, text[], text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_push(uuid, text[], text[]) TO service_role;

-- ─── 3) السحب: notification_id + إسقاط المتأخر ───
-- تغيّر شكل الصف المُعاد فيلزم الحذف ثم الإنشاء. المُرسِل القديم يتجاهل العمود الزائد، والجديد يتحمّل غيابه،
-- فلا يهمّ أيّهما يُنشر أولاً.
DROP FUNCTION IF EXISTS public.claim_push_batch(integer);
CREATE FUNCTION public.claim_push_batch(_limit integer DEFAULT 50)
RETURNS TABLE (id uuid, user_id uuid, category text, title text, body text, url text,
               subscriptions jsonb, notification_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.push_outbox o
   WHERE (o.sent_at IS NOT NULL OR o.failed_at IS NOT NULL) AND o.created_at < now() - interval '7 days';
  UPDATE public.push_outbox o SET failed_at = now()
   WHERE o.sent_at IS NULL AND o.failed_at IS NULL
     AND (o.attempts >= 5 OR o.send_after < now() - interval '12 hours');

  RETURN QUERY
  WITH due AS (
    SELECT o.id FROM public.push_outbox o
     WHERE o.sent_at IS NULL AND o.failed_at IS NULL AND o.send_after <= now()
       AND (o.claimed_at IS NULL OR o.claimed_at < now() - interval '2 minutes')
     ORDER BY o.send_after
     LIMIT LEAST(GREATEST(_limit, 1), 200)
     FOR UPDATE SKIP LOCKED
  ), claimed AS (
    UPDATE public.push_outbox o SET claimed_at = now(), attempts = o.attempts + 1
      FROM due WHERE o.id = due.id
    RETURNING o.id, o.user_id, o.category, o.title, o.body, o.url, o.notification_id
  )
  SELECT c.id, c.user_id, c.category, c.title, c.body, c.url,
         COALESCE((SELECT jsonb_agg(jsonb_build_object('token', t.token, 'platform', t.platform,
                                                       'private', t.private_preview))
                     FROM public.native_push_tokens t WHERE t.user_id = c.user_id), '[]'::jsonb),
         c.notification_id
    FROM claimed c;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_push_batch(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_push_batch(integer) TO service_role;

-- ─── 4) الإيقاظ الفوري ───
CREATE TABLE IF NOT EXISTS public.push_dispatch_state (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_kick_at timestamptz NOT NULL DEFAULT 'epoch'
);
ALTER TABLE public.push_dispatch_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_dispatch_state FROM PUBLIC, anon, authenticated;
INSERT INTO public.push_dispatch_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.push_outbox_kick()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _url text;
  _secret text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM new_rows r
                  WHERE r.sent_at IS NULL AND r.failed_at IS NULL AND r.send_after <= now()) THEN
    RETURN NULL;
  END IF;
  IF to_regnamespace('net') IS NULL OR to_regclass('vault.decrypted_secrets') IS NULL THEN
    RETURN NULL;
  END IF;
  -- إخماد: إيقاظ واحد كل 3 ثوانٍ، ومن يجد غيره يوقظ الآن لا ينتظره (SKIP LOCKED).
  PERFORM 1 FROM public.push_dispatch_state s
    WHERE s.id = 1 AND s.last_kick_at < now() - interval '3 seconds'
    FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  UPDATE public.push_dispatch_state SET last_kick_at = now() WHERE id = 1;

  EXECUTE $q$SELECT (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'zen_push_dispatch_url'),
                    (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'zen_push_dispatch_secret')$q$
     INTO _url, _secret;
  IF _url IS NULL OR _secret IS NULL THEN
    RETURN NULL;
  END IF;
  -- pg_net يُرسل بعد الالتزام (الطلب صفّ في طابوره)، فيرى المُرسِل الصفوف الجديدة.
  EXECUTE 'SELECT net.http_post(url := $1, headers := $2, body := $3, timeout_milliseconds := 30000)'
    USING _url,
          jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || _secret),
          '{"reminders":false}'::jsonb;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- الإيقاظ تحسين للسرعة فقط؛ لا يُفشل إدراج إشعار أبداً، والمجدول يلتقط الصف.
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.push_outbox_kick() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS push_outbox_kick_ins ON public.push_outbox;
CREATE TRIGGER push_outbox_kick_ins
  AFTER INSERT ON public.push_outbox
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.push_outbox_kick();
