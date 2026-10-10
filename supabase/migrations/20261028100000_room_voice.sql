-- ════════════════════════════════════════════════════════════════════════════
-- المرحلة 9.7 — الرسائل الصوتية في غرف الحلقة
-- ════════════════════════════════════════════════════════════════════════════
-- شروط السياسات في private (القاعدة من 7.2): لا تُطلب عبر /rpc.
-- حاوية خاصة room-media (2MB، صوت فقط)، والمسار {room}/{sender}/{ملف}. حتى 60 ثانية.
--  - الإرسال: المشرف دائماً؛ والطالب العضو إن كان غير مربوط بوليّ أمر، أو وافق وليّه صراحةً على
--    مشاركته في نقاش الحلقة (room_consents) حتى لو لم تشترط الغرفة الموافقة.
--  - القراءة: من يقرأ الغرفة، ولرسالة غير محذوفة؛ والمخفية بالبلاغات للمشرف ومرسلها فقط — تفرضه
--    سياسة التخزين نفسها لا الواجهة.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('room-media', 'room-media', false, 2097152,
        ARRAY['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/x-m4a', 'audio/aac'])
ON CONFLICT (id) DO UPDATE
  SET public = false, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

ALTER TABLE public.room_messages ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'text';
ALTER TABLE public.room_messages ADD COLUMN IF NOT EXISTS media_path text;
ALTER TABLE public.room_messages ADD COLUMN IF NOT EXISTS duration_seconds int;
ALTER TABLE public.room_messages DROP CONSTRAINT IF EXISTS room_messages_kind_check;
ALTER TABLE public.room_messages ADD CONSTRAINT room_messages_kind_check CHECK (
  (kind = 'text' AND media_path IS NULL AND duration_seconds IS NULL)
  OR (kind = 'voice' AND media_path IS NOT NULL AND duration_seconds BETWEEN 1 AND 60));
CREATE UNIQUE INDEX IF NOT EXISTS room_messages_media_path_key ON public.room_messages (media_path) WHERE media_path IS NOT NULL;

CREATE OR REPLACE FUNCTION private.room_voice_allowed(_uid uuid, _room uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE public.room_role(_uid, _room)
    WHEN 'mod' THEN true
    WHEN 'member' THEN
      NOT EXISTS (SELECT 1 FROM public.guardian_links gl WHERE gl.student_id = _uid)
      OR EXISTS (SELECT 1 FROM public.room_consents rc JOIN public.halaqa_rooms r ON r.halaqa_id = rc.halaqa_id
                  WHERE r.id = _room AND rc.student_id = _uid)
    ELSE false
  END
$$;
REVOKE ALL ON FUNCTION private.room_voice_allowed(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.room_voice_allowed(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.can_read_room_media(_uid uuid, _name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.room_messages m
     WHERE m.media_path = _name AND m.kind = 'voice' AND m.deleted_at IS NULL
       AND private.can_read_room(_uid, m.room_id)
       AND (m.hidden_at IS NULL OR m.sender_id = _uid OR public.room_role(_uid, m.room_id) = 'mod'))
$$;
REVOKE ALL ON FUNCTION private.can_read_room_media(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_read_room_media(uuid, text) TO authenticated, service_role;

DROP POLICY IF EXISTS "room media upload" ON storage.objects;
CREATE POLICY "room media upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'room-media'
    AND split_part(name, '/', 2) = (SELECT auth.uid())::text
    AND private.room_voice_allowed((SELECT auth.uid()), public.storage_folder_uuid(name))
  );
DROP POLICY IF EXISTS "room media read" ON storage.objects;
CREATE POLICY "room media read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'room-media' AND private.can_read_room_media((SELECT auth.uid()), name));
DROP POLICY IF EXISTS "room media delete own" ON storage.objects;
CREATE POLICY "room media delete own" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'room-media' AND split_part(name, '/', 2) = (SELECT auth.uid())::text);

CREATE OR REPLACE FUNCTION public.post_room_voice(_room uuid, _path text, _seconds int)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := (SELECT auth.uid());
  mid uuid;
BEGIN
  IF caller IS NULL OR NOT private.room_voice_allowed(caller, _room) THEN RAISE EXCEPTION 'VOICE_NOT_ALLOWED'; END IF;
  IF _seconds IS NULL OR _seconds NOT BETWEEN 1 AND 60 THEN RAISE EXCEPTION 'VOICE_LENGTH'; END IF;
  IF _path IS NULL OR _path NOT LIKE _room::text || '/' || caller::text || '/%' OR _path LIKE '%..%' THEN
    RAISE EXCEPTION 'INVALID_PATH';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'room-media' AND o.name = _path) THEN
    RAISE EXCEPTION 'MEDIA_NOT_FOUND';
  END IF;
  -- الصلاحيات والكتم وحدّ الإرسال والإشعار عبر post_room_message نفسها.
  mid := public.post_room_message(_room, 'رسالة صوتية');
  UPDATE public.room_messages SET kind = 'voice', media_path = _path, duration_seconds = _seconds WHERE id = mid;
  RETURN mid;
END;
$$;
REVOKE ALL ON FUNCTION public.post_room_voice(uuid, text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_room_voice(uuid, text, int) TO authenticated;

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
                 -- 9.7: الرسالة الصوتية (المسار يظهر لمن يرى المحتوى فقط).
                 'kind', m.kind,
                 'media_path', CASE WHEN m.kind = 'voice' AND m.deleted_at IS NULL
                                     AND (m.hidden_at IS NULL OR _mod OR m.sender_id = _uid)
                                    THEN m.media_path END,
                 'duration_seconds', m.duration_seconds,
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

-- للواجهة: هل يظهر زر الصوت للسائل نفسه؟ (لا يقبل معرّف مستخدم آخر.)
CREATE OR REPLACE FUNCTION public.my_room_voice_allowed(_room uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$ SELECT COALESCE(private.room_voice_allowed((SELECT auth.uid()), _room), false) $$;
REVOKE ALL ON FUNCTION public.my_room_voice_allowed(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_room_voice_allowed(uuid) TO authenticated;
