-- ════════════════════════════════════════════════════════════════════
-- المرحلة 11: إدارة المراكز والتقارير
--
-- 1) طاقم المركز: «مدير» و«مشرف» ينضمّان برمز يُصدره منشئ المركز، ويريان لوحة
--    المركز. المدير يدير مواعيد الحلقات أيضاً. لا يُمنح أيٌّ منهما دور «معلّم»،
--    ولا تُوسَّع سياسات RLS على جداول الطالب: كل ما يراه يأتي من دوال
--    SECURITY DEFINER تتحقق من العضوية (كما في بوابة ولي الأمر).
-- 2) جدول مواعيد الحلقات (halaqa_schedule): يوم وساعة ومكان أو رابط.
-- 3) لوحة المركز center_dashboard: الحضور والحفظ والتسميع والاختبارات لكل
--    حلقة، ونشاط المعلّمين، والطلاب المحتاجون متابعة، واتجاه الحضور أسبوعياً.
-- 4) تقرير الطالب student_report لفترة محددة: للطالب ومعلّمه وولي أمره وطاقم
--    مركزه. يُصدَّر PDF وExcel من الواجهة.
-- 5) التقرير الأسبوعي لولي الأمر: send_guardian_weekly_reports يرسل إشعاراً
--    ملخّصاً مرة واحدة في الأسبوع لكل (ولي أمر، ابن)، ويُجدوَل بـ pg_cron إن وُجد.
--
-- ما لا يراه طاقم المركز: المحاسبة الشخصية، والمحادثات، والتسجيلات الصوتية،
-- وأرقام الهواتف.
--
-- الفحوص: supabase/tests/checks.sql (47–52).
-- ════════════════════════════════════════════════════════════════════

-- ─── 1) طاقم المركز ───
CREATE TABLE IF NOT EXISTS public.center_staff (
  center_id uuid NOT NULL REFERENCES public.centers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'supervisor' CHECK (role IN ('manager', 'supervisor')),
  added_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (center_id, user_id)
);
CREATE INDEX IF NOT EXISTS center_staff_user_idx ON public.center_staff (user_id);

ALTER TABLE public.center_staff ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.center_staff FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON public.center_staff TO authenticated;
GRANT ALL ON public.center_staff TO service_role;

