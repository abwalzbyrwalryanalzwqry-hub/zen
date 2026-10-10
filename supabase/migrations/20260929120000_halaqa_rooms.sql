-- ════════════════════════════════════════════════════════════════════
-- المرحلة 13 — غرف الحلقة: قناة الإعلانات ومجموعة النقاش
--
-- لكل حلقة غرفتان مستقلتان عن جدول chats (المحادثات الثنائية):
--   • الإعلانات: يكتب فيها المعلّم وإدارة المركز فقط، ويقرؤها الطلاب
--     وأولياء أمورهم وطاقم المركز. يُشعَر الطلاب وأولياء الأمور بكل إعلان.
--   • النقاش: اختيارية يفعّلها المعلّم، لأعضاء الحلقة ومعلّمها فقط، مع
--     كتم الأعضاء والإبلاغ والحذف والتثبيت، وموافقة ولي الأمر إن طُلبت.
--
-- كل الكتابة عبر دوال SECURITY DEFINER؛ القراءة المباشرة (للبث اللحظي)
-- مقيّدة بـ can_read_room. لا يُمسّ جدول chats ولا can_start_chat.
-- الفحوص: supabase/tests/checks.sql (60–65).
-- ════════════════════════════════════════════════════════════════════

-- ─── 0) الجداول ───
CREATE TABLE IF NOT EXISTS public.halaqa_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  halaqa_id uuid NOT NULL REFERENCES public.halaqat(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('announcements', 'discussion')),
  enabled boolean NOT NULL DEFAULT true,
  consent_required boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (halaqa_id, kind)
);
ALTER TABLE public.halaqa_rooms ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.halaqa_rooms FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.halaqa_rooms TO service_role;

