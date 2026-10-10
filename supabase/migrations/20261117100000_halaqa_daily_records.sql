-- ════════════════════════════════════════════════════════════════════════════
-- السجل اليومي للحلقة — امتداد «سجل الحلقة» (9.1) لا نظام موازٍ (docs/DAILY_RECORD.md)
-- ════════════════════════════════════════════════════════════════════════════
-- الوحدة التشغيلية: سجل واحد للحلقة في اليوم (UNIQUE (halaqa_id, record_date)) بحالة
--   open ← completed ← locked، وملاحظة الحلقة، ورقم نسخة للقفل المتفائل.
-- لا تُنسخ بيانات قائمة:
--   الطالب والحلقة والمعلّم   ← profiles وhalaqat وhalaqa_students كما هي (لا أسماء في السجل).
--   الحضور                   ← attendance (صف لكل طالب وحلقة ويوم، كما في 9.1).
--   الحفظ والمراجعة           ← recitation_sessions (kind = memorize/review) وتقييمها في
--                               recitation_assessments، والجدولة عبر apply_review وحدها (القاعدة 4).
--                               عمود جديد daily_record_id يربط التسميع بسجل يومه.
--   سطر الطالب في اليوم       ← halaqa_register_entries (المفتاح (الحلقة، اليوم، الطالب) موجود منذ 9.1)،
--                               ويُضاف إليه: ملاحظة الطالب، ومعايير التقييم الاختيارية (1..5)، ورقم نسخة.
-- الصلاحيات من الدوال القائمة: private.manages_halaqa للكتابة (معلّم الحلقة أو منشئ مركزها)،
--   وprivate.can_view_center للقراءة (طاقم المركز، ومنه المشرف القارئ، القاعدة 11)، وprivate.owns_center
--   للإغلاق النهائي. الكتابة كلها عبر دوال SECURITY DEFINER؛ للعميل قراءة السجل فقط بسياسة RLS.
-- التراجع (عند الحاجة، لا يمسّ الحضور ولا التسميعات):
--   DROP FUNCTION public.daily_record_sheet, public.open_daily_record, public.set_daily_attendance,
--     public.save_daily_entry, public.set_daily_record_notes, public.complete_daily_record,
--     public.reopen_daily_record, public.lock_daily_record, public.student_daily_overview;
--   ALTER TABLE public.recitation_sessions DROP COLUMN daily_record_id;
--   ALTER TABLE public.halaqa_register_entries DROP COLUMN note, DROP COLUMN eval_tajweed,
--     DROP COLUMN eval_pronunciation, DROP COLUMN eval_behavior, DROP COLUMN eval_overall, DROP COLUMN version;
--   DROP TABLE public.halaqa_daily_records;  ثم إعادة تعريف record_halaqa_session من 20261021100000.
-- الفحص: supabase/tests/checks.sql (129).

-- ─────────── أسماء السور وعدد آياتها (مطابقة لـ src/lib/quran-meta.ts، يحرسها daily-record.test.ts) ───────────

CREATE OR REPLACE FUNCTION private.surah_no(_name text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT x.n::integer FROM unnest(ARRAY[
    'الفاتحة', 'البقرة', 'آل عمران', 'النساء', 'المائدة', 'الأنعام', 'الأعراف', 'الأنفال',
    'التوبة', 'يونس', 'هود', 'يوسف', 'الرعد', 'إبراهيم', 'الحجر', 'النحل',
    'الإسراء', 'الكهف', 'مريم', 'طه', 'الأنبياء', 'الحج', 'المؤمنون', 'النور',
    'الفرقان', 'الشعراء', 'النمل', 'القصص', 'العنكبوت', 'الروم', 'لقمان', 'السجدة',
    'الأحزاب', 'سبإ', 'فاطر', 'يس', 'الصافات', 'ص', 'الزمر', 'غافر',
    'فصلت', 'الشورى', 'الزخرف', 'الدخان', 'الجاثية', 'الأحقاف', 'محمد', 'الفتح',
    'الحجرات', 'ق', 'الذاريات', 'الطور', 'النجم', 'القمر', 'الرحمن', 'الواقعة',
    'الحديد', 'المجادلة', 'الحشر', 'الممتحنة', 'الصف', 'الجمعة', 'المنافقون', 'التغابن',
    'الطلاق', 'التحريم', 'الملك', 'القلم', 'الحاقة', 'المعارج', 'نوح', 'الجن',
    'المزمل', 'المدثر', 'القيامة', 'الإنسان', 'المرسلات', 'النبإ', 'النازعات', 'عبس',
    'التكوير', 'الانفطار', 'المطففين', 'الانشقاق', 'البروج', 'الطارق', 'الأعلى', 'الغاشية',
    'الفجر', 'البلد', 'الشمس', 'الليل', 'الضحى', 'الشرح', 'التين', 'العلق',
    'القدر', 'البينة', 'الزلزلة', 'العاديات', 'القارعة', 'التكاثر', 'العصر', 'الهمزة',
    'الفيل', 'قريش', 'الماعون', 'الكوثر', 'الكافرون', 'النصر', 'المسد', 'الإخلاص',
    'الفلق', 'الناس'
  ]) WITH ORDINALITY AS x(name, n) WHERE x.name = _name;
$$;

CREATE OR REPLACE FUNCTION private.surah_ayahs(_name text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT (ARRAY[
    7, 286, 200, 176, 120, 165, 206, 75,
    129, 109, 123, 111, 43, 52, 99, 128,
    111, 110, 98, 135, 112, 78, 118, 64,
    77, 227, 93, 88, 69, 60, 34, 30,
    73, 54, 45, 83, 182, 88, 75, 85,
    54, 53, 89, 59, 37, 35, 38, 29,
    18, 45, 60, 49, 62, 55, 78, 96,
    29, 22, 24, 13, 14, 11, 11, 18,
    12, 12, 30, 52, 52, 44, 28, 28,
    20, 56, 40, 31, 50, 40, 46, 42,
    29, 19, 36, 25, 22, 17, 19, 26,
    30, 20, 15, 21, 11, 8, 8, 19,
    5, 8, 8, 11, 11, 8, 3, 9,
    5, 4, 7, 3, 6, 3, 5, 4,
    5, 6
  ])[private.surah_no(_name)];
$$;
REVOKE ALL ON FUNCTION private.surah_no(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.surah_ayahs(text) FROM PUBLIC, anon, authenticated;

-- ─────────── الجدول ───────────

CREATE TABLE IF NOT EXISTS public.halaqa_daily_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  halaqa_id uuid NOT NULL REFERENCES public.halaqat(id) ON DELETE CASCADE,
  record_date date NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'completed', 'locked')),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 2000),
  version integer NOT NULL DEFAULT 1,
  opened_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_at timestamptz,
  locked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  locked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT halaqa_daily_records_one_per_day UNIQUE (halaqa_id, record_date),
  CONSTRAINT halaqa_daily_records_completed_at CHECK (status = 'open' OR completed_at IS NOT NULL),
  CONSTRAINT halaqa_daily_records_locked_at CHECK (status <> 'locked' OR locked_at IS NOT NULL)
);
COMMENT ON TABLE public.halaqa_daily_records IS
  'السجل اليومي للحلقة: حاوية يوم واحد (حضور وحفظ ومراجعة وتقييم وملاحظات من جداولها الأصلية). docs/DAILY_RECORD.md';
