CREATE TABLE public.centers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  city text,
  description text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.centers TO authenticated;
GRANT ALL ON public.centers TO service_role;
ALTER TABLE public.centers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "centers readable to authenticated" ON public.centers FOR SELECT TO authenticated USING (true);
CREATE POLICY "teachers insert centers" ON public.centers FOR INSERT TO authenticated WITH CHECK (public.is_teacher(auth.uid()));
CREATE POLICY "teachers update centers" ON public.centers FOR UPDATE TO authenticated USING (public.is_teacher(auth.uid())) WITH CHECK (public.is_teacher(auth.uid()));
CREATE POLICY "teachers delete centers" ON public.centers FOR DELETE TO authenticated USING (public.is_teacher(auth.uid()));

CREATE TABLE public.halaqat (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id uuid NOT NULL REFERENCES public.centers(id) ON DELETE CASCADE,
  name text NOT NULL,
  teacher_id uuid REFERENCES auth.users(id),
  schedule text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.halaqat TO authenticated;
GRANT ALL ON public.halaqat TO service_role;
ALTER TABLE public.halaqat ENABLE ROW LEVEL SECURITY;
CREATE POLICY "halaqat readable to authenticated" ON public.halaqat FOR SELECT TO authenticated USING (true);
CREATE POLICY "teachers insert halaqat" ON public.halaqat FOR INSERT TO authenticated WITH CHECK (public.is_teacher(auth.uid()));
CREATE POLICY "teachers update halaqat" ON public.halaqat FOR UPDATE TO authenticated USING (public.is_teacher(auth.uid())) WITH CHECK (public.is_teacher(auth.uid()));
CREATE POLICY "teachers delete halaqat" ON public.halaqat FOR DELETE TO authenticated USING (public.is_teacher(auth.uid()));

CREATE TABLE public.halaqa_students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  halaqa_id uuid NOT NULL REFERENCES public.halaqat(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (halaqa_id, student_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.halaqa_students TO authenticated;
GRANT ALL ON public.halaqa_students TO service_role;
ALTER TABLE public.halaqa_students ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read halaqa members" ON public.halaqa_students FOR SELECT TO authenticated USING (public.is_teacher(auth.uid()) OR student_id = auth.uid());
CREATE POLICY "teachers add members" ON public.halaqa_students FOR INSERT TO authenticated WITH CHECK (public.is_teacher(auth.uid()));
CREATE POLICY "teachers remove members" ON public.halaqa_students FOR DELETE TO authenticated USING (public.is_teacher(auth.uid()));

CREATE TABLE public.mushaf_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  teacher_id uuid REFERENCES auth.users(id),
  halaqa_id uuid REFERENCES public.halaqat(id) ON DELETE SET NULL,
  page integer NOT NULL,
  kind text NOT NULL DEFAULT 'memorize',
  session_date date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  rating integer,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mushaf_page_range CHECK (page BETWEEN 1 AND 604),
  CONSTRAINT mushaf_kind_valid CHECK (kind IN ('memorize','review','consolidate')),
  CONSTRAINT mushaf_rating_range CHECK (rating IS NULL OR rating BETWEEN 1 AND 5)
);
CREATE INDEX mushaf_records_student_date_idx ON public.mushaf_records (student_id, session_date DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mushaf_records TO authenticated;
GRANT ALL ON public.mushaf_records TO service_role;
ALTER TABLE public.mushaf_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own or teacher reads all mushaf" ON public.mushaf_records FOR SELECT TO authenticated USING (student_id = auth.uid() OR public.is_teacher(auth.uid()));
CREATE POLICY "teachers insert mushaf" ON public.mushaf_records FOR INSERT TO authenticated WITH CHECK (public.is_teacher(auth.uid()) AND teacher_id = auth.uid());
CREATE POLICY "teachers update mushaf" ON public.mushaf_records FOR UPDATE TO authenticated USING (public.is_teacher(auth.uid())) WITH CHECK (public.is_teacher(auth.uid()));
CREATE POLICY "teachers delete mushaf" ON public.mushaf_records FOR DELETE TO authenticated USING (public.is_teacher(auth.uid()));

CREATE TRIGGER centers_updated_at BEFORE UPDATE ON public.centers FOR EACH ROW EXECUTE FUNCTION public.progress_touch_updated_at();
CREATE TRIGGER halaqat_updated_at BEFORE UPDATE ON public.halaqat FOR EACH ROW EXECUTE FUNCTION public.progress_touch_updated_at();
CREATE TRIGGER mushaf_records_updated_at BEFORE UPDATE ON public.mushaf_records FOR EACH ROW EXECUTE FUNCTION public.progress_touch_updated_at();