-- المرحلة 10: إشعارات Web Push من الخادم، وتفضيلات لكل نوع مع ساعات هدوء، وتذكيرات يومية مجدولة.
--
-- المسار:
--   1. كل صف يُدرج في notifications (من أي مصدر قائم: واجب، تقييم، غياب لولي الأمر، غرف، أوسمة…)
--      يمرّ على المشغّل enqueue_push: إن كان للمستخدم اشتراك Push وسمحت تفضيلاته بالفئة، يُضاف إلى
--      push_outbox بموعد إرسال يحترم ساعات الهدوء.
--   2. enqueue_daily_reminders() (مجدولة، لا تُمنح للمسجّلين) تضيف تذكير الورد والمحاسبة في وقت كل
--      مستخدم المحلي، مرة واحدة في اليوم (dedupe_key).
--   3. الخادم (service_role) يسحب الدفعة claim_push_batch ويرسل ويختم finish_push، ويحذف الاشتراكات
--      المنتهية (404/410).
-- الجداول الثلاثة تُحذف مع الحساب (user_id) وتدخل في export_my_data تلقائياً (قاعدة HANDOFF 27).

-- ─── 1) الاشتراكات ───
CREATE TABLE public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE CHECK (endpoint ~ '^https://' AND length(endpoint) <= 1000),
  p256dh text NOT NULL CHECK (length(p256dh) BETWEEN 80 AND 100),
  auth text NOT NULL CHECK (length(auth) BETWEEN 16 AND 30),
  user_agent text CHECK (length(user_agent) <= 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_success_at timestamptz
);
CREATE INDEX push_subscriptions_user_idx ON public.push_subscriptions (user_id);
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_subscriptions FROM anon, authenticated;
GRANT SELECT, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;
CREATE POLICY "own push subscriptions read" ON public.push_subscriptions
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY "own push subscriptions delete" ON public.push_subscriptions
  FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));

-- ─── 2) التفضيلات ───
CREATE TABLE public.notification_prefs (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  push_enabled boolean NOT NULL DEFAULT true,
  -- الفئة الغائبة مفعّلة. {"grades": false} يوقف إشعارات التقييم وحدها.
  categories jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(categories) = 'object'),
  quiet_start time,
  quiet_end time,
  timezone text NOT NULL DEFAULT 'Asia/Aden',
  wird_time time,
  muhasaba_time time,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((quiet_start IS NULL) = (quiet_end IS NULL))
);
ALTER TABLE public.notification_prefs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notification_prefs FROM anon, authenticated;
GRANT SELECT ON public.notification_prefs TO authenticated;
GRANT ALL ON public.notification_prefs TO service_role;
CREATE POLICY "own notification prefs read" ON public.notification_prefs
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

-- ─── 3) صندوق الإرسال (service_role فقط، بلا سياسات عمداً) ───
CREATE TABLE public.push_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_id uuid REFERENCES public.notifications(id) ON DELETE CASCADE,
  category text NOT NULL,
  title text NOT NULL,
  body text,
  url text NOT NULL DEFAULT '/notifications',
  send_after timestamptz NOT NULL DEFAULT now(),
  dedupe_key text UNIQUE,
  attempts int NOT NULL DEFAULT 0,
  claimed_at timestamptz,
  sent_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX push_outbox_due_idx ON public.push_outbox (send_after)
  WHERE sent_at IS NULL AND failed_at IS NULL;
CREATE INDEX push_outbox_user_idx ON public.push_outbox (user_id);
ALTER TABLE public.push_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_outbox FROM anon, authenticated;
GRANT ALL ON public.push_outbox TO service_role;

