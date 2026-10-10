-- ════════════════════════════════════════════════════════════════════
-- خطة الإصلاح: H4 (مزامنة حالة القراءة) وH3 (منطقة زمنية لكل مستخدم).
--
-- H4: العلامات والختمة وسجل القراءة كانت في localStorage وحده، فتضيع بحذف التطبيق أو تغيير الهاتف.
--     الآن تُحفظ مع الحساب في quran_reading_state: صف واحد لكل مستخدم، وكل حقل بوقت تعديله على الجهاز،
--     والدمج «الأحدث يغلب» لكل حقل على حدة داخل sync_quran_state (معاملة واحدة، بلا كتابة مباشرة).
--     العمود user_id يُدخل الجدول في export_my_data وdelete_my_account تلقائياً (القاعدة 27).
--
-- H3: zen_today() كانت بتوقيت عدن للجميع. الآن بتوقيت المستخدم المستدعي إن عُرف (notification_prefs.timezone،
--     يضبطه الجهاز عبر set_my_timezone)، وعدن افتراضياً للمهام المجدولة ومن لم يُضبط توقيته.
-- ════════════════════════════════════════════════════════════════════

-- ─── H3: المنطقة الزمنية ───

-- توقيت المستدعي فقط (لا تقبل معرّف مستخدم آخر). في private لأن zen_today تُستدعى من سياسات (القاعدة 36).
CREATE OR REPLACE FUNCTION private.caller_timezone()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.timezone FROM public.notification_prefs p WHERE p.user_id = (SELECT auth.uid())
$$;
REVOKE ALL ON FUNCTION private.caller_timezone() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.caller_timezone() TO authenticated, service_role;

-- التعريف نفسه (STABLE وsql وsearch_path) سوى مصدر المنطقة؛ CREATE OR REPLACE يُبقي الدالة نفسها
-- فتبقى القيم الافتراضية للأعمدة والسياسات المعتمدة عليها كما هي.
CREATE OR REPLACE FUNCTION public.zen_today()
RETURNS date
LANGUAGE sql
STABLE
SET search_path = public
AS $$ SELECT (now() AT TIME ZONE COALESCE(private.caller_timezone(), 'Asia/Aden'))::date $$;

-- يضبط الجهاز منطقته عند فتح التطبيق إن تغيّرت. ينشئ صف التفضيلات بالقيم الافتراضية إن لم يوجد
-- (القيم الافتراضية تطابق غياب الصف: الإشعارات مفعّلة، بلا ساعات هدوء ولا تذكيرات).
CREATE OR REPLACE FUNCTION public.set_my_timezone(_timezone text)
RETURNS text
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
  IF _timezone IS NULL OR length(_timezone) > 64
     OR NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = _timezone) THEN
    RAISE EXCEPTION 'INVALID_TIMEZONE';
  END IF;
  INSERT INTO public.notification_prefs AS p (user_id, timezone, updated_at)
  VALUES (caller, _timezone, now())
  ON CONFLICT (user_id) DO UPDATE
    SET timezone = EXCLUDED.timezone, updated_at = now()
    WHERE p.timezone IS DISTINCT FROM EXCLUDED.timezone;
  RETURN _timezone;
