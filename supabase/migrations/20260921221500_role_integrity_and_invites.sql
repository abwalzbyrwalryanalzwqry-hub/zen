-- ─────────── سلامة الأدوار: user_roles هو المصدر الوحيد للحقيقة ───────────
-- المشكلة قبل هذا الترحيل:
--   1) handle_new_user تُنشئ profiles بالدور الافتراضي 'student' دائماً، والمُشغّل
--      profiles_role_to_user_roles يعمل AFTER INSERT فقط. العميل كان يُحدّث profiles.role
--      إلى 'teacher' (UPDATE) فلا يعمل المُشغّل ⇒ user_roles يبقى 'student' ⇒ المعلّم
--      الجديد بلا أي صلاحية، مع أن الواجهة تُظهر له شارة «معلم» (تضارب مربك).
--   2) أي مستخدم كان يستطيع تعيين دوره بنفسه من شاشة الحساب.
-- الحل: profiles.role يُشتق من user_roles تلقائياً ولا يُكتب من العميل أبداً،
--       ودور المعلم يُمنح فقط برمز دعوة يُصدره معلّم قائم.

-- ─── 1) profiles.role للقراءة فقط من ناحية العميل ───
CREATE OR REPLACE FUNCTION public.profiles_role_is_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- منع انتقال الملف الشخصي إلى مستخدم آخر.
  NEW.id := OLD.id;
  -- الدور دائماً مشتق من user_roles، لا مما يرسله العميل: أي محاولة لتغييره
  -- تُستبدل بالقيمة الحقيقية. اشتقاقه (بدل إرجاعه إلى OLD.role) هو ما يسمح
  -- لمُشغّل المزامنة بتحديثه فعلياً عند منح الدور أو سحبه.
  NEW.role := CASE
    WHEN public.has_role(NEW.id, 'teacher') THEN 'teacher'
    ELSE 'student'
  END;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.profiles_role_is_immutable() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS profiles_role_immutable ON public.profiles;
CREATE TRIGGER profiles_role_immutable
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.profiles_role_is_immutable();

-- ─── 2) مزامنة profiles.role من user_roles (الاتجاه الصحيح) ───
CREATE OR REPLACE FUNCTION public.sync_profile_role_from_roles()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target uuid := COALESCE(NEW.user_id, OLD.user_id);
BEGIN
  UPDATE public.profiles p
     SET role = CASE WHEN public.has_role(target, 'teacher') THEN 'teacher' ELSE 'student' END
   WHERE p.id = target;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_profile_role_from_roles() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS user_roles_sync_profile ON public.user_roles;
CREATE TRIGGER user_roles_sync_profile
AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.sync_profile_role_from_roles();

-- المُشغّل القديم بالاتجاه المعاكس (profiles ⇒ user_roles) لم يعد صحيحاً: يُحذف.
DROP TRIGGER IF EXISTS profiles_role_to_user_roles ON public.profiles;

-- ─── 3) إنشاء الحساب: دور الطالب دائماً، والاسم من بيانات التسجيل ───
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, phone, name, role)
  VALUES (
    NEW.id,
    NEW.phone,
    COALESCE(
      NULLIF(NEW.raw_user_meta_data->>'name', ''),
      'مستخدم ' || COALESCE(RIGHT(COALESCE(NEW.phone, ''), 4), '')
    ),
    -- الدور لا يُقرأ من بيانات المستخدم أبداً: كل حساب جديد طالب حتى يُمنح غير ذلك.
    'student'
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'student')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- تصحيح البيانات القائمة: كل من كُتب له 'teacher' في profiles بلا صلاحية فعلية يعود طالباً.
UPDATE public.profiles p
   SET role = CASE WHEN public.has_role(p.id, 'teacher') THEN 'teacher' ELSE 'student' END
 WHERE p.role IS DISTINCT FROM (CASE WHEN public.has_role(p.id, 'teacher') THEN 'teacher' ELSE 'student' END);

-- ─── 4) دعوات المعلمين: الدور يُمنح برمز من معلّم قائم ───
CREATE TABLE IF NOT EXISTS public.teacher_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  note text,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  used_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  used_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS teacher_invites_creator_idx ON public.teacher_invites (created_by, created_at DESC);

ALTER TABLE public.teacher_invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.teacher_invites FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.teacher_invites TO service_role;
GRANT SELECT ON public.teacher_invites TO authenticated;

-- المُنشئ فقط يرى دعواته؛ لا أحد يكتب في الجدول مباشرة (الكتابة عبر الدوال أدناه).
DROP POLICY IF EXISTS "creators read own invites" ON public.teacher_invites;
CREATE POLICY "creators read own invites" ON public.teacher_invites
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = created_by);

-- إصدار رمز دعوة (للمعلمين فقط)
CREATE OR REPLACE FUNCTION public.create_teacher_invite(_note text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
  new_code text;
  attempt integer;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول.';
  END IF;
  IF NOT public.has_role(caller, 'teacher') THEN
    RAISE EXCEPTION 'إصدار دعوات المعلمين متاح للمعلمين فقط.';
  END IF;

  -- رمز من 10 محارف سُدسية عشرية كبيرة، مصدره gen_random_uuid()
  -- (مولّد مضمّن في PostgreSQL). لا يُستخدم gen_random_bytes لأنه من امتداد
  -- pgcrypto الذي يوجد في مخطط extensions على Supabase، وهذه الدالة تعمل
  -- بـ search_path = public فلن تجده.
  FOR attempt IN 1..5 LOOP
    new_code := upper(left(replace(gen_random_uuid()::text, '-', ''), 10));
    BEGIN
      INSERT INTO public.teacher_invites (code, note, created_by)
      VALUES (new_code, NULLIF(btrim(COALESCE(_note, '')), ''), caller);
      RETURN new_code;
    EXCEPTION WHEN unique_violation THEN
      -- تصادم رمز (احتمال ضعيف جداً): أعد التوليد.
      NULL;
    END;
  END LOOP;

  RAISE EXCEPTION 'تعذّر توليد رمز دعوة فريد، حاول مرة أخرى.';
END;
$$;
REVOKE ALL ON FUNCTION public.create_teacher_invite(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_teacher_invite(text) TO authenticated;

-- استخدام رمز دعوة لمنح دور المعلم لصاحب الجلسة
CREATE OR REPLACE FUNCTION public.redeem_teacher_invite(_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
  invite public.teacher_invites;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول.';
  END IF;

  SELECT * INTO invite
  FROM public.teacher_invites
  WHERE code = upper(btrim(_code))
  FOR UPDATE;

  IF invite.id IS NULL THEN
    RAISE EXCEPTION 'رمز الدعوة غير صحيح.';
  END IF;
  IF invite.used_by IS NOT NULL THEN
    RAISE EXCEPTION 'رمز الدعوة مستخدم مسبقاً.';
  END IF;
  IF invite.expires_at < now() THEN
    RAISE EXCEPTION 'انتهت صلاحية رمز الدعوة.';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (caller, 'teacher')
  ON CONFLICT (user_id, role) DO NOTHING;

  UPDATE public.teacher_invites
     SET used_by = caller, used_at = now()
   WHERE id = invite.id;

  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.redeem_teacher_invite(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_teacher_invite(text) TO authenticated;

-- ملاحظة تشغيلية: لمنح أول معلّم في مشروع جديد (لا يوجد معلّم يُصدر دعوة)، نفّذ مرة
-- واحدة من محرر SQL في Supabase:
--   INSERT INTO public.user_roles (user_id, role)
--   VALUES ('<UUID المستخدم>', 'teacher') ON CONFLICT DO NOTHING;
