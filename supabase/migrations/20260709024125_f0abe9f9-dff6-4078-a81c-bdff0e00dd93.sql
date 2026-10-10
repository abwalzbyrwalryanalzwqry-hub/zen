
CREATE TABLE public.progress (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  surah_name TEXT NOT NULL,
  from_ayah INT NOT NULL,
  to_ayah INT NOT NULL,
  memorization_type TEXT NOT NULL DEFAULT 'new' CHECK (memorization_type IN ('new','revision')),
  rating INT CHECK (rating BETWEEN 1 AND 5),
  feedback TEXT,
  notes TEXT,
  reviewed_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.progress TO authenticated;
GRANT ALL ON public.progress TO service_role;

ALTER TABLE public.progress ENABLE ROW LEVEL SECURITY;

-- Helper: is the caller a teacher?
CREATE OR REPLACE FUNCTION public.is_teacher(_uid UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _uid AND role = 'teacher')
$$;

-- Students see their own; teachers see everyone's
CREATE POLICY "read own or teacher reads all" ON public.progress
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_teacher(auth.uid()));

-- Students insert their own entries
CREATE POLICY "insert own progress" ON public.progress
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Owner can update their own entry (notes etc). Teachers can update any (rating/feedback).
CREATE POLICY "update own or teacher updates all" ON public.progress
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.is_teacher(auth.uid()))
  WITH CHECK (auth.uid() = user_id OR public.is_teacher(auth.uid()));

CREATE POLICY "delete own progress" ON public.progress
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.progress_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER progress_updated_at
BEFORE UPDATE ON public.progress
FOR EACH ROW EXECUTE FUNCTION public.progress_touch_updated_at();

CREATE INDEX progress_user_created_idx ON public.progress(user_id, created_at DESC);
