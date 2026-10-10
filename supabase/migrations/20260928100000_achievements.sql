-- ════════════════════════════════════════════════════════════════════
-- المرحلة 12: التحفيز والإنجازات
--
-- 1) أيام الالتزام: يوم الالتزام هو يوم فيه ورد مسجَّل، أو سجل مصحف، أو تسميع،
--    أو حضور. تُعرض السلسلة الحالية وأفضل سلسلة، ومعها «أيام الالتزام في 30
--    يوماً» حتى لا يكون انكسار السلسلة هو الرسالة الوحيدة.
-- 2) الأوسمة: سورة أو حزب أو جزء اكتملت صفحاته كلها «حفظاً» في سجل المصحف
--    (الذي يكتبه المعلّم)، وأوسمة التزام عند 7 و30 و100 يوم متتالية. تُمنح من
--    مُشغّل في قاعدة البيانات فقط، ولا تُسحب إذا حُذف سجل لاحقاً.
-- 3) شهادات إتمام الجزء: تُنشأ «بانتظار الاعتماد» مع وسام الجزء، ويعتمدها معلّم
--    الطالب أو يردّها. المعتمدة فقط تُصدَّر صورةً.
-- 4) لوحة شرف للحلقة، يفعّلها المعلّم، ترتّب بأيام الالتزام لا بالدرجات.
-- 5) تحديات جماعية للحلقة: ختمة (30 جزءاً يحجزها الأعضاء) أو هدف صفحات.
--
-- حدود الوحدات بصفحات مصحف المدينة من بيانات Tanzil الوصفية (CC BY 3.0)،
-- مولّدة من src/data/quran-divisions.json ويتحقق منها اختبار وحدات.
-- المحاسبة الشخصية لا تدخل في أي حساب هنا.
--
-- الفحوص: supabase/tests/checks.sql (53–58).
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.zen_today()
RETURNS date
LANGUAGE sql
STABLE
SET search_path = public
AS $$ SELECT (now() AT TIME ZONE 'Asia/Aden')::date $$;
GRANT EXECUTE ON FUNCTION public.zen_today() TO authenticated, service_role;

-- ─── 0) وحدات المصحف ───
CREATE TABLE IF NOT EXISTS public.quran_units (
  kind text NOT NULL CHECK (kind IN ('surah', 'hizb', 'juz')),
  no smallint NOT NULL,
  first_page smallint NOT NULL CHECK (first_page BETWEEN 1 AND 604),
  last_page smallint NOT NULL CHECK (last_page BETWEEN 1 AND 604),
  name text,
  PRIMARY KEY (kind, no),
  CHECK (last_page >= first_page)
);
ALTER TABLE public.quran_units ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.quran_units FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.quran_units TO authenticated;
GRANT ALL ON public.quran_units TO service_role;
DROP POLICY IF EXISTS "read quran units" ON public.quran_units;
CREATE POLICY "read quran units" ON public.quran_units FOR SELECT TO authenticated USING (true);

