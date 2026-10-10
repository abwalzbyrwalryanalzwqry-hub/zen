-- ═══════════════════════════════════════════════════════════════════════════
-- تطوير المحادثات — المرحلة 1: سلامة الأطفال والإشراف
-- (docs/CHAT_AI_ROADMAP.md — القراران 1 و2، والبنود C1 وC2 وC5 وC6 وS10)
--
--   القرار 1 / C1  محادثات الطلاب فيما بينهم ممنوعة افتراضياً؛ يفعّلها مدير المركز
--                  (centers.student_dm_enabled).
--   القرار 2       معلّم الحلقة المشتركة يطّلع دائماً على محادثات طلابه فيما بينهم (قراءة فقط).
--                  ولي الأمر لا يطّلع أبداً.
--   C2             إبلاغ عن رسالة في المحادثة الثنائية، وحظر مستخدم.
--   C5             بلاغات المحادثات والغرف تصل إلى المعلّم وإدارة المركز معاً.
--   C6             لا أرقام هواتف ولا روابط بين الطلاب (المحادثات الثنائية والنقاش).
--   S10            محادثة معلّم ↔ معلّم داخل المركز نفسه فقط.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1) إعداد المركز (القرار 1) ───
ALTER TABLE public.centers
  ADD COLUMN IF NOT EXISTS student_dm_enabled boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.centers.student_dm_enabled IS
  'السماح بالمحادثات الخاصة بين طلاب الحلقة الواحدة. افتراضياً ممنوعة. يغيّره مدير المركز عبر set_center_chat_settings().';

