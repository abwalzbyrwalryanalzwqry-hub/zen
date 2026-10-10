-- ════════════════════════════════════════════════════════════════════════════
-- المرحلة 11.3 — الأهداف العائلية
-- ════════════════════════════════════════════════════════════════════════════
-- يضع وليّ الأمر لابنه هدفاً (صفحات حفظ، أو أجزاء، أو أيام نشاط، أو حضور، أو سلسلة) بمكافأة رمزية
-- يكتبها هو («نزهة يوم الجمعة»). يقرؤه الطالب ووليّه فقط. التقدّم محسوب من سجل الطالب نفسه منذ بدء
-- الهدف، لا يُكتب يدوياً. لا مقارنة بين الأبناء: كل استعلام لطالب واحد، ولا ترتيب ولا درجات.

CREATE TABLE IF NOT EXISTS public.family_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guardian_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('pages', 'juz', 'active_days', 'attendance', 'streak')),
  target int NOT NULL CHECK (target BETWEEN 1 AND 604),
  title text CHECK (title IS NULL OR char_length(title) <= 80),
  reward text CHECK (reward IS NULL OR char_length(reward) <= 80),
  starts_on date NOT NULL DEFAULT current_date,
  ends_on date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'done', 'cancelled')),
  achieved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on IS NULL OR ends_on >= starts_on)
);
CREATE INDEX IF NOT EXISTS family_goals_student_idx ON public.family_goals (student_id, status);
CREATE INDEX IF NOT EXISTS family_goals_guardian_idx ON public.family_goals (guardian_id);
ALTER TABLE public.family_goals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.family_goals FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.family_goals TO service_role;
-- لا قراءة ولا كتابة مباشرة: عبر الدوال أدناه فقط.

-- تقدّم هدف من سجل الطالب منذ بدايته. داخلي.
CREATE OR REPLACE FUNCTION public.family_goal_progress(_g public.family_goals)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE _g.kind
    WHEN 'pages' THEN (SELECT count(DISTINCT page) FROM public.mushaf_records
                        WHERE student_id = _g.student_id AND kind = 'memorize' AND session_date >= _g.starts_on)
    WHEN 'juz' THEN (SELECT count(*) FROM public.student_badges
                      WHERE student_id = _g.student_id AND kind = 'juz' AND earned_at >= _g.starts_on)
    WHEN 'active_days' THEN (SELECT count(DISTINCT day) FROM public.student_activity_days(_g.student_id, _g.starts_on)
                              WHERE day >= _g.starts_on)
    WHEN 'attendance' THEN (SELECT count(*) FROM public.attendance
                             WHERE student_id = _g.student_id AND status IN ('present', 'late')
                               AND session_date >= _g.starts_on)
    WHEN 'streak' THEN (public.streak_of(_g.student_id)->>'current')::int
  END::int
$$;
REVOKE ALL ON FUNCTION public.family_goal_progress(public.family_goals) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.family_goal_progress(public.family_goals) TO service_role;

-- أهداف طالب واحد مع تقدّمها، للطالب نفسه أو لوليّه. يُعلّم المكتمل ويُشعر الطرفين مرة واحدة.
CREATE OR REPLACE FUNCTION public.family_goals_for(_student uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := (SELECT auth.uid());
  g public.family_goals%ROWTYPE;
  p int;
  res jsonb := '[]'::jsonb;
BEGIN
  IF caller IS NULL OR NOT (caller = _student OR public.is_guardian_of(caller, _student)) THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;
  FOR g IN
    SELECT * FROM public.family_goals
     WHERE student_id = _student AND status <> 'cancelled'
       AND (status = 'active' OR achieved_at > now() - interval '60 days')
     ORDER BY status, created_at DESC
  LOOP
    p := public.family_goal_progress(g);
    IF g.status = 'active' AND p >= g.target THEN
      UPDATE public.family_goals SET status = 'done', achieved_at = now() WHERE id = g.id AND status = 'active';
      IF FOUND THEN
        g.status := 'done';
        g.achieved_at := now();
        INSERT INTO public.notifications (user_id, kind, title, body, link) VALUES
          (g.student_id, 'achievement', 'أتممت هدفك العائلي',
           COALESCE(g.title, 'هدف عائلي') || COALESCE(' · المكافأة: ' || g.reward, ''), '/achievements'),
          (g.guardian_id, 'guardian', 'أتمّ ابنك هدفه',
           COALESCE(g.title, 'هدف عائلي') || COALESCE(' · المكافأة: ' || g.reward, ''), '/family');
      END IF;
    END IF;
    res := res || jsonb_build_object(
      'id', g.id, 'kind', g.kind, 'target', g.target, 'progress', LEAST(p, g.target),
      'title', g.title, 'reward', g.reward, 'starts_on', g.starts_on, 'ends_on', g.ends_on,
      'status', g.status, 'achieved_at', g.achieved_at,
      'expired', g.status = 'active' AND g.ends_on IS NOT NULL AND g.ends_on < current_date,
      'mine', g.guardian_id = caller);
  END LOOP;
  RETURN res;
END;
$$;
REVOKE ALL ON FUNCTION public.family_goals_for(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.family_goals_for(uuid) TO authenticated;

-- وليّ الأمر يضع هدفاً لابنه (حتى 3 أهداف نشطة منه لكل ابن)، ويُشعَر الابن.
CREATE OR REPLACE FUNCTION public.set_family_goal(
  _student uuid, _kind text, _target int, _title text DEFAULT NULL, _reward text DEFAULT NULL,
  _ends_on date DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := (SELECT auth.uid());
  gid uuid;
BEGIN
  IF caller IS NULL OR NOT public.is_guardian_of(caller, _student) THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  IF (SELECT count(*) FROM public.family_goals
       WHERE guardian_id = caller AND student_id = _student AND status = 'active') >= 3 THEN
    RAISE EXCEPTION 'TOO_MANY_GOALS';
  END IF;
  IF _ends_on IS NOT NULL AND _ends_on < current_date THEN RAISE EXCEPTION 'INVALID_DATE'; END IF;
  INSERT INTO public.family_goals (guardian_id, student_id, kind, target, title, reward, ends_on)
  VALUES (caller, _student, _kind, _target, NULLIF(btrim(_title), ''), NULLIF(btrim(_reward), ''), _ends_on)
  RETURNING id INTO gid;
  INSERT INTO public.notifications (user_id, kind, title, body, link)
  VALUES (_student, 'guardian', 'هدف عائلي جديد',
          COALESCE(NULLIF(btrim(_title), ''), 'هدف من وليّ أمرك') || COALESCE(' · المكافأة: ' || NULLIF(btrim(_reward), ''), ''),
          '/achievements');
  RETURN gid;
END;
$$;
REVOKE ALL ON FUNCTION public.set_family_goal(uuid, text, int, text, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_family_goal(uuid, text, int, text, text, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_family_goal(_goal uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.family_goals SET status = 'cancelled'
   WHERE id = _goal AND guardian_id = (SELECT auth.uid()) AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.cancel_family_goal(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_family_goal(uuid) TO authenticated;
