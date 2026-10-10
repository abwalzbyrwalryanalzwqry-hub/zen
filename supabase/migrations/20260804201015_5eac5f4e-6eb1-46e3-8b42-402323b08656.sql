-- Roles must live outside the user-editable profiles table
CREATE TYPE public.app_role AS ENUM ('student', 'teacher');

CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- Backfill from existing profiles
INSERT INTO public.user_roles (user_id, role)
SELECT id, role::public.app_role FROM public.profiles
ON CONFLICT (user_id, role) DO NOTHING;

-- Role is assigned once, at profile creation; later profile edits cannot escalate it
CREATE OR REPLACE FUNCTION public.sync_role_on_profile_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, NEW.role::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS profiles_role_to_user_roles ON public.profiles;
CREATE TRIGGER profiles_role_to_user_roles
AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.sync_role_on_profile_insert();

-- Teacher check now reads the secure roles table
CREATE OR REPLACE FUNCTION public.is_teacher(_uid UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.has_role(_uid, 'teacher')
$$;