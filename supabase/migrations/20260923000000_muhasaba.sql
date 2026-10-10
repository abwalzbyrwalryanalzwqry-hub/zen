-- ════════════════════════════════════════════════════════════════════
-- «محاسبتي»: المحاسبة اليومية الشخصية
--
-- بيانات خاصة تماماً بصاحبها: لا يقرؤها معلّم ولا طالب آخر، ولا تدخل في أي
-- تقرير أو مقارنة. لذلك كل السياسات «المالك فقط» ولا يوجد استثناء للمعلّم.
--
-- ما لا يُخزَّن هنا عمداً (يُقرأ من مصادره القائمة حتى لا تتكرر البيانات):
--   الحفظ الجديد والمراجعة → progress · mushaf_records · review_cards · exam_results
--   التسميع               → recitation_sessions
--
-- الجداول:
--   muhasaba_settings    إعدادات المستخدم (البدء، ما يتابعه، التذكير)
--   muhasaba_habits      «طاعاتي»: عادات يختارها المستخدم وجدولها وترتيبها
--   muhasaba_days        صف واحد لكل (مستخدم، يوم): الصلوات والعادات والحال والعهد
--   muhasaba_week_goals  هدف الأسبوع القادم من «مراجعة الأسبوع»
-- ════════════════════════════════════════════════════════════════════

-- ─────────── الإعدادات ───────────
CREATE TABLE IF NOT EXISTS public.muhasaba_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  onboarded_at timestamptz,
  track_prayers boolean NOT NULL DEFAULT true,
  track_quran boolean NOT NULL DEFAULT true,
  reminder_enabled boolean NOT NULL DEFAULT false,
  reminder_time time NOT NULL DEFAULT '21:30',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ─────────── العادات ───────────
CREATE TABLE IF NOT EXISTS public.muhasaba_habits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  -- مفتاح العادة الجاهزة (azkar_morning …) أو NULL للعادة المكتوبة يدوياً.
  preset_key text,
  -- أيام الأسبوع (0 = الأحد … 6 = السبت)؛ NULL = كل يوم.
  days smallint[],
  position integer NOT NULL DEFAULT 0,
  paused boolean NOT NULL DEFAULT false,
  -- الحذف ناعم: تبقى العادة في السجل القديم ولا تظهر في الأيام القادمة.
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT muhasaba_habit_title_len CHECK (char_length(btrim(title)) BETWEEN 1 AND 40),
  CONSTRAINT muhasaba_habit_days_valid CHECK (
    days IS NULL
    OR (cardinality(days) BETWEEN 1 AND 7 AND days <@ ARRAY[0, 1, 2, 3, 4, 5, 6]::smallint[])
  )
);

CREATE INDEX IF NOT EXISTS muhasaba_habits_user_idx
  ON public.muhasaba_habits (user_id, position);

-- عادة جاهزة واحدة فقط لكل مستخدم (يمنع تكرارها عند إعادة البدء أو من جهازين).
CREATE UNIQUE INDEX IF NOT EXISTS muhasaba_habits_preset_unique
  ON public.muhasaba_habits (user_id, preset_key)
  WHERE preset_key IS NOT NULL;

-- ─────────── اليوم ───────────
CREATE TABLE IF NOT EXISTS public.muhasaba_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day date NOT NULL,
  -- {"fajr":"on_time","dhuhr":"late",…} — غياب المفتاح = لم يُسجَّل (لا يعني فاتتني).
  prayers jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- العادات التي أنجزها في هذا اليوم.
  habits_done uuid[] NOT NULL DEFAULT '{}',
  -- ما سجّله الطالب بنفسه في القرآن مما لا يسجّله التطبيق (ورد التلاوة، حفظ خارج التطبيق).
  quran_self jsonb NOT NULL DEFAULT '{}'::jsonb,
  mood text,
  focus text[] NOT NULL DEFAULT '{}',
  -- ملاحظة خاصة اختيارية.
  note text,
  -- عهد الغد: يُكتب في هذا اليوم لليوم التالي.
  goal_key text,
  goal_text text,
  goal_result text,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT muhasaba_day_unique UNIQUE (user_id, day),
  CONSTRAINT muhasaba_prayers_object CHECK (jsonb_typeof(prayers) = 'object'),
  CONSTRAINT muhasaba_prayers_keys CHECK (
    prayers - ARRAY['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'] = '{}'::jsonb
  ),
  CONSTRAINT muhasaba_quran_self_object CHECK (jsonb_typeof(quran_self) = 'object'),
  CONSTRAINT muhasaba_mood_valid CHECK (
    mood IS NULL OR mood IN ('calm', 'good', 'tired', 'lacking', 'distant')
  ),
  CONSTRAINT muhasaba_focus_len CHECK (cardinality(focus) <= 12),
  CONSTRAINT muhasaba_note_len CHECK (note IS NULL OR char_length(note) <= 500),
  CONSTRAINT muhasaba_goal_len CHECK (goal_text IS NULL OR char_length(btrim(goal_text)) BETWEEN 1 AND 120),
  CONSTRAINT muhasaba_goal_result_valid CHECK (
    goal_result IS NULL OR goal_result IN ('kept', 'partial', 'not_yet')
  ),
  -- لا تقييم لعهد غير موجود.
  CONSTRAINT muhasaba_goal_result_needs_goal CHECK (goal_result IS NULL OR goal_text IS NOT NULL)
);