-- ─── 4) أدوات ───
CREATE OR REPLACE FUNCTION public.push_category(_kind text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _kind = 'assignment' THEN 'assignments'
    WHEN _kind = 'assessment' THEN 'grades'
    WHEN _kind IN ('guardian', 'guardian_weekly') THEN 'family'
    WHEN _kind IN ('announcement', 'room', 'room_report') THEN 'rooms'
    WHEN _kind IN ('achievement', 'certificate', 'challenge') THEN 'achievements'
    ELSE 'general'
  END
$$;

-- أول لحظة يُسمح فيها بالإرسال: _at نفسها، أو نهاية ساعات الهدوء إن وقعت فيها.
CREATE OR REPLACE FUNCTION public.push_release_at(_user uuid, _at timestamptz)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.notification_prefs%ROWTYPE;
  loc timestamp;
  t time;
BEGIN
  SELECT * INTO p FROM public.notification_prefs WHERE user_id = _user;
  IF NOT FOUND OR p.quiet_start IS NULL OR p.quiet_start = p.quiet_end THEN
    RETURN _at;
  END IF;
  loc := _at AT TIME ZONE p.timezone;
  t := loc::time;
  IF p.quiet_start < p.quiet_end THEN
    IF t >= p.quiet_start AND t < p.quiet_end THEN
      RETURN (loc::date + p.quiet_end) AT TIME ZONE p.timezone;
    END IF;
  ELSE
    -- فترة تعبر منتصف الليل، مثل 22:00–06:00
    IF t >= p.quiet_start THEN
      RETURN (loc::date + 1 + p.quiet_end) AT TIME ZONE p.timezone;
    ELSIF t < p.quiet_end THEN
      RETURN (loc::date + p.quiet_end) AT TIME ZONE p.timezone;
    END IF;
  END IF;
  RETURN _at;
END;
$$;
REVOKE ALL ON FUNCTION public.push_release_at(uuid, timestamptz) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.push_allowed(_user uuid, _category text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.push_subscriptions s WHERE s.user_id = _user)
     AND COALESCE(
           (SELECT p.push_enabled AND COALESCE((p.categories ->> _category)::boolean, true)
              FROM public.notification_prefs p WHERE p.user_id = _user),
           true)
$$;
REVOKE ALL ON FUNCTION public.push_allowed(uuid, text) FROM PUBLIC, anon, authenticated;

-- ─── 5) من الإشعار إلى صندوق الإرسال ───
CREATE OR REPLACE FUNCTION public.enqueue_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cat text := public.push_category(NEW.kind);
BEGIN
  IF NOT public.push_allowed(NEW.user_id, cat) THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.push_outbox (user_id, notification_id, category, title, body, url, send_after)
  VALUES (NEW.user_id, NEW.id, cat, left(NEW.title, 120), left(NEW.body, 240),
          CASE WHEN NEW.link ~ '^/[A-Za-z0-9/_\-$?=&.]*$' THEN NEW.link ELSE '/notifications' END,
          public.push_release_at(NEW.user_id, now()));
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enqueue_push() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS enqueue_push ON public.notifications;
CREATE TRIGGER enqueue_push
  AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_push();