CREATE OR REPLACE FUNCTION public.set_center_chat_settings(_center uuid, _student_dm_enabled boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.manages_center(auth.uid(), _center) THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  UPDATE public.centers
     SET student_dm_enabled = COALESCE(_student_dm_enabled, false), updated_at = now()
   WHERE id = _center;
END;
$$;
REVOKE ALL ON FUNCTION public.set_center_chat_settings(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_center_chat_settings(uuid, boolean) TO authenticated;

-- زميلان في حلقة يسمح مركزها بمحادثات الطلاب.
CREATE OR REPLACE FUNCTION public.are_dm_classmates(_a uuid, _b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _a IS NOT NULL AND _b IS NOT NULL AND _a <> _b AND EXISTS (
    SELECT 1
      FROM public.halaqa_students x
      JOIN public.halaqa_students y ON y.halaqa_id = x.halaqa_id
      JOIN public.halaqat h ON h.id = x.halaqa_id
      JOIN public.centers c ON c.id = h.center_id
     WHERE x.student_id = _a AND y.student_id = _b AND c.student_dm_enabled
  )
$$;
REVOKE ALL ON FUNCTION public.are_dm_classmates(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.are_dm_classmates(uuid, uuid) TO authenticated, service_role;

-- ─── 2) مراكز المعلّم، ومعلّم ↔ معلّم في المركز نفسه (S10) ───
CREATE OR REPLACE FUNCTION public.teachers_share_center(_a uuid, _b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ca AS (
    SELECT center_id FROM public.halaqat WHERE teacher_id = _a
    UNION SELECT center_id FROM public.center_staff WHERE user_id = _a
    UNION SELECT id FROM public.centers WHERE created_by = _a
  ), cb AS (
    SELECT center_id FROM public.halaqat WHERE teacher_id = _b
    UNION SELECT center_id FROM public.center_staff WHERE user_id = _b
    UNION SELECT id FROM public.centers WHERE created_by = _b
  )
  SELECT EXISTS (SELECT 1 FROM ca JOIN cb USING (center_id))
$$;
REVOKE ALL ON FUNCTION public.teachers_share_center(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.teachers_share_center(uuid, uuid) TO authenticated, service_role;

-- ─── 3) الحظر (C2) ───
CREATE TABLE IF NOT EXISTS public.user_blocks (
  blocker_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
CREATE INDEX IF NOT EXISTS user_blocks_blocked_idx ON public.user_blocks (blocked_id);
ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_blocks FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.user_blocks TO authenticated;
GRANT ALL ON public.user_blocks TO service_role;
DROP POLICY IF EXISTS "read own blocks" ON public.user_blocks;
CREATE POLICY "read own blocks" ON public.user_blocks
  FOR SELECT TO authenticated USING (blocker_id = (SELECT auth.uid()));

CREATE OR REPLACE FUNCTION public.is_blocked_between(_a uuid, _b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_blocks
                  WHERE (blocker_id = _a AND blocked_id = _b)
                     OR (blocker_id = _b AND blocked_id = _a))
$$;
REVOKE ALL ON FUNCTION public.is_blocked_between(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_blocked_between(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_user_block(_user uuid, _blocked boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF _user IS NULL OR _user = auth.uid() THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  IF _blocked THEN
    INSERT INTO public.user_blocks (blocker_id, blocked_id) VALUES (auth.uid(), _user)
    ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.user_blocks WHERE blocker_id = auth.uid() AND blocked_id = _user;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.set_user_block(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_user_block(uuid, boolean) TO authenticated;

-- ─── 4) من يحق له بدء محادثة (القرار 1، C2، S10) ───
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
     AND NOT public.is_blocked_between(_a, _b)
     AND (
       public.teaches_student(_a, _b)
       OR public.teaches_student(_b, _a)
       OR (public.is_teacher(_a) AND public.is_teacher(_b) AND public.teachers_share_center(_a, _b))
       OR public.are_dm_classmates(_a, _b)
       OR public.guardian_meets_teacher(_a, _b)
       OR public.guardian_meets_teacher(_b, _a)
     )
$$;

-- جهات الاتصال = المرشّحون الذين يسمح can_start_chat بمراسلتهم الآن.
CREATE OR REPLACE FUNCTION public.my_chat_contacts()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u FROM (
    -- طلاب حلقاتي
    SELECT hs.student_id AS u
      FROM public.halaqa_students hs JOIN public.halaqat h ON h.id = hs.halaqa_id
     WHERE h.teacher_id = auth.uid()
    UNION
    -- معلّمو حلقاتي
    SELECT h.teacher_id
      FROM public.halaqa_students hs JOIN public.halaqat h ON h.id = hs.halaqa_id
     WHERE hs.student_id = auth.uid() AND h.teacher_id IS NOT NULL
    UNION
    -- زملائي في الحلقات
    SELECT y.student_id
      FROM public.halaqa_students x JOIN public.halaqa_students y ON y.halaqa_id = x.halaqa_id
     WHERE x.student_id = auth.uid()
    UNION
    -- معلّمو مراكزي
    SELECT h.teacher_id FROM public.halaqat h
     WHERE h.teacher_id IS NOT NULL AND public.is_teacher(auth.uid())
    UNION
    -- معلّمو أبنائي
    SELECT h.teacher_id
      FROM public.guardian_links g
      JOIN public.halaqa_students hs ON hs.student_id = g.student_id
      JOIN public.halaqat h ON h.id = hs.halaqa_id
     WHERE g.guardian_id = auth.uid() AND h.teacher_id IS NOT NULL
    UNION
    -- أولياء أمور طلابي
    SELECT g.guardian_id FROM public.guardian_links g
     WHERE public.teaches_student(auth.uid(), g.student_id)
  ) t
  WHERE u IS NOT NULL AND u <> auth.uid() AND public.can_start_chat(auth.uid(), u)
$$;

-- ─── 5) اطلاع معلّم الحلقة على محادثات طلابه (القرار 2) ───
-- محادثة «زميلين»: طرفاها طالبان في حلقة واحدة على الأقل.
CREATE OR REPLACE FUNCTION public.is_student_pair_chat(_chat_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chats c
     WHERE c.id = _chat_id AND c.is_group = false AND cardinality(c.participants) = 2
       AND public.are_classmates(c.participants[1], c.participants[2])
  )
$$;
REVOKE ALL ON FUNCTION public.is_student_pair_chat(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_student_pair_chat(uuid) TO authenticated, service_role;

-- هل _uid معلّم حلقة تضم طرفي المحادثة (وليس طرفاً فيها)؟ لا يشمل أولياء الأمور ولا طاقم المركز.
CREATE OR REPLACE FUNCTION public.supervises_chat(_chat_id uuid, _uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _uid IS NOT NULL AND public.is_teacher(_uid) AND EXISTS (
    SELECT 1
      FROM public.chats c
      JOIN public.halaqat h ON h.teacher_id = _uid
     WHERE c.id = _chat_id
       AND c.is_group = false
       AND cardinality(c.participants) = 2
       AND NOT (_uid = ANY (c.participants))
       AND EXISTS (SELECT 1 FROM public.halaqa_students x
                    WHERE x.halaqa_id = h.id AND x.student_id = c.participants[1])
       AND EXISTS (SELECT 1 FROM public.halaqa_students y
                    WHERE y.halaqa_id = h.id AND y.student_id = c.participants[2])
  )
$$;
REVOKE ALL ON FUNCTION public.supervises_chat(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervises_chat(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_read_chat(_chat_id uuid, _uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_chat_participant(_chat_id, _uid) OR public.supervises_chat(_chat_id, _uid)
$$;
REVOKE ALL ON FUNCTION public.can_read_chat(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_chat(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "chat participants read" ON public.chats;
CREATE POLICY "chat participants read" ON public.chats
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = ANY (participants) OR public.supervises_chat(id, (SELECT auth.uid())));

DROP POLICY IF EXISTS "read messages in own chats" ON public.messages;
CREATE POLICY "read messages in own chats" ON public.messages
  FOR SELECT TO authenticated
  USING (public.can_read_chat(chat_id, (SELECT auth.uid())));

DROP POLICY IF EXISTS "chat media read participant" ON storage.objects;
CREATE POLICY "chat media read participant" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'chat-media'
         AND public.can_read_chat(public.storage_folder_uuid(name), (SELECT auth.uid())));

-- سياق المحادثة لواجهة التطبيق.
CREATE OR REPLACE FUNCTION public.chat_context(_chat_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _me uuid := auth.uid();
  _c public.chats;
  _peer uuid;
BEGIN
  IF _me IS NULL OR NOT public.can_read_chat(_chat_id, _me) THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  SELECT * INTO _c FROM public.chats WHERE id = _chat_id;
  _peer := (SELECT p FROM unnest(_c.participants) p WHERE p <> _me LIMIT 1);
  RETURN jsonb_build_object(
    'participant', _me = ANY (_c.participants),
    'supervisor', public.supervises_chat(_chat_id, _me),
    'can_post', public.can_post_in_chat(_chat_id, _me),
    'student_pair', public.is_student_pair_chat(_chat_id),
    'peer_id', CASE WHEN _me = ANY (_c.participants) THEN _peer END,
    'blocked_by_me', EXISTS (SELECT 1 FROM public.user_blocks
                              WHERE blocker_id = _me AND blocked_id = _peer),
    'members', (SELECT jsonb_agg(jsonb_build_object('id', p.id, 'name', COALESCE(p.name, 'مستخدم'))
                                 ORDER BY p.name)
                  FROM public.profiles p WHERE p.id = ANY (_c.participants))
  );
END;
$$;
REVOKE ALL ON FUNCTION public.chat_context(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chat_context(uuid) TO authenticated;

-- محادثات طلابي فيما بينهم (للمعلّم).
CREATE OR REPLACE FUNCTION public.supervised_chats()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'chat_id', c.id,
           'names', (SELECT string_agg(COALESCE(p.name, 'طالب'), ' و' ORDER BY p.name)
                       FROM public.profiles p WHERE p.id = ANY (c.participants)),
           'last_message', c.last_message,
           'updated_at', c.updated_at
         ) ORDER BY c.updated_at DESC), '[]'::jsonb)
    FROM public.chats c
   WHERE public.supervises_chat(c.id, auth.uid())
     AND c.last_message IS NOT NULL
$$;
REVOKE ALL ON FUNCTION public.supervised_chats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervised_chats() TO authenticated;

-- ─── 6) الإبلاغ في المحادثات الثنائية (C2، C5) ───
CREATE TABLE IF NOT EXISTS public.message_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text CHECK (reason IS NULL OR char_length(reason) <= 300),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, reporter_id)
);
ALTER TABLE public.message_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.message_reports FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.message_reports TO service_role;

-- من يراجع بلاغات مستخدم: معلّمو حلقاته ومديرو مراكزها.
CREATE OR REPLACE FUNCTION public.moderators_of(_user uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT h.teacher_id
    FROM public.halaqa_students hs JOIN public.halaqat h ON h.id = hs.halaqa_id
   WHERE hs.student_id = _user AND h.teacher_id IS NOT NULL
  UNION
  SELECT c.created_by
    FROM public.halaqa_students hs
    JOIN public.halaqat h ON h.id = hs.halaqa_id
    JOIN public.centers c ON c.id = h.center_id
   WHERE hs.student_id = _user AND c.created_by IS NOT NULL
  UNION
  SELECT s.user_id
    FROM public.halaqa_students hs
    JOIN public.halaqat h ON h.id = hs.halaqa_id
    JOIN public.center_staff s ON s.center_id = h.center_id AND s.role = 'manager'
   WHERE hs.student_id = _user
$$;
REVOKE ALL ON FUNCTION public.moderators_of(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.moderators_of(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.report_message(_id uuid, _reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _me uuid := auth.uid();
  _m public.messages;
BEGIN
  SELECT * INTO _m FROM public.messages WHERE id = _id;
  IF _m.id IS NULL OR NOT public.is_chat_participant(_m.chat_id, _me) THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;
  IF _m.sender_id = _me THEN RAISE EXCEPTION 'CANNOT_REPORT_OWN'; END IF;

  INSERT INTO public.message_reports (message_id, reporter_id, reason)
  VALUES (_id, _me, NULLIF(left(btrim(COALESCE(_reason, '')), 300), ''))
  ON CONFLICT (message_id, reporter_id) DO NOTHING;

  IF FOUND THEN
    INSERT INTO public.notifications (user_id, kind, title, body, link)
    SELECT DISTINCT m, 'chat_report', 'بلاغ عن رسالة في محادثة', 'وصل بلاغ جديد يحتاج مراجعتك.',
           '/chats?reports=1'
      FROM (SELECT public.moderators_of(_me) AS m
            UNION SELECT public.moderators_of(_m.sender_id)) t
     WHERE m IS NOT NULL AND m <> _me AND m <> _m.sender_id;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.report_message(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_message(uuid, text) TO authenticated;

-- هل _uid يراجع هذا البلاغ؟
CREATE OR REPLACE FUNCTION public.can_review_message_report(_report uuid, _uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.message_reports r JOIN public.messages m ON m.id = r.message_id
     WHERE r.id = _report
       AND _uid NOT IN (r.reporter_id, m.sender_id)
       AND (_uid IN (SELECT public.moderators_of(r.reporter_id))
            OR _uid IN (SELECT public.moderators_of(m.sender_id)))
  )
$$;
REVOKE ALL ON FUNCTION public.can_review_message_report(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_review_message_report(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.open_message_reports()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', r.id,
           'chat_id', m.chat_id,
           'message_id', m.id,
           'content', m.content,
           'type', m.type,
           'sender_name', COALESCE(ps.name, 'مستخدم'),
           'reporter_name', COALESCE(pr.name, 'مستخدم'),
           'reason', r.reason,
           'created_at', r.created_at,
           'can_open', public.can_read_chat(m.chat_id, auth.uid())
         ) ORDER BY r.created_at DESC), '[]'::jsonb)
    FROM public.message_reports r
    JOIN public.messages m ON m.id = r.message_id
    LEFT JOIN public.profiles ps ON ps.id = m.sender_id
    LEFT JOIN public.profiles pr ON pr.id = r.reporter_id
   WHERE r.resolved_at IS NULL
     AND public.can_review_message_report(r.id, auth.uid())
$$;
REVOKE ALL ON FUNCTION public.open_message_reports() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_message_reports() TO authenticated;

CREATE OR REPLACE FUNCTION public.resolve_message_report(_report uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_review_message_report(_report, auth.uid()) THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  UPDATE public.message_reports SET resolved_at = now(), resolved_by = auth.uid()
   WHERE id = _report AND resolved_at IS NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.resolve_message_report(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_message_report(uuid) TO authenticated;

-- ─── 7) لا أرقام هواتف ولا روابط بين الطلاب (C6) ───
CREATE OR REPLACE FUNCTION public.has_contact_info(_t text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    -- روابط ومعرّفات تواصل
    _t ~* '(https?://|www\.|t\.me/|wa\.me/|chat\.whatsapp|[a-z0-9._-]+\.(com|net|org|me|io|app)\b)'
    -- 8 أرقام متتالية أو أكثر (بعد توحيد الأرقام العربية وحذف الفواصل) = رقم هاتف
    OR regexp_replace(translate(_t, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'),
                      '[\s\-\.\(\)\+]', '', 'g') ~ '[0-9]{8,}',
    false)
$$;
GRANT EXECUTE ON FUNCTION public.has_contact_info(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.guard_student_contact_info()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.type = 'text' AND public.is_student_pair_chat(NEW.chat_id)
     AND public.has_contact_info(NEW.content) THEN
    RAISE EXCEPTION 'CONTACT_INFO_BLOCKED';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS messages_guard_contact_info ON public.messages;
CREATE TRIGGER messages_guard_contact_info
  BEFORE INSERT OR UPDATE OF content ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.guard_student_contact_info();

-- النقاش: غير المشرف لا ينشر أرقاماً ولا روابط، والبلاغات تصل لإدارة المركز أيضاً.
CREATE OR REPLACE FUNCTION public.post_room_message(_room uuid, _content text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _role text := public.room_role(auth.uid(), _room);
  _r public.halaqa_rooms;
  _text text := btrim(COALESCE(_content, ''));
  _id uuid;
  _title text;
BEGIN
  IF _role IS NULL THEN RAISE EXCEPTION 'not allowed'; END IF;
  SELECT * INTO _r FROM public.halaqa_rooms WHERE id = _room;
  IF _r.kind = 'announcements' AND _role <> 'mod' THEN
    RAISE EXCEPTION 'announcements are for teachers only';
  END IF;
  IF _r.kind = 'discussion' AND _role NOT IN ('mod', 'member') THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  IF char_length(_text) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'message length'; END IF;
  IF _role <> 'mod' AND public.has_contact_info(_text) THEN
    RAISE EXCEPTION 'contact info';
  END IF;
  IF _role <> 'mod' AND EXISTS (SELECT 1 FROM public.room_mutes
                                 WHERE room_id = _room AND user_id = _uid AND until > now()) THEN
    RAISE EXCEPTION 'muted';
  END IF;
  -- حدّ الإرسال: 10 رسائل في الدقيقة للغرفة الواحدة.
  IF (SELECT count(*) FROM public.room_messages
       WHERE room_id = _room AND sender_id = _uid AND created_at > now() - interval '1 minute') >= 10 THEN
    RAISE EXCEPTION 'rate limit';
  END IF;

  INSERT INTO public.room_messages (room_id, sender_id, content)
  VALUES (_room, _uid, _text) RETURNING id INTO _id;

  INSERT INTO public.room_reads (room_id, user_id, last_read_at) VALUES (_room, _uid, now())
  ON CONFLICT (room_id, user_id) DO UPDATE SET last_read_at = now();

  -- إشعار الإعلان للطلاب وأولياء أمورهم.
  IF _r.kind = 'announcements' THEN
    SELECT 'إعلان في ' || h.name INTO _title FROM public.halaqat h WHERE h.id = _r.halaqa_id;
    INSERT INTO public.notifications (user_id, kind, title, body, link)
    SELECT DISTINCT u, 'announcement', _title, left(_text, 140), '/rooms/' || _room
      FROM (
        SELECT hs.student_id AS u FROM public.halaqa_students hs WHERE hs.halaqa_id = _r.halaqa_id
        UNION
        SELECT gl.guardian_id FROM public.guardian_links gl
          JOIN public.halaqa_students hs ON hs.student_id = gl.student_id
         WHERE hs.halaqa_id = _r.halaqa_id
      ) t
     WHERE u <> _uid;
  END IF;
  RETURN _id;
END;
$$;

CREATE OR REPLACE FUNCTION public.report_room_message(_id uuid, _reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _m public.room_messages;
  _halaqa uuid;
BEGIN
  SELECT * INTO _m FROM public.room_messages WHERE id = _id;
  IF _m.id IS NULL OR public.room_role(auth.uid(), _m.room_id) IS NULL THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  IF _m.sender_id = auth.uid() THEN RAISE EXCEPTION 'cannot report own message'; END IF;
  IF _m.deleted_at IS NOT NULL THEN RETURN; END IF;
  INSERT INTO public.room_reports (message_id, reporter_id, reason)
  VALUES (_id, auth.uid(), NULLIF(left(btrim(COALESCE(_reason, '')), 300), ''))
  ON CONFLICT (message_id, reporter_id) DO NOTHING;
  IF FOUND THEN
    SELECT halaqa_id INTO _halaqa FROM public.halaqa_rooms WHERE id = _m.room_id;
    -- معلّم الحلقة ومنشئ المركز ومديروه (C5).
    INSERT INTO public.notifications (user_id, kind, title, body, link)
    SELECT DISTINCT u, 'room_report', 'بلاغ عن رسالة', 'بلاغ جديد في غرف ' || h.name, '/rooms/' || _m.room_id
      FROM public.halaqat h
      CROSS JOIN LATERAL (
        SELECT h.teacher_id AS u
        UNION SELECT c.created_by FROM public.centers c WHERE c.id = h.center_id
        UNION SELECT s.user_id FROM public.center_staff s
               WHERE s.center_id = h.center_id AND s.role = 'manager'
      ) t
     WHERE h.id = _halaqa AND u IS NOT NULL AND u <> _m.sender_id;
  END IF;
END;
$$;