DELETE FROM public.quran_units;
INSERT INTO public.quran_units (kind, no, first_page, last_page, name) VALUES
  ('surah',1,1,1,'الفاتحة'), ('surah',2,2,49,'البقرة'), ('surah',3,50,76,'آل عمران'), ('surah',4,77,106,'النساء'), ('surah',5,106,127,'المائدة'), ('surah',6,128,150,'الأنعام'),
  ('surah',7,151,176,'الأعراف'), ('surah',8,177,186,'الأنفال'), ('surah',9,187,207,'التوبة'), ('surah',10,208,221,'يونس'), ('surah',11,221,235,'هود'), ('surah',12,235,248,'يوسف'),
  ('surah',13,249,255,'الرعد'), ('surah',14,255,261,'إبراهيم'), ('surah',15,262,267,'الحجر'), ('surah',16,267,281,'النحل'), ('surah',17,282,293,'الإسراء'), ('surah',18,293,304,'الكهف'),
  ('surah',19,305,312,'مريم'), ('surah',20,312,321,'طه'), ('surah',21,322,331,'الأنبياء'), ('surah',22,332,341,'الحج'), ('surah',23,342,349,'المؤمنون'), ('surah',24,350,359,'النور'),
  ('surah',25,359,366,'الفرقان'), ('surah',26,367,376,'الشعراء'), ('surah',27,377,385,'النمل'), ('surah',28,385,396,'القصص'), ('surah',29,396,404,'العنكبوت'), ('surah',30,404,410,'الروم'),
  ('surah',31,411,414,'لقمان'), ('surah',32,415,417,'السجدة'), ('surah',33,418,427,'الأحزاب'), ('surah',34,428,434,'سبإ'), ('surah',35,434,440,'فاطر'), ('surah',36,440,445,'يس'),
  ('surah',37,446,452,'الصافات'), ('surah',38,453,458,'ص'), ('surah',39,458,467,'الزمر'), ('surah',40,467,476,'غافر'), ('surah',41,477,482,'فصلت'), ('surah',42,483,489,'الشورى'),
  ('surah',43,489,495,'الزخرف'), ('surah',44,496,498,'الدخان'), ('surah',45,499,502,'الجاثية'), ('surah',46,502,506,'الأحقاف'), ('surah',47,507,510,'محمد'), ('surah',48,511,515,'الفتح'),
  ('surah',49,515,517,'الحجرات'), ('surah',50,518,520,'ق'), ('surah',51,520,523,'الذاريات'), ('surah',52,523,525,'الطور'), ('surah',53,526,528,'النجم'), ('surah',54,528,531,'القمر'),
  ('surah',55,531,534,'الرحمن'), ('surah',56,534,537,'الواقعة'), ('surah',57,537,541,'الحديد'), ('surah',58,542,545,'المجادلة'), ('surah',59,545,548,'الحشر'), ('surah',60,549,551,'الممتحنة'),
  ('surah',61,551,552,'الصف'), ('surah',62,553,554,'الجمعة'), ('surah',63,554,555,'المنافقون'), ('surah',64,556,557,'التغابن'), ('surah',65,558,559,'الطلاق'), ('surah',66,560,561,'التحريم'),
  ('surah',67,562,564,'الملك'), ('surah',68,564,566,'القلم'), ('surah',69,566,568,'الحاقة'), ('surah',70,568,570,'المعارج'), ('surah',71,570,571,'نوح'), ('surah',72,572,573,'الجن'),
  ('surah',73,574,575,'المزمل'), ('surah',74,575,577,'المدثر'), ('surah',75,577,578,'القيامة'), ('surah',76,578,580,'الإنسان'), ('surah',77,580,581,'المرسلات'), ('surah',78,582,583,'النبإ'),
  ('surah',79,583,584,'النازعات'), ('surah',80,585,585,'عبس'), ('surah',81,586,586,'التكوير'), ('surah',82,587,587,'الانفطار'), ('surah',83,587,589,'المطففين'), ('surah',84,589,589,'الانشقاق'),
  ('surah',85,590,590,'البروج'), ('surah',86,591,591,'الطارق'), ('surah',87,591,592,'الأعلى'), ('surah',88,592,592,'الغاشية'), ('surah',89,593,594,'الفجر'), ('surah',90,594,594,'البلد'),
  ('surah',91,595,595,'الشمس'), ('surah',92,595,596,'الليل'), ('surah',93,596,596,'الضحى'), ('surah',94,596,596,'الشرح'), ('surah',95,597,597,'التين'), ('surah',96,597,597,'العلق'),
  ('surah',97,598,598,'القدر'), ('surah',98,598,599,'البينة'), ('surah',99,599,599,'الزلزلة'), ('surah',100,599,600,'العاديات'), ('surah',101,600,600,'القارعة'), ('surah',102,600,600,'التكاثر'),
  ('surah',103,601,601,'العصر'), ('surah',104,601,601,'الهمزة'), ('surah',105,601,601,'الفيل'), ('surah',106,602,602,'قريش'), ('surah',107,602,602,'الماعون'), ('surah',108,602,602,'الكوثر'),
  ('surah',109,603,603,'الكافرون'), ('surah',110,603,603,'النصر'), ('surah',111,603,603,'المسد'), ('surah',112,604,604,'الإخلاص'), ('surah',113,604,604,'الفلق'), ('surah',114,604,604,'الناس'),
  ('hizb',1,1,11,NULL), ('hizb',2,11,21,NULL), ('hizb',3,22,31,NULL), ('hizb',4,32,41,NULL), ('hizb',5,42,51,NULL), ('hizb',6,51,62,NULL),
  ('hizb',7,62,72,NULL), ('hizb',8,72,81,NULL), ('hizb',9,82,92,NULL), ('hizb',10,92,101,NULL), ('hizb',11,102,112,NULL), ('hizb',12,112,121,NULL),
  ('hizb',13,121,131,NULL), ('hizb',14,132,141,NULL), ('hizb',15,142,150,NULL), ('hizb',16,151,161,NULL), ('hizb',17,162,172,NULL), ('hizb',18,173,181,NULL),
  ('hizb',19,182,192,NULL), ('hizb',20,192,201,NULL), ('hizb',21,201,211,NULL), ('hizb',22,212,221,NULL), ('hizb',23,222,231,NULL), ('hizb',24,231,241,NULL),
  ('hizb',25,242,251,NULL), ('hizb',26,252,261,NULL), ('hizb',27,262,272,NULL), ('hizb',28,272,281,NULL), ('hizb',29,282,292,NULL), ('hizb',30,292,301,NULL),
  ('hizb',31,302,312,NULL), ('hizb',32,312,321,NULL), ('hizb',33,322,331,NULL), ('hizb',34,332,341,NULL), ('hizb',35,342,351,NULL), ('hizb',36,352,361,NULL),
  ('hizb',37,362,371,NULL), ('hizb',38,371,381,NULL), ('hizb',39,382,391,NULL), ('hizb',40,392,401,NULL), ('hizb',41,402,413,NULL), ('hizb',42,413,421,NULL),
  ('hizb',43,422,431,NULL), ('hizb',44,431,441,NULL), ('hizb',45,442,451,NULL), ('hizb',46,451,461,NULL), ('hizb',47,462,471,NULL), ('hizb',48,472,481,NULL),
  ('hizb',49,482,491,NULL), ('hizb',50,491,502,NULL), ('hizb',51,502,513,NULL), ('hizb',52,513,521,NULL), ('hizb',53,522,531,NULL), ('hizb',54,531,541,NULL),
  ('hizb',55,542,552,NULL), ('hizb',56,553,561,NULL), ('hizb',57,562,571,NULL), ('hizb',58,572,581,NULL), ('hizb',59,582,591,NULL), ('hizb',60,591,604,NULL),
  ('juz',1,1,21,NULL), ('juz',2,22,41,NULL), ('juz',3,42,62,NULL), ('juz',4,62,81,NULL), ('juz',5,82,101,NULL), ('juz',6,102,121,NULL),
  ('juz',7,121,141,NULL), ('juz',8,142,161,NULL), ('juz',9,162,181,NULL), ('juz',10,182,201,NULL), ('juz',11,201,221,NULL), ('juz',12,222,241,NULL),
  ('juz',13,242,261,NULL), ('juz',14,262,281,NULL), ('juz',15,282,301,NULL), ('juz',16,302,321,NULL), ('juz',17,322,341,NULL), ('juz',18,342,361,NULL),
  ('juz',19,362,381,NULL), ('juz',20,382,401,NULL), ('juz',21,402,421,NULL), ('juz',22,422,441,NULL), ('juz',23,442,461,NULL), ('juz',24,462,481,NULL),
  ('juz',25,482,502,NULL), ('juz',26,502,521,NULL), ('juz',27,522,541,NULL), ('juz',28,542,561,NULL), ('juz',29,562,581,NULL), ('juz',30,582,604,NULL);

