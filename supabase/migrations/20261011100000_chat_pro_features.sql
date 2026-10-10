-- ═══════════════════════════════════════════════════════════════════════════
-- تطوير المحادثات — المرحلة 3: ميزات المحادثة الاحترافية
-- (docs/CHAT_AI_ROADMAP.md — الرد، والحذف للجميع، والتفاعلات، وC5، وR4، وR6)
--
--   الرد          messages.reply_to (من المحادثة نفسها فقط).
--   الحذف         delete_message(): المرسل يحذف رسالته للجميع، ويبقى أثر «رسالة محذوفة».
--   التفاعلات     message_reactions بمجموعة ثابتة، وtoggle_reaction().
--   C5            إخفاء تلقائي لرسالة النقاش بعد 3 بلاغات مفتوحة حتى يراجعها المشرف. النص المخفي
--                 يُنقل إلى جدول لا يقرؤه إلا الخادم، فلا يصل إلى أحد عبر القراءة المباشرة أو البث.
--   R4            شارة غير المقروء في شريط التنقل تشمل الغرف.
--   R6            «قرأه X من Y» لإعلانات الحلقة (للمشرف).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1) الرد والحذف للجميع ───
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS reply_to uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
GRANT INSERT (reply_to) ON public.messages TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_message_reply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.reply_to IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.messages WHERE id = NEW.reply_to AND chat_id = NEW.chat_id) THEN
    RAISE EXCEPTION 'REPLY_OUTSIDE_CHAT';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS messages_guard_reply ON public.messages;
CREATE TRIGGER messages_guard_reply
  BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.guard_message_reply();

