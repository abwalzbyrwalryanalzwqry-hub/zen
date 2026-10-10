CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ─────────── assignments ───────────
CREATE TABLE public.assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  teacher_id uuid,
  halaqa_id uuid REFERENCES public.halaqat(id) ON DELETE SET NULL,
  kind text NOT NULL DEFAULT 'memorize',
  surah_name text NOT NULL,
  from_ayah integer NOT NULL DEFAULT 1,
  to_ayah integer NOT NULL DEFAULT 1,
  instructions text,
  due_date date NOT NULL DEFAULT (now()::date),
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assignments TO authenticated;
GRANT ALL ON public.assignments TO service_role;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "students read own assignments" ON public.assignments FOR SELECT TO authenticated
  USING (auth.uid() = student_id OR public.is_teacher(auth.uid()));
CREATE POLICY "students update own assignments" ON public.assignments FOR UPDATE TO authenticated
  USING (auth.uid() = student_id OR public.is_teacher(auth.uid()))
  WITH CHECK (auth.uid() = student_id OR public.is_teacher(auth.uid()));
CREATE POLICY "teachers insert assignments" ON public.assignments FOR INSERT TO authenticated
  WITH CHECK (public.is_teacher(auth.uid()));
CREATE POLICY "teachers delete assignments" ON public.assignments FOR DELETE TO authenticated
  USING (public.is_teacher(auth.uid()));

-- ─────────── recitation_sessions ───────────
CREATE TABLE public.recitation_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  assignment_id uuid REFERENCES public.assignments(id) ON DELETE SET NULL,
  halaqa_id uuid REFERENCES public.halaqat(id) ON DELETE SET NULL,
  surah_name text NOT NULL,
  from_ayah integer NOT NULL DEFAULT 1,
  to_ayah integer NOT NULL DEFAULT 1,
  kind text NOT NULL DEFAULT 'memorize',
  audio_path text,
  duration_seconds integer DEFAULT 0,
  status text NOT NULL DEFAULT 'awaiting_teacher',
  session_date date NOT NULL DEFAULT (now()::date),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recitation_sessions TO authenticated;
GRANT ALL ON public.recitation_sessions TO service_role;
ALTER TABLE public.recitation_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own or teacher" ON public.recitation_sessions FOR SELECT TO authenticated
  USING (auth.uid() = student_id OR public.is_teacher(auth.uid()));
CREATE POLICY "students insert own recitations" ON public.recitation_sessions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = student_id);
CREATE POLICY "update own or teacher" ON public.recitation_sessions FOR UPDATE TO authenticated
  USING (auth.uid() = student_id OR public.is_teacher(auth.uid()))
  WITH CHECK (auth.uid() = student_id OR public.is_teacher(auth.uid()));
CREATE POLICY "delete own or teacher" ON public.recitation_sessions FOR DELETE TO authenticated
  USING (auth.uid() = student_id OR public.is_teacher(auth.uid()));

-- ─────────── recitation_assessments ───────────
CREATE TABLE public.recitation_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.recitation_sessions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  teacher_id uuid,
  score integer,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  teacher_notes text,
  ai_summary text,
  ai_confidence numeric,
  next_review_date date,
  approved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recitation_assessments TO authenticated;
GRANT ALL ON public.recitation_assessments TO service_role;
ALTER TABLE public.recitation_assessments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own or teacher" ON public.recitation_assessments FOR SELECT TO authenticated
  USING (auth.uid() = student_id OR public.is_teacher(auth.uid()));
CREATE POLICY "teachers write assessments" ON public.recitation_assessments FOR INSERT TO authenticated
  WITH CHECK (public.is_teacher(auth.uid()));
CREATE POLICY "teachers update assessments" ON public.recitation_assessments FOR UPDATE TO authenticated
  USING (public.is_teacher(auth.uid())) WITH CHECK (public.is_teacher(auth.uid()));
CREATE POLICY "teachers delete assessments" ON public.recitation_assessments FOR DELETE TO authenticated
  USING (public.is_teacher(auth.uid()));

