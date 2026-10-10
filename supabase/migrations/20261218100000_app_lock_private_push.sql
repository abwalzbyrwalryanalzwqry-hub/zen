-- ════════════════════════════════════════════════════════════════════
-- قفل التطبيق 1.29.0 — إشعارات خاصة وتحليلات القفل (تدقيق القفل، M6 والمرحلة 4)
--   • native_push_tokens.private_preview: جهاز فعّل قفل زِن مع «إخفاء نص الإشعارات» يتلقى إشعاراً عاماً
--     («زِن — لديك إشعار جديد») بخصوصية PRIVATE بدل العنوان والنص، فلا تظهر الأسماء والرسائل على شاشة
--     قفل الجهاز ولا في الشريط لمن يمسك الهاتف وزِن مقفل. الرابط يبقى (يُفتح خلف شاشة القفل).
--   • set_native_push_private: صاحب الرمز وحده يغيّره (الجهاز الحامل للرمز، كما في save_native_push_token).
--   • claim_push_batch يضيف private إلى كل رمز أصلي؛ بقية الحقول والسلوك كما هي.
--   • أحداث استعمال مجمّعة بلا معرّف للقفل: lock_active، lock_recovered، lock_pin_unavailable.
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE public.native_push_tokens
  ADD COLUMN IF NOT EXISTS private_preview boolean NOT NULL DEFAULT false;

-- رمز جديد لنفس الجهاز يبدأ عاماً، ثم يزامن التطبيق الخيار مباشرة بعد التسجيل.
CREATE OR REPLACE FUNCTION public.set_native_push_private(_token text, _private boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
  n integer;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;
  UPDATE public.native_push_tokens
     SET private_preview = COALESCE(_private, false)
   WHERE token = _token AND user_id = caller;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END;
$$;
REVOKE ALL ON FUNCTION public.set_native_push_private(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_native_push_private(text, boolean) TO authenticated;

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
         || COALESCE((SELECT jsonb_agg(jsonb_build_object('token', t.token, 'platform', t.platform,
                                                          'private', t.private_preview))
                        FROM public.native_push_tokens t WHERE t.user_id = c.user_id), '[]'::jsonb)
    FROM claimed c;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_push_batch(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_push_batch(integer) TO service_role;

-- الأحداث المسموحة (أي غيرها يُتجاهل): أحداث القفل الثلاثة تُعدّ مجمّعة بلا أي معرّف.
CREATE OR REPLACE FUNCTION public.usage_events_allowed()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT ARRAY['app_open', 'mushaf_open', 'assistant_ask', 'exam_done', 'recite_done',
               'room_join', 'session_recorded', 'share_card',
               'lock_active', 'lock_recovered', 'lock_pin_unavailable']
$$;
REVOKE ALL ON FUNCTION public.usage_events_allowed() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.usage_events_allowed() TO authenticated;
