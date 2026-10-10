-- ─────────── خصوصية أرقام الهواتف ───────────
-- قبل هذا الترحيل: "profiles readable to authenticated ... USING (true)" ⇒ أي مستخدم
-- مسجَّل يقرأ اسم ورقم هاتف كل المستخدمين، ومعظمهم أطفال. هذه مشكلة خصوصية جدّية.
-- بعده: الاسم والصورة والدور مرئية (ضرورية للمحادثات والقوائم)، ورقم الهاتف مرئي
-- لصاحبه ولمعلّم حلقته ولمن أنشأ المركز فقط — والتقييد على مستوى قاعدة البيانات.

-- 1) عمود الهاتف يُنقل إلى جدول منفصل محكوم بسياسته الخاصة.
CREATE TABLE IF NOT EXISTS public.profile_contacts (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.profile_contacts (user_id, phone)
SELECT id, phone FROM public.profiles WHERE phone IS NOT NULL
ON CONFLICT (user_id) DO UPDATE SET phone = EXCLUDED.phone;

ALTER TABLE public.profile_contacts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.profile_contacts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.profile_contacts TO authenticated;
GRANT ALL ON public.profile_contacts TO service_role;

-- من يرى الرقم: صاحبه، أو معلّم يُدرّس صاحبه في إحدى حلقاته.
DROP POLICY IF EXISTS "read own or student phone" ON public.profile_contacts;
CREATE POLICY "read own or student phone" ON public.profile_contacts
  FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    OR EXISTS (
      SELECT 1
      FROM public.halaqa_students hs
      JOIN public.halaqat h ON h.id = hs.halaqa_id
      WHERE hs.student_id = profile_contacts.user_id
        AND h.teacher_id = (SELECT auth.uid())
    )
  );

-- مزامنة الرقم تلقائياً عند التسجيل أو تحديثه في auth.users.
CREATE OR REPLACE FUNCTION public.sync_profile_contact()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profile_contacts (user_id, phone, updated_at)
  VALUES (NEW.id, NEW.phone, now())
  ON CONFLICT (user_id) DO UPDATE
    SET phone = COALESCE(EXCLUDED.phone, public.profile_contacts.phone),
        updated_at = now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_profile_contact() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS auth_user_phone_sync ON auth.users;
CREATE TRIGGER auth_user_phone_sync
AFTER INSERT OR UPDATE OF phone ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.sync_profile_contact();

-- 2) إخفاء عمود phone في profiles عن العميل (يبقى للتوافق الخلفي لكن بلا صلاحية قراءة).
REVOKE SELECT ON public.profiles FROM authenticated;
GRANT SELECT (id, name, avatar, role, created_at) ON public.profiles TO authenticated;
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (name, avatar) ON public.profiles TO authenticated;

-- 3) دالة ملائمة: رقم هاتف مستخدم إن كان المتصل مصرّحاً له.
CREATE OR REPLACE FUNCTION public.visible_phone(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT phone FROM public.profile_contacts WHERE user_id = _user_id
$$;
GRANT EXECUTE ON FUNCTION public.visible_phone(uuid) TO authenticated;

-- ─────────── إحكام سياسة تحديث المحادثات ───────────
-- السياسة السابقة بلا WITH CHECK: يستطيع مشارك تعديل مصفوفة participants (مثلاً
-- إخراج الطرف الآخر أو إضافة أشخاص). نضيف تحققاً على الصف الجديد.
DROP POLICY IF EXISTS "chat participants update" ON public.chats;
CREATE POLICY "chat participants update" ON public.chats
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = ANY(participants))
  WITH CHECK ((SELECT auth.uid()) = ANY(participants));

-- منع تغيير قائمة المشاركين بعد الإنشاء (تُدار لاحقاً بجدول أعضاء مخصّص).
CREATE OR REPLACE FUNCTION public.chats_participants_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.participants IS DISTINCT FROM OLD.participants THEN
    NEW.participants := OLD.participants;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.chats_participants_immutable() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS chats_participants_guard ON public.chats;
CREATE TRIGGER chats_participants_guard
BEFORE UPDATE ON public.chats
FOR EACH ROW EXECUTE FUNCTION public.chats_participants_immutable();

-- ─────────── حدّ طول الرسائل ───────────
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_content_length;
ALTER TABLE public.messages
  ADD CONSTRAINT messages_content_length CHECK (char_length(content) BETWEEN 1 AND 4000);