-- ─── 6) دوال المستخدم ───
CREATE OR REPLACE FUNCTION public.save_push_subscription(
  _endpoint text, _p256dh text, _auth text, _user_agent text DEFAULT NULL)
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
  -- الرابط نفسه لمستخدم آخر (جهاز مشترك): لا يُنقل إلا إن طابقت المفاتيح التي لا يعرفها إلا المتصفح.
  INSERT INTO public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  VALUES (caller, _endpoint, _p256dh, _auth, left(_user_agent, 200))
  ON CONFLICT (endpoint) DO UPDATE
     SET user_id = caller, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
         user_agent = EXCLUDED.user_agent
   WHERE push_subscriptions.user_id = caller
      OR (push_subscriptions.p256dh = EXCLUDED.p256dh AND push_subscriptions.auth = EXCLUDED.auth);
  IF NOT EXISTS (SELECT 1 FROM public.push_subscriptions WHERE endpoint = _endpoint AND user_id = caller) THEN
    RAISE EXCEPTION 'SUBSCRIPTION_CONFLICT';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.save_push_subscription(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_push_subscription(text, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_push_subscription(_endpoint text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.push_subscriptions WHERE endpoint = _endpoint AND user_id = auth.uid()
$$;
REVOKE ALL ON FUNCTION public.remove_push_subscription(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_push_subscription(text) TO authenticated;

-- يستبدل التفضيلات كلها. المفاتيح المجهولة في categories تُرفض، وكذلك المنطقة الزمنية المجهولة.
CREATE OR REPLACE FUNCTION public.set_notification_prefs(
  _push_enabled boolean,
  _categories jsonb,
  _quiet_start time,
  _quiet_end time,
  _timezone text,
  _wird_time time,
  _muhasaba_time time)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
  k text;
  v jsonb;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;
  IF _categories IS NULL OR jsonb_typeof(_categories) <> 'object' THEN
    RAISE EXCEPTION 'INVALID_CATEGORIES';
  END IF;
  FOR k, v IN SELECT * FROM jsonb_each(_categories) LOOP
    IF k NOT IN ('assignments', 'grades', 'family', 'rooms', 'achievements', 'general', 'wird', 'muhasaba')
       OR jsonb_typeof(v) <> 'boolean' THEN
      RAISE EXCEPTION 'INVALID_CATEGORIES';
    END IF;
  END LOOP;
  IF (_quiet_start IS NULL) <> (_quiet_end IS NULL) THEN
    RAISE EXCEPTION 'INVALID_QUIET_HOURS';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = _timezone) THEN
    RAISE EXCEPTION 'INVALID_TIMEZONE';
  END IF;
  INSERT INTO public.notification_prefs AS p
    (user_id, push_enabled, categories, quiet_start, quiet_end, timezone, wird_time, muhasaba_time, updated_at)
  VALUES (caller, COALESCE(_push_enabled, true), _categories, _quiet_start, _quiet_end, _timezone,
          _wird_time, _muhasaba_time, now())
  ON CONFLICT (user_id) DO UPDATE
     SET push_enabled = EXCLUDED.push_enabled, categories = EXCLUDED.categories,
         quiet_start = EXCLUDED.quiet_start, quiet_end = EXCLUDED.quiet_end,
         timezone = EXCLUDED.timezone, wird_time = EXCLUDED.wird_time,
         muhasaba_time = EXCLUDED.muhasaba_time, updated_at = now();
END;
$$;
REVOKE ALL ON FUNCTION public.set_notification_prefs(boolean, jsonb, time, time, text, time, time) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_notification_prefs(boolean, jsonb, time, time, text, time, time) TO authenticated;

-- ─── 7) التذكيرات اليومية (مجدولة؛ service_role فقط؛ آمنة للتكرار) ───
-- تُضاف في أول تشغيل بعد وقت المستخدم المحلي بحدّ ثلاث ساعات في اليوم نفسه (لا تذكير قديم إن
-- توقّف المجدول، ولا لفّ بعد منتصف الليل).
CREATE OR REPLACE FUNCTION public.enqueue_daily_reminders(_now timestamptz DEFAULT now())
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer := 0;
  added integer;
BEGIN
  INSERT INTO public.push_outbox (user_id, category, title, body, url, send_after, dedupe_key)
  SELECT p.user_id, 'wird', 'وردك اليوم',
         'حان وقت وردك من القرآن. سجّله حين تنتهي.', '/quran',
         public.push_release_at(p.user_id, _now),
         'wird:' || p.user_id || ':' || (_now AT TIME ZONE p.timezone)::date
    FROM public.notification_prefs p
   WHERE p.wird_time IS NOT NULL
     AND ((_now AT TIME ZONE p.timezone)::time - p.wird_time) >= interval '0'
     AND ((_now AT TIME ZONE p.timezone)::time - p.wird_time) < interval '3 hours'
     AND public.push_allowed(p.user_id, 'wird')
  ON CONFLICT (dedupe_key) DO NOTHING;
  GET DIAGNOSTICS added = ROW_COUNT;
  n := n + added;

  INSERT INTO public.push_outbox (user_id, category, title, body, url, send_after, dedupe_key)
  SELECT p.user_id, 'muhasaba', 'محاسبة اليوم',
         'دقيقتان مع نفسك قبل النوم.', '/muhasaba',
         public.push_release_at(p.user_id, _now),
         'muhasaba:' || p.user_id || ':' || (_now AT TIME ZONE p.timezone)::date
    FROM public.notification_prefs p
   WHERE p.muhasaba_time IS NOT NULL
     AND ((_now AT TIME ZONE p.timezone)::time - p.muhasaba_time) >= interval '0'
     AND ((_now AT TIME ZONE p.timezone)::time - p.muhasaba_time) < interval '3 hours'
     AND public.push_allowed(p.user_id, 'muhasaba')
  ON CONFLICT (dedupe_key) DO NOTHING;
  GET DIAGNOSTICS added = ROW_COUNT;
  RETURN n + added;
END;
$$;
REVOKE ALL ON FUNCTION public.enqueue_daily_reminders(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_daily_reminders(timestamptz) TO service_role;

-- ─── 8) الإرسال (service_role فقط) ───
-- يحجز دفعة مستحقة لدقيقتين (لا يرسلها مرسِلان معاً) ويعيدها مع اشتراكات أصحابها.
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
    FROM claimed c;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_push_batch(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_push_batch(integer) TO service_role;

-- يختم نتيجة الإرسال: يحذف الاشتراكات المنتهية لصاحب الرسالة، ويعلّم الرسالة مرسلة إن وصلت
-- إلى جهاز واحد على الأقل أو لم يبقَ له جهاز. وإلا تبقى لإعادة المحاولة بعد انتهاء الحجز.
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
  UPDATE public.push_subscriptions s SET last_success_at = now()
   WHERE s.user_id = owner AND s.endpoint = ANY (COALESCE(_delivered, '{}'));
  IF COALESCE(array_length(_delivered, 1), 0) > 0
     OR NOT EXISTS (SELECT 1 FROM public.push_subscriptions s WHERE s.user_id = owner) THEN
    UPDATE public.push_outbox o SET sent_at = now() WHERE o.id = _id;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.finish_push(uuid, text[], text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_push(uuid, text[], text[]) TO service_role;
