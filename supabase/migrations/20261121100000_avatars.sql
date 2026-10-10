-- ════════════════════════════════════════════════════════════════════════════
-- تحليل قسم «المزيد» — المرحلة 4ج (GAP-08): الصورة الشخصية
-- ════════════════════════════════════════════════════════════════════════════
-- حاوية `avatars` عامة القراءة لأن `profiles.avatar` رابط تعرضه بطاقات الحلقة والمحادثات مباشرة. المسار
-- `{uid}/{عشوائي}.webp` (اسم لا يُخمَّن، ولا سياسة SELECT فلا سرد للملفات). الكتابة والحذف لصاحب المجلد وحده،
-- و512KB لصور WebP/JPEG/PNG (العميل يصغّرها إلى 256px قبل الرفع).
-- my_storage_objects تشمل الحاوية فيحذف «حذف الحساب» الصورة مع بقية الملفات. الفحص 133.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', true, 524288, ARRAY['image/webp', 'image/jpeg', 'image/png'])
ON CONFLICT (id) DO UPDATE
  SET public = true,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "avatars insert own folder" ON storage.objects;
CREATE POLICY "avatars insert own folder" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

DROP POLICY IF EXISTS "avatars update own folder" ON storage.objects;
CREATE POLICY "avatars update own folder" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text)
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

DROP POLICY IF EXISTS "avatars delete own folder" ON storage.objects;
CREATE POLICY "avatars delete own folder" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

-- واجهة التخزين تحتاج قراءة صف الملف لتحذفه أو تستبدله؛ نقصرها على صاحب المجلد (القراءة العامة عبر الرابط
-- لا تمر بـ RLS لأن الحاوية عامة).
DROP POLICY IF EXISTS "avatars select own folder" ON storage.objects;
CREATE POLICY "avatars select own folder" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

CREATE OR REPLACE FUNCTION public.my_storage_objects()
RETURNS TABLE (bucket_id text, name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, storage
AS $$
  SELECT o.bucket_id, o.name FROM storage.objects o
  WHERE auth.uid() IS NOT NULL AND (
    (o.bucket_id = 'recitations' AND split_part(o.name, '/', 1) = auth.uid()::text)
    OR (o.bucket_id = 'chat-media' AND split_part(o.name, '/', 2) = auth.uid()::text)
    OR (o.bucket_id = 'avatars' AND split_part(o.name, '/', 1) = auth.uid()::text)
  )
  LIMIT 5000
$$;
REVOKE ALL ON FUNCTION public.my_storage_objects() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_storage_objects() TO authenticated;
