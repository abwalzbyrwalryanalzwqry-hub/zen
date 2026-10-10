-- ════════════════════════════════════════════════════════════════════════════
-- المرحلة 8.4 — حصة التسميع المباشر
-- ════════════════════════════════════════════════════════════════════════════
-- ميزة جديدة في ai_usage_events: live_recite (مقطع 5–8 ثوانٍ لكل طلب).
-- الحدود في recitation-core.ts (LIVE_LIMITS): 12 مقطعاً في الدقيقة و450 يومياً،
-- وتُفرض عبر consume_ai_quota القائمة، ويُستردّ المقطع عند فشل النموذج.
ALTER TABLE public.ai_usage_events DROP CONSTRAINT IF EXISTS ai_usage_events_feature_check;
ALTER TABLE public.ai_usage_events
  ADD CONSTRAINT ai_usage_events_feature_check
  CHECK (feature IN ('chat', 'summarize', 'learn', 'feedback', 'transcribe', 'coach', 'muhasaba',
                     'teacher_summary', 'plan', 'live_recite'));