CREATE OR REPLACE FUNCTION public.delete_message(_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _m public.messages;
BEGIN
  SELECT * INTO _m FROM public.messages WHERE id = _id;
  IF _m.id IS NULL OR _m.sender_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  IF _m.deleted_at IS NOT NULL THEN RETURN; END IF;
  UPDATE public.messages
     -- القيد messages_content_length يمنع النص الفارغ؛ الواجهة تعتمد على deleted_at.
     SET content = 'رسالة محذوفة', media_path = NULL, duration_seconds = NULL, deleted_at = now()
   WHERE id = _id;
  DELETE FROM public.message_reactions WHERE message_id = _id;
  -- معاينة المحادثة إن كانت هذه آخر رسالة.
  UPDATE public.chats c SET last_message = 'رسالة محذوفة'
   WHERE c.id = _m.chat_id
     AND NOT EXISTS (SELECT 1 FROM public.messages x
                      WHERE x.chat_id = _m.chat_id AND x.created_at > _m.created_at);
END;
$$;
REVOKE ALL ON FUNCTION public.delete_message(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_message(uuid) TO authenticated;

-- التعديل لا يُحيي رسالة محذوفة.
CREATE OR REPLACE FUNCTION public.edit_message(_id uuid, _content text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _m public.messages;
  _text text := btrim(COALESCE(_content, ''));
BEGIN
  SELECT * INTO _m FROM public.messages WHERE id = _id;
  IF _m.id IS NULL OR _m.sender_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  IF _m.type <> 'text' OR _m.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'NOT_EDITABLE'; END IF;
  IF _m.created_at < now() - interval '15 minutes' THEN RAISE EXCEPTION 'EDIT_WINDOW_PASSED'; END IF;
  IF char_length(_text) NOT BETWEEN 1 AND 4000 THEN RAISE EXCEPTION 'INVALID_LENGTH'; END IF;
  UPDATE public.messages SET content = _text, edited_at = now() WHERE id = _id;
  UPDATE public.chats c SET last_message = left(_text, 200)
   WHERE c.id = _m.chat_id
     AND NOT EXISTS (SELECT 1 FROM public.messages x
                      WHERE x.chat_id = _m.chat_id AND x.created_at > _m.created_at);
END;
$$;

-- ─── 2) التفاعلات ───
CREATE TABLE IF NOT EXISTS public.message_reactions (
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji text NOT NULL CHECK (emoji IN ('👍', '❤️', '🤲', '✅', '🌟')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id, emoji)
);
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.message_reactions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.message_reactions TO authenticated;
GRANT ALL ON public.message_reactions TO service_role;
DROP POLICY IF EXISTS "read reactions in readable chats" ON public.message_reactions;
CREATE POLICY "read reactions in readable chats" ON public.message_reactions
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.messages m
                  WHERE m.id = message_id AND public.can_read_chat(m.chat_id, (SELECT auth.uid()))));
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (SELECT 1 FROM pg_publication_tables
                      WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
                        AND tablename = 'message_reactions') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.toggle_reaction(_id uuid, _emoji text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _m public.messages;
BEGIN
  SELECT * INTO _m FROM public.messages WHERE id = _id;
  IF _m.id IS NULL OR _m.deleted_at IS NOT NULL
     OR NOT public.can_post_in_chat(_m.chat_id, auth.uid()) THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;
  DELETE FROM public.message_reactions WHERE message_id = _id AND user_id = auth.uid() AND emoji = _emoji;
  IF FOUND THEN RETURN false; END IF;
  INSERT INTO public.message_reactions (message_id, user_id, emoji) VALUES (_id, auth.uid(), _emoji);
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.toggle_reaction(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.toggle_reaction(uuid, text) TO authenticated;

-- ─── 3) الإخفاء التلقائي في النقاش (C5) ───
ALTER TABLE public.room_messages ADD COLUMN IF NOT EXISTS hidden_at timestamptz;

DO $$
DECLARE _c text;
BEGIN
  FOR _c IN SELECT conname FROM pg_constraint
             WHERE conrelid = 'public.room_messages'::regclass AND contype = 'c'
               AND pg_get_constraintdef(oid) LIKE '%deleted_at IS NULL%'
  LOOP
    EXECUTE format('ALTER TABLE public.room_messages DROP CONSTRAINT %I', _c);
  END LOOP;
END $$;
ALTER TABLE public.room_messages DROP CONSTRAINT IF EXISTS room_messages_content_state;
ALTER TABLE public.room_messages ADD CONSTRAINT room_messages_content_state
  CHECK ((content IS NULL) = (deleted_at IS NOT NULL OR hidden_at IS NOT NULL));

CREATE TABLE IF NOT EXISTS public.room_hidden_contents (
  message_id uuid PRIMARY KEY REFERENCES public.room_messages(id) ON DELETE CASCADE,
  content text NOT NULL,
  hidden_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.room_hidden_contents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.room_hidden_contents FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.room_hidden_contents TO service_role;

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
  IF NOT FOUND THEN RETURN; END IF;

  SELECT halaqa_id INTO _halaqa FROM public.halaqa_rooms WHERE id = _m.room_id;
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

  -- 3 بلاغات مفتوحة على رسالة غير مشرف: تُخفى حتى المراجعة.
  IF _m.hidden_at IS NULL
     AND NOT public.is_room_moderator(_m.sender_id, _halaqa)
     AND (SELECT count(*) FROM public.room_reports
           WHERE message_id = _id AND resolved_at IS NULL) >= 3 THEN
    INSERT INTO public.room_hidden_contents (message_id, content) VALUES (_id, _m.content)
    ON CONFLICT (message_id) DO NOTHING;
    UPDATE public.room_messages SET content = NULL, hidden_at = now(), pinned = false WHERE id = _id;
  END IF;
END;
$$;

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
  DELETE FROM public.room_hidden_contents WHERE message_id = _id;
  UPDATE public.room_reports SET resolved_at = now(), resolved_by = auth.uid()
   WHERE message_id = _id AND resolved_at IS NULL;
END;
$$;

-- الإبقاء (بلا حذف) يعيد الرسالة المخفية.
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
    UPDATE public.room_messages m
       SET content = h.content, hidden_at = NULL
      FROM public.room_hidden_contents h
     WHERE m.id = _message AND h.message_id = m.id AND m.deleted_at IS NULL;
    DELETE FROM public.room_hidden_contents WHERE message_id = _message;
  END IF;
END;
$$;

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
  _mod boolean;
BEGIN
  IF public.room_role(_uid, _room) IS NULL THEN RAISE EXCEPTION 'not allowed'; END IF;
  SELECT halaqa_id INTO _halaqa FROM public.halaqa_rooms WHERE id = _room;
  _mod := public.room_role(_uid, _room) = 'mod';
  RETURN COALESCE((
    SELECT jsonb_agg(x ORDER BY x->>'created_at')
      FROM (
        SELECT jsonb_build_object(
                 'id', m.id,
                 'sender_id', m.sender_id,
                 'sender_name', COALESCE(p.name, 'مستخدم'),
                 'sender_is_mod', public.is_room_moderator(m.sender_id, _halaqa),
                 -- المخفي يراه المشرف (ومرسله) للمراجعة فقط.
                 'content', COALESCE(m.content,
                                     CASE WHEN _mod OR m.sender_id = _uid THEN hc.content END),
                 'deleted', m.deleted_at IS NOT NULL,
                 'hidden', m.hidden_at IS NOT NULL AND m.deleted_at IS NULL,
                 'pinned', m.pinned,
                 'created_at', m.created_at,
                 'mine', m.sender_id = _uid,
                 'reported_by_me', EXISTS (SELECT 1 FROM public.room_reports rr
                                            WHERE rr.message_id = m.id AND rr.reporter_id = _uid)
               ) AS x
          FROM public.room_messages m
          LEFT JOIN public.profiles p ON p.id = m.sender_id
          LEFT JOIN public.room_hidden_contents hc ON hc.message_id = m.id
         WHERE m.room_id = _room AND (_before IS NULL OR m.created_at < _before)
         ORDER BY m.created_at DESC
         LIMIT LEAST(GREATEST(COALESCE(_limit, 50), 1), 100)
      ) s
  ), '[]'::jsonb);
END;
$$;

-- ─── 4) قراءة الإعلانات (R6) ───
CREATE OR REPLACE FUNCTION public.room_read_stats(_room uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _r public.halaqa_rooms;
  _total int;
BEGIN
  IF public.room_role(auth.uid(), _room) IS DISTINCT FROM 'mod' THEN RAISE EXCEPTION 'not allowed'; END IF;
  SELECT * INTO _r FROM public.halaqa_rooms WHERE id = _room;
  SELECT count(*) INTO _total FROM public.halaqa_students WHERE halaqa_id = _r.halaqa_id;
  RETURN jsonb_build_object(
    'total', _total,
    'messages', COALESCE((
      SELECT jsonb_object_agg(m.id, (
               SELECT count(*) FROM public.room_reads rr
                 JOIN public.halaqa_students hs ON hs.student_id = rr.user_id AND hs.halaqa_id = _r.halaqa_id
                WHERE rr.room_id = _room AND rr.last_read_at >= m.created_at))
        FROM (SELECT id, created_at FROM public.room_messages
               WHERE room_id = _room AND deleted_at IS NULL
               ORDER BY created_at DESC LIMIT 50) m
    ), '{}'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.room_read_stats(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.room_read_stats(uuid) TO authenticated;

-- ─── 5) الشارة تشمل الغرف (R4) ───
CREATE OR REPLACE FUNCTION public.unread_total()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (COALESCE((SELECT SUM(unread) FROM public.unread_counts()), 0)
        + COALESCE((SELECT SUM((x ->> 'unread')::int)
                      FROM jsonb_array_elements(public.my_rooms()) x), 0))::integer
$$;

-- البحث يتجاهل المحذوف.
CREATE OR REPLACE FUNCTION public.search_my_messages(_q text, _limit integer DEFAULT 30)
RETURNS SETOF public.messages
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.*
    FROM public.messages m
    JOIN public.chats c ON c.id = m.chat_id
   WHERE auth.uid() = ANY (c.participants)
     AND m.type = 'text'
     AND m.deleted_at IS NULL
     AND char_length(btrim(COALESCE(_q, ''))) >= 2
     AND public.normalize_ar(m.content) LIKE
         '%' || replace(replace(replace(public.normalize_ar(btrim(_q)), '\', '\\'), '%', '\%'), '_', '\_') || '%'
   ORDER BY m.created_at DESC
   LIMIT LEAST(GREATEST(COALESCE(_limit, 30), 1), 100)
$$;

-- ─── 6) وصف صحيح للطرف الآخر (F12، F13): معلّم أو وليّ أمر أو طالب ───
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
    'peer_kind', CASE
       WHEN _peer IS NULL THEN NULL
       WHEN public.is_teacher(_peer) THEN 'teacher'
       WHEN EXISTS (SELECT 1 FROM public.guardian_links WHERE guardian_id = _peer)
            AND NOT EXISTS (SELECT 1 FROM public.halaqa_students WHERE student_id = _peer) THEN 'guardian'
       ELSE 'student' END,
    'peer_avatar', (SELECT avatar FROM public.profiles WHERE id = _peer),
    'blocked_by_me', EXISTS (SELECT 1 FROM public.user_blocks
                              WHERE blocker_id = _me AND blocked_id = _peer),
    'members', (SELECT jsonb_agg(jsonb_build_object('id', p.id, 'name', COALESCE(p.name, 'مستخدم'))
                                 ORDER BY p.name)
                  FROM public.profiles p WHERE p.id = ANY (_c.participants))
  );
END;
$$;