END;
$$;
REVOKE ALL ON FUNCTION public.set_my_timezone(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_my_timezone(text) TO authenticated;

-- ─── H4: حالة القراءة ───

CREATE TABLE IF NOT EXISTS public.quran_reading_state (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  bookmarks jsonb CHECK (bookmarks IS NULL OR jsonb_typeof(bookmarks) = 'array'),
  bookmarks_at timestamptz,
  khatmah jsonb CHECK (khatmah IS NULL OR jsonb_typeof(khatmah) = 'object'),
  khatmah_at timestamptz,
  history jsonb CHECK (history IS NULL OR jsonb_typeof(history) = 'object'),
  history_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- حدود الحجم: العلامات حتى 2000 تقريباً، والسجل 40 موضعاً وأيام القراءة.
  CHECK (bookmarks IS NULL OR octet_length(bookmarks::text) <= 400000),
  CHECK (khatmah IS NULL OR octet_length(khatmah::text) <= 50000),
  CHECK (history IS NULL OR octet_length(history::text) <= 100000)
);
ALTER TABLE public.quran_reading_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.quran_reading_state FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.quran_reading_state TO authenticated;
GRANT ALL ON public.quran_reading_state TO service_role;
CREATE POLICY "own reading state read" ON public.quran_reading_state
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

-- يدمج ما أرسله الجهاز (حقل بوقت أحدث من المحفوظ يغلب) ويعيد الحالة كاملة بعد الدمج.
-- حقل بلا وقت لا يُرسل شيئاً (قراءة فقط؛ وLEAST وحدها تتجاهل NULL فتعيد now()، لذلك CASE). وقت في المستقبل (ساعة الجهاز متقدّمة) يُقصّ إلى الآن.
CREATE OR REPLACE FUNCTION public.sync_quran_state(
  _bookmarks jsonb DEFAULT NULL,
  _bookmarks_at timestamptz DEFAULT NULL,
  _khatmah jsonb DEFAULT NULL,
  _khatmah_at timestamptz DEFAULT NULL,
  _history jsonb DEFAULT NULL,
  _history_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
  s public.quran_reading_state;
  b_at timestamptz := CASE WHEN _bookmarks_at IS NULL THEN NULL ELSE LEAST(_bookmarks_at, now()) END;
  k_at timestamptz := CASE WHEN _khatmah_at IS NULL THEN NULL ELSE LEAST(_khatmah_at, now()) END;
  h_at timestamptz := CASE WHEN _history_at IS NULL THEN NULL ELSE LEAST(_history_at, now()) END;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;
  IF (_bookmarks_at IS NOT NULL AND (_bookmarks IS NULL OR jsonb_typeof(_bookmarks) <> 'array'))
     OR (_khatmah_at IS NOT NULL AND (_khatmah IS NULL OR jsonb_typeof(_khatmah) <> 'object'))
     OR (_history_at IS NOT NULL AND (_history IS NULL OR jsonb_typeof(_history) <> 'object')) THEN
    RAISE EXCEPTION 'INVALID_STATE';
  END IF;

  INSERT INTO public.quran_reading_state (user_id) VALUES (caller) ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO s FROM public.quran_reading_state WHERE user_id = caller FOR UPDATE;

  IF b_at IS NOT NULL AND (s.bookmarks_at IS NULL OR b_at > s.bookmarks_at) THEN
    s.bookmarks := _bookmarks;
    s.bookmarks_at := b_at;
  END IF;
  IF k_at IS NOT NULL AND (s.khatmah_at IS NULL OR k_at > s.khatmah_at) THEN
    s.khatmah := _khatmah;
    s.khatmah_at := k_at;
  END IF;
  IF h_at IS NOT NULL AND (s.history_at IS NULL OR h_at > s.history_at) THEN
    s.history := _history;
    s.history_at := h_at;
  END IF;

  UPDATE public.quran_reading_state
     SET bookmarks = s.bookmarks, bookmarks_at = s.bookmarks_at,
         khatmah = s.khatmah, khatmah_at = s.khatmah_at,
         history = s.history, history_at = s.history_at,
         updated_at = now()
   WHERE user_id = caller;

  RETURN jsonb_build_object(
    'bookmarks', s.bookmarks, 'bookmarks_at', s.bookmarks_at,
    'khatmah', s.khatmah, 'khatmah_at', s.khatmah_at,
    'history', s.history, 'history_at', s.history_at
  );
END;
$$;
REVOKE ALL ON FUNCTION public.sync_quran_state(jsonb, timestamptz, jsonb, timestamptz, jsonb, timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_quran_state(jsonb, timestamptz, jsonb, timestamptz, jsonb, timestamptz)
  TO authenticated;
