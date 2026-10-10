-- ════════════════════════════════════════════════════════════════════
-- بوابة ولي الأمر
--
-- يربط ولي الأمر حسابه بحساب ابنه برمز ربط يُصدره الطالب نفسه أو معلّم حلقته،
-- ثم يرى عرضاً للقراءة فقط: الحلقات، والحضور، والواجبات، وتقييمات التسميع،
-- ونتائج الاختبارات، وما حُفظ من صفحات المصحف. ويصله إشعار عند كل تقييم
-- تسميع وعند كل غياب، ويستطيع مراسلة معلّم ابنه.
--
-- ما لا يراه ولي الأمر: المحاسبة الشخصية (muhasaba)، والمحادثات، والتسجيلات
-- الصوتية، وأرقام الهواتف. لا تُوسَّع سياسات RLS على جداول الطالب؛ العرض
-- كله من دالة واحدة guardian_child_overview تتحقق من الربط.
--
-- الفحوص: supabase/tests/checks.sql (43–46).
-- ════════════════════════════════════════════════════════════════════

-- ─── 1) الروابط ───
CREATE TABLE IF NOT EXISTS public.guardian_links (
  guardian_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  relation text NOT NULL DEFAULT 'guardian'
    CHECK (relation IN ('father', 'mother', 'guardian')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guardian_id, student_id),
  CONSTRAINT guardian_not_self CHECK (guardian_id <> student_id)
);
CREATE INDEX IF NOT EXISTS guardian_links_student_idx ON public.guardian_links (student_id);

ALTER TABLE public.guardian_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.guardian_links FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON public.guardian_links TO authenticated;
GRANT ALL ON public.guardian_links TO service_role;

-- ولي الأمر والطالب ومعلّم الطالب يرون الربط، وأيّ منهم يستطيع فكّه.
-- الإنشاء عبر claim_guardian_code فقط.
DROP POLICY IF EXISTS "guardian links visible to parties" ON public.guardian_links;
CREATE POLICY "guardian links visible to parties" ON public.guardian_links
  FOR SELECT TO authenticated
  USING (
    guardian_id = (SELECT auth.uid())
    OR student_id = (SELECT auth.uid())
    OR public.teaches_student((SELECT auth.uid()), student_id)
  );

DROP POLICY IF EXISTS "guardian links removable by parties" ON public.guardian_links;
CREATE POLICY "guardian links removable by parties" ON public.guardian_links
  FOR DELETE TO authenticated
  USING (
    guardian_id = (SELECT auth.uid())
    OR student_id = (SELECT auth.uid())
    OR public.teaches_student((SELECT auth.uid()), student_id)
  );

CREATE OR REPLACE FUNCTION public.is_guardian_of(_guardian uuid, _student uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.guardian_links
     WHERE guardian_id = _guardian AND student_id = _student
  )
$$;
REVOKE ALL ON FUNCTION public.is_guardian_of(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_guardian_of(uuid, uuid) TO authenticated, service_role;

-- ─── 2) رموز الربط ───
-- لا يقرؤها أحد مباشرة؛ الرمز يظهر مرة واحدة لمن أصدره.
CREATE TABLE IF NOT EXISTS public.guardian_link_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  relation text NOT NULL DEFAULT 'guardian'
    CHECK (relation IN ('father', 'mother', 'guardian')),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '72 hours'),
  used_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS guardian_link_codes_student_idx
  ON public.guardian_link_codes (student_id, created_at DESC);
ALTER TABLE public.guardian_link_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.guardian_link_codes FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.guardian_link_codes TO service_role;

