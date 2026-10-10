-- ════════════════════════════════════════════════════════════════════════════
-- المرحلة 11.1 — موافقة وليّ الأمر على دعوة الحلقة
-- ════════════════════════════════════════════════════════════════════════════
-- لا يُخزَّن عمر الطالب؛ «القاصر» هنا من ربطه وليّ أمر بحسابه (guardian_links). لهذا الطالب:
--   قبول الدعوة ⇒ awaiting_guardian (لا عضوية بعد) وإشعار أولياء أمره،
--   guardian_approve_invite(_invite, _approve) من أحدهم ⇒ accepted + عضوية، أو declined.
-- الطالب غير المربوط: السلوك كما كان. والحسابات التي ينشئها المعلّم مباشرة لا تمرّ بالدعوات.

ALTER TABLE public.halaqa_invites DROP CONSTRAINT IF EXISTS halaqa_invites_status_check;
ALTER TABLE public.halaqa_invites ADD CONSTRAINT halaqa_invites_status_check
  CHECK (status IN ('pending', 'awaiting_guardian', 'accepted', 'declined', 'cancelled'));
ALTER TABLE public.halaqa_invites ADD COLUMN IF NOT EXISTS guardian_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.halaqa_invites ADD COLUMN IF NOT EXISTS guardian_at timestamptz;

-- دعوة مفتوحة واحدة لكل (حلقة، طالب) سواء انتظرت الطالب أو وليّ الأمر.
DROP INDEX IF EXISTS public.halaqa_invites_one_pending;
CREATE UNIQUE INDEX IF NOT EXISTS halaqa_invites_one_open
  ON public.halaqa_invites (halaqa_id, student_id)
  WHERE status IN ('pending', 'awaiting_guardian');

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
   WHERE halaqa_id = _halaqa AND student_id = _student AND status IN ('pending', 'awaiting_guardian');
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

  SELECT name INTO halaqa_name FROM public.halaqat WHERE id = inv.halaqa_id;
  SELECT name INTO student_name FROM public.profiles WHERE id = caller;

  -- 11.1: الطالب المربوط بوليّ أمر لا ينضم بقبوله وحده؛ تنتظر الدعوة موافقة وليّ الأمر.
  IF _accept AND EXISTS (SELECT 1 FROM public.guardian_links gl WHERE gl.student_id = caller) THEN
    UPDATE public.halaqa_invites
       SET status = 'awaiting_guardian', responded_at = now()
     WHERE id = _invite;
    INSERT INTO public.notifications (user_id, kind, title, body, link)
    SELECT gl.guardian_id, 'guardian', 'طلب موافقة على حلقة',
           COALESCE(student_name, 'ابنك') || ' يريد الانضمام إلى «' || COALESCE(halaqa_name, 'حلقة') || '». وافق أو ارفض من «متابعة أبنائي».',
           '/family'
      FROM public.guardian_links gl WHERE gl.student_id = caller;
    INSERT INTO public.notifications (user_id, kind, title, body, link)
    VALUES (inv.invited_by, 'halaqa_invite_response', 'قبل الطالب الدعوة، بانتظار وليّ الأمر',
            COALESCE(student_name, 'الطالب') || ' · «' || COALESCE(halaqa_name, 'حلقة') || '»', '/centers');
    RETURN 'awaiting_guardian';
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
  IF inv.status NOT IN ('pending', 'awaiting_guardian') THEN
    RAISE EXCEPTION 'INVITE_CLOSED';
  END IF;
  UPDATE public.halaqa_invites SET status = 'cancelled', responded_at = now() WHERE id = _invite;
END;
$$;

CREATE OR REPLACE FUNCTION public.guardian_approve_invite(_invite uuid, _approve boolean)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := (SELECT auth.uid());
  inv public.halaqa_invites%ROWTYPE;
  halaqa_name text;
  student_name text;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  SELECT * INTO inv FROM public.halaqa_invites WHERE id = _invite FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (
       SELECT 1 FROM public.guardian_links gl WHERE gl.guardian_id = caller AND gl.student_id = inv.student_id) THEN
    RAISE EXCEPTION 'INVITE_NOT_FOUND';
  END IF;
  IF inv.status <> 'awaiting_guardian' THEN RAISE EXCEPTION 'INVITE_CLOSED'; END IF;

  UPDATE public.halaqa_invites
     SET status = CASE WHEN _approve THEN 'accepted' ELSE 'declined' END,
         guardian_id = caller, guardian_at = now()
   WHERE id = _invite;
  IF _approve THEN
    INSERT INTO public.halaqa_students (halaqa_id, student_id)
    VALUES (inv.halaqa_id, inv.student_id)
    ON CONFLICT (halaqa_id, student_id) DO NOTHING;
  END IF;

  SELECT name INTO halaqa_name FROM public.halaqat WHERE id = inv.halaqa_id;
  SELECT name INTO student_name FROM public.profiles WHERE id = inv.student_id;
  INSERT INTO public.notifications (user_id, kind, title, body, link) VALUES
    (inv.student_id, 'halaqa_invite_response',
     CASE WHEN _approve THEN 'وافق وليّ أمرك على الحلقة' ELSE 'لم يوافق وليّ أمرك على الحلقة' END,
     '«' || COALESCE(halaqa_name, 'حلقة') || '»', '/today'),
    (inv.invited_by, 'halaqa_invite_response',
     CASE WHEN _approve THEN 'وافق وليّ الأمر: انضم الطالب' ELSE 'لم يوافق وليّ الأمر' END,
     COALESCE(student_name, 'الطالب') || ' · «' || COALESCE(halaqa_name, 'حلقة') || '»', '/centers');
  RETURN CASE WHEN _approve THEN 'accepted' ELSE 'declined' END;
END;
$$;
REVOKE ALL ON FUNCTION public.guardian_approve_invite(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guardian_approve_invite(uuid, boolean) TO authenticated;

-- ما ينتظر موافقة وليّ الأمر الحالي، باسم الابن والحلقة والمعلّم.
CREATE OR REPLACE FUNCTION public.guardian_pending_invites()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', i.id, 'student_id', i.student_id, 'student_name', COALESCE(ps.name, 'ابنك'),
           'halaqa_name', COALESCE(h.name, 'حلقة'), 'teacher_name', COALESCE(pt.name, 'معلّم'),
           'center_name', c.name, 'schedule', h.schedule, 'responded_at', i.responded_at)
           ORDER BY i.responded_at DESC), '[]'::jsonb)
    FROM public.halaqa_invites i
    JOIN public.guardian_links gl ON gl.student_id = i.student_id AND gl.guardian_id = (SELECT auth.uid())
    JOIN public.halaqat h ON h.id = i.halaqa_id
    LEFT JOIN public.centers c ON c.id = h.center_id
    LEFT JOIN public.profiles ps ON ps.id = i.student_id
    LEFT JOIN public.profiles pt ON pt.id = i.invited_by
   WHERE i.status = 'awaiting_guardian'
$$;
REVOKE ALL ON FUNCTION public.guardian_pending_invites() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guardian_pending_invites() TO authenticated;