CREATE OR REPLACE FUNCTION public.unit_label(_kind text, _no int)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE _kind
    WHEN 'surah' THEN 'سورة ' || COALESCE((SELECT name FROM public.quran_units WHERE kind = 'surah' AND no = _no), _no::text)
    WHEN 'hizb' THEN 'الحزب ' || _no
    WHEN 'juz' THEN 'الجزء ' || _no
    WHEN 'streak' THEN _no || ' يوماً من الالتزام'
    ELSE _kind || ' ' || _no
  END
$$;
GRANT EXECUTE ON FUNCTION public.unit_label(text, int) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_halaqa_member(_uid uuid, _halaqa uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _uid IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.halaqa_students WHERE halaqa_id = _halaqa AND student_id = _uid)
$$;
REVOKE ALL ON FUNCTION public.is_halaqa_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_halaqa_member(uuid, uuid) TO authenticated, service_role;

-- ─── 1) الورد اليومي وأيام الالتزام ───
CREATE TABLE IF NOT EXISTS public.daily_wird (
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day date NOT NULL,
  pages smallint CHECK (pages IS NULL OR pages BETWEEN 1 AND 604),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, day)
);
ALTER TABLE public.daily_wird ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.daily_wird FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.daily_wird TO authenticated;
GRANT ALL ON public.daily_wird TO service_role;

DROP POLICY IF EXISTS "wird read" ON public.daily_wird;
CREATE POLICY "wird read" ON public.daily_wird FOR SELECT TO authenticated
  USING (student_id = (SELECT auth.uid())
         OR public.teaches_student((SELECT auth.uid()), student_id)
         OR public.is_guardian_of((SELECT auth.uid()), student_id));
-- يُسجَّل اليوم أو الأمس فقط — لا ملء لأيام سابقة.
DROP POLICY IF EXISTS "wird insert own" ON public.daily_wird;
CREATE POLICY "wird insert own" ON public.daily_wird FOR INSERT TO authenticated
  WITH CHECK (student_id = (SELECT auth.uid())
              AND day BETWEEN public.zen_today() - 1 AND public.zen_today());
DROP POLICY IF EXISTS "wird delete own" ON public.daily_wird;
CREATE POLICY "wird delete own" ON public.daily_wird FOR DELETE TO authenticated
  USING (student_id = (SELECT auth.uid()) AND day >= public.zen_today() - 1);

-- أيام النشاط من سجلات التطبيق (لا من المحاسبة الشخصية).
CREATE OR REPLACE FUNCTION public.student_activity_days(_student uuid, _since date)
RETURNS TABLE (day date)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT w.day FROM public.daily_wird w WHERE w.student_id = _student AND w.day >= _since
  UNION
  SELECT m.session_date FROM public.mushaf_records m WHERE m.student_id = _student AND m.session_date >= _since
  UNION
  SELECT (r.created_at AT TIME ZONE 'Asia/Aden')::date FROM public.recitation_sessions r
   WHERE r.student_id = _student AND r.created_at >= _since::timestamp AT TIME ZONE 'Asia/Aden'
  UNION
  SELECT a.session_date FROM public.attendance a
   WHERE a.student_id = _student AND a.status IN ('present', 'late') AND a.session_date >= _since