CREATE TABLE IF NOT EXISTS public.room_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.halaqa_rooms(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text CHECK (content IS NULL OR char_length(content) BETWEEN 1 AND 2000),
  pinned boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  deleted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((deleted_at IS NULL) = (content IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS room_messages_room_idx ON public.room_messages (room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS room_messages_sender_idx ON public.room_messages (sender_id, created_at DESC);
ALTER TABLE public.room_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.room_messages FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.room_messages TO authenticated;
GRANT ALL ON public.room_messages TO service_role;

CREATE TABLE IF NOT EXISTS public.room_mutes (
  room_id uuid NOT NULL REFERENCES public.halaqa_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  until timestamptz NOT NULL,
  muted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
);
ALTER TABLE public.room_mutes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.room_mutes FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.room_mutes TO service_role;

CREATE TABLE IF NOT EXISTS public.room_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.room_messages(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text CHECK (reason IS NULL OR char_length(reason) <= 300),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, reporter_id)
);
ALTER TABLE public.room_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.room_reports FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.room_reports TO service_role;

CREATE TABLE IF NOT EXISTS public.room_reads (
  room_id uuid NOT NULL REFERENCES public.halaqa_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
);
ALTER TABLE public.room_reads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.room_reads FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.room_reads TO service_role;

-- موافقة ولي الأمر على مشاركة ابنه في نقاش الحلقة.
CREATE TABLE IF NOT EXISTS public.room_consents (
  halaqa_id uuid NOT NULL REFERENCES public.halaqat(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (halaqa_id, student_id)
);
ALTER TABLE public.room_consents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.room_consents FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.room_consents TO service_role;

-- قناة إعلانات لكل حلقة، الآن وعند إنشاء أي حلقة.
CREATE OR REPLACE FUNCTION public.create_announcements_room()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.halaqa_rooms (halaqa_id, kind) VALUES (NEW.id, 'announcements')
  ON CONFLICT (halaqa_id, kind) DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.create_announcements_room() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS halaqat_announcements_room ON public.halaqat;
CREATE TRIGGER halaqat_announcements_room AFTER INSERT ON public.halaqat
FOR EACH ROW EXECUTE FUNCTION public.create_announcements_room();

INSERT INTO public.halaqa_rooms (halaqa_id, kind)
SELECT id, 'announcements' FROM public.halaqat
ON CONFLICT (halaqa_id, kind) DO NOTHING;

-- ─── 1) الصلاحيات ───
-- المشرف على غرف الحلقة: معلّمها أو منشئ مركزها أو مديره.
CREATE OR REPLACE FUNCTION public.is_room_moderator(_uid uuid, _halaqa uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _uid IS NOT NULL AND (
    public.can_manage_schedule(_uid, _halaqa)
    OR EXISTS (SELECT 1 FROM public.halaqat h WHERE h.id = _halaqa AND h.teacher_id = _uid)
  )
$$;
REVOKE ALL ON FUNCTION public.is_room_moderator(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_room_moderator(uuid, uuid) TO authenticated, service_role;

-- دور المستخدم في الغرفة: mod | member | reader | NULL (لا وصول).
CREATE OR REPLACE FUNCTION public.room_role(_uid uuid, _room uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _uid IS NULL OR r.id IS NULL THEN NULL
    WHEN public.is_room_moderator(_uid, r.halaqa_id) THEN 'mod'
    WHEN r.kind = 'announcements' THEN
      CASE WHEN public.can_view_schedule(_uid, r.halaqa_id) THEN 'reader' END
    WHEN r.enabled
         AND public.is_halaqa_member(_uid, r.halaqa_id)
         AND (NOT r.consent_required OR EXISTS (
               SELECT 1 FROM public.room_consents rc
                WHERE rc.halaqa_id = r.halaqa_id AND rc.student_id = _uid))
      THEN 'member'
  END
  FROM (SELECT 1) one
  LEFT JOIN public.halaqa_rooms r ON r.id = _room
$$;
REVOKE ALL ON FUNCTION public.room_role(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.room_role(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_read_room(_uid uuid, _room uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$ SELECT public.room_role(_uid, _room) IS NOT NULL $$;
REVOKE ALL ON FUNCTION public.can_read_room(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_room(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "room messages readable to room" ON public.room_messages;
CREATE POLICY "room messages readable to room" ON public.room_messages
  FOR SELECT TO authenticated
  USING (public.can_read_room((SELECT auth.uid()), room_id));

-- البث اللحظي (سياسة القراءة أعلاه تسري عليه).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (SELECT 1 FROM pg_publication_tables
                      WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
                        AND tablename = 'room_messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.room_messages;
  END IF;
END $$;

-- ─── 2) الرسائل ───
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
REVOKE ALL ON FUNCTION public.post_room_message(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_room_message(uuid, text) TO authenticated;

-- حذف لطيف: المرسل لرسالته، والمشرف لأي رسالة. يبقى أثر «رسالة محذوفة».
CREATE OR REPLACE FUNCTION public.delete_room_message(_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _m public.room_messages;
BEGIN
  SELECT * INTO _m FROM public.room_messages WHERE id = _id;
  IF _m.id IS NULL THEN RAISE EXCEPTION 'not found'; END IF;
  IF NOT (_m.sender_id = auth.uid() OR public.room_role(auth.uid(), _m.room_id) = 'mod') THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  IF public.room_role(auth.uid(), _m.room_id) IS NULL THEN RAISE EXCEPTION 'not allowed'; END IF;
  UPDATE public.room_messages
     SET content = NULL, pinned = false, deleted_at = now(), deleted_by = auth.uid()
   WHERE id = _id AND deleted_at IS NULL;
  UPDATE public.room_reports SET resolved_at = now(), resolved_by = auth.uid()
   WHERE message_id = _id AND resolved_at IS NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.delete_room_message(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_room_message(uuid) TO authenticated;

-- تثبيت رسالة واحدة في الغرفة (للمشرف).
CREATE OR REPLACE FUNCTION public.pin_room_message(_id uuid, _pinned boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _m public.room_messages;
BEGIN
  SELECT * INTO _m FROM public.room_messages WHERE id = _id;
  IF _m.id IS NULL OR public.room_role(auth.uid(), _m.room_id) IS DISTINCT FROM 'mod' THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  IF _m.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'deleted'; END IF;
  UPDATE public.room_messages SET pinned = false WHERE room_id = _m.room_id AND pinned;
  IF _pinned THEN UPDATE public.room_messages SET pinned = true WHERE id = _id; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.pin_room_message(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pin_room_message(uuid, boolean) TO authenticated;

-- صفحة من الرسائل (الأحدث أولاً حتى _before)، مع اسم المرسل.
CREATE OR REPLACE FUNCTION public.room_messages_page(_room uuid, _before timestamptz DEFAULT NULL, _limit int DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _halaqa uuid;
BEGIN
  IF public.room_role(_uid, _room) IS NULL THEN RAISE EXCEPTION 'not allowed'; END IF;
  SELECT halaqa_id INTO _halaqa FROM public.halaqa_rooms WHERE id = _room;
  RETURN COALESCE((
    SELECT jsonb_agg(x ORDER BY x->>'created_at')
      FROM (
        SELECT jsonb_build_object(
                 'id', m.id,
                 'sender_id', m.sender_id,
                 'sender_name', COALESCE(p.name, 'مستخدم'),
                 'sender_is_mod', public.is_room_moderator(m.sender_id, _halaqa),
                 'content', m.content,
                 'deleted', m.deleted_at IS NOT NULL,
                 'pinned', m.pinned,
                 'created_at', m.created_at,
                 'mine', m.sender_id = _uid,
                 'reported_by_me', EXISTS (SELECT 1 FROM public.room_reports rr
                                            WHERE rr.message_id = m.id AND rr.reporter_id = _uid)
               ) AS x
          FROM public.room_messages m
          LEFT JOIN public.profiles p ON p.id = m.sender_id
         WHERE m.room_id = _room AND (_before IS NULL OR m.created_at < _before)
         ORDER BY m.created_at DESC
         LIMIT LEAST(GREATEST(COALESCE(_limit, 50), 1), 100)
      ) s
  ), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.room_messages_page(uuid, timestamptz, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.room_messages_page(uuid, timestamptz, int) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_room_read(_room uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.room_role(auth.uid(), _room) IS NULL THEN RAISE EXCEPTION 'not allowed'; END IF;
  INSERT INTO public.room_reads (room_id, user_id, last_read_at) VALUES (_room, auth.uid(), now())
  ON CONFLICT (room_id, user_id) DO UPDATE SET last_read_at = now();
END;
$$;
REVOKE ALL ON FUNCTION public.mark_room_read(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_room_read(uuid) TO authenticated;

-- ─── 3) الإشراف: الكتم والإبلاغ ───
CREATE OR REPLACE FUNCTION public.mute_room_member(_room uuid, _user uuid, _hours int)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _halaqa uuid;
BEGIN
  IF public.room_role(auth.uid(), _room) IS DISTINCT FROM 'mod' THEN RAISE EXCEPTION 'not allowed'; END IF;
  SELECT halaqa_id INTO _halaqa FROM public.halaqa_rooms WHERE id = _room;
  IF public.is_room_moderator(_user, _halaqa) THEN RAISE EXCEPTION 'cannot mute a moderator'; END IF;
  IF COALESCE(_hours, 0) <= 0 THEN
    DELETE FROM public.room_mutes WHERE room_id = _room AND user_id = _user;
    RETURN;
  END IF;
  IF _hours > 24 * 30 THEN RAISE EXCEPTION 'mute too long'; END IF;
  INSERT INTO public.room_mutes (room_id, user_id, until, muted_by)
  VALUES (_room, _user, now() + make_interval(hours => _hours), auth.uid())
  ON CONFLICT (room_id, user_id)
    DO UPDATE SET until = EXCLUDED.until, muted_by = EXCLUDED.muted_by, created_at = now();
  INSERT INTO public.notifications (user_id, kind, title, body, link)
  SELECT _user, 'room', 'أُوقفت مشاركتك مؤقتاً',
         'أوقف المعلّم مشاركتك في نقاش ' || h.name || ' لمدة ' || _hours || ' ساعة.', '/rooms/' || _room
    FROM public.halaqat h WHERE h.id = _halaqa;
END;
$$;
REVOKE ALL ON FUNCTION public.mute_room_member(uuid, uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mute_room_member(uuid, uuid, int) TO authenticated;

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
    INSERT INTO public.notifications (user_id, kind, title, body, link)
    SELECT h.teacher_id, 'room_report', 'بلاغ عن رسالة', 'بلاغ جديد في غرف ' || h.name, '/rooms/' || _m.room_id
      FROM public.halaqat h WHERE h.id = _halaqa AND h.teacher_id IS NOT NULL;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.report_room_message(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_room_message(uuid, text) TO authenticated;

-- البلاغات المفتوحة في غرفة (للمشرف).
CREATE OR REPLACE FUNCTION public.room_open_reports(_room uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.room_role(auth.uid(), _room) IS DISTINCT FROM 'mod' THEN RAISE EXCEPTION 'not allowed'; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'message_id', m.id,
             'sender_id', m.sender_id,
             'sender_name', COALESCE(p.name, 'مستخدم'),
             'content', m.content,
             'created_at', m.created_at,
             'reports', r.n,
             'reasons', r.reasons
           ) ORDER BY r.last_at DESC)
      FROM (
        SELECT message_id, count(*) AS n, max(created_at) AS last_at,
               COALESCE(jsonb_agg(reason) FILTER (WHERE reason IS NOT NULL), '[]'::jsonb) AS reasons
          FROM public.room_reports WHERE resolved_at IS NULL GROUP BY message_id
      ) r
      JOIN public.room_messages m ON m.id = r.message_id AND m.room_id = _room
      LEFT JOIN public.profiles p ON p.id = m.sender_id
  ), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.room_open_reports(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.room_open_reports(uuid) TO authenticated;

-- حسم البلاغ: إبقاء الرسالة أو حذفها.
CREATE OR REPLACE FUNCTION public.resolve_room_reports(_message uuid, _delete boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _room uuid;
BEGIN
  SELECT room_id INTO _room FROM public.room_messages WHERE id = _message;
  IF _room IS NULL OR public.room_role(auth.uid(), _room) IS DISTINCT FROM 'mod' THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  IF _delete THEN
    PERFORM public.delete_room_message(_message);
  ELSE
    UPDATE public.room_reports SET resolved_at = now(), resolved_by = auth.uid()
     WHERE message_id = _message AND resolved_at IS NULL;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.resolve_room_reports(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_room_reports(uuid, boolean) TO authenticated;

-- ─── 4) إعدادات النقاش وموافقة ولي الأمر ───
CREATE OR REPLACE FUNCTION public.set_discussion(_halaqa uuid, _enabled boolean, _consent_required boolean DEFAULT true)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
BEGIN
  IF NOT public.is_room_moderator(auth.uid(), _halaqa) THEN RAISE EXCEPTION 'not allowed'; END IF;
  INSERT INTO public.halaqa_rooms (halaqa_id, kind, enabled, consent_required)
  VALUES (_halaqa, 'discussion', _enabled, COALESCE(_consent_required, true))
  ON CONFLICT (halaqa_id, kind)
    DO UPDATE SET enabled = EXCLUDED.enabled, consent_required = EXCLUDED.consent_required
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;
REVOKE ALL ON FUNCTION public.set_discussion(uuid, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_discussion(uuid, boolean, boolean) TO authenticated;

-- يوافق ولي الأمر لابنه. والمعلّم يوافق فقط لطالب لا وليّ أمر مربوطاً به.
CREATE OR REPLACE FUNCTION public.set_room_consent(_halaqa uuid, _student uuid, _allow boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _has_guardian boolean;
BEGIN
  IF NOT public.is_halaqa_member(_student, _halaqa) THEN RAISE EXCEPTION 'not a member'; END IF;
  _has_guardian := EXISTS (SELECT 1 FROM public.guardian_links WHERE student_id = _student);
  IF NOT (public.is_guardian_of(_uid, _student)
          OR (NOT _has_guardian AND public.is_room_moderator(_uid, _halaqa))) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  IF _allow THEN
    INSERT INTO public.room_consents (halaqa_id, student_id, granted_by)
    VALUES (_halaqa, _student, _uid)
    ON CONFLICT (halaqa_id, student_id) DO UPDATE SET granted_by = EXCLUDED.granted_by, created_at = now();
  ELSE
    DELETE FROM public.room_consents WHERE halaqa_id = _halaqa AND student_id = _student;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.set_room_consent(uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_room_consent(uuid, uuid, boolean) TO authenticated;

-- إعدادات النقاش لحلقة (للمشرف): الحالة وأعضاء الحلقة وموافقاتهم وكتمهم.
CREATE OR REPLACE FUNCTION public.discussion_settings(_halaqa uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _r public.halaqa_rooms;
BEGIN
  IF NOT public.is_room_moderator(auth.uid(), _halaqa) THEN RAISE EXCEPTION 'not allowed'; END IF;
  SELECT * INTO _r FROM public.halaqa_rooms WHERE halaqa_id = _halaqa AND kind = 'discussion';
  RETURN jsonb_build_object(
    'room_id', _r.id,
    'enabled', COALESCE(_r.enabled, false),
    'consent_required', COALESCE(_r.consent_required, true),
    'members', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'student_id', hs.student_id,
               'name', COALESCE(p.name, 'طالب'),
               'has_guardian', EXISTS (SELECT 1 FROM public.guardian_links gl WHERE gl.student_id = hs.student_id),
               'consented', EXISTS (SELECT 1 FROM public.room_consents rc
                                     WHERE rc.halaqa_id = _halaqa AND rc.student_id = hs.student_id),
               'muted_until', (SELECT mu.until FROM public.room_mutes mu
                                WHERE mu.room_id = _r.id AND mu.user_id = hs.student_id AND mu.until > now())
             ) ORDER BY p.name)
        FROM public.halaqa_students hs
        LEFT JOIN public.profiles p ON p.id = hs.student_id
       WHERE hs.halaqa_id = _halaqa
    ), '[]'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.discussion_settings(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.discussion_settings(uuid) TO authenticated;

-- لولي الأمر: نقاشات حلقات أبنائه التي تطلب موافقته.
CREATE OR REPLACE FUNCTION public.guardian_room_consents()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'halaqa_id', h.id,
           'halaqa_name', h.name,
           'student_id', gl.student_id,
           'student_name', COALESCE(p.name, 'طالب'),
           'consented', EXISTS (SELECT 1 FROM public.room_consents rc
                                 WHERE rc.halaqa_id = h.id AND rc.student_id = gl.student_id)
         ) ORDER BY p.name, h.name), '[]'::jsonb)
    FROM public.guardian_links gl
    JOIN public.halaqa_students hs ON hs.student_id = gl.student_id
    JOIN public.halaqat h ON h.id = hs.halaqa_id
    JOIN public.halaqa_rooms r ON r.halaqa_id = h.id AND r.kind = 'discussion'
                              AND r.enabled AND r.consent_required
    LEFT JOIN public.profiles p ON p.id = gl.student_id
   WHERE gl.guardian_id = auth.uid()
$$;
REVOKE ALL ON FUNCTION public.guardian_room_consents() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guardian_room_consents() TO authenticated;

-- ─── 5) قائمة غرفي وحالة غرفة ───
CREATE OR REPLACE FUNCTION public.my_rooms()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH cand AS (
    SELECT r.*, public.room_role(auth.uid(), r.id) AS role
      FROM public.halaqa_rooms r
     WHERE r.halaqa_id IN (
             SELECT halaqa_id FROM public.halaqa_students WHERE student_id = auth.uid()
             UNION SELECT hs.halaqa_id FROM public.halaqa_students hs
                    JOIN public.guardian_links gl ON gl.student_id = hs.student_id
                   WHERE gl.guardian_id = auth.uid()
             UNION SELECT id FROM public.halaqat WHERE teacher_id = auth.uid()
             UNION SELECT h.id FROM public.halaqat h WHERE public.can_manage_schedule(auth.uid(), h.id))
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'room_id', c.id,
           'halaqa_id', c.halaqa_id,
           'halaqa_name', h.name,
           'kind', c.kind,
           'enabled', c.enabled,
           'role', c.role,
           'can_post', c.role = 'mod' OR (c.kind = 'discussion' AND c.role = 'member'),
           'last_message', lm.content,
           'last_at', lm.created_at,
           'unread', (SELECT count(*) FROM public.room_messages m
                       WHERE m.room_id = c.id AND m.sender_id <> auth.uid() AND m.deleted_at IS NULL
                         AND m.created_at > COALESCE((SELECT last_read_at FROM public.room_reads rr
                                                       WHERE rr.room_id = c.id AND rr.user_id = auth.uid()),
                                                     '-infinity'::timestamptz))
         ) ORDER BY lm.created_at DESC NULLS LAST, h.name, c.kind), '[]'::jsonb)
    FROM cand c
    JOIN public.halaqat h ON h.id = c.halaqa_id
    LEFT JOIN LATERAL (SELECT content, created_at FROM public.room_messages m
                        WHERE m.room_id = c.id AND m.deleted_at IS NULL
                        ORDER BY created_at DESC LIMIT 1) lm ON true
   WHERE c.role IS NOT NULL
$$;
REVOKE ALL ON FUNCTION public.my_rooms() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_rooms() TO authenticated;

CREATE OR REPLACE FUNCTION public.room_info(_room uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _role text := public.room_role(auth.uid(), _room);
  _r public.halaqa_rooms;
BEGIN
  IF _role IS NULL THEN RAISE EXCEPTION 'not allowed'; END IF;
  SELECT * INTO _r FROM public.halaqa_rooms WHERE id = _room;
  RETURN jsonb_build_object(
    'room_id', _r.id,
    'halaqa_id', _r.halaqa_id,
    'halaqa_name', (SELECT name FROM public.halaqat WHERE id = _r.halaqa_id),
    'kind', _r.kind,
    'enabled', _r.enabled,
    'role', _role,
    'can_post', _role = 'mod' OR (_r.kind = 'discussion' AND _role = 'member'),
    'muted_until', (SELECT until FROM public.room_mutes
                     WHERE room_id = _room AND user_id = auth.uid() AND until > now()),
    'open_reports', CASE WHEN _role = 'mod' THEN (
        SELECT count(DISTINCT rr.message_id) FROM public.room_reports rr
          JOIN public.room_messages m ON m.id = rr.message_id
         WHERE m.room_id = _room AND rr.resolved_at IS NULL) ELSE 0 END,
    'pinned', (SELECT jsonb_build_object('id', m.id, 'content', m.content, 'created_at', m.created_at,
                                         'sender_name', COALESCE(p.name, 'مستخدم'))
                 FROM public.room_messages m LEFT JOIN public.profiles p ON p.id = m.sender_id
                WHERE m.room_id = _room AND m.pinned AND m.deleted_at IS NULL LIMIT 1)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.room_info(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.room_info(uuid) TO authenticated;
