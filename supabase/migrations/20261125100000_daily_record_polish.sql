-- ════════════════════════════════════════════════════════════════════════════
-- السجل اليومي — المرحلة 5 من خطة التطوير: الأداء (docs/DAILY_RECORD.md، DR-25)
-- ════════════════════════════════════════════════════════════════════════════
-- daily_student_row يقرأ لكل طالب «آخر حفظ» و«آخر مراجعة» مرتبة بالتاريخ ثم وقت الإنشاء. بلا فهرس مطابق
-- يمسح كل تسميعات الطالب مرتين لكل سطر في الورقة. الفهرس الجزئي (المعتمد فقط) يجعلها قراءة واحدة من رأس الفهرس.
-- إضافة فقط. التراجع: DROP INDEX public.recitation_sessions_student_kind_recent_idx. الفحص: checks.sql (138).

CREATE INDEX IF NOT EXISTS recitation_sessions_student_kind_recent_idx
  ON public.recitation_sessions (student_id, kind, session_date DESC, created_at DESC)
  WHERE status = 'approved';