$$;
REVOKE ALL ON FUNCTION public.student_activity_days(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.student_activity_days(uuid, date) TO service_role;

-- السلسلة: أيام متتالية تنتهي اليوم أو أمس (فلا تنكسر قبل انقضاء اليوم).
CREATE OR REPLACE FUNCTION public.streak_of(_student uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH d AS (
    SELECT DISTINCT day FROM public.student_activity_days(_student, public.zen_today() - 400)
     WHERE day <= public.zen_today()
  ), g AS (
    SELECT day, day - (row_number() OVER (ORDER BY day))::int AS grp FROM d
  ), runs AS (
    SELECT max(day) AS last_day, count(*)::int AS n FROM g GROUP BY grp
  )
  SELECT jsonb_build_object(
    'current', COALESCE((SELECT n FROM runs WHERE last_day >= public.zen_today() - 1), 0),
    'best', COALESCE((SELECT max(n) FROM runs), 0),
    'active_30', (SELECT count(*) FROM d WHERE day > public.zen_today() - 30),
    'today', EXISTS (SELECT 1 FROM d WHERE day = public.zen_today()),
    'wird_today', EXISTS (SELECT 1 FROM public.daily_wird w
                           WHERE w.student_id = _student AND w.day = public.zen_today()),
    'last_day', (SELECT max(day) FROM d)
  )
$$;
REVOKE ALL ON FUNCTION public.streak_of(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.streak_of(uuid) TO service_role;

-- ─── 2) الأوسمة ───
CREATE TABLE IF NOT EXISTS public.student_badges (
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('surah', 'hizb', 'juz', 'streak')),
  no smallint NOT NULL,
  earned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, kind, no)
);
CREATE INDEX IF NOT EXISTS student_badges_earned_idx ON public.student_badges (student_id, earned_at DESC);
ALTER TABLE public.student_badges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.student_badges FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.student_badges TO authenticated;
GRANT ALL ON public.student_badges TO service_role;
DROP POLICY IF EXISTS "badges read" ON public.student_badges;
CREATE POLICY "badges read" ON public.student_badges FOR SELECT TO authenticated
  USING (student_id = (SELECT auth.uid())
         OR public.teaches_student((SELECT auth.uid()), student_id)
         OR public.is_guardian_of((SELECT auth.uid()), student_id));

-- ─── 3) شهادات إتمام الجزء ───
CREATE TABLE IF NOT EXISTS public.certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  juz smallint NOT NULL CHECK (juz BETWEEN 1 AND 30),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  serial text NOT NULL UNIQUE DEFAULT upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
  student_name text NOT NULL,
  halaqa_name text,
  center_name text,
  teacher_name text,
  teacher_note text CHECK (teacher_note IS NULL OR char_length(teacher_note) <= 300),
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, juz)
);
ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.certificates FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.certificates TO authenticated;
GRANT ALL ON public.certificates TO service_role;
DROP POLICY IF EXISTS "certificates read" ON public.certificates;
CREATE POLICY "certificates read" ON public.certificates FOR SELECT TO authenticated
  USING (student_id = (SELECT auth.uid())
         OR public.teaches_student((SELECT auth.uid()), student_id)
         OR public.is_guardian_of((SELECT auth.uid()), student_id));