CREATE INDEX IF NOT EXISTS halaqa_daily_records_opened_by_idx ON public.halaqa_daily_records (opened_by);
CREATE INDEX IF NOT EXISTS halaqa_daily_records_completed_by_idx ON public.halaqa_daily_records (completed_by);
CREATE INDEX IF NOT EXISTS halaqa_daily_records_locked_by_idx ON public.halaqa_daily_records (locked_by);
ALTER TABLE public.halaqa_daily_records ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.halaqa_daily_records FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.halaqa_daily_records TO authenticated;
GRANT ALL ON public.halaqa_daily_records TO service_role;
DROP POLICY IF EXISTS "daily record read manager" ON public.halaqa_daily_records;
CREATE POLICY "daily record read manager" ON public.halaqa_daily_records FOR SELECT TO authenticated
  USING (private.manages_halaqa((SELECT auth.uid()), halaqa_id));
DROP TRIGGER IF EXISTS halaqa_daily_records_updated_at ON public.halaqa_daily_records;
CREATE TRIGGER halaqa_daily_records_updated_at BEFORE UPDATE ON public.halaqa_daily_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─────────── توسيع الجداول القائمة (أعمدة اختيارية، بلا حذف) ───────────

ALTER TABLE public.halaqa_register_entries
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS eval_tajweed smallint,
  ADD COLUMN IF NOT EXISTS eval_pronunciation smallint,
  ADD COLUMN IF NOT EXISTS eval_behavior smallint,
  ADD COLUMN IF NOT EXISTS eval_overall smallint,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE public.halaqa_register_entries
  DROP CONSTRAINT IF EXISTS halaqa_register_entries_note_len,
  ADD CONSTRAINT halaqa_register_entries_note_len CHECK (note IS NULL OR char_length(note) <= 1000),
  DROP CONSTRAINT IF EXISTS halaqa_register_entries_eval_range,
  ADD CONSTRAINT halaqa_register_entries_eval_range CHECK (
    (eval_tajweed IS NULL OR eval_tajweed BETWEEN 1 AND 5)
    AND (eval_pronunciation IS NULL OR eval_pronunciation BETWEEN 1 AND 5)
    AND (eval_behavior IS NULL OR eval_behavior BETWEEN 1 AND 5)
    AND (eval_overall IS NULL OR eval_overall BETWEEN 1 AND 5));
COMMENT ON COLUMN public.halaqa_register_entries.note IS 'ملاحظة المعلّم على الطالب في هذا اليوم (ملاحظة الحلقة في halaqa_daily_records.notes).';
COMMENT ON COLUMN public.halaqa_register_entries.eval_overall IS 'تقييم اليوم الاختياري 1..5 بميزان التقدير نفسه (grading.ts).';
CREATE INDEX IF NOT EXISTS halaqa_register_entries_recorded_by_idx ON public.halaqa_register_entries (recorded_by);