-- ─────────── attendance ───────────
CREATE TABLE public.attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  halaqa_id uuid REFERENCES public.halaqat(id) ON DELETE SET NULL,
  teacher_id uuid,
  session_date date NOT NULL DEFAULT (now()::date),
  status text NOT NULL DEFAULT 'present',
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX attendance_unique_day ON public.attendance (student_id, halaqa_id, session_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance TO authenticated;
GRANT ALL ON public.attendance TO service_role;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own or teacher" ON public.attendance FOR SELECT TO authenticated
  USING (auth.uid() = student_id OR public.is_teacher(auth.uid()));
CREATE POLICY "teachers insert attendance" ON public.attendance FOR INSERT TO authenticated
  WITH CHECK (public.is_teacher(auth.uid()));
CREATE POLICY "teachers update attendance" ON public.attendance FOR UPDATE TO authenticated
  USING (public.is_teacher(auth.uid())) WITH CHECK (public.is_teacher(auth.uid()));
CREATE POLICY "teachers delete attendance" ON public.attendance FOR DELETE TO authenticated
  USING (public.is_teacher(auth.uid()));

-- ─────────── notifications ───────────
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL DEFAULT 'general',
  title text NOT NULL,
  body text,
  link text,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own notifications" ON public.notifications FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "authenticated insert notifications" ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id OR public.is_teacher(auth.uid()));
CREATE POLICY "update own notifications" ON public.notifications FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete own notifications" ON public.notifications FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- ─────────── stories ───────────
CREATE TABLE public.stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prophet text NOT NULL,
  title text NOT NULL,
  intro text NOT NULL DEFAULT '',
  timeline jsonb NOT NULL DEFAULT '[]'::jsonb,
  ayat jsonb NOT NULL DEFAULT '[]'::jsonb,
  vocabulary jsonb NOT NULL DEFAULT '[]'::jsonb,
  quiz jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.stories TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stories TO authenticated;
GRANT ALL ON public.stories TO service_role;
ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone reads stories" ON public.stories FOR SELECT USING (true);
CREATE POLICY "teachers manage stories" ON public.stories FOR ALL TO authenticated
  USING (public.is_teacher(auth.uid())) WITH CHECK (public.is_teacher(auth.uid()));

-- ─────────── story_progress ───────────
CREATE TABLE public.story_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  story_id uuid NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  last_step integer NOT NULL DEFAULT 0,
  quiz_score integer,
  completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, story_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.story_progress TO authenticated;
GRANT ALL ON public.story_progress TO service_role;
ALTER TABLE public.story_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own story progress" ON public.story_progress FOR ALL TO authenticated
  USING (auth.uid() = user_id OR public.is_teacher(auth.uid()))
  WITH CHECK (auth.uid() = user_id);

-- ─────────── updated_at triggers ───────────
CREATE TRIGGER update_assignments_updated_at BEFORE UPDATE ON public.assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_recitation_sessions_updated_at BEFORE UPDATE ON public.recitation_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_recitation_assessments_updated_at BEFORE UPDATE ON public.recitation_assessments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_attendance_updated_at BEFORE UPDATE ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_stories_updated_at BEFORE UPDATE ON public.stories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_story_progress_updated_at BEFORE UPDATE ON public.story_progress
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─────────── seed stories ───────────
INSERT INTO public.stories (prophet, title, intro, timeline, ayat, vocabulary, quiz, sort_order) VALUES
('نوح عليه السلام', 'قصة نوح عليه السلام', 'أول رسول أُرسل إلى أهل الأرض، دعا قومه ألف سنة إلا خمسين عاماً.',
 '["دعا نوح عليه السلام قومه إلى عبادة الله وحده وترك الأصنام.","استمر في دعوتهم ليلاً ونهاراً سراً وجهراً، فلم يؤمن معه إلا قليل.","أمره الله ببناء السفينة، فسخر منه قومه.","جاء الطوفان فنجا المؤمنون وغرق المكذبون ومنهم ابنه.","استقرت السفينة على الجودي وبدأت الحياة من جديد."]'::jsonb,
 '[{"surah":"نوح","from":1,"to":28},{"surah":"هود","from":25,"to":49}]'::jsonb,
 '[{"word":"الفلك","meaning":"السفينة"},{"word":"الجودي","meaning":"جبل استقرت عليه السفينة"},{"word":"يُقلع","meaning":"يتوقف ويكفّ"}]'::jsonb,
 '[{"q":"كم لبث نوح عليه السلام يدعو قومه؟","options":["مئة عام","ألف سنة إلا خمسين عاماً","خمسون عاماً"],"answer":1},{"q":"أين استقرت السفينة؟","options":["على الجودي","على الطور","على حراء"],"answer":0}]'::jsonb, 1),
('إبراهيم عليه السلام', 'قصة إبراهيم عليه السلام', 'أبو الأنبياء وخليل الرحمن، الذي حطّم الأصنام وبنى الكعبة.',
 '["بحث إبراهيم عن ربه فتبرأ من عبادة الكواكب والأصنام.","حطّم أصنام قومه وترك كبيرهم ليحاجّهم.","ألقوه في النار فجعلها الله برداً وسلاماً.","هاجر وأسكن هاجر وإسماعيل عند البيت الحرام.","رأى في المنام ذبح ابنه ففداه الله بذبح عظيم، ثم رفع مع إسماعيل قواعد البيت."]'::jsonb,
 '[{"surah":"الأنبياء","from":51,"to":73},{"surah":"الصافات","from":99,"to":113}]'::jsonb,
 '[{"word":"حنيفاً","meaning":"مائلاً عن الشرك إلى التوحيد"},{"word":"جُذاذاً","meaning":"قِطَعاً متكسرة"},{"word":"القواعد","meaning":"أسس البناء"}]'::jsonb,
 '[{"q":"بماذا وصف الله إبراهيم عليه السلام؟","options":["كليم الله","خليل الله","روح الله"],"answer":1},{"q":"ماذا فعل الله بالنار؟","options":["أطفأها بالمطر","جعلها برداً وسلاماً","رفع إبراهيم قبل إلقائه"],"answer":1}]'::jsonb, 2),
('موسى عليه السلام', 'قصة موسى عليه السلام', 'كليم الله الذي أُرسل إلى فرعون وأنقذ بني إسرائيل.',
 '["وُلد في زمن يقتل فيه فرعون الأبناء، فألقته أمه في اليم.","نشأ في قصر فرعون ثم خرج إلى مدين وتزوج هناك.","كلّمه الله في الوادي المقدس وأرسله إلى فرعون بالآيات.","واجه السحرة فآمنوا برب العالمين.","انفلق البحر فنجا بنو إسرائيل وغرق فرعون وجنوده."]'::jsonb,
 '[{"surah":"طه","from":9,"to":98},{"surah":"القصص","from":1,"to":43}]'::jsonb,
 '[{"word":"اليمّ","meaning":"البحر أو النهر"},{"word":"طوى","meaning":"اسم الوادي المقدس"},{"word":"عصا","meaning":"آية موسى الكبرى"}]'::jsonb,
 '[{"q":"في أي وادٍ كلّم الله موسى؟","options":["وادي طوى","وادي القرى","وادي عبقر"],"answer":0},{"q":"ماذا حدث للسحرة؟","options":["هربوا","آمنوا برب العالمين","كذّبوا موسى"],"answer":1}]'::jsonb, 3),
('يوسف عليه السلام', 'قصة يوسف عليه السلام', 'أحسن القصص: من الجب إلى عرش مصر بالصبر والعفاف.',
 '["رأى يوسف رؤيا الأحد عشر كوكباً، فأوصاه أبوه بكتمانها.","ألقاه إخوته في الجب فالتقطته سيارة وبيع في مصر.","راودته امرأة العزيز فاستعصم ودخل السجن ظلماً.","فسّر رؤيا الملك فصار على خزائن الأرض.","جمع الله شمله بأبيه وإخوته وعفا عنهم."]'::jsonb,
 '[{"surah":"يوسف","from":1,"to":111}]'::jsonb,
 '[{"word":"الجُبّ","meaning":"البئر"},{"word":"سيّارة","meaning":"قافلة مسافرين"},{"word":"استعصم","meaning":"امتنع وتمسّك بالعفة"}]'::jsonb,
 '[{"q":"كم كوكباً رأى يوسف في رؤياه؟","options":["سبعة","أحد عشر","اثنا عشر"],"answer":1},{"q":"ماذا وُلّي يوسف في مصر؟","options":["قيادة الجيش","خزائن الأرض","القضاء"],"answer":1}]'::jsonb, 4),
('محمد ﷺ', 'سيرة النبي محمد ﷺ', 'خاتم الأنبياء والمرسلين، رحمة للعالمين.',
 '["وُلد ﷺ في مكة يتيماً ونشأ أميناً صادقاً.","نزل عليه الوحي في غار حراء بـ اقرأ.","دعا سراً ثم جهراً وصبر هو وأصحابه على الأذى.","هاجر إلى المدينة وأسّس أول مجتمع إسلامي.","فُتحت مكة وعمّ الإسلام، وودّع الناس في حجة الوداع."]'::jsonb,
 '[{"surah":"العلق","from":1,"to":5},{"surah":"الأحزاب","from":40,"to":40}]'::jsonb,
 '[{"word":"الوحي","meaning":"ما يُنزله الله على أنبيائه"},{"word":"الهجرة","meaning":"الانتقال من مكة إلى المدينة"},{"word":"الصادق الأمين","meaning":"لقبه ﷺ قبل البعثة"}]'::jsonb,
 '[{"q":"أين نزل الوحي أول مرة؟","options":["غار ثور","غار حراء","المسجد الحرام"],"answer":1},{"q":"ما أول ما نزل من القرآن؟","options":["يا أيها المدثر","اقرأ باسم ربك","الحمد لله رب العالمين"],"answer":1}]'::jsonb, 5);