-- المرحلة 15: إشعارات أصلية (FCM) لتطبيق أندرويد المغلَّف بـ Capacitor.
--
-- جدول مستقل لرموز الأجهزة بدل خلطها باشتراكات Web Push (بنيتا المفتاح مختلفتان). يمرّ الإرسال في
-- المسار نفسه: notifications → push_outbox → claim_push_batch → المرسِل → finish_push، فتسري
-- التفضيلات وساعات الهدوء والتذكيرات اليومية على الجهازين معاً دون تكرار منطق.
-- الرموز تُحذف مع الحساب (user_id ON DELETE CASCADE) وتدخل في export_my_data (قاعدة HANDOFF 27).

-- ─── 1) رموز الأجهزة ───
CREATE TABLE public.native_push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE CHECK (length(token) BETWEEN 20 AND 4096 AND token ~ '^[A-Za-z0-9_:\-]+$'),
  platform text NOT NULL CHECK (platform IN ('android', 'ios')),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_success_at timestamptz
);
CREATE INDEX native_push_tokens_user_idx ON public.native_push_tokens (user_id);
ALTER TABLE public.native_push_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.native_push_tokens FROM anon, authenticated;
GRANT SELECT, DELETE ON public.native_push_tokens TO authenticated;
GRANT ALL ON public.native_push_tokens TO service_role;
CREATE POLICY "own native tokens read" ON public.native_push_tokens
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY "own native tokens delete" ON public.native_push_tokens
  FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));

-- ─── 2) دوال المستخدم ───
-- الرمز يصدره FCM للجهاز نفسه ولا يُقرأ لغير صاحبه، فالجهاز الذي يقدّمه هو حامله: إن سجّل مستخدم
-- آخر دخوله على الجهاز نفسه انتقل الرمز إليه (فلا تصل إشعارات الحساب السابق إلى الجهاز).
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
  INSERT INTO public.native_push_tokens (user_id, token, platform)
  VALUES (caller, _token, _platform)
  ON CONFLICT (token) DO UPDATE
     SET user_id = caller, platform = EXCLUDED.platform, created_at = now(), last_success_at = NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.save_native_push_token(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_native_push_token(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_native_push_token(_token text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.native_push_tokens WHERE token = _token AND user_id = auth.uid()
$$;
REVOKE ALL ON FUNCTION public.remove_native_push_token(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_native_push_token(text) TO authenticated;

-- ─── 3) المسار المشترك: وجود جهاز من أي نوع يكفي للإرسال ───
CREATE OR REPLACE FUNCTION public.push_allowed(_user uuid, _category text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (EXISTS (SELECT 1 FROM public.push_subscriptions s WHERE s.user_id = _user)
          OR EXISTS (SELECT 1 FROM public.native_push_tokens t WHERE t.user_id = _user))
     AND COALESCE(
           (SELECT p.push_enabled AND COALESCE((p.categories ->> _category)::boolean, true)
              FROM public.notification_prefs p WHERE p.user_id = _user),
           true)
$$;
REVOKE ALL ON FUNCTION public.push_allowed(uuid, text) FROM PUBLIC, anon, authenticated;

-- التوقيع نفسه: الرموز الأصلية تُضاف إلى مصفوفة subscriptions بعنصر {token, platform}، ويميّزها
-- المرسِل بغياب endpoint.
CREATE OR REPLACE FUNCTION public.claim_push_batch(_limit integer DEFAULT 50)
RETURNS TABLE (id uuid, user_id uuid, category text, title text, body text, url text, subscriptions jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.push_outbox o
   WHERE (o.sent_at IS NOT NULL OR o.failed_at IS NOT NULL) AND o.created_at < now() - interval '7 days';
  UPDATE public.push_outbox o SET failed_at = now()
   WHERE o.sent_at IS NULL AND o.failed_at IS NULL AND o.attempts >= 5;

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
    RETURNING o.id, o.user_id, o.category, o.title, o.body, o.url
  )
  SELECT c.id, c.user_id, c.category, c.title, c.body, c.url,
         COALESCE((SELECT jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
                     FROM public.push_subscriptions s WHERE s.user_id = c.user_id), '[]'::jsonb)
         || COALESCE((SELECT jsonb_agg(jsonb_build_object('token', t.token, 'platform', t.platform))
                        FROM public.native_push_tokens t WHERE t.user_id = c.user_id), '[]'::jsonb)
    FROM claimed c;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_push_batch(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_push_batch(integer) TO service_role;

-- المعرّفات في _delivered/_gone روابط Web Push أو رموز FCM؛ لا تداخل بين الصيغتين
-- (الرابط يبدأ بـ https:// والرمز لا يحوي «/»).
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
  DELETE FROM public.push_subscriptions s
   WHERE s.user_id = owner AND s.endpoint = ANY (COALESCE(_gone, '{}'));
  DELETE FROM public.native_push_tokens t
   WHERE t.user_id = owner AND t.token = ANY (COALESCE(_gone, '{}'));
  UPDATE public.push_subscriptions s SET last_success_at = now()
   WHERE s.user_id = owner AND s.endpoint = ANY (COALESCE(_delivered, '{}'));
  UPDATE public.native_push_tokens t SET last_success_at = now()
   WHERE t.user_id = owner AND t.token = ANY (COALESCE(_delivered, '{}'));
  IF COALESCE(array_length(_delivered, 1), 0) > 0
     OR (NOT EXISTS (SELECT 1 FROM public.push_subscriptions s WHERE s.user_id = owner)
         AND NOT EXISTS (SELECT 1 FROM public.native_push_tokens t WHERE t.user_id = owner)) THEN
    UPDATE public.push_outbox o SET sent_at = now() WHERE o.id = _id;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.finish_push(uuid, text[], text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_push(uuid, text[], text[]) TO service_role;