-- محاولات الاستخدام الفاشلة: حدّ لتخمين الرموز.
CREATE TABLE IF NOT EXISTS public.guardian_claim_failures (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS guardian_claim_failures_idx ON public.guardian_claim_failures (user_id, at DESC);
ALTER TABLE public.guardian_claim_failures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.guardian_claim_failures FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.guardian_claim_failures TO service_role;

-- يُصدر رمز ربط لطالب: الطالب نفسه أو معلّم حلقته.
CREATE OR REPLACE FUNCTION public.create_guardian_code(_student uuid, _relation text DEFAULT 'guardian')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
  rel text := COALESCE(NULLIF(btrim(_relation), ''), 'guardian');
  new_code text;
  row_expires timestamptz;
  attempt integer;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول.';
  END IF;
  IF _student IS NULL OR NOT (caller = _student OR public.teaches_student(caller, _student)) THEN
    RAISE EXCEPTION 'لا تملك إصدار رمز ربط لهذا الطالب.';
  END IF;
  IF rel NOT IN ('father', 'mother', 'guardian') THEN
    RAISE EXCEPTION 'صلة القرابة غير صحيحة.';
  END IF;
  IF (SELECT count(*) FROM public.guardian_links WHERE student_id = _student) >= 4 THEN
    RAISE EXCEPTION 'بلغ الطالب الحد الأقصى لأولياء الأمور (4).';
  END IF;

  -- رمز واحد صالح في كل مرة لكل طالب: يُلغى السابق غير المستخدم.
  UPDATE public.guardian_link_codes
     SET expires_at = now()
   WHERE student_id = _student AND used_at IS NULL AND expires_at > now();

  FOR attempt IN 1..5 LOOP
    new_code := upper(left(replace(gen_random_uuid()::text, '-', ''), 10));
    BEGIN
      INSERT INTO public.guardian_link_codes (code, student_id, created_by, relation)
      VALUES (new_code, _student, caller, rel)
      RETURNING expires_at INTO row_expires;
      RETURN jsonb_build_object('code', new_code, 'expires_at', row_expires);
    EXCEPTION WHEN unique_violation THEN
      NULL;
    END;
  END LOOP;
  RAISE EXCEPTION 'تعذّر توليد رمز فريد، حاول مرة أخرى.';
END;
$$;
REVOKE ALL ON FUNCTION public.create_guardian_code(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_guardian_code(uuid, text) TO authenticated;

-- يستخدم ولي الأمر الرمز فيُربط حسابه بحساب الطالب.
-- الرمز الخاطئ لا يرفع استثناءً (حتى تُحفظ المحاولة الفاشلة)، بل يعيد خطأ.
CREATE OR REPLACE FUNCTION public.claim_guardian_code(_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
  clean text := upper(regexp_replace(COALESCE(_code, ''), '[^0-9A-Za-z]', '', 'g'));
  c public.guardian_link_codes;
  child_name text;
  guardian_name text;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول.';
  END IF;

  IF (SELECT count(*) FROM public.guardian_claim_failures
       WHERE user_id = caller AND at > now() - interval '1 hour') >= 10 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'محاولات كثيرة، حاول بعد ساعة.');
  END IF;

  SELECT * INTO c FROM public.guardian_link_codes WHERE code = clean FOR UPDATE;

  IF c.id IS NULL OR c.used_at IS NOT NULL OR c.expires_at <= now() THEN
    INSERT INTO public.guardian_claim_failures (user_id) VALUES (caller);
    RETURN jsonb_build_object('ok', false, 'error', 'الرمز غير صحيح أو انتهت صلاحيته.');
  END IF;
  IF c.student_id = caller THEN
    RETURN jsonb_build_object('ok', false, 'error', 'لا يمكنك ربط حسابك بنفسك.');
  END IF;
  IF (SELECT count(*) FROM public.guardian_links WHERE student_id = c.student_id) >= 4 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'بلغ الطالب الحد الأقصى لأولياء الأمور.');
  END IF;

  INSERT INTO public.guardian_links (guardian_id, student_id, relation)
  VALUES (caller, c.student_id, c.relation)
  ON CONFLICT (guardian_id, student_id) DO UPDATE SET relation = EXCLUDED.relation;

  UPDATE public.guardian_link_codes SET used_by = caller, used_at = now() WHERE id = c.id;

  SELECT name INTO child_name FROM public.profiles WHERE id = c.student_id;
  SELECT name INTO guardian_name FROM public.profiles WHERE id = caller;

  -- يعلم الطالب أن حساباً رُبط به، فإن لم يعرفه فكّ الربط من صفحته.
  INSERT INTO public.notifications (user_id, kind, title, body, link)
  VALUES (c.student_id, 'guardian', 'رُبط ولي أمر بحسابك',
          COALESCE(guardian_name, 'مستخدم') || ' صار يتابع تقدّمك. إن لم تعرفه فأزل الربط من ملفك.',
          '/profile');

  RETURN jsonb_build_object('ok', true, 'student_id', c.student_id, 'name', child_name);
END;
$$;
REVOKE ALL ON FUNCTION public.claim_guardian_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_guardian_code(text) TO authenticated;

-- ─── 3) القوائم ───
-- أبنائي (لولي الأمر).
CREATE OR REPLACE FUNCTION public.my_guardian_children()
RETURNS TABLE (student_id uuid, name text, relation text, linked_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT g.student_id, COALESCE(p.name, 'طالب'), g.relation, g.created_at
    FROM public.guardian_links g
    LEFT JOIN public.profiles p ON p.id = g.student_id
   WHERE g.guardian_id = auth.uid()
   ORDER BY g.created_at
$$;
REVOKE ALL ON FUNCTION public.my_guardian_children() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_guardian_children() TO authenticated;

-- أولياء أمر طالب (للطالب نفسه أو معلّمه).
CREATE OR REPLACE FUNCTION public.student_guardians(_student uuid)
RETURNS TABLE (guardian_id uuid, name text, relation text, linked_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT g.guardian_id, COALESCE(p.name, 'ولي أمر'), g.relation, g.created_at
    FROM public.guardian_links g
    LEFT JOIN public.profiles p ON p.id = g.guardian_id
   WHERE g.student_id = _student
     AND (auth.uid() = _student OR public.teaches_student(auth.uid(), _student))
   ORDER BY g.created_at
$$;
REVOKE ALL ON FUNCTION public.student_guardians(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.student_guardians(uuid) TO authenticated;

-- ─── 4) عرض ولي الأمر ───
CREATE OR REPLACE FUNCTION public.guardian_child_overview(_student uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_guardian_of(auth.uid(), _student) THEN
    RAISE EXCEPTION 'لا تملك متابعة هذا الطالب.';
  END IF;

  SELECT jsonb_build_object(
    'student', (SELECT jsonb_build_object('id', p.id, 'name', p.name)
                  FROM public.profiles p WHERE p.id = _student),

    'halaqat', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', h.id, 'name', h.name, 'schedule', h.schedule,
               'teacher_id', h.teacher_id, 'teacher_name', tp.name,
               'center_name', c.name) ORDER BY h.name)
        FROM public.halaqa_students hs
        JOIN public.halaqat h ON h.id = hs.halaqa_id
        LEFT JOIN public.profiles tp ON tp.id = h.teacher_id
        LEFT JOIN public.centers c ON c.id = h.center_id
       WHERE hs.student_id = _student), '[]'::jsonb),

    'attendance_30d', (
      SELECT jsonb_build_object(
               'present', count(*) FILTER (WHERE status = 'present'),
               'late', count(*) FILTER (WHERE status = 'late'),
               'absent', count(*) FILTER (WHERE status = 'absent'),
               'excused', count(*) FILTER (WHERE status = 'excused'))
        FROM public.attendance
       WHERE student_id = _student AND session_date > (now()::date - 30)),

    'attendance', COALESCE((
      SELECT jsonb_agg(x ORDER BY x->>'date' DESC) FROM (
        SELECT jsonb_build_object('date', session_date, 'status', status, 'reason', reason) AS x
          FROM public.attendance
         WHERE student_id = _student
         ORDER BY session_date DESC LIMIT 10) s), '[]'::jsonb),

    'assignments', COALESCE((
      SELECT jsonb_agg(x ORDER BY x->>'due_date' DESC) FROM (
        SELECT jsonb_build_object('id', id, 'kind', kind, 'surah_name', surah_name,
                 'from_ayah', from_ayah, 'to_ayah', to_ayah, 'due_date', due_date,
                 'status', status, 'instructions', instructions) AS x
          FROM public.assignments
         WHERE student_id = _student
         ORDER BY due_date DESC LIMIT 15) s), '[]'::jsonb),

    'assessments', COALESCE((
      SELECT jsonb_agg(x ORDER BY x->>'created_at' DESC) FROM (
        SELECT jsonb_build_object('id', a.id, 'score', a.score, 'approved', a.approved,
                 'teacher_notes', a.teacher_notes, 'created_at', a.created_at,
                 'surah_name', rs.surah_name, 'from_ayah', rs.from_ayah, 'to_ayah', rs.to_ayah) AS x
          FROM public.recitation_assessments a
          JOIN public.recitation_sessions rs ON rs.id = a.session_id
         WHERE a.student_id = _student
         ORDER BY a.created_at DESC LIMIT 10) s), '[]'::jsonb),

    'exams', COALESCE((
      SELECT jsonb_agg(x ORDER BY x->>'created_at' DESC) FROM (
        SELECT jsonb_build_object('id', r.id, 'title', e.title, 'percentage', r.percentage,
                 'mastery', r.mastery, 'created_at', r.created_at) AS x
          FROM public.exam_results r
          JOIN public.exams e ON e.id = r.exam_id
         WHERE r.student_id = _student
         ORDER BY r.created_at DESC LIMIT 10) s), '[]'::jsonb),

    'mushaf', (
      SELECT jsonb_build_object(
               'memorized_pages', count(DISTINCT page) FILTER (WHERE kind = 'memorize'),
               'last_session', max(session_date))
        FROM public.mushaf_records
       WHERE student_id = _student)
  ) INTO result;

  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.guardian_child_overview(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guardian_child_overview(uuid) TO authenticated;

-- ─── 5) إشعارات ولي الأمر ───
CREATE OR REPLACE FUNCTION public.notify_guardians(_student uuid, _kind text, _title text, _body text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.notifications (user_id, kind, title, body, link)
  SELECT g.guardian_id, _kind, _title, _body, '/family'
    FROM public.guardian_links g
   WHERE g.student_id = _student
$$;
REVOKE ALL ON FUNCTION public.notify_guardians(uuid, text, text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.guardian_notify_assessment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.recitation_sessions;
  child text;
BEGIN
  SELECT * INTO s FROM public.recitation_sessions WHERE id = NEW.session_id;
  SELECT name INTO child FROM public.profiles WHERE id = NEW.student_id;
  PERFORM public.notify_guardians(
    NEW.student_id, 'guardian',
    CASE WHEN NEW.approved THEN 'اعتُمد تسميع ' ELSE 'طُلبت إعادة تسميع ' END || COALESCE(child, 'ابنك'),
    'سورة ' || COALESCE(s.surah_name, '') || ' [' || COALESCE(s.from_ayah, 0) || '–' || COALESCE(s.to_ayah, 0) || ']'
      || CASE WHEN NEW.score IS NOT NULL THEN ' · الدرجة ' || NEW.score || '/100' ELSE '' END);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guardian_notify_assessment() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guardian_notify_assessment ON public.recitation_assessments;
CREATE TRIGGER guardian_notify_assessment
  AFTER INSERT ON public.recitation_assessments
  FOR EACH ROW EXECUTE FUNCTION public.guardian_notify_assessment();

CREATE OR REPLACE FUNCTION public.guardian_notify_absence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  child text;
BEGIN
  IF NEW.status <> 'absent' OR (TG_OP = 'UPDATE' AND OLD.status = 'absent') THEN
    RETURN NEW;
  END IF;
  SELECT name INTO child FROM public.profiles WHERE id = NEW.student_id;
  PERFORM public.notify_guardians(
    NEW.student_id, 'guardian',
    'غياب ' || COALESCE(child, 'ابنك') || ' عن الحلقة',
    'سُجّل غياب بتاريخ ' || NEW.session_date::text || '.');
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guardian_notify_absence() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guardian_notify_absence ON public.attendance;
CREATE TRIGGER guardian_notify_absence
  AFTER INSERT OR UPDATE OF status ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION public.guardian_notify_absence();

-- ─── 6) المحادثات: ولي الأمر ↔ معلّم ابنه ───
CREATE OR REPLACE FUNCTION public.guardian_meets_teacher(_guardian uuid, _teacher uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _guardian IS NOT NULL AND _teacher IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.guardian_links g
     WHERE g.guardian_id = _guardian
       AND public.teaches_student(_teacher, g.student_id)
  )
$$;
REVOKE ALL ON FUNCTION public.guardian_meets_teacher(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guardian_meets_teacher(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_start_chat(_a uuid, _b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _a IS NOT NULL
     AND _b IS NOT NULL
     AND _a <> _b
     AND (
       public.teaches_student(_a, _b)
       OR public.teaches_student(_b, _a)
       OR (public.is_teacher(_a) AND public.is_teacher(_b))
       OR public.are_classmates(_a, _b)
       OR public.guardian_meets_teacher(_a, _b)
       OR public.guardian_meets_teacher(_b, _a)
     )
$$;

CREATE OR REPLACE FUNCTION public.my_chat_contacts()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- طلاب حلقاتي (إن كنت معلّماً)
  SELECT DISTINCT hs.student_id
    FROM public.halaqa_students hs
    JOIN public.halaqat h ON h.id = hs.halaqa_id
   WHERE h.teacher_id = auth.uid()
     AND public.is_teacher(auth.uid())
  UNION
  -- معلّمو حلقاتي (إن كنت طالباً فيها)
  SELECT DISTINCT h.teacher_id
    FROM public.halaqa_students hs
    JOIN public.halaqat h ON h.id = hs.halaqa_id
   WHERE hs.student_id = auth.uid()
     AND h.teacher_id IS NOT NULL
     AND public.is_teacher(h.teacher_id)
  UNION
  -- زملائي في الحلقات نفسها
  SELECT DISTINCT y.student_id
    FROM public.halaqa_students x
    JOIN public.halaqa_students y ON y.halaqa_id = x.halaqa_id
   WHERE x.student_id = auth.uid()
     AND y.student_id <> auth.uid()
  UNION
  -- بقية المعلّمين (إن كنت معلّماً)
  SELECT ur.user_id
    FROM public.user_roles ur
   WHERE ur.role = 'teacher'
     AND public.is_teacher(auth.uid())
     AND ur.user_id <> auth.uid()
  UNION
  -- معلّمو أبنائي (إن كنت ولي أمر)
  SELECT DISTINCT h.teacher_id
    FROM public.guardian_links g
    JOIN public.halaqa_students hs ON hs.student_id = g.student_id
    JOIN public.halaqat h ON h.id = hs.halaqa_id
   WHERE g.guardian_id = auth.uid()
     AND h.teacher_id IS NOT NULL
     AND public.is_teacher(h.teacher_id)
  UNION
  -- أولياء أمور طلابي (إن كنت معلّماً)
  SELECT DISTINCT g.guardian_id
    FROM public.guardian_links g
   WHERE public.teaches_student(auth.uid(), g.student_id)
$$;
