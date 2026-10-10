-- ════════════════════════════════════════════════════════════════════
-- المرحلة 5: سدّ الثغرات المتبقية في الصلاحيات
--
--   S1  الإشعارات: لا يُرسل المعلّم إشعاراً إلا لطلاب حلقاته.
--   S2  المراكز: تعديلها وحذفها لمنشئها فقط، ولا يُنشأ مركز باسم غيرك.
--   S3  أعضاء الحلقات: يقرؤهم مدير الحلقة (معلّمها أو منشئ مركزها) والطالب نفسه.
--   S4  الانضمام إلى حلقة بموافقة الطالب: دعوة ← قبول/رفض، ولا إضافة مباشرة.
--   S5  المحادثات: تُبدأ فقط بين معلّم وطالب من حلقاته، أو بين معلّمَين.
--
-- الاختبارات: supabase/tests/checks.sql (36–40).
-- ════════════════════════════════════════════════════════════════════

-- ═══════════════ S1: الإشعارات ═══════════════
DROP POLICY IF EXISTS "authenticated insert notifications" ON public.notifications;
DROP POLICY IF EXISTS "insert own or own-student notifications" ON public.notifications;
CREATE POLICY "insert own or own-student notifications" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    OR public.teaches_student((SELECT auth.uid()), user_id)
  );

-- ═══════════════ S2: المراكز ═══════════════
DROP POLICY IF EXISTS "teachers insert centers" ON public.centers;
CREATE POLICY "teachers insert centers" ON public.centers
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_teacher((SELECT auth.uid())))
    AND created_by = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS "teachers update centers" ON public.centers;
CREATE POLICY "teachers update centers" ON public.centers
  FOR UPDATE TO authenticated
  USING (public.owns_center((SELECT auth.uid()), id))
  WITH CHECK (created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS "teachers delete centers" ON public.centers;
CREATE POLICY "teachers delete centers" ON public.centers
  FOR DELETE TO authenticated
  USING (public.owns_center((SELECT auth.uid()), id));

-- ═══════════════ S3: قراءة أعضاء الحلقات ═══════════════
DROP POLICY IF EXISTS "read halaqa members" ON public.halaqa_students;
CREATE POLICY "read halaqa members" ON public.halaqa_students
  FOR SELECT TO authenticated
  USING (
    student_id = (SELECT auth.uid())
    OR public.manages_halaqa((SELECT auth.uid()), halaqa_id)
  );

-- ═══════════════ S4: الانضمام بموافقة الطالب ═══════════════
-- لا إضافة مباشرة من العميل: العضوية تنشأ فقط بقبول الطالب دعوةً (respond_halaqa_invite)
-- أو من الخادم عند إنشاء المعلّم حساباً جديداً للطالب (service_role).
DROP POLICY IF EXISTS "teachers add members" ON public.halaqa_students;
REVOKE INSERT, UPDATE ON public.halaqa_students FROM authenticated;

CREATE TABLE IF NOT EXISTS public.halaqa_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  halaqa_id uuid NOT NULL REFERENCES public.halaqat(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invited_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz
);

-- دعوة معلّقة واحدة فقط لكل (حلقة، طالب).
CREATE UNIQUE INDEX IF NOT EXISTS halaqa_invites_one_pending
  ON public.halaqa_invites (halaqa_id, student_id)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS halaqa_invites_student_idx
  ON public.halaqa_invites (student_id, status);
CREATE INDEX IF NOT EXISTS halaqa_invites_halaqa_idx
  ON public.halaqa_invites (halaqa_id, status);

ALTER TABLE public.halaqa_invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.halaqa_invites FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.halaqa_invites TO authenticated;
GRANT ALL ON public.halaqa_invites TO service_role;

DROP POLICY IF EXISTS "read own or managed invites" ON public.halaqa_invites;
CREATE POLICY "read own or managed invites" ON public.halaqa_invites
  FOR SELECT TO authenticated
  USING (
    student_id = (SELECT auth.uid())
    OR public.manages_halaqa((SELECT auth.uid()), halaqa_id)
  );

-- يدعو مديرُ الحلقة طالباً مسجّلاً. تُرجع رقم الدعوة (أو الدعوة المعلّقة القائمة).
CREATE OR REPLACE FUNCTION public.invite_to_halaqa(_halaqa uuid, _student uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
  invite_id uuid;
  halaqa_name text;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;
  IF NOT public.manages_halaqa(caller, _halaqa) THEN
    RAISE EXCEPTION 'NOT_YOUR_HALAQA';
  END IF;
  IF _student IS NULL OR _student = caller
     OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _student) THEN
    RAISE EXCEPTION 'INVALID_STUDENT';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.halaqa_students WHERE halaqa_id = _halaqa AND student_id = _student
  ) THEN
    RAISE EXCEPTION 'ALREADY_MEMBER';
  END IF;

  SELECT id INTO invite_id
    FROM public.halaqa_invites
   WHERE halaqa_id = _halaqa AND student_id = _student AND status = 'pending';
  IF invite_id IS NOT NULL THEN
    RETURN invite_id;
  END IF;

  INSERT INTO public.halaqa_invites (halaqa_id, student_id, invited_by)
  VALUES (_halaqa, _student, caller)
  RETURNING id INTO invite_id;

  SELECT name INTO halaqa_name FROM public.halaqat WHERE id = _halaqa;
  INSERT INTO public.notifications (user_id, kind, title, body, link)
  VALUES (
    _student,
    'halaqa_invite',
    'دعوة للانضمام إلى حلقة',
    'دعاك معلّم للانضمام إلى «' || COALESCE(halaqa_name, 'حلقة') || '». وافق أو ارفض من صفحة الإشعارات.',
    '/notifications'
  );

  RETURN invite_id;
