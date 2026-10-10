-- ════════════════════════════════════════════════════════════════════
-- حاويات التخزين: التسميعات الصوتية ومرفقات المحادثات
--
-- الكود كان يرفع إلى حاوية "recitations" عبر
-- supabase.storage.from(RECITATION_BUCKET).upload(...) لكن الحاوية لم تُنشأ
-- في أي ترحيل، فكل رفع تسميع يفشل بـ "Bucket not found" في أي بيئة جديدة.
-- ════════════════════════════════════════════════════════════════════

-- ─────────── حاوية التسميعات ───────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'recitations',
  'recitations',
  false,                                   -- خاصة: الوصول بروابط موقّعة فقط
  10485760,                                -- 10 ميغابايت
  ARRAY['audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-m4a']
)
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ─────────── حاوية مرفقات المحادثات ───────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-media',
  'chat-media',
  false,
  10485760,                                -- 10 ميغابايت
  ARRAY[
    'audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-m4a',
    'image/jpeg', 'image/png', 'image/webp', 'image/gif'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ─────────── دالة مساعدة: هل المستخدم مشارك في المحادثة؟ ───────────
CREATE OR REPLACE FUNCTION public.is_chat_participant(_chat_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chats c
    WHERE c.id = _chat_id AND _user_id = ANY(c.participants)
  );
$$;

REVOKE ALL ON FUNCTION public.is_chat_participant(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.is_chat_participant(uuid, uuid) TO authenticated, service_role;

-- دالة لتحويل أول مجلد في المسار إلى uuid بأمان (المسار قد يكون بأي شكل)
CREATE OR REPLACE FUNCTION public.storage_folder_uuid(_name text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  first_folder text := split_part(_name, '/', 1);
BEGIN
  RETURN first_folder::uuid;
EXCEPTION
  WHEN others THEN RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.storage_folder_uuid(text) TO authenticated, service_role;

-- ─────────── سياسات التسميعات ───────────
-- مسار الملف: {student_id}/{timestamp}.webm
DROP POLICY IF EXISTS "recitations upload own folder" ON storage.objects;
CREATE POLICY "recitations upload own folder" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'recitations'
    AND public.storage_folder_uuid(name) = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS "recitations read own or teacher" ON storage.objects;
CREATE POLICY "recitations read own or teacher" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'recitations'
    AND (
      public.storage_folder_uuid(name) = (SELECT auth.uid())
      OR public.is_teacher((SELECT auth.uid()))
    )
  );

DROP POLICY IF EXISTS "recitations delete own or teacher" ON storage.objects;
CREATE POLICY "recitations delete own or teacher" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'recitations'
    AND (
      public.storage_folder_uuid(name) = (SELECT auth.uid())
      OR public.is_teacher((SELECT auth.uid()))
    )
  );

-- ─────────── سياسات مرفقات المحادثات ───────────
-- مسار الملف: {chat_id}/{sender_id}/{timestamp}.{ext}
DROP POLICY IF EXISTS "chat media upload participant" ON storage.objects;
CREATE POLICY "chat media upload participant" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chat-media'
    AND public.is_chat_participant(public.storage_folder_uuid(name), (SELECT auth.uid()))
    AND split_part(name, '/', 2) = (SELECT auth.uid())::text
  );

DROP POLICY IF EXISTS "chat media read participant" ON storage.objects;
CREATE POLICY "chat media read participant" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'chat-media'
    AND public.is_chat_participant(public.storage_folder_uuid(name), (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "chat media delete own" ON storage.objects;
CREATE POLICY "chat media delete own" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'chat-media'
    AND split_part(name, '/', 2) = (SELECT auth.uid())::text
  );