-- هل هذا المستخدم مدير للمركز؟ (منشئه، أو عضو طاقم بدور «مدير»)
CREATE OR REPLACE FUNCTION public.manages_center(_uid uuid, _center uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _uid IS NOT NULL AND _center IS NOT NULL AND (
    public.owns_center(_uid, _center)
    OR EXISTS (SELECT 1 FROM public.center_staff s
                WHERE s.center_id = _center AND s.user_id = _uid AND s.role = 'manager')
  )
$$;
REVOKE ALL ON FUNCTION public.manages_center(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manages_center(uuid, uuid) TO authenticated, service_role;

-- هل يرى هذا المستخدم لوحة المركز؟ (منشئه أو أي عضو في طاقمه)
CREATE OR REPLACE FUNCTION public.can_view_center(_uid uuid, _center uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _uid IS NOT NULL AND _center IS NOT NULL AND (
    public.owns_center(_uid, _center)
    OR EXISTS (SELECT 1 FROM public.center_staff s
                WHERE s.center_id = _center AND s.user_id = _uid)
  )
$$;
REVOKE ALL ON FUNCTION public.can_view_center(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_center(uuid, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.can_view_center IS
  'صحيح إذا كان _uid منشئ المركز أو عضواً في طاقمه (مدير أو مشرف).';

-- الطاقم يراه صاحبه ومنشئ المركز وبقية طاقمه. الحذف: منشئ المركز، أو العضو نفسه (انسحاب).
DROP POLICY IF EXISTS "center staff visible to center" ON public.center_staff;
CREATE POLICY "center staff visible to center" ON public.center_staff
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR public.can_view_center((SELECT auth.uid()), center_id)
  );

DROP POLICY IF EXISTS "center staff removable by owner or self" ON public.center_staff;
CREATE POLICY "center staff removable by owner or self" ON public.center_staff
  FOR DELETE TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR public.owns_center((SELECT auth.uid()), center_id)
  );

-- رموز الانضمام إلى الطاقم — لا يقرؤها أحد مباشرة.
CREATE TABLE IF NOT EXISTS public.center_staff_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  center_id uuid NOT NULL REFERENCES public.centers(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('manager', 'supervisor')),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '72 hours'),
  used_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS center_staff_codes_center_idx
  ON public.center_staff_codes (center_id, created_at DESC);
ALTER TABLE public.center_staff_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.center_staff_codes FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.center_staff_codes TO service_role;

CREATE TABLE IF NOT EXISTS public.center_code_failures (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS center_code_failures_idx ON public.center_code_failures (user_id, at DESC);
ALTER TABLE public.center_code_failures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.center_code_failures FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.center_code_failures TO service_role;

-- يُصدر منشئ المركز وحده رمز انضمام. الحد: 10 أعضاء طاقم لكل مركز.
CREATE OR REPLACE FUNCTION public.create_center_staff_code(_center uuid, _role text DEFAULT 'supervisor')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
  r text := COALESCE(NULLIF(btrim(_role), ''), 'supervisor');
  new_code text;
  row_expires timestamptz;
  attempt integer;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول.';
  END IF;
  IF NOT public.owns_center(caller, _center) THEN
    RAISE EXCEPTION 'إصدار رموز الطاقم لمنشئ المركز فقط.';
  END IF;
  IF r NOT IN ('manager', 'supervisor') THEN
    RAISE EXCEPTION 'الدور غير صحيح.';
  END IF;
  IF (SELECT count(*) FROM public.center_staff WHERE center_id = _center) >= 10 THEN
    RAISE EXCEPTION 'بلغ المركز الحد الأقصى لأعضاء الطاقم (10).';
  END IF;

  -- رمز واحد صالح في كل مرة لكل مركز.
  UPDATE public.center_staff_codes
     SET expires_at = now()
   WHERE center_id = _center AND used_at IS NULL AND expires_at > now();

  FOR attempt IN 1..5 LOOP
    new_code := upper(left(replace(gen_random_uuid()::text, '-', ''), 10));
    BEGIN
      INSERT INTO public.center_staff_codes (code, center_id, role, created_by)
      VALUES (new_code, _center, r, caller)
      RETURNING expires_at INTO row_expires;
      RETURN jsonb_build_object('code', new_code, 'role', r, 'expires_at', row_expires);
    EXCEPTION WHEN unique_violation THEN
      NULL;
    END;
  END LOOP;
  RAISE EXCEPTION 'تعذّر توليد رمز فريد، حاول مرة أخرى.';
END;
$$;
REVOKE ALL ON FUNCTION public.create_center_staff_code(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_center_staff_code(uuid, text) TO authenticated;

-- يستخدم العضو الرمز فينضم إلى الطاقم. الخطأ يُعاد ولا يُرمى حتى تُحفظ المحاولة الفاشلة.
CREATE OR REPLACE FUNCTION public.claim_center_staff_code(_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
  clean text := upper(regexp_replace(COALESCE(_code, ''), '[^0-9A-Za-z]', '', 'g'));
  c public.center_staff_codes;
  center_name text;
  member_name text;
  owner uuid;
BEGIN
  IF caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'يجب تسجيل الدخول.');
  END IF;
  IF (SELECT count(*) FROM public.center_code_failures
       WHERE user_id = caller AND at > now() - interval '1 hour') >= 10 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'محاولات كثيرة، حاول بعد ساعة.');
  END IF;

  SELECT * INTO c FROM public.center_staff_codes WHERE code = clean FOR UPDATE;
  IF c.id IS NULL OR c.used_at IS NOT NULL OR c.expires_at <= now() THEN
    INSERT INTO public.center_code_failures (user_id) VALUES (caller);
    RETURN jsonb_build_object('ok', false, 'error', 'الرمز غير صحيح أو انتهت صلاحيته.');
  END IF;

  SELECT name, created_by INTO center_name, owner FROM public.centers WHERE id = c.center_id;
  IF owner = caller THEN
    RETURN jsonb_build_object('ok', false, 'error', 'أنت منشئ هذا المركز أصلاً.');
  END IF;

  INSERT INTO public.center_staff (center_id, user_id, role, added_by)
  VALUES (c.center_id, caller, c.role, c.created_by)
  ON CONFLICT (center_id, user_id) DO UPDATE SET role = EXCLUDED.role;

  UPDATE public.center_staff_codes SET used_by = caller, used_at = now() WHERE id = c.id;

  SELECT name INTO member_name FROM public.profiles WHERE id = caller;
  INSERT INTO public.notifications (user_id, kind, title, body, link)
  VALUES (owner, 'center',
          'انضم ' || COALESCE(member_name, 'عضو') || ' إلى طاقم ' || COALESCE(center_name, 'المركز'),
          CASE WHEN c.role = 'manager' THEN 'بدور مدير.' ELSE 'بدور مشرف.' END,
          '/center/' || c.center_id::text);

  RETURN jsonb_build_object('ok', true, 'center_id', c.center_id,
                            'center_name', center_name, 'role', c.role);
END;
$$;
REVOKE ALL ON FUNCTION public.claim_center_staff_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_center_staff_code(text) TO authenticated;

-- المراكز التي أراها في لوحة الإدارة، مع دوري فيها.
CREATE OR REPLACE FUNCTION public.my_managed_centers()
RETURNS TABLE (center_id uuid, name text, city text, role text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.name, c.city, 'owner'::text
    FROM public.centers c
   WHERE c.created_by = auth.uid() AND public.is_teacher(auth.uid())
  UNION ALL
  SELECT c.id, c.name, c.city, s.role
    FROM public.center_staff s
    JOIN public.centers c ON c.id = s.center_id
   WHERE s.user_id = auth.uid()
     AND c.created_by IS DISTINCT FROM auth.uid()
$$;
REVOKE ALL ON FUNCTION public.my_managed_centers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_managed_centers() TO authenticated;

-- طاقم مركز بأسمائهم (دون هواتف).
CREATE OR REPLACE FUNCTION public.center_staff_list(_center uuid)
RETURNS TABLE (user_id uuid, name text, role text, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.user_id, COALESCE(p.name, 'عضو'), s.role, s.created_at
    FROM public.center_staff s
    LEFT JOIN public.profiles p ON p.id = s.user_id
   WHERE s.center_id = _center
     AND public.can_view_center(auth.uid(), _center)
   ORDER BY s.created_at
$$;
REVOKE ALL ON FUNCTION public.center_staff_list(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.center_staff_list(uuid) TO authenticated;

-- ─── 2) مواعيد الحلقات ───
CREATE TABLE IF NOT EXISTS public.halaqa_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  halaqa_id uuid NOT NULL REFERENCES public.halaqat(id) ON DELETE CASCADE,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6), -- 0 = الأحد
  start_time time NOT NULL,
  end_time time NOT NULL,
  location text CHECK (location IS NULL OR char_length(location) <= 120),
  online_url text CHECK (online_url IS NULL OR (online_url ~ '^https://' AND char_length(online_url) <= 300)),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT halaqa_schedule_time_order CHECK (end_time > start_time)
);
CREATE INDEX IF NOT EXISTS halaqa_schedule_halaqa_idx ON public.halaqa_schedule (halaqa_id, weekday);

ALTER TABLE public.halaqa_schedule ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.halaqa_schedule FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.halaqa_schedule TO authenticated;
GRANT ALL ON public.halaqa_schedule TO service_role;

-- يعدّل المواعيد معلّم الحلقة أو منشئ مركزها (manages_halaqa) أو مدير المركز.
CREATE OR REPLACE FUNCTION public.can_manage_schedule(_uid uuid, _halaqa uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.manages_halaqa(_uid, _halaqa)
      OR EXISTS (SELECT 1 FROM public.halaqat h
                  WHERE h.id = _halaqa AND public.manages_center(_uid, h.center_id))
$$;
REVOKE ALL ON FUNCTION public.can_manage_schedule(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_schedule(uuid, uuid) TO authenticated, service_role;

-- يرى المواعيد أعضاء الحلقة وأولياء أمورهم ومعلّمها وطاقم مركزها.
CREATE OR REPLACE FUNCTION public.can_view_schedule(_uid uuid, _halaqa uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _uid IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.halaqa_students hs
             WHERE hs.halaqa_id = _halaqa
               AND (hs.student_id = _uid OR public.is_guardian_of(_uid, hs.student_id)))
    OR EXISTS (SELECT 1 FROM public.halaqat h
                WHERE h.id = _halaqa
                  AND (h.teacher_id = _uid OR public.can_view_center(_uid, h.center_id)))
  )
$$;
REVOKE ALL ON FUNCTION public.can_view_schedule(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_schedule(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "schedule visible to halaqa" ON public.halaqa_schedule;
CREATE POLICY "schedule visible to halaqa" ON public.halaqa_schedule
  FOR SELECT TO authenticated
  USING (public.can_view_schedule((SELECT auth.uid()), halaqa_id));

DROP POLICY IF EXISTS "schedule insert by managers" ON public.halaqa_schedule;
CREATE POLICY "schedule insert by managers" ON public.halaqa_schedule
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_manage_schedule((SELECT auth.uid()), halaqa_id)
    AND created_by = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS "schedule update by managers" ON public.halaqa_schedule;
CREATE POLICY "schedule update by managers" ON public.halaqa_schedule
  FOR UPDATE TO authenticated
  USING (public.can_manage_schedule((SELECT auth.uid()), halaqa_id))
  WITH CHECK (public.can_manage_schedule((SELECT auth.uid()), halaqa_id));

DROP POLICY IF EXISTS "schedule delete by managers" ON public.halaqa_schedule;
CREATE POLICY "schedule delete by managers" ON public.halaqa_schedule
  FOR DELETE TO authenticated
  USING (public.can_manage_schedule((SELECT auth.uid()), halaqa_id));

-- مواعيدي: حلقاتي طالباً أو معلّماً، وحلقات أبنائي ولياً للأمر.
CREATE OR REPLACE FUNCTION public.my_halaqa_schedule()
RETURNS TABLE (
  slot_id uuid, halaqa_id uuid, halaqa_name text, center_name text, teacher_name text,
  weekday smallint, start_time time, end_time time, location text, online_url text,
  as_role text, child_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH mine AS (
    SELECT hs.halaqa_id, 'student'::text AS as_role, NULL::text AS child_name
      FROM public.halaqa_students hs WHERE hs.student_id = auth.uid()
    UNION
    SELECT h.id, 'teacher', NULL FROM public.halaqat h WHERE h.teacher_id = auth.uid()
    UNION
    SELECT hs.halaqa_id, 'guardian', p.name
      FROM public.guardian_links g
      JOIN public.halaqa_students hs ON hs.student_id = g.student_id
      LEFT JOIN public.profiles p ON p.id = g.student_id
     WHERE g.guardian_id = auth.uid()
  )
  SELECT s.id, h.id, h.name, c.name, tp.name,
         s.weekday, s.start_time, s.end_time, s.location, s.online_url,
         m.as_role, m.child_name
    FROM mine m
    JOIN public.halaqat h ON h.id = m.halaqa_id
    JOIN public.halaqa_schedule s ON s.halaqa_id = h.id
    LEFT JOIN public.centers c ON c.id = h.center_id
    LEFT JOIN public.profiles tp ON tp.id = h.teacher_id
   ORDER BY s.weekday, s.start_time
$$;
REVOKE ALL ON FUNCTION public.my_halaqa_schedule() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_halaqa_schedule() TO authenticated;

-- ─── 3) لوحة المركز ───
CREATE OR REPLACE FUNCTION public.center_dashboard(_center uuid, _days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  days integer := LEAST(GREATEST(COALESCE(_days, 30), 1), 366);
  since date := current_date - days;
  result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_view_center(auth.uid(), _center) THEN
    RAISE EXCEPTION 'لا تملك عرض لوحة هذا المركز.';
  END IF;

  WITH
  hq AS (
    SELECT h.id, h.name, h.teacher_id FROM public.halaqat h WHERE h.center_id = _center
  ),
  members AS (
    SELECT DISTINCT hs.halaqa_id, hs.student_id
      FROM public.halaqa_students hs JOIN hq ON hq.id = hs.halaqa_id
  ),
  students AS (SELECT DISTINCT student_id FROM members),
  att AS (
    -- الحضور المنسوب إلى حلقة من حلقات المركز، أو غير المنسوب لطالب فيه.
    SELECT a.student_id, a.halaqa_id, a.session_date, a.status, a.teacher_id
      FROM public.attendance a
     WHERE a.session_date > since
       AND (a.halaqa_id IN (SELECT id FROM hq)
            OR (a.halaqa_id IS NULL AND a.student_id IN (SELECT student_id FROM students)))
  ),
  per_student AS (
    SELECT st.student_id,
           p.name,
           (SELECT string_agg(hq.name, '، ' ORDER BY hq.name)
              FROM members m JOIN hq ON hq.id = m.halaqa_id
             WHERE m.student_id = st.student_id) AS halaqat,
           (SELECT count(*) FROM att WHERE att.student_id = st.student_id) AS att_total,
           (SELECT count(*) FROM att WHERE att.student_id = st.student_id
                                       AND att.status IN ('present', 'late')) AS att_present,
           (SELECT round(avg(ra.score)) FROM public.recitation_assessments ra
             WHERE ra.student_id = st.student_id AND ra.created_at > since
               AND ra.score IS NOT NULL) AS avg_score,
           (SELECT count(DISTINCT mr.page) FROM public.mushaf_records mr
             WHERE mr.student_id = st.student_id AND mr.kind = 'memorize'
               AND mr.session_date > since) AS pages,
           GREATEST(
             (SELECT max(a2.session_date) FROM public.attendance a2
               WHERE a2.student_id = st.student_id AND a2.status IN ('present', 'late')),
             (SELECT max(rs.created_at)::date FROM public.recitation_sessions rs
               WHERE rs.student_id = st.student_id),
             (SELECT max(mr.session_date) FROM public.mushaf_records mr
               WHERE mr.student_id = st.student_id)
           ) AS last_activity,
           (SELECT array_agg(x.status) FROM (
              SELECT a3.status FROM public.attendance a3
               WHERE a3.student_id = st.student_id
               ORDER BY a3.session_date DESC LIMIT 3) x) AS last3
      FROM students st
      LEFT JOIN public.profiles p ON p.id = st.student_id
  ),
  risk AS (
    SELECT ps.*,
           array_remove(ARRAY[
             CASE WHEN ps.att_total >= 3 AND ps.att_present * 100 < ps.att_total * 60
                  THEN 'low_attendance' END,
             CASE WHEN ps.last3 IS NOT NULL AND array_length(ps.last3, 1) = 3
                   AND ps.last3 <@ ARRAY['absent']::text[]
                  THEN 'absent_streak' END,
             CASE WHEN ps.avg_score IS NOT NULL AND ps.avg_score < 60 THEN 'low_score' END,
             CASE WHEN ps.last_activity IS NULL OR ps.last_activity < current_date - 14
                  THEN 'inactive' END
           ], NULL) AS reasons
      FROM per_student ps
  )
  SELECT jsonb_build_object(
    'center', (SELECT jsonb_build_object('id', c.id, 'name', c.name, 'city', c.city)
                 FROM public.centers c WHERE c.id = _center),
    'period_days', days,
    'since', since,
    'can_manage', public.manages_center(auth.uid(), _center),
    'totals', jsonb_build_object(
      'halaqat', (SELECT count(*) FROM hq),
      'students', (SELECT count(*) FROM students),
      'teachers', (SELECT count(DISTINCT teacher_id) FROM hq WHERE teacher_id IS NOT NULL),
      'weekly_slots', (SELECT count(*) FROM public.halaqa_schedule s WHERE s.halaqa_id IN (SELECT id FROM hq)),
      'attendance_records', (SELECT count(*) FROM att),
      'attendance_rate', (SELECT CASE WHEN count(*) = 0 THEN NULL
                                 ELSE round(100.0 * count(*) FILTER (WHERE status IN ('present', 'late')) / count(*)) END
                            FROM att),
      'pages_memorized', (SELECT COALESCE(sum(pages), 0) FROM per_student),
      'assessments', (SELECT count(*) FROM public.recitation_assessments ra
                       WHERE ra.created_at > since AND ra.student_id IN (SELECT student_id FROM students)),
      'avg_score', (SELECT round(avg(ra.score)) FROM public.recitation_assessments ra
                     WHERE ra.created_at > since AND ra.score IS NOT NULL
                       AND ra.student_id IN (SELECT student_id FROM students)),
      'exams', (SELECT count(*) FROM public.exam_results er
                 WHERE er.created_at > since AND er.student_id IN (SELECT student_id FROM students)),
      'avg_exam', (SELECT round(avg(er.percentage)) FROM public.exam_results er
                    WHERE er.created_at > since AND er.student_id IN (SELECT student_id FROM students)),
      'at_risk', (SELECT count(*) FROM risk WHERE cardinality(reasons) > 0)
    ),
    'halaqat', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', hq.id,
               'name', hq.name,
               'teacher_id', hq.teacher_id,
               'teacher_name', tp.name,
               'students', (SELECT count(*) FROM members m WHERE m.halaqa_id = hq.id),
               'present', (SELECT count(*) FROM att WHERE att.status = 'present'
                              AND (att.halaqa_id = hq.id OR (att.halaqa_id IS NULL AND att.student_id IN
                                   (SELECT student_id FROM members m WHERE m.halaqa_id = hq.id)))),
               'late', (SELECT count(*) FROM att WHERE att.status = 'late'
                           AND (att.halaqa_id = hq.id OR (att.halaqa_id IS NULL AND att.student_id IN
                                (SELECT student_id FROM members m WHERE m.halaqa_id = hq.id)))),
               'absent', (SELECT count(*) FROM att WHERE att.status = 'absent'
                             AND (att.halaqa_id = hq.id OR (att.halaqa_id IS NULL AND att.student_id IN
                                  (SELECT student_id FROM members m WHERE m.halaqa_id = hq.id)))),
               'excused', (SELECT count(*) FROM att WHERE att.status = 'excused'
                              AND (att.halaqa_id = hq.id OR (att.halaqa_id IS NULL AND att.student_id IN
                                   (SELECT student_id FROM members m WHERE m.halaqa_id = hq.id)))),
               'pages_memorized', (SELECT COALESCE(sum(ps.pages), 0) FROM per_student ps
                                    WHERE ps.student_id IN (SELECT student_id FROM members m WHERE m.halaqa_id = hq.id)),
               'assessments', (SELECT count(*) FROM public.recitation_assessments ra
                                WHERE ra.created_at > since AND ra.student_id IN
                                      (SELECT student_id FROM members m WHERE m.halaqa_id = hq.id)),
               'avg_score', (SELECT round(avg(ra.score)) FROM public.recitation_assessments ra
                              WHERE ra.created_at > since AND ra.score IS NOT NULL AND ra.student_id IN
                                    (SELECT student_id FROM members m WHERE m.halaqa_id = hq.id)),
               'avg_exam', (SELECT round(avg(er.percentage)) FROM public.exam_results er
                             WHERE er.created_at > since AND er.student_id IN
                                   (SELECT student_id FROM members m WHERE m.halaqa_id = hq.id)),
               'slots', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                                     'id', s.id, 'weekday', s.weekday,
                                     'start_time', to_char(s.start_time, 'HH24:MI'),
                                     'end_time', to_char(s.end_time, 'HH24:MI'),
                                     'location', s.location, 'online_url', s.online_url)
                                   ORDER BY s.weekday, s.start_time)
                                   FROM public.halaqa_schedule s WHERE s.halaqa_id = hq.id), '[]'::jsonb)
             ) ORDER BY hq.name)
        FROM hq LEFT JOIN public.profiles tp ON tp.id = hq.teacher_id), '[]'::jsonb),
    'teachers', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', t.teacher_id,
               'name', tp.name,
               'halaqat', (SELECT count(*) FROM hq WHERE hq.teacher_id = t.teacher_id),
               'students', (SELECT count(DISTINCT m.student_id) FROM members m JOIN hq ON hq.id = m.halaqa_id
                             WHERE hq.teacher_id = t.teacher_id),
               'attendance_marked', (SELECT count(*) FROM att WHERE att.teacher_id = t.teacher_id),
               'assessments', (SELECT count(*) FROM public.recitation_assessments ra
                                WHERE ra.teacher_id = t.teacher_id AND ra.created_at > since
                                  AND ra.student_id IN (SELECT student_id FROM students)),
               'assignments', (SELECT count(*) FROM public.assignments asg
                                WHERE asg.teacher_id = t.teacher_id AND asg.created_at > since
                                  AND asg.student_id IN (SELECT student_id FROM students)),
               'last_activity', GREATEST(
                  (SELECT max(att.session_date) FROM att WHERE att.teacher_id = t.teacher_id),
                  (SELECT max(ra.created_at)::date FROM public.recitation_assessments ra
                    WHERE ra.teacher_id = t.teacher_id
                      AND ra.student_id IN (SELECT student_id FROM students)),
                  (SELECT max(asg.created_at)::date FROM public.assignments asg
                    WHERE asg.teacher_id = t.teacher_id
                      AND asg.student_id IN (SELECT student_id FROM students)))
             ) ORDER BY tp.name)
        FROM (SELECT DISTINCT teacher_id FROM hq WHERE teacher_id IS NOT NULL) t
        LEFT JOIN public.profiles tp ON tp.id = t.teacher_id), '[]'::jsonb),
    'at_risk', COALESCE((
      SELECT jsonb_agg(x) FROM (
        SELECT jsonb_build_object(
                 'id', r.student_id, 'name', COALESCE(r.name, 'طالب'), 'halaqat', r.halaqat,
                 'attendance_rate', CASE WHEN r.att_total = 0 THEN NULL
                                         ELSE round(100.0 * r.att_present / r.att_total) END,
                 'avg_score', r.avg_score,
                 'last_activity', r.last_activity,
                 'reasons', to_jsonb(r.reasons)) AS x
          FROM risk r
         WHERE cardinality(r.reasons) > 0
         ORDER BY cardinality(r.reasons) DESC, r.name
         LIMIT 50) s), '[]'::jsonb),
    'weekly', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'week', w.week_start,
               'records', w.total,
               'rate', CASE WHEN w.total = 0 THEN NULL ELSE round(100.0 * w.ok / w.total) END)
             ORDER BY w.week_start)
        FROM (SELECT date_trunc('week', session_date)::date AS week_start,
                     count(*) AS total,
                     count(*) FILTER (WHERE status IN ('present', 'late')) AS ok
                FROM att GROUP BY 1) w), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.center_dashboard(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.center_dashboard(uuid, integer) TO authenticated;

-- ─── 4) تقرير الطالب لفترة ───
-- من يطلب تقرير طالب: الطالب نفسه، أو معلّم حلقته، أو ولي أمره، أو طاقم مركزه.
CREATE OR REPLACE FUNCTION public.can_view_student_report(_uid uuid, _student uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _uid IS NOT NULL AND _student IS NOT NULL AND (
    _uid = _student
    OR public.teaches_student(_uid, _student)
    OR public.is_guardian_of(_uid, _student)
    OR EXISTS (SELECT 1 FROM public.halaqa_students hs
                 JOIN public.halaqat h ON h.id = hs.halaqa_id
                WHERE hs.student_id = _student
                  AND public.can_view_center(_uid, h.center_id))
  )
$$;
REVOKE ALL ON FUNCTION public.can_view_student_report(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_student_report(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.student_report(_student uuid, _from date, _to date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  f date := COALESCE(_from, current_date - 30);
  t date := COALESCE(_to, current_date);
  result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_view_student_report(auth.uid(), _student) THEN
    RAISE EXCEPTION 'لا تملك عرض تقرير هذا الطالب.';
  END IF;
  IF t < f THEN
    RAISE EXCEPTION 'نهاية الفترة قبل بدايتها.';
  END IF;
  IF t - f > 366 THEN
    RAISE EXCEPTION 'أقصى فترة للتقرير سنة واحدة.';
  END IF;

  SELECT jsonb_build_object(
    'student', (SELECT jsonb_build_object('id', p.id, 'name', p.name)
                  FROM public.profiles p WHERE p.id = _student),
    'from', f,
    'to', t,
    'halaqat', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('name', h.name, 'teacher_name', tp.name,
                                          'center_name', c.name) ORDER BY h.name)
        FROM public.halaqa_students hs
        JOIN public.halaqat h ON h.id = hs.halaqa_id
        LEFT JOIN public.profiles tp ON tp.id = h.teacher_id
        LEFT JOIN public.centers c ON c.id = h.center_id
       WHERE hs.student_id = _student), '[]'::jsonb),
    'attendance_summary', (
      SELECT jsonb_build_object(
               'present', count(*) FILTER (WHERE status = 'present'),
               'late', count(*) FILTER (WHERE status = 'late'),
               'absent', count(*) FILTER (WHERE status = 'absent'),
               'excused', count(*) FILTER (WHERE status = 'excused'))
        FROM public.attendance
       WHERE student_id = _student AND session_date BETWEEN f AND t),
    'attendance', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('date', session_date, 'status', status, 'reason', reason)
                       ORDER BY session_date DESC)
        FROM (SELECT * FROM public.attendance
               WHERE student_id = _student AND session_date BETWEEN f AND t
               ORDER BY session_date DESC LIMIT 200) a), '[]'::jsonb),
    'mushaf_summary', (
      SELECT jsonb_build_object(
               'memorized_pages', count(DISTINCT page) FILTER (WHERE kind = 'memorize'),
               'reviewed_pages', count(DISTINCT page) FILTER (WHERE kind = 'review'),
               'consolidated_pages', count(DISTINCT page) FILTER (WHERE kind = 'consolidate'),
               'avg_rating', round(avg(rating), 1))
        FROM public.mushaf_records
       WHERE student_id = _student AND session_date BETWEEN f AND t),
    'mushaf', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('date', session_date, 'page', page, 'kind', kind,
                                          'rating', rating, 'notes', notes)
                       ORDER BY session_date DESC, page)
        FROM (SELECT * FROM public.mushaf_records
               WHERE student_id = _student AND session_date BETWEEN f AND t
               ORDER BY session_date DESC LIMIT 200) m), '[]'::jsonb),
    'assessments', COALESCE((
      SELECT jsonb_agg(x ORDER BY x->>'date' DESC) FROM (
        SELECT jsonb_build_object('date', a.created_at::date, 'surah_name', rs.surah_name,
                 'from_ayah', rs.from_ayah, 'to_ayah', rs.to_ayah, 'score', a.score,
                 'approved', a.approved, 'teacher_notes', a.teacher_notes) AS x
          FROM public.recitation_assessments a
          JOIN public.recitation_sessions rs ON rs.id = a.session_id
         WHERE a.student_id = _student AND a.created_at::date BETWEEN f AND t
         ORDER BY a.created_at DESC LIMIT 200) s), '[]'::jsonb),
    'assignments', COALESCE((
      SELECT jsonb_agg(x ORDER BY x->>'due_date' DESC) FROM (
        SELECT jsonb_build_object('due_date', due_date, 'kind', kind, 'surah_name', surah_name,
                 'from_ayah', from_ayah, 'to_ayah', to_ayah, 'status', status) AS x
          FROM public.assignments
         WHERE student_id = _student AND due_date BETWEEN f AND t
         ORDER BY due_date DESC LIMIT 200) s), '[]'::jsonb),
    'exams', COALESCE((
      SELECT jsonb_agg(x ORDER BY x->>'date' DESC) FROM (
        SELECT jsonb_build_object('date', r.created_at::date, 'title', e.title,
                 'percentage', r.percentage, 'mastery', r.mastery) AS x
          FROM public.exam_results r
          JOIN public.exams e ON e.id = r.exam_id
         WHERE r.student_id = _student AND r.created_at::date BETWEEN f AND t
         ORDER BY r.created_at DESC LIMIT 100) s), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.student_report(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.student_report(uuid, date, date) TO authenticated;

-- طلاب مركز بأسمائهم لطاقمه (لاختيار تقرير طالب من لوحة المركز).
CREATE OR REPLACE FUNCTION public.center_students(_center uuid)
RETURNS TABLE (student_id uuid, name text, halaqat text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT hs.student_id, COALESCE(p.name, 'طالب'), string_agg(h.name, '، ' ORDER BY h.name)
    FROM public.halaqa_students hs
    JOIN public.halaqat h ON h.id = hs.halaqa_id
    LEFT JOIN public.profiles p ON p.id = hs.student_id
   WHERE h.center_id = _center
     AND public.can_view_center(auth.uid(), _center)
   GROUP BY hs.student_id, p.name
   ORDER BY 2
$$;
REVOKE ALL ON FUNCTION public.center_students(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.center_students(uuid) TO authenticated;

-- ─── 5) التقرير الأسبوعي لولي الأمر ───
CREATE TABLE IF NOT EXISTS public.guardian_weekly_sent (
  guardian_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guardian_id, student_id, week_start)
);
ALTER TABLE public.guardian_weekly_sent ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.guardian_weekly_sent FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.guardian_weekly_sent TO service_role;

-- ملخّص الأيام السبعة الماضية لطالب (نصّ الإشعار). داخلي فقط.
CREATE OR REPLACE FUNCTION public.weekly_summary_text(_student uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT concat_ws(' · ',
    CASE WHEN a.total > 0 THEN 'الحضور ' || a.ok || ' من ' || a.total ELSE 'لا حصص مسجّلة' END,
    CASE WHEN m.pages > 0 THEN 'حفظ ' || m.pages || ' صفحة' END,
    CASE WHEN r.n > 0 THEN r.n || ' تسميع' || COALESCE(' بمتوسط ' || r.avg || '/100', '') END,
    CASE WHEN e.n > 0 THEN e.n || ' اختبار' || COALESCE(' بمتوسط ' || e.avg || '%', '') END,
    CASE WHEN w.pending > 0 THEN w.pending || ' واجب لم يُنجز' END)
    FROM (SELECT count(*) AS total, count(*) FILTER (WHERE status IN ('present', 'late')) AS ok
            FROM public.attendance
           WHERE student_id = _student AND session_date > current_date - 7) a,
         (SELECT count(DISTINCT page) AS pages FROM public.mushaf_records
           WHERE student_id = _student AND kind = 'memorize' AND session_date > current_date - 7) m,
         (SELECT count(*) AS n, round(avg(score)) AS avg FROM public.recitation_assessments
           WHERE student_id = _student AND created_at > now() - interval '7 days') r,
         (SELECT count(*) AS n, round(avg(percentage)) AS avg FROM public.exam_results
           WHERE student_id = _student AND created_at > now() - interval '7 days') e,
         (SELECT count(*) AS pending FROM public.assignments
           WHERE student_id = _student AND status = 'pending'
             AND due_date BETWEEN current_date - 7 AND current_date) w
$$;
REVOKE ALL ON FUNCTION public.weekly_summary_text(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.weekly_summary_text(uuid) TO service_role;

-- يرسل التقرير الأسبوعي لكل ولي أمر عن كل ابن، مرة واحدة في الأسبوع.
-- للخادم فقط (pg_cron أو service_role). يعيد عدد الإشعارات المرسلة.
CREATE OR REPLACE FUNCTION public.send_guardian_weekly_reports()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  wk date := date_trunc('week', current_date)::date;
  sent integer := 0;
  g record;
BEGIN
  FOR g IN
    SELECT l.guardian_id, l.student_id, COALESCE(p.name, 'ابنك') AS child
      FROM public.guardian_links l
      LEFT JOIN public.profiles p ON p.id = l.student_id
     WHERE NOT EXISTS (SELECT 1 FROM public.guardian_weekly_sent s
                        WHERE s.guardian_id = l.guardian_id
                          AND s.student_id = l.student_id
                          AND s.week_start = wk)
  LOOP
    INSERT INTO public.notifications (user_id, kind, title, body, link)
    VALUES (g.guardian_id, 'guardian_weekly',
            'التقرير الأسبوعي: ' || g.child,
            public.weekly_summary_text(g.student_id),
            '/family');
    INSERT INTO public.guardian_weekly_sent (guardian_id, student_id, week_start)
    VALUES (g.guardian_id, g.student_id, wk);
    sent := sent + 1;
  END LOOP;
  RETURN sent;
END;
$$;
REVOKE ALL ON FUNCTION public.send_guardian_weekly_reports() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.send_guardian_weekly_reports() TO service_role;

-- الجدولة: كل خميس 15:00 UTC (18:00 بتوقيت صنعاء والرياض) إن كان pg_cron مفعّلاً.
-- إن لم يكن مفعّلاً: فعّله من لوحة Supabase (Database ← Extensions) ثم نفّذ هذا الجزء.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'zen-guardian-weekly';
    PERFORM cron.schedule('zen-guardian-weekly', '0 15 * * 4',
                          'SELECT public.send_guardian_weekly_reports()');
  END IF;
END $$;