ALTER TABLE public.recitation_sessions
  ADD COLUMN IF NOT EXISTS daily_record_id uuid REFERENCES public.halaqa_daily_records(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS recitation_sessions_daily_record_idx
  ON public.recitation_sessions (daily_record_id, student_id) WHERE daily_record_id IS NOT NULL;
COMMENT ON COLUMN public.recitation_sessions.daily_record_id IS 'السجل اليومي الذي سُجّل فيه هذا الحفظ/المراجعة (اختياري).';

-- ─────────── نقل ما سُجّل بسجل الحلقة قبل اليوم (آمن عند التكرار) ───────────

INSERT INTO public.halaqa_daily_records (halaqa_id, record_date, status, opened_by, completed_by, completed_at, created_at)
SELECT e.halaqa_id, e.session_date,
       CASE WHEN e.session_date < public.zen_today() THEN 'completed' ELSE 'open' END,
       (array_agg(e.recorded_by ORDER BY e.updated_at DESC))[1],
       CASE WHEN e.session_date < public.zen_today() THEN (array_agg(e.recorded_by ORDER BY e.updated_at DESC))[1] END,
       CASE WHEN e.session_date < public.zen_today() THEN max(e.updated_at) END,
       min(e.created_at)
  FROM public.halaqa_register_entries e
 GROUP BY e.halaqa_id, e.session_date
ON CONFLICT (halaqa_id, record_date) DO NOTHING;

UPDATE public.recitation_sessions s
   SET daily_record_id = d.id
  FROM public.halaqa_register_entries e
  JOIN public.halaqa_daily_records d ON d.halaqa_id = e.halaqa_id AND d.record_date = e.session_date
 WHERE s.id = e.recitation_session_id AND s.daily_record_id IS NULL;

-- ─────────── أدوات داخلية ───────────

/** السجل للكتابة: الجلسة، ومدير الحلقة، والحالة «مفتوح». قفل مشترك يكفي لعمليات الطالب. */
CREATE OR REPLACE FUNCTION private.daily_record_for_write(_record uuid, _exclusive boolean)
RETURNS public.halaqa_daily_records
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec public.halaqa_daily_records;
  caller uuid := (SELECT auth.uid());
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF _exclusive THEN
    SELECT * INTO rec FROM public.halaqa_daily_records WHERE id = _record FOR UPDATE;
  ELSE
    SELECT * INTO rec FROM public.halaqa_daily_records WHERE id = _record FOR SHARE;
  END IF;
  IF rec.id IS NULL THEN RAISE EXCEPTION 'RECORD_NOT_FOUND'; END IF;
  IF NOT private.manages_halaqa(caller, rec.halaqa_id) THEN RAISE EXCEPTION 'NOT_YOUR_HALAQA'; END IF;
  IF rec.status = 'locked' THEN RAISE EXCEPTION 'RECORD_LOCKED'; END IF;
  IF rec.status = 'completed' AND NOT _exclusive THEN RAISE EXCEPTION 'RECORD_COMPLETED'; END IF;
  RETURN rec;
END;
$$;
REVOKE ALL ON FUNCTION private.daily_record_for_write(uuid, boolean) FROM PUBLIC, anon, authenticated;

/** الحفظ أو المراجعة في سجل اليوم: المقاطع (سورة سورة) بترتيب المصحف، والدرجة والخطأ والملاحظة من أول مقطع. */
CREATE OR REPLACE FUNCTION private.daily_kind_json(_record uuid, _student uuid, _kind text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN count(*) = 0 THEN NULL ELSE jsonb_build_object(
    'segments', jsonb_agg(jsonb_build_object('surah_name', s.surah_name, 'from_ayah', s.from_ayah, 'to_ayah', s.to_ayah)
                          ORDER BY private.surah_no(s.surah_name), s.from_ayah),
    'score', (array_agg(ra.score ORDER BY private.surah_no(s.surah_name), s.from_ayah))[1],
    'error_type', (array_agg(ra.errors -> 0 ->> 'type' ORDER BY private.surah_no(s.surah_name), s.from_ayah))[1],
    'notes', (array_agg(ra.teacher_notes ORDER BY private.surah_no(s.surah_name), s.from_ayah))[1]
  ) END
    FROM public.recitation_sessions s
    LEFT JOIN public.recitation_assessments ra ON ra.session_id = s.id
   WHERE s.daily_record_id = _record AND s.student_id = _student AND s.kind = _kind;
$$;
REVOKE ALL ON FUNCTION private.daily_kind_json(uuid, uuid, text) FROM PUBLIC, anon, authenticated;

/** سطر الطالب في السجل: كل قيمة من جدولها الأصلي، ولا شيء مخزَّن مرتين. */
CREATE OR REPLACE FUNCTION private.daily_student_row(_halaqa uuid, _date date, _record uuid, _student uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'student_id', _student,
    'name', coalesce(p.name, ''),
    'avatar', p.avatar,
    'status', a.status,
    'reason', a.reason,
    'version', coalesce(e.version, 0),
    'note', e.note,
    'evaluation', CASE WHEN e.eval_overall IS NULL AND e.eval_tajweed IS NULL
                            AND e.eval_pronunciation IS NULL AND e.eval_behavior IS NULL THEN NULL
                       ELSE jsonb_build_object('overall', e.eval_overall, 'tajweed', e.eval_tajweed,
                                               'pronunciation', e.eval_pronunciation, 'behavior', e.eval_behavior) END,
    'memorize', CASE WHEN _record IS NULL THEN NULL ELSE private.daily_kind_json(_record, _student, 'memorize') END,
    'review', CASE WHEN _record IS NULL THEN NULL ELSE private.daily_kind_json(_record, _student, 'review') END,
    'last_memorize', (SELECT jsonb_build_object('surah_name', s.surah_name, 'from_ayah', s.from_ayah,
                                                'to_ayah', s.to_ayah, 'session_date', s.session_date)
                        FROM public.recitation_sessions s
                       WHERE s.student_id = _student AND s.kind = 'memorize' AND s.status = 'approved'
                         AND s.session_date < _date
                       ORDER BY s.session_date DESC, s.created_at DESC LIMIT 1),
    'last_review', (SELECT jsonb_build_object('surah_name', s.surah_name, 'from_ayah', s.from_ayah,
                                              'to_ayah', s.to_ayah, 'session_date', s.session_date)
                      FROM public.recitation_sessions s
                     WHERE s.student_id = _student AND s.kind = 'review' AND s.status = 'approved'
                       AND s.session_date < _date
                     ORDER BY s.session_date DESC, s.created_at DESC LIMIT 1),
    'absences_30d', (SELECT count(*) FROM public.attendance x
                      WHERE x.student_id = _student AND x.halaqa_id = _halaqa AND x.status = 'absent'
                        AND x.session_date BETWEEN _date - 30 AND _date)
  )
    FROM (SELECT 1) one
    LEFT JOIN public.profiles p ON p.id = _student
    LEFT JOIN public.attendance a ON a.student_id = _student AND a.halaqa_id = _halaqa AND a.session_date = _date
    LEFT JOIN public.halaqa_register_entries e
           ON e.halaqa_id = _halaqa AND e.session_date = _date AND e.student_id = _student;
$$;
REVOKE ALL ON FUNCTION private.daily_student_row(uuid, date, uuid, uuid) FROM PUBLIC, anon, authenticated;

/** يتحقق من رقم نسخة سطر الطالب ويعيده (0 إن لم يوجد). */
CREATE OR REPLACE FUNCTION private.daily_entry_check(_halaqa uuid, _date date, _student uuid, _version integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.halaqa_students hs WHERE hs.halaqa_id = _halaqa AND hs.student_id = _student) THEN
    RAISE EXCEPTION 'STUDENT_NOT_IN_HALAQA';
  END IF;
  SELECT e.version INTO v FROM public.halaqa_register_entries e
   WHERE e.halaqa_id = _halaqa AND e.session_date = _date AND e.student_id = _student
   FOR UPDATE;
  IF coalesce(v, 0) <> coalesce(_version, -1) THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
  RETURN coalesce(v, 0);
END;
$$;
REVOKE ALL ON FUNCTION private.daily_entry_check(uuid, date, uuid, integer) FROM PUBLIC, anon, authenticated;

-- ─────────── القراءة ───────────

/**
 * ورقة اليوم: رأس السجل (قد يكون null قبل فتحه) والطلاب. للقراءة: مدير الحلقة أو طاقم مركزها
 * (المشرف يقرأ ولا يكتب). can_edit = مدير الحلقة، can_lock = منشئ المركز.
 */
CREATE OR REPLACE FUNCTION public.daily_record_sheet(_halaqa uuid, _date date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := (SELECT auth.uid());
  h public.halaqat;
  rec public.halaqa_daily_records;
  editor boolean;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF _date IS NULL THEN RAISE EXCEPTION 'INVALID_DATE'; END IF;
  SELECT * INTO h FROM public.halaqat WHERE id = _halaqa;
  IF h.id IS NULL THEN RAISE EXCEPTION 'NOT_YOUR_HALAQA'; END IF;
  editor := private.manages_halaqa(caller, _halaqa);
  IF NOT editor AND NOT private.can_view_center(caller, h.center_id) THEN
    RAISE EXCEPTION 'NOT_YOUR_HALAQA';
  END IF;
  SELECT * INTO rec FROM public.halaqa_daily_records WHERE halaqa_id = _halaqa AND record_date = _date;
  RETURN jsonb_build_object(
    'halaqa', jsonb_build_object('id', h.id, 'name', h.name,
                                 'teacher_name', (SELECT p.name FROM public.profiles p WHERE p.id = h.teacher_id)),
    'date', _date,
    'today', public.zen_today(),
    'can_edit', editor AND _date BETWEEN public.zen_today() - 14 AND public.zen_today(),
    'can_lock', private.owns_center(caller, h.center_id),
    'record', CASE WHEN rec.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', rec.id, 'status', rec.status, 'version', rec.version, 'notes', rec.notes,
      'completed_at', rec.completed_at, 'locked_at', rec.locked_at,
      'completed_by_name', (SELECT p.name FROM public.profiles p WHERE p.id = rec.completed_by)) END,
    'students', coalesce((
      SELECT jsonb_agg(private.daily_student_row(_halaqa, _date, rec.id, hs.student_id)
                       ORDER BY coalesce(p.name, ''), hs.student_id)
        FROM public.halaqa_students hs
        LEFT JOIN public.profiles p ON p.id = hs.student_id
       WHERE hs.halaqa_id = _halaqa), '[]'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.daily_record_sheet(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.daily_record_sheet(uuid, date) TO authenticated, service_role;

/** ملخص الطالب في ملفه (للمعلّم الذي يدرّسه وللطالب نفسه): آخر حفظ ومراجعة، وحضور 30 يوماً، وآخر تقييم وملاحظات. */
CREATE OR REPLACE FUNCTION public.student_daily_overview(_student uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := (SELECT auth.uid());
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF caller <> _student AND NOT private.teaches_student(caller, _student) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  RETURN jsonb_build_object(
    'attendance', (SELECT jsonb_build_object(
        'present', count(*) FILTER (WHERE a.status = 'present'),
        'late', count(*) FILTER (WHERE a.status = 'late'),
        'absent', count(*) FILTER (WHERE a.status = 'absent'),
        'excused', count(*) FILTER (WHERE a.status = 'excused'))
      FROM public.attendance a
     WHERE a.student_id = _student AND a.session_date BETWEEN public.zen_today() - 30 AND public.zen_today()),
    'last_memorize', (SELECT jsonb_build_object('surah_name', s.surah_name, 'from_ayah', s.from_ayah,
                                                'to_ayah', s.to_ayah, 'session_date', s.session_date)
                        FROM public.recitation_sessions s
                       WHERE s.student_id = _student AND s.kind = 'memorize' AND s.status = 'approved'
                       ORDER BY s.session_date DESC, s.created_at DESC LIMIT 1),
    'last_review', (SELECT jsonb_build_object('surah_name', s.surah_name, 'from_ayah', s.from_ayah,
                                              'to_ayah', s.to_ayah, 'session_date', s.session_date)
                      FROM public.recitation_sessions s
                     WHERE s.student_id = _student AND s.kind = 'review' AND s.status = 'approved'
                     ORDER BY s.session_date DESC, s.created_at DESC LIMIT 1),
    'last_evaluation', (SELECT jsonb_build_object('session_date', e.session_date, 'overall', e.eval_overall,
                                                  'tajweed', e.eval_tajweed, 'pronunciation', e.eval_pronunciation,
                                                  'behavior', e.eval_behavior)
                          FROM public.halaqa_register_entries e
                         WHERE e.student_id = _student
                           AND (e.eval_overall IS NOT NULL OR e.eval_tajweed IS NOT NULL
                                OR e.eval_pronunciation IS NOT NULL OR e.eval_behavior IS NOT NULL)
                         ORDER BY e.session_date DESC LIMIT 1),
    'notes', coalesce((SELECT jsonb_agg(jsonb_build_object('session_date', n.session_date, 'note', n.note)
                                        ORDER BY n.session_date DESC)
                         FROM (SELECT e.session_date, e.note FROM public.halaqa_register_entries e
                                WHERE e.student_id = _student AND e.note IS NOT NULL
                                ORDER BY e.session_date DESC LIMIT 5) n), '[]'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.student_daily_overview(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.student_daily_overview(uuid) TO authenticated, service_role;

-- ─────────── الكتابة ───────────

/** فتح سجل اليوم (أو إعادته إن وُجد): مدير الحلقة، ولآخر 14 يوماً كسجل الحلقة. */
CREATE OR REPLACE FUNCTION public.open_daily_record(_halaqa uuid, _date date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := (SELECT auth.uid());
  rec public.halaqa_daily_records;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT private.manages_halaqa(caller, _halaqa) THEN RAISE EXCEPTION 'NOT_YOUR_HALAQA'; END IF;
  IF _date IS NULL OR _date > public.zen_today() OR _date < public.zen_today() - 14 THEN
    RAISE EXCEPTION 'INVALID_DATE';
  END IF;
  INSERT INTO public.halaqa_daily_records (halaqa_id, record_date, opened_by)
  VALUES (_halaqa, _date, caller)
  ON CONFLICT (halaqa_id, record_date) DO NOTHING;
  SELECT * INTO rec FROM public.halaqa_daily_records WHERE halaqa_id = _halaqa AND record_date = _date;
  RETURN jsonb_build_object('id', rec.id, 'status', rec.status, 'version', rec.version);
END;
$$;
REVOKE ALL ON FUNCTION public.open_daily_record(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_daily_record(uuid, date) TO authenticated, service_role;

/** حضور طالب واحد (لمسة واحدة)، في جدول attendance نفسه، مع فحص نسخة سطره. يعيد سطره المحدَّث. */
CREATE OR REPLACE FUNCTION public.set_daily_attendance(
  _record uuid, _student uuid, _status text, _reason text, _version integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := (SELECT auth.uid());
  rec public.halaqa_daily_records;
  att_id uuid;
BEGIN
  rec := private.daily_record_for_write(_record, false);
  IF _status NOT IN ('present', 'absent', 'late', 'excused') THEN RAISE EXCEPTION 'INVALID_STATUS'; END IF;
  IF _reason IS NOT NULL AND char_length(_reason) > 300 THEN RAISE EXCEPTION 'INVALID_REASON'; END IF;
  PERFORM private.daily_entry_check(rec.halaqa_id, rec.record_date, _student, _version);
  IF _status IN ('absent', 'excused') AND EXISTS (
    SELECT 1 FROM public.recitation_sessions s WHERE s.daily_record_id = rec.id AND s.student_id = _student) THEN
    RAISE EXCEPTION 'HAS_ACHIEVEMENT';
  END IF;

  INSERT INTO public.attendance (student_id, halaqa_id, teacher_id, session_date, status, reason)
  VALUES (_student, rec.halaqa_id, caller, rec.record_date, _status, nullif(trim(_reason), ''))
  ON CONFLICT (student_id, (COALESCE(halaqa_id, '00000000-0000-0000-0000-000000000000'::uuid)), session_date)
  DO UPDATE SET status = EXCLUDED.status, reason = EXCLUDED.reason, teacher_id = caller, updated_at = now()
  RETURNING id INTO att_id;

  INSERT INTO public.halaqa_register_entries (halaqa_id, session_date, student_id, attendance_id, recorded_by)
  VALUES (rec.halaqa_id, rec.record_date, _student, att_id, caller)
  ON CONFLICT (halaqa_id, session_date, student_id) DO UPDATE
    SET attendance_id = att_id, recorded_by = caller, version = halaqa_register_entries.version + 1, updated_at = now();

  RETURN private.daily_student_row(rec.halaqa_id, rec.record_date, rec.id, _student);
END;
$$;
REVOKE ALL ON FUNCTION public.set_daily_attendance(uuid, uuid, text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_daily_attendance(uuid, uuid, text, text, integer) TO authenticated, service_role;

/**
 * حفظ ما أنجزه الطالب في اليوم. _payload مفاتيح اختيارية، والمفتاح الغائب لا يُمسّ:
 *   memorize / review : null (حذف) أو {segments:[{surah_name,from_ayah,to_ayah}], grade 1..5, error_type, notes}
 *   evaluation        : null أو {overall, tajweed, pronunciation, behavior} كل منها 1..5 أو null
 *   note              : نص أو null
 * المقطع الجديد يُجدول عبر apply_review مرة واحدة؛ تصحيح مقطع قائم يحدّث تقييمه فقط (لا مضاعفة SM-2).
 */
CREATE OR REPLACE FUNCTION public.save_daily_entry(_record uuid, _student uuid, _payload jsonb, _version integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := (SELECT auth.uid());
  rec public.halaqa_daily_records;
  att public.attendance;
  k text;
  part jsonb;
  seg jsonb;
  grade integer;
  err_type text;
  notes text;
  sname text;
  a_from integer;
  a_to integer;
  sess_id uuid;
  first_sess uuid;
  first_ass uuid;
  ev jsonb;
  c text;
BEGIN
  rec := private.daily_record_for_write(_record, false);
  IF _payload IS NULL OR jsonb_typeof(_payload) <> 'object' THEN RAISE EXCEPTION 'INVALID_PAYLOAD'; END IF;
  PERFORM private.daily_entry_check(rec.halaqa_id, rec.record_date, _student, _version);
  SELECT * INTO att FROM public.attendance a
   WHERE a.student_id = _student AND a.halaqa_id = rec.halaqa_id AND a.session_date = rec.record_date;

  FOREACH k IN ARRAY ARRAY['memorize', 'review'] LOOP
    CONTINUE WHEN NOT _payload ? k;
    part := _payload -> k;
    IF jsonb_typeof(part) = 'null' THEN
      DELETE FROM public.recitation_sessions s
       WHERE s.daily_record_id = rec.id AND s.student_id = _student AND s.kind = k;
      CONTINUE;
    END IF;
    IF jsonb_typeof(part) <> 'object' OR jsonb_typeof(part -> 'segments') IS DISTINCT FROM 'array'
       OR jsonb_array_length(part -> 'segments') NOT BETWEEN 1 AND 10 THEN
      RAISE EXCEPTION 'INVALID_RANGE';
    END IF;
    IF att.status IN ('absent', 'excused') THEN RAISE EXCEPTION 'STUDENT_NOT_PRESENT'; END IF;
    grade := (part ->> 'grade')::integer;
    IF grade IS NULL OR grade NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'INVALID_GRADE'; END IF;
    err_type := coalesce(nullif(part ->> 'error_type', ''), 'none');
    IF err_type NOT IN ('none', 'hifz', 'tajweed', 'tashkeel', 'waqf') THEN RAISE EXCEPTION 'INVALID_ERROR_TYPE'; END IF;
    notes := nullif(trim(part ->> 'notes'), '');
    IF notes IS NOT NULL AND char_length(notes) > 1000 THEN RAISE EXCEPTION 'INVALID_NOTES'; END IF;
    FOR seg IN SELECT * FROM jsonb_array_elements(part -> 'segments') LOOP
      sname := seg ->> 'surah_name';
      a_from := (seg ->> 'from_ayah')::integer;
      a_to := (seg ->> 'to_ayah')::integer;
      IF private.surah_no(sname) IS NULL OR a_from IS NULL OR a_to IS NULL
         OR a_from < 1 OR a_to < a_from OR a_to > private.surah_ayahs(sname) THEN
        RAISE EXCEPTION 'INVALID_RANGE';
      END IF;
    END LOOP;
    IF (SELECT count(DISTINCT e ->> 'surah_name') FROM jsonb_array_elements(part -> 'segments') e)
       <> jsonb_array_length(part -> 'segments') THEN
      RAISE EXCEPTION 'INVALID_RANGE';
    END IF;

    -- حاضر ضمناً إن سُجّل إنجاز ولم يُسجَّل الحضور بعد.
    IF att.id IS NULL THEN
      INSERT INTO public.attendance (student_id, halaqa_id, teacher_id, session_date, status)
      VALUES (_student, rec.halaqa_id, caller, rec.record_date, 'present')
      RETURNING * INTO att;
    END IF;

    DELETE FROM public.recitation_sessions s
     WHERE s.daily_record_id = rec.id AND s.student_id = _student AND s.kind = k
       AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(part -> 'segments') e
                        WHERE e ->> 'surah_name' = s.surah_name
                          AND (e ->> 'from_ayah')::integer = s.from_ayah
                          AND (e ->> 'to_ayah')::integer = s.to_ayah);
    FOR seg IN SELECT * FROM jsonb_array_elements(part -> 'segments') LOOP
      sname := seg ->> 'surah_name';
      a_from := (seg ->> 'from_ayah')::integer;
      a_to := (seg ->> 'to_ayah')::integer;
      SELECT s.id INTO sess_id FROM public.recitation_sessions s
       WHERE s.daily_record_id = rec.id AND s.student_id = _student AND s.kind = k
         AND s.surah_name = sname AND s.from_ayah = a_from AND s.to_ayah = a_to;
      IF sess_id IS NULL THEN
        INSERT INTO public.recitation_sessions
          (student_id, halaqa_id, surah_name, from_ayah, to_ayah, kind, status, session_date, daily_record_id)
        VALUES (_student, rec.halaqa_id, sname, a_from, a_to, k, 'approved', rec.record_date, rec.id)
        RETURNING id INTO sess_id;
        INSERT INTO public.recitation_assessments
          (session_id, student_id, teacher_id, score, errors, teacher_notes, approved)
        VALUES (sess_id, _student, caller, public.grade_to_score(grade),
                CASE WHEN err_type = 'none' THEN '[]'::jsonb ELSE jsonb_build_array(jsonb_build_object('type', err_type)) END,
                notes, true);
        PERFORM public.apply_review(_student, sname, a_from, a_to, public.grade_to_score(grade));
      ELSE
        UPDATE public.recitation_assessments
           SET score = public.grade_to_score(grade),
               errors = CASE WHEN err_type = 'none' THEN '[]'::jsonb ELSE jsonb_build_array(jsonb_build_object('type', err_type)) END,
               teacher_notes = notes, updated_at = now()
         WHERE session_id = sess_id;
      END IF;
    END LOOP;
  END LOOP;

  IF _payload ? 'evaluation' THEN
    ev := CASE WHEN jsonb_typeof(_payload -> 'evaluation') = 'object' THEN _payload -> 'evaluation' ELSE '{}'::jsonb END;
    FOREACH c IN ARRAY ARRAY['overall', 'tajweed', 'pronunciation', 'behavior'] LOOP
      IF ev ? c AND jsonb_typeof(ev -> c) <> 'null'
         AND (jsonb_typeof(ev -> c) <> 'number' OR (ev ->> c)::numeric NOT IN (1, 2, 3, 4, 5)) THEN
        RAISE EXCEPTION 'INVALID_EVALUATION';
      END IF;
    END LOOP;
  END IF;
  IF _payload ? 'note' AND jsonb_typeof(_payload -> 'note') NOT IN ('null', 'string') THEN
    RAISE EXCEPTION 'INVALID_NOTES';
  END IF;
  IF _payload ? 'note' AND char_length(coalesce(_payload ->> 'note', '')) > 1000 THEN RAISE EXCEPTION 'INVALID_NOTES'; END IF;

  SELECT s.id, ra.id INTO first_sess, first_ass
    FROM public.recitation_sessions s
    LEFT JOIN public.recitation_assessments ra ON ra.session_id = s.id
   WHERE s.daily_record_id = rec.id AND s.student_id = _student
   ORDER BY (s.kind = 'memorize') DESC, private.surah_no(s.surah_name), s.from_ayah LIMIT 1;

  INSERT INTO public.halaqa_register_entries AS e
    (halaqa_id, session_date, student_id, attendance_id, recitation_session_id, assessment_id, recorded_by,
     note, eval_overall, eval_tajweed, eval_pronunciation, eval_behavior)
  VALUES (rec.halaqa_id, rec.record_date, _student, att.id, first_sess, first_ass, caller,
          nullif(trim(_payload ->> 'note'), ''),
          (ev ->> 'overall')::smallint, (ev ->> 'tajweed')::smallint,
          (ev ->> 'pronunciation')::smallint, (ev ->> 'behavior')::smallint)
  ON CONFLICT (halaqa_id, session_date, student_id) DO UPDATE SET
    attendance_id = coalesce(att.id, e.attendance_id),
    recitation_session_id = first_sess,
    assessment_id = first_ass,
    recorded_by = caller,
    note = CASE WHEN _payload ? 'note' THEN nullif(trim(_payload ->> 'note'), '') ELSE e.note END,
    eval_overall = CASE WHEN _payload ? 'evaluation' THEN (ev ->> 'overall')::smallint ELSE e.eval_overall END,
    eval_tajweed = CASE WHEN _payload ? 'evaluation' THEN (ev ->> 'tajweed')::smallint ELSE e.eval_tajweed END,
    eval_pronunciation = CASE WHEN _payload ? 'evaluation' THEN (ev ->> 'pronunciation')::smallint ELSE e.eval_pronunciation END,
    eval_behavior = CASE WHEN _payload ? 'evaluation' THEN (ev ->> 'behavior')::smallint ELSE e.eval_behavior END,
    version = e.version + 1,
    updated_at = now();

  RETURN private.daily_student_row(rec.halaqa_id, rec.record_date, rec.id, _student);
END;
$$;
REVOKE ALL ON FUNCTION public.save_daily_entry(uuid, uuid, jsonb, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_daily_entry(uuid, uuid, jsonb, integer) TO authenticated, service_role;

/** ملاحظة الحلقة لليوم (لا ملاحظة طالب). */
CREATE OR REPLACE FUNCTION public.set_daily_record_notes(_record uuid, _notes text, _version integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec public.halaqa_daily_records;
BEGIN
  rec := private.daily_record_for_write(_record, true);
  IF rec.status <> 'open' THEN RAISE EXCEPTION 'RECORD_COMPLETED'; END IF;
  IF rec.version <> coalesce(_version, -1) THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
  IF _notes IS NOT NULL AND char_length(_notes) > 2000 THEN RAISE EXCEPTION 'INVALID_NOTES'; END IF;
  UPDATE public.halaqa_daily_records
     SET notes = nullif(trim(_notes), ''), version = version + 1
   WHERE id = rec.id
  RETURNING * INTO rec;
  RETURN jsonb_build_object('id', rec.id, 'status', rec.status, 'version', rec.version, 'notes', rec.notes);
END;
$$;
REVOKE ALL ON FUNCTION public.set_daily_record_notes(uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_daily_record_notes(uuid, text, integer) TO authenticated, service_role;

/**
 * إنهاء سجل اليوم. القاعدة الإلزامية الوحيدة: حضور مسجَّل لطالب واحد على الأقل؛ بقية النواقص تنبيهات
 * تعرضها الواجهة قبل التأكيد. يُشعَر منشئ المركز إن لم يكن هو من أنهاه (جدول notifications، القاعدة 28).
 */
CREATE OR REPLACE FUNCTION public.complete_daily_record(_record uuid, _version integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := (SELECT auth.uid());
  rec public.halaqa_daily_records;
  h public.halaqat;
  center_owner uuid;
BEGIN
  rec := private.daily_record_for_write(_record, true);
  IF rec.status <> 'open' THEN RAISE EXCEPTION 'RECORD_COMPLETED'; END IF;
  IF rec.version <> coalesce(_version, -1) THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.attendance a JOIN public.halaqa_students hs
                    ON hs.halaqa_id = a.halaqa_id AND hs.student_id = a.student_id
                  WHERE a.halaqa_id = rec.halaqa_id AND a.session_date = rec.record_date) THEN
    RAISE EXCEPTION 'NO_ATTENDANCE';
  END IF;
  UPDATE public.halaqa_daily_records
     SET status = 'completed', completed_by = caller, completed_at = now(), version = version + 1
   WHERE id = rec.id
  RETURNING * INTO rec;

  SELECT * INTO h FROM public.halaqat WHERE id = rec.halaqa_id;
  SELECT c.created_by INTO center_owner FROM public.centers c WHERE c.id = h.center_id;
  IF center_owner IS NOT NULL AND center_owner <> caller THEN
    INSERT INTO public.notifications (user_id, kind, title, body, link)
    VALUES (center_owner, 'daily_record', 'اكتمل السجل اليومي',
            coalesce(h.name, '') || ' — ' || to_char(rec.record_date, 'YYYY-MM-DD'),
            '/teacher/register?halaqa=' || rec.halaqa_id || '&date=' || to_char(rec.record_date, 'YYYY-MM-DD'));
  END IF;
  RETURN jsonb_build_object('id', rec.id, 'status', rec.status, 'version', rec.version);
END;
$$;
REVOKE ALL ON FUNCTION public.complete_daily_record(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_daily_record(uuid, integer) TO authenticated, service_role;

/** إعادة فتح سجل مكتمل للتصحيح (غير المُغلق نهائياً). */
CREATE OR REPLACE FUNCTION public.reopen_daily_record(_record uuid, _version integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec public.halaqa_daily_records;
BEGIN
  rec := private.daily_record_for_write(_record, true);
  IF rec.status <> 'completed' THEN RAISE EXCEPTION 'INVALID_TRANSITION'; END IF;
  IF rec.version <> coalesce(_version, -1) THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
  IF rec.record_date < public.zen_today() - 14 THEN RAISE EXCEPTION 'INVALID_DATE'; END IF;
  UPDATE public.halaqa_daily_records
     SET status = 'open', completed_by = NULL, completed_at = NULL, version = version + 1
   WHERE id = rec.id
  RETURNING * INTO rec;
  RETURN jsonb_build_object('id', rec.id, 'status', rec.status, 'version', rec.version);
END;
$$;
REVOKE ALL ON FUNCTION public.reopen_daily_record(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reopen_daily_record(uuid, integer) TO authenticated, service_role;

/** الإغلاق النهائي: لمنشئ المركز وحده، وللسجل المكتمل فقط. بعده لا كتابة لأحد. */
CREATE OR REPLACE FUNCTION public.lock_daily_record(_record uuid, _version integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := (SELECT auth.uid());
  rec public.halaqa_daily_records;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  SELECT * INTO rec FROM public.halaqa_daily_records WHERE id = _record FOR UPDATE;
  IF rec.id IS NULL THEN RAISE EXCEPTION 'RECORD_NOT_FOUND'; END IF;
  IF NOT private.owns_center(caller, (SELECT h.center_id FROM public.halaqat h WHERE h.id = rec.halaqa_id)) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF rec.status = 'locked' THEN RAISE EXCEPTION 'RECORD_LOCKED'; END IF;
  IF rec.status <> 'completed' THEN RAISE EXCEPTION 'INVALID_TRANSITION'; END IF;
  IF rec.version <> coalesce(_version, -1) THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
  UPDATE public.halaqa_daily_records
     SET status = 'locked', locked_by = caller, locked_at = now(), version = version + 1
   WHERE id = rec.id
  RETURNING * INTO rec;
  RETURN jsonb_build_object('id', rec.id, 'status', rec.status, 'version', rec.version);
END;
$$;
REVOKE ALL ON FUNCTION public.lock_daily_record(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lock_daily_record(uuid, integer) TO authenticated, service_role;

-- ─────────── سجل الحلقة (9.1) يبقى عاملاً لصندوق الإرسال القائم، ضمن السجل اليومي ───────────
-- التعريف نفسه من 20261021100000 مع: فتح السجل اليومي ضمناً، ورفض الكتابة في المكتمل/المُغلق،
-- وربط التسميع الجديد بالسجل (daily_record_id)، وزيادة رقم نسخة السطر.

CREATE OR REPLACE FUNCTION public.record_halaqa_session(_halaqa uuid, _date date, _rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := (SELECT auth.uid());
  r jsonb;
  sid uuid;
  st text;
  grade integer;
  surah text;
  a_from integer;
  a_to integer;
  v_kind text;
  err_type text;
  entry public.halaqa_register_entries;
  att_id uuid;
  sess_id uuid;
  ass_id uuid;
  created integer := 0;
  updated integer := 0;
  reviews integer := 0;
  rec public.halaqa_daily_records;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT private.manages_halaqa(caller, _halaqa) THEN RAISE EXCEPTION 'NOT_YOUR_HALAQA'; END IF;
  IF _date IS NULL OR _date > public.zen_today() OR _date < public.zen_today() - 14 THEN
    RAISE EXCEPTION 'INVALID_DATE';
  END IF;
  IF jsonb_typeof(_rows) <> 'array' OR jsonb_array_length(_rows) = 0 OR jsonb_array_length(_rows) > 80 THEN
    RAISE EXCEPTION 'INVALID_ROWS';
  END IF;
  -- السجل اليومي: يُفتح ضمناً، ولا يُكتب في سجل مكتمل أو مُغلق (حتى من صندوق الإرسال بلا اتصال).
  INSERT INTO public.halaqa_daily_records (halaqa_id, record_date, opened_by)
  VALUES (_halaqa, _date, caller)
  ON CONFLICT (halaqa_id, record_date) DO NOTHING;
  SELECT * INTO rec FROM public.halaqa_daily_records d
   WHERE d.halaqa_id = _halaqa AND d.record_date = _date FOR SHARE;
  IF rec.status = 'locked' THEN RAISE EXCEPTION 'RECORD_LOCKED'; END IF;
  IF rec.status = 'completed' THEN RAISE EXCEPTION 'RECORD_COMPLETED'; END IF;

  FOR r IN SELECT * FROM jsonb_array_elements(_rows) LOOP
    sid := (r ->> 'student_id')::uuid;
    st := coalesce(r ->> 'status', 'present');
    IF st NOT IN ('present', 'absent', 'late', 'excused') THEN RAISE EXCEPTION 'INVALID_STATUS'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.halaqa_students hs WHERE hs.halaqa_id = _halaqa AND hs.student_id = sid) THEN
      RAISE EXCEPTION 'STUDENT_NOT_IN_HALAQA';
    END IF;

    SELECT * INTO entry FROM public.halaqa_register_entries e
     WHERE e.halaqa_id = _halaqa AND e.session_date = _date AND e.student_id = sid
     FOR UPDATE;

    -- الحضور: صف واحد لكل (طالب، حلقة، يوم).
    INSERT INTO public.attendance (student_id, halaqa_id, teacher_id, session_date, status, reason)
    VALUES (sid, _halaqa, caller, _date, st, nullif(r ->> 'reason', ''))
    ON CONFLICT (student_id, (COALESCE(halaqa_id, '00000000-0000-0000-0000-000000000000'::uuid)), session_date)
    DO UPDATE
      SET status = EXCLUDED.status, reason = EXCLUDED.reason, teacher_id = caller, updated_at = now()
    RETURNING id INTO att_id;

    sess_id := entry.recitation_session_id;
    ass_id := entry.assessment_id;
    surah := nullif(trim(r ->> 'surah_name'), '');
    grade := (r ->> 'grade')::integer;
    IF st IN ('present', 'late') AND surah IS NOT NULL THEN
      a_from := (r ->> 'from_ayah')::integer;
      a_to := coalesce((r ->> 'to_ayah')::integer, a_from);
      v_kind := coalesce(nullif(r ->> 'kind', ''), 'memorize');
      err_type := coalesce(nullif(r ->> 'error_type', ''), 'none');
      IF a_from IS NULL OR a_from < 1 OR a_to < a_from THEN RAISE EXCEPTION 'INVALID_RANGE'; END IF;
      IF v_kind NOT IN ('memorize', 'review') THEN RAISE EXCEPTION 'INVALID_KIND'; END IF;
      IF grade IS NULL OR grade NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'INVALID_GRADE'; END IF;
      IF err_type NOT IN ('none', 'hifz', 'tajweed', 'tashkeel', 'waqf') THEN RAISE EXCEPTION 'INVALID_ERROR_TYPE'; END IF;

      IF sess_id IS NULL THEN
        INSERT INTO public.recitation_sessions
          (student_id, halaqa_id, surah_name, from_ayah, to_ayah, kind, status, session_date, daily_record_id)
        VALUES (sid, _halaqa, surah, a_from, a_to, v_kind, 'approved', _date, rec.id)
        RETURNING id INTO sess_id;
        INSERT INTO public.recitation_assessments
          (session_id, student_id, teacher_id, score, errors, teacher_notes, approved)
        VALUES (sess_id, sid, caller, public.grade_to_score(grade),
                CASE WHEN err_type = 'none' THEN '[]'::jsonb ELSE jsonb_build_array(jsonb_build_object('type', err_type)) END,
                nullif(r ->> 'notes', ''), true)
        RETURNING id INTO ass_id;
        -- الجدولة عبر apply_review وحدها، مرة واحدة لكل قيد.
        PERFORM public.apply_review(sid, surah, a_from, a_to, public.grade_to_score(grade));
        reviews := reviews + 1;
      ELSE
        -- تصحيح قيد قائم: يُحدَّث السجل ولا تُعاد الجدولة (لا مضاعفة لأثر SM-2).
        UPDATE public.recitation_sessions
           SET surah_name = surah, from_ayah = a_from, to_ayah = a_to, kind = v_kind, updated_at = now()
         WHERE id = sess_id;
        UPDATE public.recitation_assessments
           SET score = public.grade_to_score(grade),
               errors = CASE WHEN err_type = 'none' THEN '[]'::jsonb ELSE jsonb_build_array(jsonb_build_object('type', err_type)) END,
               teacher_notes = nullif(r ->> 'notes', ''), updated_at = now()
         WHERE id = ass_id;
      END IF;
    END IF;

    IF entry.student_id IS NULL THEN
      INSERT INTO public.halaqa_register_entries
        (halaqa_id, session_date, student_id, attendance_id, recitation_session_id, assessment_id, recorded_by)
      VALUES (_halaqa, _date, sid, att_id, sess_id, ass_id, caller);
      created := created + 1;
    ELSE
      UPDATE public.halaqa_register_entries
         SET attendance_id = att_id, recitation_session_id = sess_id, assessment_id = ass_id,
             recorded_by = caller, version = version + 1, updated_at = now()
       WHERE halaqa_id = _halaqa AND session_date = _date AND student_id = sid;
      updated := updated + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('created', created, 'updated', updated, 'reviews', reviews);
END;
$$;
REVOKE ALL ON FUNCTION public.record_halaqa_session(uuid, date, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_halaqa_session(uuid, date, jsonb) TO authenticated, service_role;