-- يمنح ما استحقّه الطالب ولم يُمنح بعد، ويُنشئ طلب الشهادة، ويُشعر.
CREATE OR REPLACE FUNCTION public.award_badges(_student uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  streak int;
  labels text;
  n int;
  j record;
BEGIN
  IF _student IS NULL THEN RETURN 0; END IF;
  streak := (public.streak_of(_student)->>'current')::int;

  WITH pages AS (
    SELECT DISTINCT page FROM public.mushaf_records WHERE student_id = _student AND kind = 'memorize'
  ), done AS (
    SELECT u.kind, u.no FROM public.quran_units u
     WHERE (SELECT count(*) FROM pages p WHERE p.page BETWEEN u.first_page AND u.last_page)
           = u.last_page - u.first_page + 1
    UNION ALL
    SELECT 'streak', t FROM unnest(ARRAY[7, 30, 100]) t WHERE streak >= t
  ), ins AS (
    INSERT INTO public.student_badges (student_id, kind, no)
    SELECT _student, kind, no FROM done
    ON CONFLICT DO NOTHING
    RETURNING kind, no
  )
  SELECT count(*), string_agg(public.unit_label(kind, no), '، ' ORDER BY kind, no)
    INTO n, labels FROM ins;

  IF n = 0 THEN RETURN 0; END IF;

  -- طلب شهادة لكل جزء جديد، ومعلّمو الطالب يُشعَرون للاعتماد.
  FOR j IN
    SELECT b.no FROM public.student_badges b
     WHERE b.student_id = _student AND b.kind = 'juz'
       AND NOT EXISTS (SELECT 1 FROM public.certificates c WHERE c.student_id = _student AND c.juz = b.no)
  LOOP
    INSERT INTO public.certificates (student_id, juz, student_name, halaqa_name, center_name, teacher_name)
    SELECT _student, j.no,
           COALESCE((SELECT name FROM public.profiles WHERE id = _student), 'طالب'),
           h.name, c.name, (SELECT name FROM public.profiles WHERE id = h.teacher_id)
      FROM (SELECT 1) x
      LEFT JOIN LATERAL (
        SELECT h.* FROM public.halaqa_students hs JOIN public.halaqat h ON h.id = hs.halaqa_id
         WHERE hs.student_id = _student ORDER BY hs.created_at LIMIT 1) h ON true
      LEFT JOIN public.centers c ON c.id = h.center_id
    ON CONFLICT DO NOTHING;

    INSERT INTO public.notifications (user_id, kind, title, body, link)
    SELECT DISTINCT h.teacher_id, 'certificate', 'شهادة بانتظار اعتمادك',
           COALESCE((SELECT name FROM public.profiles WHERE id = _student), 'طالب')
             || ' أتمّ حفظ الجزء ' || j.no || '.', '/teacher'
      FROM public.halaqa_students hs JOIN public.halaqat h ON h.id = hs.halaqa_id
     WHERE hs.student_id = _student AND h.teacher_id IS NOT NULL;
  END LOOP;

  INSERT INTO public.notifications (user_id, kind, title, body, link)
  VALUES (_student, 'achievement', 'وسام جديد', 'بارك الله فيك: ' || labels || '.', '/achievements');
  PERFORM public.notify_guardians(_student, 'achievement', 'إنجاز جديد لابنك',
    COALESCE((SELECT name FROM public.profiles WHERE id = _student), 'ابنك') || ': ' || labels || '.');
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.award_badges(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.award_badges(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.award_badges_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.award_badges(NEW.student_id);
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.award_badges_trigger() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS award_badges_mushaf ON public.mushaf_records;
CREATE TRIGGER award_badges_mushaf AFTER INSERT OR UPDATE OF page, kind ON public.mushaf_records
  FOR EACH ROW EXECUTE FUNCTION public.award_badges_trigger();
DROP TRIGGER IF EXISTS award_badges_wird ON public.daily_wird;
CREATE TRIGGER award_badges_wird AFTER INSERT ON public.daily_wird
  FOR EACH ROW EXECUTE FUNCTION public.award_badges_trigger();
DROP TRIGGER IF EXISTS award_badges_attendance ON public.attendance;
CREATE TRIGGER award_badges_attendance AFTER INSERT OR UPDATE OF status ON public.attendance
  FOR EACH ROW WHEN (NEW.status IN ('present', 'late')) EXECUTE FUNCTION public.award_badges_trigger();
DROP TRIGGER IF EXISTS award_badges_recitation ON public.recitation_sessions;
CREATE TRIGGER award_badges_recitation AFTER INSERT ON public.recitation_sessions
  FOR EACH ROW EXECUTE FUNCTION public.award_badges_trigger();

-- اعتماد الشهادة أو ردّها: معلّم الطالب فقط.
CREATE OR REPLACE FUNCTION public.decide_certificate(_id uuid, _approve boolean, _note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c public.certificates;
  me uuid := auth.uid();
BEGIN
  SELECT * INTO c FROM public.certificates WHERE id = _id FOR UPDATE;
  IF c.id IS NULL OR me IS NULL OR NOT public.teaches_student(me, c.student_id) THEN
    RAISE EXCEPTION 'لا تملك اعتماد هذه الشهادة.';
  END IF;
  IF _note IS NOT NULL AND char_length(_note) > 300 THEN
    RAISE EXCEPTION 'الملاحظة أطول من 300 حرف.';
  END IF;
  UPDATE public.certificates
     SET status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
         teacher_note = NULLIF(btrim(COALESCE(_note, '')), ''),
         teacher_name = COALESCE((SELECT name FROM public.profiles WHERE id = me), teacher_name),
         decided_by = me, decided_at = now()
   WHERE id = _id;
  IF _approve THEN
    INSERT INTO public.notifications (user_id, kind, title, body, link)
    VALUES (c.student_id, 'certificate', 'اعتُمدت شهادتك',
            'شهادة إتمام حفظ الجزء ' || c.juz || ' جاهزة للمشاركة.', '/achievements');
    PERFORM public.notify_guardians(c.student_id, 'certificate', 'شهادة إتمام لابنك',
            c.student_name || ' أتمّ حفظ الجزء ' || c.juz || '، واعتمدها المعلّم.');
  END IF;
  RETURN jsonb_build_object('ok', true, 'status', CASE WHEN _approve THEN 'approved' ELSE 'rejected' END);
END;
$$;
REVOKE ALL ON FUNCTION public.decide_certificate(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_certificate(uuid, boolean, text) TO authenticated;

-- ملخّص الإنجازات لطالب: له ولمعلّمه ولولي أمره ولطاقم مركزه.
CREATE OR REPLACE FUNCTION public.student_achievements(_student uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
BEGIN
  IF me IS NULL OR NOT public.can_view_student_report(me, _student) THEN
    RAISE EXCEPTION 'لا تملك عرض إنجازات هذا الطالب.';
  END IF;
  RETURN jsonb_build_object(
    'student', (SELECT jsonb_build_object('id', id, 'name', name) FROM public.profiles WHERE id = _student),
    'streak', public.streak_of(_student),
    'memorized_pages', (SELECT count(DISTINCT page) FROM public.mushaf_records
                         WHERE student_id = _student AND kind = 'memorize'),
    'memorized', COALESCE((SELECT jsonb_agg(DISTINCT page) FROM public.mushaf_records
                            WHERE student_id = _student AND kind = 'memorize'), '[]'::jsonb),
    'badges', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                 'kind', kind, 'no', no, 'label', public.unit_label(kind, no), 'earned_at', earned_at)
                 ORDER BY earned_at DESC, kind, no)
               FROM public.student_badges WHERE student_id = _student), '[]'::jsonb),
    'certificates', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                 'id', id, 'juz', juz, 'status', status, 'serial', serial, 'student_name', student_name,
                 'halaqa_name', halaqa_name, 'center_name', center_name, 'teacher_name', teacher_name,
                 'teacher_note', teacher_note, 'decided_at', decided_at, 'created_at', created_at)
                 ORDER BY juz)
               FROM public.certificates WHERE student_id = _student), '[]'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.student_achievements(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.student_achievements(uuid) TO authenticated;

-- الشهادات المنتظرة لطلاب المعلّم.
CREATE OR REPLACE FUNCTION public.my_pending_certificates()
RETURNS TABLE (id uuid, student_id uuid, student_name text, juz smallint, halaqa_name text, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.student_id, c.student_name, c.juz, c.halaqa_name, c.created_at
    FROM public.certificates c
   WHERE c.status = 'pending' AND public.teaches_student(auth.uid(), c.student_id)
   ORDER BY c.created_at
$$;
REVOKE ALL ON FUNCTION public.my_pending_certificates() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_pending_certificates() TO authenticated;

-- ─── 4) لوحة الشرف ───
CREATE TABLE IF NOT EXISTS public.halaqa_honor_board (
  halaqa_id uuid PRIMARY KEY REFERENCES public.halaqat(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.halaqa_honor_board ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.halaqa_honor_board FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.halaqa_honor_board TO service_role;

CREATE OR REPLACE FUNCTION public.set_honor_board(_halaqa uuid, _enabled boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.manages_halaqa(auth.uid(), _halaqa) THEN
    RAISE EXCEPTION 'لوحة الشرف يفعّلها معلّم الحلقة.';
  END IF;
  INSERT INTO public.halaqa_honor_board (halaqa_id, enabled, updated_by, updated_at)
  VALUES (_halaqa, _enabled, auth.uid(), now())
  ON CONFLICT (halaqa_id) DO UPDATE
    SET enabled = EXCLUDED.enabled, updated_by = EXCLUDED.updated_by, updated_at = now();
END;
$$;
REVOKE ALL ON FUNCTION public.set_honor_board(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_honor_board(uuid, boolean) TO authenticated;

-- أيام الالتزام في 30 يوماً وعدد الأوسمة فقط — بلا درجات ولا نسب حضور.
CREATE OR REPLACE FUNCTION public.halaqa_honor_board(_halaqa uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  on_ boolean;
BEGIN
  IF me IS NULL OR NOT public.can_view_schedule(me, _halaqa) THEN
    RAISE EXCEPTION 'لا تملك عرض لوحة شرف هذه الحلقة.';
  END IF;
  on_ := COALESCE((SELECT enabled FROM public.halaqa_honor_board WHERE halaqa_id = _halaqa), false);
  IF NOT on_ THEN
    RETURN jsonb_build_object('enabled', false, 'can_manage', public.manages_halaqa(me, _halaqa), 'rows', '[]'::jsonb);
  END IF;
  RETURN jsonb_build_object(
    'enabled', true,
    'can_manage', public.manages_halaqa(me, _halaqa),
    'rows', COALESCE((
      SELECT jsonb_agg(to_jsonb(r) ORDER BY r.active_30 DESC, r.badges DESC, r.name)
        FROM (
          SELECT p.id AS student_id, p.name,
                 (public.streak_of(hs.student_id)->>'active_30')::int AS active_30,
                 (public.streak_of(hs.student_id)->>'current')::int AS streak,
                 (SELECT count(*) FROM public.student_badges b
                   WHERE b.student_id = hs.student_id AND b.kind <> 'streak')::int AS badges,
                 hs.student_id = me AS is_me
            FROM public.halaqa_students hs
            JOIN public.profiles p ON p.id = hs.student_id
           WHERE hs.halaqa_id = _halaqa
        ) r
       WHERE r.active_30 > 0
       LIMIT 20), '[]'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.halaqa_honor_board(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.halaqa_honor_board(uuid) TO authenticated;

-- ─── 5) التحديات الجماعية ───
CREATE TABLE IF NOT EXISTS public.halaqa_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  halaqa_id uuid NOT NULL REFERENCES public.halaqat(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 2 AND 80),
  kind text NOT NULL CHECK (kind IN ('khatma', 'pages')),
  target int NOT NULL CHECK (target BETWEEN 1 AND 100000),
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  completed_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on >= starts_on AND ends_on - starts_on <= 120),
  CHECK (kind <> 'khatma' OR target = 30)
);
CREATE INDEX IF NOT EXISTS halaqa_challenges_halaqa_idx ON public.halaqa_challenges (halaqa_id, ends_on DESC);
ALTER TABLE public.halaqa_challenges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.halaqa_challenges FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.halaqa_challenges TO authenticated;
GRANT ALL ON public.halaqa_challenges TO service_role;
DROP POLICY IF EXISTS "challenges read" ON public.halaqa_challenges;
CREATE POLICY "challenges read" ON public.halaqa_challenges FOR SELECT TO authenticated
  USING (public.can_view_schedule((SELECT auth.uid()), halaqa_id));
DROP POLICY IF EXISTS "challenges create" ON public.halaqa_challenges;
CREATE POLICY "challenges create" ON public.halaqa_challenges FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_schedule((SELECT auth.uid()), halaqa_id)
              AND created_by = (SELECT auth.uid()) AND completed_at IS NULL);
DROP POLICY IF EXISTS "challenges delete" ON public.halaqa_challenges;
CREATE POLICY "challenges delete" ON public.halaqa_challenges FOR DELETE TO authenticated
  USING (public.can_manage_schedule((SELECT auth.uid()), halaqa_id));

CREATE TABLE IF NOT EXISTS public.challenge_parts (
  challenge_id uuid NOT NULL REFERENCES public.halaqa_challenges(id) ON DELETE CASCADE,
  part smallint NOT NULL CHECK (part BETWEEN 1 AND 30),
  claimed_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  done_at timestamptz,
  PRIMARY KEY (challenge_id, part)
);
ALTER TABLE public.challenge_parts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.challenge_parts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.challenge_parts TO service_role;

CREATE TABLE IF NOT EXISTS public.challenge_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id uuid NOT NULL REFERENCES public.halaqa_challenges(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pages int NOT NULL CHECK (pages BETWEEN 1 AND 604),
  day date NOT NULL DEFAULT public.zen_today(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS challenge_logs_challenge_idx ON public.challenge_logs (challenge_id);
ALTER TABLE public.challenge_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.challenge_logs FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.challenge_logs TO service_role;

-- يُعلن اكتمال التحدي مرة واحدة لأعضاء الحلقة ومعلّمها.
CREATE OR REPLACE FUNCTION public.check_challenge_complete(_challenge uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ch public.halaqa_challenges;
  progress int;
BEGIN
  SELECT * INTO ch FROM public.halaqa_challenges WHERE id = _challenge FOR UPDATE;
  IF ch.id IS NULL OR ch.completed_at IS NOT NULL THEN RETURN; END IF;
  IF ch.kind = 'khatma' THEN
    SELECT count(*) INTO progress FROM public.challenge_parts WHERE challenge_id = _challenge AND done_at IS NOT NULL;
  ELSE
    SELECT COALESCE(sum(pages), 0) INTO progress FROM public.challenge_logs WHERE challenge_id = _challenge;
  END IF;
  IF progress < ch.target THEN RETURN; END IF;
  UPDATE public.halaqa_challenges SET completed_at = now() WHERE id = _challenge;
  INSERT INTO public.notifications (user_id, kind, title, body, link)
  SELECT u, 'challenge', 'اكتمل التحدي', 'اكتمل «' || ch.title || '» بفضل الله ثم بجهدكم.', '/achievements'
    FROM (SELECT student_id AS u FROM public.halaqa_students WHERE halaqa_id = ch.halaqa_id
          UNION SELECT teacher_id FROM public.halaqat WHERE id = ch.halaqa_id AND teacher_id IS NOT NULL) x;
END;
$$;
REVOKE ALL ON FUNCTION public.check_challenge_complete(uuid) FROM PUBLIC, anon, authenticated;

-- تحقق مشترك: العضو في حلقة التحدي والتحدي جارٍ.
CREATE OR REPLACE FUNCTION public.challenge_for_member(_challenge uuid)
RETURNS public.halaqa_challenges
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ch public.halaqa_challenges;
BEGIN
  SELECT * INTO ch FROM public.halaqa_challenges WHERE id = _challenge;
  IF ch.id IS NULL OR NOT public.is_halaqa_member(auth.uid(), ch.halaqa_id) THEN
    RAISE EXCEPTION 'التحدي لأعضاء الحلقة.';
  END IF;
  IF public.zen_today() NOT BETWEEN ch.starts_on AND ch.ends_on THEN
    RAISE EXCEPTION 'التحدي غير جارٍ الآن.';
  END IF;
  RETURN ch;
END;
$$;
REVOKE ALL ON FUNCTION public.challenge_for_member(uuid) FROM PUBLIC, anon, authenticated;

-- الختمة: حجز جزء، أو إتمامه، أو تركه. _action: claim | done | release
CREATE OR REPLACE FUNCTION public.challenge_part_action(_challenge uuid, _part int, _action text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ch public.halaqa_challenges := public.challenge_for_member(_challenge);
  me uuid := auth.uid();
  owner_ uuid;
BEGIN
  IF ch.kind <> 'khatma' THEN RAISE EXCEPTION 'هذا التحدي ليس ختمة.'; END IF;
  IF _part NOT BETWEEN 1 AND 30 THEN RAISE EXCEPTION 'رقم الجزء غير صحيح.'; END IF;
  SELECT claimed_by INTO owner_ FROM public.challenge_parts WHERE challenge_id = _challenge AND part = _part;

  IF _action = 'claim' THEN
    IF owner_ IS NOT NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'taken');
    END IF;
    IF (SELECT count(*) FROM public.challenge_parts
         WHERE challenge_id = _challenge AND claimed_by = me AND done_at IS NULL) >= 3 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'limit');
    END IF;
    INSERT INTO public.challenge_parts (challenge_id, part, claimed_by) VALUES (_challenge, _part, me)
    ON CONFLICT DO NOTHING;
  ELSIF owner_ IS DISTINCT FROM me THEN
    RAISE EXCEPTION 'هذا الجزء ليس محجوزاً لك.';
  ELSIF _action = 'done' THEN
    UPDATE public.challenge_parts SET done_at = now() WHERE challenge_id = _challenge AND part = _part;
    PERFORM public.check_challenge_complete(_challenge);
  ELSIF _action = 'release' THEN
    DELETE FROM public.challenge_parts WHERE challenge_id = _challenge AND part = _part AND done_at IS NULL;
  ELSE
    RAISE EXCEPTION 'إجراء غير معروف.';
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.challenge_part_action(uuid, int, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.challenge_part_action(uuid, int, text) TO authenticated;

-- هدف الصفحات: يسجّل العضو ما قرأه (حد 604 صفحة في المرة).
CREATE OR REPLACE FUNCTION public.log_challenge_pages(_challenge uuid, _pages int)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ch public.halaqa_challenges := public.challenge_for_member(_challenge);
BEGIN
  IF ch.kind <> 'pages' THEN RAISE EXCEPTION 'هذا التحدي بالأجزاء لا بالصفحات.'; END IF;
  IF _pages IS NULL OR _pages NOT BETWEEN 1 AND 604 THEN RAISE EXCEPTION 'عدد الصفحات بين 1 و604.'; END IF;
  IF (SELECT COALESCE(sum(pages), 0) FROM public.challenge_logs
       WHERE challenge_id = _challenge AND student_id = auth.uid() AND day = public.zen_today()) + _pages > 604 THEN
    RAISE EXCEPTION 'تجاوزت 604 صفحات لهذا اليوم.';
  END IF;
  INSERT INTO public.challenge_logs (challenge_id, student_id, pages) VALUES (_challenge, auth.uid(), _pages);
  PERFORM public.check_challenge_complete(_challenge);
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.log_challenge_pages(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_challenge_pages(uuid, int) TO authenticated;

-- تحديات الحلقة وتقدّمها.
CREATE OR REPLACE FUNCTION public.halaqa_challenges_view(_halaqa uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
BEGIN
  IF me IS NULL OR NOT public.can_view_schedule(me, _halaqa) THEN
    RAISE EXCEPTION 'لا تملك عرض تحديات هذه الحلقة.';
  END IF;
  RETURN jsonb_build_object(
    'can_manage', public.can_manage_schedule(me, _halaqa),
    'is_member', public.is_halaqa_member(me, _halaqa),
    'today', public.zen_today(),
    'challenges', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'title', c.title, 'kind', c.kind, 'target', c.target,
        'starts_on', c.starts_on, 'ends_on', c.ends_on, 'completed_at', c.completed_at,
        'progress', CASE WHEN c.kind = 'khatma'
          THEN (SELECT count(*) FROM public.challenge_parts p WHERE p.challenge_id = c.id AND p.done_at IS NOT NULL)
          ELSE (SELECT COALESCE(sum(l.pages), 0) FROM public.challenge_logs l WHERE l.challenge_id = c.id) END,
        'my_pages', (SELECT COALESCE(sum(l.pages), 0) FROM public.challenge_logs l
                      WHERE l.challenge_id = c.id AND l.student_id = me),
        'contributors', CASE WHEN c.kind = 'khatma'
          THEN (SELECT count(DISTINCT claimed_by) FROM public.challenge_parts p WHERE p.challenge_id = c.id)
          ELSE (SELECT count(DISTINCT student_id) FROM public.challenge_logs l WHERE l.challenge_id = c.id) END,
        'parts', CASE WHEN c.kind = 'khatma' THEN COALESCE((
          SELECT jsonb_agg(jsonb_build_object('part', p.part, 'name', pr.name,
                   'mine', p.claimed_by = me, 'done', p.done_at IS NOT NULL) ORDER BY p.part)
            FROM public.challenge_parts p JOIN public.profiles pr ON pr.id = p.claimed_by
           WHERE p.challenge_id = c.id), '[]'::jsonb) ELSE '[]'::jsonb END
      ) ORDER BY c.completed_at IS NOT NULL, c.ends_on DESC)
      FROM public.halaqa_challenges c
      WHERE c.halaqa_id = _halaqa AND c.ends_on >= public.zen_today() - 60), '[]'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.halaqa_challenges_view(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.halaqa_challenges_view(uuid) TO authenticated;

-- إنجازاتي وحلقاتي في طلب واحد لصفحة «إنجازاتي».
CREATE OR REPLACE FUNCTION public.my_achievement_halaqat()
RETURNS TABLE (halaqa_id uuid, halaqa_name text, honor_board boolean, active_challenges int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT h.id, h.name,
         COALESCE((SELECT enabled FROM public.halaqa_honor_board b WHERE b.halaqa_id = h.id), false),
         (SELECT count(*)::int FROM public.halaqa_challenges c
           WHERE c.halaqa_id = h.id AND c.completed_at IS NULL
             AND public.zen_today() BETWEEN c.starts_on AND c.ends_on)
    FROM public.halaqat h
   WHERE public.is_halaqa_member(auth.uid(), h.id) OR public.manages_halaqa(auth.uid(), h.id)
   ORDER BY h.name
$$;
REVOKE ALL ON FUNCTION public.my_achievement_halaqat() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_achievement_halaqat() TO authenticated;

-- منح ما سبق استحقاقه قبل هذا الترحيل (بلا إشعارات مكرّرة لاحقاً).
DO $$
DECLARE s uuid;
BEGIN
  FOR s IN SELECT DISTINCT student_id FROM public.mushaf_records WHERE kind = 'memorize' LOOP
    PERFORM public.award_badges(s);
  END LOOP;
END $$;
