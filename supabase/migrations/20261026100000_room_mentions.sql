-- ════════════════════════════════════════════════════════════════════════════
-- المرحلة 9.6 — الإشارات في غرف النقاش
-- ════════════════════════════════════════════════════════════════════════════
-- الصيغة المخزّنة: @[الاسم](معرّف المستخدم). العميل يدرجها من قائمة أعضاء الغرفة (بالأسماء لا بأسماء
-- الدخول، كي لا تنكشف معرّفات الدخول بين الطلاب)، والخادم وحده يقرّر من يُشعَر.

-- يستبدل الإشارات بـ «@الاسم» (لفحص أرقام التواصل ولنص الإشعار).
CREATE OR REPLACE FUNCTION public.strip_room_mentions(_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT regexp_replace(COALESCE(_text, ''),
    '@\[([^\]]{1,40})\]\([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\)', '@\1', 'g')
$$;
REVOKE ALL ON FUNCTION public.strip_room_mentions(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.strip_room_mentions(text) TO authenticated, service_role;

-- من يمكن الإشارة إليه: أعضاء النقاش الفعليون (بموافقة إن لزمت) ومشرفو الحلقة، عدا السائل.
CREATE OR REPLACE FUNCTION public.room_mention_candidates(_room uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := (SELECT auth.uid());
  r public.halaqa_rooms;
BEGIN
  SELECT * INTO r FROM public.halaqa_rooms WHERE id = _room;
  IF r.id IS NULL OR r.kind <> 'discussion' OR COALESCE(public.room_role(caller, _room), '') NOT IN ('mod', 'member') THEN
    RETURN '[]'::jsonb;
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object('user_id', u.id, 'name', COALESCE(p.name, 'عضو'), 'mod', u.is_mod) ORDER BY u.is_mod DESC, p.name)
      FROM (
        SELECT hs.student_id AS id, false AS is_mod FROM public.halaqa_students hs
         WHERE hs.halaqa_id = r.halaqa_id AND public.room_role(hs.student_id, _room) = 'member'
        UNION
        SELECT h.teacher_id, true FROM public.halaqat h WHERE h.id = r.halaqa_id AND h.teacher_id IS NOT NULL
      ) u
      LEFT JOIN public.profiles p ON p.id = u.id
     WHERE u.id <> caller
  ), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.room_mention_candidates(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.room_mention_candidates(uuid) TO authenticated;

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
  _plain text;
  _sender text;
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
  -- الإشارات «@[الاسم](معرّف)» تُزال قبل فحص أرقام التواصل (المعرّف فيه أرقام).
  _plain := public.strip_room_mentions(_text);
  IF _role <> 'mod' AND public.has_contact_info(_plain) THEN
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
    SELECT DISTINCT u, 'announcement', _title, left(_plain, 140), '/rooms/' || _room
      FROM (
        SELECT hs.student_id AS u FROM public.halaqa_students hs WHERE hs.halaqa_id = _r.halaqa_id
        UNION
        SELECT gl.guardian_id FROM public.guardian_links gl
          JOIN public.halaqa_students hs ON hs.student_id = gl.student_id
         WHERE hs.halaqa_id = _r.halaqa_id
      ) t
     WHERE u <> _uid;
  END IF;

  -- الإشارات في النقاش (9.6): تُحلَّل هنا على الخادم لا في العميل. 5 على الأكثر، ولمن يقرأ الغرفة فقط،
  -- وليس للمرسل نفسه. الإعلان يُشعر الجميع أصلاً فلا إشعار إضافي.
  IF _r.kind = 'discussion' THEN
    SELECT COALESCE(p.name, 'زميلك') INTO _sender FROM public.profiles p WHERE p.id = _uid;
    INSERT INTO public.notifications (user_id, kind, title, body, link)
    SELECT m.u, 'room', COALESCE(_sender, 'زميلك') || ' أشار إليك', left(_plain, 140), '/rooms/' || _room
      FROM (SELECT DISTINCT u FROM (
              SELECT (x[1])::uuid AS u
                FROM regexp_matches(_text, '@\[[^\]]{1,40}\]\(([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)', 'g') x
              LIMIT 5) t) m
     WHERE m.u <> _uid AND public.room_role(m.u, _room) IS NOT NULL;
  END IF;
  RETURN _id;
END;
$$;
