-- المرحلة 14: أدوات المعلّم المدعومة بالذكاء الاصطناعي.
--
-- 1) teacher_student_week(): حقائق أسبوع الطالب (حضور، تسميع، أنواع الأخطاء، مراجعات SM-2، واجبات)
--    لمعلّمه فقط. الملخّص النصي يُكتب على الخادم من هذه الحقائق وحدها.
-- 2) memorization_plans: خطة حفظ أسبوعية مقترحة من سجل SM-2، لا تُعتمد إلا من معلّم الطالب.
--    الخطة نطاقات (سورة/من/إلى) لا نصّ قرآني فيها.

-- ─────────── حصص الذكاء الاصطناعي للميزتين الجديدتين ───────────
ALTER TABLE public.ai_usage_events DROP CONSTRAINT IF EXISTS ai_usage_events_feature_check;
ALTER TABLE public.ai_usage_events
  ADD CONSTRAINT ai_usage_events_feature_check
  CHECK (feature IN ('chat', 'summarize', 'learn', 'feedback', 'transcribe', 'coach', 'muhasaba',
                     'teacher_summary', 'plan'));

-- ─────────── فئة إشعار الخطة ───────────
CREATE OR REPLACE FUNCTION public.push_category(_kind text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _kind IN ('assignment', 'plan') THEN 'assignments'
    WHEN _kind = 'assessment' THEN 'grades'
    WHEN _kind IN ('guardian', 'guardian_weekly') THEN 'family'
    WHEN _kind IN ('announcement', 'room', 'room_report') THEN 'rooms'
    WHEN _kind IN ('achievement', 'certificate', 'challenge') THEN 'achievements'
    ELSE 'general'
  END
$$;

-- ─────────── حقائق أسبوع الطالب لمعلّمه ───────────
CREATE OR REPLACE FUNCTION public.teacher_student_week(_student uuid, _days integer DEFAULT 7)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _d integer := GREATEST(1, LEAST(COALESCE(_days, 7), 31));
  _since date := now()::date - (GREATEST(1, LEAST(COALESCE(_days, 7), 31)) - 1);
  result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.teaches_student(auth.uid(), _student) THEN
    RAISE EXCEPTION 'NOT_YOUR_STUDENT';
  END IF;

  SELECT jsonb_build_object(
    'student', (SELECT jsonb_build_object('id', p.id, 'name', p.name)
                  FROM public.profiles p WHERE p.id = _student),
    'days', _d,
    'since', _since,

    'attendance', (
      SELECT jsonb_build_object(
               'present', count(*) FILTER (WHERE status = 'present'),
               'late', count(*) FILTER (WHERE status = 'late'),
               'absent', count(*) FILTER (WHERE status = 'absent'),
               'excused', count(*) FILTER (WHERE status = 'excused'))
        FROM public.attendance
       WHERE student_id = _student AND session_date >= _since),

    'recitations', (
      SELECT jsonb_build_object(
               'submitted', count(*) FILTER (WHERE status NOT IN ('practice', 'recording', 'uploading')),
               'practice', count(*) FILTER (WHERE status = 'practice'),
               'practice_avg', round(avg(ai_score) FILTER (WHERE status = 'practice')))
        FROM public.recitation_sessions
       WHERE student_id = _student AND session_date >= _since),

    'assessments', COALESCE((
      SELECT jsonb_agg(x ORDER BY x->>'date' DESC) FROM (
        SELECT jsonb_build_object(
                 'date', a.created_at::date, 'score', a.score,
                 'surah_name', rs.surah_name, 'from_ayah', rs.from_ayah, 'to_ayah', rs.to_ayah,
                 'error_types', COALESCE((SELECT jsonb_agg(DISTINCT e->>'type')
                                            FROM jsonb_array_elements(
                                                   CASE WHEN jsonb_typeof(a.errors) = 'array'
                                                        THEN a.errors ELSE '[]'::jsonb END) e
                                           WHERE e->>'type' IS NOT NULL), '[]'::jsonb)) AS x
          FROM public.recitation_assessments a
          JOIN public.recitation_sessions rs ON rs.id = a.session_id
         WHERE a.student_id = _student AND a.created_at::date >= _since
         ORDER BY a.created_at DESC LIMIT 15) s), '[]'::jsonb),

    'avg_score', (SELECT round(avg(score)) FROM public.recitation_assessments
                   WHERE student_id = _student AND created_at::date >= _since),

    'error_counts', COALESCE((
      SELECT jsonb_object_agg(t, n) FROM (
        SELECT e->>'type' AS t, count(*) AS n
          FROM public.recitation_assessments a,
               jsonb_array_elements(CASE WHEN jsonb_typeof(a.errors) = 'array'
                                         THEN a.errors ELSE '[]'::jsonb END) e
         WHERE a.student_id = _student AND a.created_at::date >= _since
           AND e->>'type' IS NOT NULL
         GROUP BY 1) c), '{}'::jsonb),

    'assignments', (
      SELECT jsonb_build_object(
               'open', count(*) FILTER (WHERE status IN ('pending', 'redo')),
               'overdue', count(*) FILTER (WHERE status IN ('pending', 'redo') AND due_date < now()::date),
               'approved', count(*) FILTER (WHERE status = 'approved' AND updated_at::date >= _since))
        FROM public.assignments
       WHERE student_id = _student),

    'reviews', jsonb_build_object(
      'due', (SELECT count(*) FROM public.review_cards
               WHERE student_id = _student AND due_date <= now()::date),
      'cards', (SELECT count(*) FROM public.review_cards WHERE student_id = _student),
      'weak', COALESCE((
        SELECT jsonb_agg(x) FROM (
          SELECT jsonb_build_object('surah_name', surah_name, 'from_ayah', from_ayah,
                   'to_ayah', to_ayah, 'lapses', lapses, 'ease', ease, 'due_date', due_date) AS x
            FROM public.review_cards
           WHERE student_id = _student AND (lapses > 0 OR ease < 2.3)
           ORDER BY lapses DESC, ease ASC LIMIT 5) w), '[]'::jsonb))
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.teacher_student_week(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.teacher_student_week(uuid, integer) TO authenticated;

-- ─────────── خطط الحفظ ───────────
CREATE TABLE IF NOT EXISTS public.memorization_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  proposed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  teacher_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'approved', 'rejected', 'superseded')),
  week_start date NOT NULL DEFAULT (now()::date),
  items jsonb NOT NULL,
  rationale text CHECK (char_length(rationale) <= 1500),
  teacher_note text CHECK (char_length(teacher_note) <= 500),
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS memorization_plans_student_idx
  ON public.memorization_plans (student_id, created_at DESC);

ALTER TABLE public.memorization_plans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.memorization_plans FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.memorization_plans TO authenticated;
GRANT ALL ON public.memorization_plans TO service_role;

DROP POLICY IF EXISTS "plan read student teacher guardian" ON public.memorization_plans;
CREATE POLICY "plan read student teacher guardian" ON public.memorization_plans
  FOR SELECT TO authenticated
  USING (auth.uid() = student_id
         OR public.teaches_student(auth.uid(), student_id)
         OR public.is_guardian_of(auth.uid(), student_id));

-- عناصر الخطة: 1..40 عنصراً، لكلٍّ يوم (1..7) ونوع (new/review) وسورة ونطاق آيات صحيح.
CREATE OR REPLACE FUNCTION public.valid_plan_items(_items jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT jsonb_typeof(_items) = 'array'
     AND jsonb_array_length(_items) BETWEEN 1 AND 40
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(_items) e
        WHERE jsonb_typeof(e) <> 'object'
           OR NOT (e ?& ARRAY['day', 'kind', 'surah_name', 'from_ayah', 'to_ayah'])
           OR jsonb_typeof(e->'day') <> 'number'
           OR jsonb_typeof(e->'from_ayah') <> 'number'
           OR jsonb_typeof(e->'to_ayah') <> 'number'
           OR jsonb_typeof(e->'surah_name') <> 'string'
           OR (e->>'day')::numeric NOT BETWEEN 1 AND 7
           OR e->>'kind' NOT IN ('new', 'review')
           OR char_length(e->>'surah_name') NOT BETWEEN 2 AND 40
           OR (e->>'from_ayah')::numeric < 1
           OR (e->>'to_ayah')::numeric > 286
           OR (e->>'to_ayah')::numeric < (e->>'from_ayah')::numeric)
$$;

REVOKE ALL ON FUNCTION public.valid_plan_items(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.valid_plan_items(jsonb) TO authenticated, service_role;

-- الطالب نفسه أو معلّمه يقترح. الاقتراح السابق المعلّق يُستبدل. يُشعَر المعلّمون أو الطالب.
CREATE OR REPLACE FUNCTION public.propose_memorization_plan(
  _student uuid,
  _items jsonb,
  _rationale text DEFAULT NULL,
  _week_start date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _id uuid;
  _is_teacher boolean;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;
  _is_teacher := public.teaches_student(_uid, _student);
  IF _uid <> _student AND NOT _is_teacher THEN
    RAISE EXCEPTION 'NOT_YOUR_STUDENT';
  END IF;
  IF NOT public.valid_plan_items(_items) THEN
    RAISE EXCEPTION 'INVALID_PLAN';
  END IF;
  IF _week_start IS NOT NULL AND abs(_week_start - now()::date) > 14 THEN
    RAISE EXCEPTION 'INVALID_PLAN';
  END IF;

  UPDATE public.memorization_plans SET status = 'superseded', decided_at = now()
   WHERE student_id = _student AND status = 'proposed';

  INSERT INTO public.memorization_plans (student_id, proposed_by, status, week_start, items, rationale)
  VALUES (_student, _uid, 'proposed', COALESCE(_week_start, now()::date), _items,
          left(NULLIF(btrim(_rationale), ''), 1500))
  RETURNING id INTO _id;

  IF _uid = _student THEN
    INSERT INTO public.notifications (user_id, kind, title, body, link)
    SELECT DISTINCT h.teacher_id, 'plan', 'خطة حفظ بانتظار اعتمادك',
           COALESCE((SELECT name FROM public.profiles WHERE id = _student), 'طالب') || ' اقترح خطة الأسبوع.',
           '/quran/student/' || _student
      FROM public.halaqa_students hs
      JOIN public.halaqat h ON h.id = hs.halaqa_id
     WHERE hs.student_id = _student AND h.teacher_id IS NOT NULL
       AND public.is_teacher(h.teacher_id);
  ELSE
    INSERT INTO public.notifications (user_id, kind, title, body, link)
    VALUES (_student, 'plan', 'اقترح معلّمك خطة حفظ', 'راجعها في سجل الحفظ.', '/quran');
  END IF;

  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.propose_memorization_plan(uuid, jsonb, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.propose_memorization_plan(uuid, jsonb, text, date) TO authenticated;

-- معلّم الطالب وحده يعتمد أو يرفض، وله أن يعدّل العناصر قبل الاعتماد.
CREATE OR REPLACE FUNCTION public.decide_memorization_plan(
  _plan uuid,
  _approve boolean,
  _note text DEFAULT NULL,
  _items jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  p public.memorization_plans;
BEGIN
  SELECT * INTO p FROM public.memorization_plans WHERE id = _plan FOR UPDATE;
  IF p.id IS NULL OR _uid IS NULL OR NOT public.teaches_student(_uid, p.student_id) THEN
    RAISE EXCEPTION 'NOT_YOUR_STUDENT';
  END IF;
  IF p.status <> 'proposed' THEN
    RAISE EXCEPTION 'PLAN_NOT_PENDING';
  END IF;
  IF _items IS NOT NULL AND NOT public.valid_plan_items(_items) THEN
    RAISE EXCEPTION 'INVALID_PLAN';
  END IF;

  IF _approve THEN
    UPDATE public.memorization_plans SET status = 'superseded'
     WHERE student_id = p.student_id AND status = 'approved';
  END IF;

  UPDATE public.memorization_plans
     SET status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
         items = COALESCE(_items, items),
         teacher_id = _uid,
         teacher_note = left(NULLIF(btrim(_note), ''), 500),
         decided_at = now()
   WHERE id = _plan;

  IF p.student_id <> _uid THEN
    INSERT INTO public.notifications (user_id, kind, title, body, link)
    VALUES (p.student_id, 'plan',
            CASE WHEN _approve THEN 'اعتمد معلّمك خطة الحفظ' ELSE 'لم يعتمد معلّمك خطة الحفظ' END,
            left(NULLIF(btrim(_note), ''), 140), '/quran');
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.decide_memorization_plan(uuid, boolean, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_memorization_plan(uuid, boolean, text, jsonb) TO authenticated;
