-- ════════════════════════════════════════════════════════════════════════════
-- المرحلة 12.3 — مساعد المعلّم (مسودّات)
-- ════════════════════════════════════════════════════════════════════════════
-- «zen-tools» يضيف draft_week_plan وdraft_guardian_note: مسودّتان يحرّرهما المعلّم في واجهته، ولا
-- يُرسل شيء ولا يُنشأ واجب دون اعتماده. تتحقّقان من أن المستدعي معلّم الطالب بـ teacher_student_week
-- (بجلسته) كملخّص الأسبوع. هنا فقط حصة مستقلة لهما: الميزة teacher_draft (40 يومياً).
ALTER TABLE public.ai_usage_events DROP CONSTRAINT IF EXISTS ai_usage_events_feature_check;
ALTER TABLE public.ai_usage_events
  ADD CONSTRAINT ai_usage_events_feature_check
  CHECK (feature IN ('chat', 'summarize', 'learn', 'feedback', 'transcribe', 'coach', 'muhasaba',
                     'teacher_summary', 'plan', 'live_recite', 'teacher_draft'));