END;
$$;

REVOKE ALL ON FUNCTION public.invite_to_halaqa(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invite_to_halaqa(uuid, uuid) TO authenticated;

-- يقبل الطالب الدعوة أو يرفضها. القبول وحده يُنشئ العضوية.
CREATE OR REPLACE FUNCTION public.respond_halaqa_invite(_invite uuid, _accept boolean)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
  inv public.halaqa_invites%ROWTYPE;
  halaqa_name text;
  student_name text;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  SELECT * INTO inv FROM public.halaqa_invites WHERE id = _invite FOR UPDATE;
  IF NOT FOUND OR inv.student_id <> caller THEN
    RAISE EXCEPTION 'INVITE_NOT_FOUND';
  END IF;
  IF inv.status <> 'pending' THEN
    RAISE EXCEPTION 'INVITE_CLOSED';
  END IF;

  UPDATE public.halaqa_invites
     SET status = CASE WHEN _accept THEN 'accepted' ELSE 'declined' END,
         responded_at = now()
   WHERE id = _invite;

  IF _accept THEN
    INSERT INTO public.halaqa_students (halaqa_id, student_id)
    VALUES (inv.halaqa_id, inv.student_id)
    ON CONFLICT (halaqa_id, student_id) DO NOTHING;
  END IF;

  SELECT name INTO halaqa_name FROM public.halaqat WHERE id = inv.halaqa_id;
  SELECT name INTO student_name FROM public.profiles WHERE id = caller;
  INSERT INTO public.notifications (user_id, kind, title, body, link)
  VALUES (
    inv.invited_by,
    'halaqa_invite_response',
    CASE WHEN _accept THEN 'قُبلت دعوة الحلقة' ELSE 'رُفضت دعوة الحلقة' END,
    COALESCE(student_name, 'الطالب') || ' · «' || COALESCE(halaqa_name, 'حلقة') || '»',
    '/centers'
  );

  RETURN CASE WHEN _accept THEN 'accepted' ELSE 'declined' END;
END;
$$;

REVOKE ALL ON FUNCTION public.respond_halaqa_invite(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_halaqa_invite(uuid, boolean) TO authenticated;

-- يلغي مديرُ الحلقة دعوةً معلّقة.
CREATE OR REPLACE FUNCTION public.cancel_halaqa_invite(_invite uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
  inv public.halaqa_invites%ROWTYPE;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;
  SELECT * INTO inv FROM public.halaqa_invites WHERE id = _invite FOR UPDATE;
  IF NOT FOUND OR NOT public.manages_halaqa(caller, inv.halaqa_id) THEN
    RAISE EXCEPTION 'INVITE_NOT_FOUND';
  END IF;
  IF inv.status <> 'pending' THEN
    RAISE EXCEPTION 'INVITE_CLOSED';
  END IF;
  UPDATE public.halaqa_invites SET status = 'cancelled', responded_at = now() WHERE id = _invite;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_halaqa_invite(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_halaqa_invite(uuid) TO authenticated;

-- ═══════════════ S5: من يبدأ محادثة مع من ═══════════════
-- مسموح: معلّم ↔ طالب من حلقاته (بأي اتجاه)، ومعلّم ↔ معلّم.
-- غير مسموح: طالب ↔ طالب، أو أي شخص ↔ غريب. المحادثات القائمة لا تُمسّ.
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
     )
$$;

REVOKE ALL ON FUNCTION public.can_start_chat(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_start_chat(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "chat participants insert" ON public.chats;
CREATE POLICY "chat participants insert" ON public.chats
  FOR INSERT TO authenticated
  WITH CHECK (
    is_group = false
    AND cardinality(participants) = 2
    AND (SELECT auth.uid()) = ANY(participants)
    AND public.can_start_chat(participants[1], participants[2])
  );

-- قائمة من يحقّ للمستخدم الحالي بدء محادثة معهم (لشاشة «محادثة جديدة»).
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
  -- بقية المعلّمين (إن كنت معلّماً)
  SELECT ur.user_id
    FROM public.user_roles ur
   WHERE ur.role = 'teacher'
     AND public.is_teacher(auth.uid())
     AND ur.user_id <> auth.uid()
$$;

REVOKE ALL ON FUNCTION public.my_chat_contacts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_chat_contacts() TO authenticated;