-- قيم حالات الصلاة: تُفحص بمُشغّل لأن CHECK لا يستطيع المرور على قيم jsonb.
CREATE OR REPLACE FUNCTION public.muhasaba_days_validate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v text;
BEGIN
  FOR v IN SELECT value FROM jsonb_each_text(NEW.prayers) LOOP
    IF v NOT IN ('on_time', 'late', 'missed') THEN
      RAISE EXCEPTION 'INVALID_PRAYER_STATUS';
    END IF;
  END LOOP;
  -- لا محاسبة ليوم لم يأتِ بعد (يُسمح بيوم واحد لفروق المناطق الزمنية).
  IF NEW.day > (now()::date + 1) THEN
    RAISE EXCEPTION 'FUTURE_DAY';
  END IF;
  NEW.note := NULLIF(btrim(NEW.note), '');
  NEW.goal_text := NULLIF(btrim(NEW.goal_text), '');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS muhasaba_days_validate ON public.muhasaba_days;
CREATE TRIGGER muhasaba_days_validate
  BEFORE INSERT OR UPDATE ON public.muhasaba_days
  FOR EACH ROW EXECUTE FUNCTION public.muhasaba_days_validate();

-- ─────────── هدف الأسبوع ───────────
CREATE TABLE IF NOT EXISTS public.muhasaba_week_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- أول يوم (السبت) من الأسبوع الذي يخصّه الهدف.
  week_start date NOT NULL,
  goal_key text,
  goal_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT muhasaba_week_unique UNIQUE (user_id, week_start),
  CONSTRAINT muhasaba_week_goal_len CHECK (char_length(btrim(goal_text)) BETWEEN 1 AND 120)
);

-- ─────────── updated_at ───────────
DROP TRIGGER IF EXISTS muhasaba_settings_touch ON public.muhasaba_settings;
CREATE TRIGGER muhasaba_settings_touch BEFORE UPDATE ON public.muhasaba_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS muhasaba_habits_touch ON public.muhasaba_habits;
CREATE TRIGGER muhasaba_habits_touch BEFORE UPDATE ON public.muhasaba_habits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS muhasaba_days_touch ON public.muhasaba_days;
CREATE TRIGGER muhasaba_days_touch BEFORE UPDATE ON public.muhasaba_days
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS muhasaba_week_goals_touch ON public.muhasaba_week_goals;
CREATE TRIGGER muhasaba_week_goals_touch BEFORE UPDATE ON public.muhasaba_week_goals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─────────── الصلاحيات: المالك فقط ───────────
ALTER TABLE public.muhasaba_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.muhasaba_habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.muhasaba_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.muhasaba_week_goals ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.muhasaba_settings, public.muhasaba_habits,
  public.muhasaba_days, public.muhasaba_week_goals FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.muhasaba_settings, public.muhasaba_habits,
  public.muhasaba_days, public.muhasaba_week_goals TO authenticated;
GRANT ALL ON public.muhasaba_settings, public.muhasaba_habits,
  public.muhasaba_days, public.muhasaba_week_goals TO service_role;

DROP POLICY IF EXISTS "owner only" ON public.muhasaba_settings;
CREATE POLICY "owner only" ON public.muhasaba_settings
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "owner only" ON public.muhasaba_habits;
CREATE POLICY "owner only" ON public.muhasaba_habits
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "owner only" ON public.muhasaba_days;
CREATE POLICY "owner only" ON public.muhasaba_days
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "owner only" ON public.muhasaba_week_goals;
CREATE POLICY "owner only" ON public.muhasaba_week_goals
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- ─────────── مساعد محاسبتي: حصة مستقلة ───────────
ALTER TABLE public.ai_usage_events DROP CONSTRAINT IF EXISTS ai_usage_events_feature_check;
ALTER TABLE public.ai_usage_events
  ADD CONSTRAINT ai_usage_events_feature_check
  CHECK (feature IN ('chat', 'summarize', 'learn', 'feedback', 'transcribe', 'coach', 'muhasaba'));

COMMENT ON TABLE public.muhasaba_days IS
  'محاسبتي: صف واحد لكل مستخدم ويوم. خاص بصاحبه فقط؛ لا يطّلع عليه المعلّم.';
