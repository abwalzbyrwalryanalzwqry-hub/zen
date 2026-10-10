-- ════════════════════════════════════════════════════════════════════════════
-- المرحلة 7.3 — سياسات وفهارس (ملاحظات مستشار الأداء)
-- ════════════════════════════════════════════════════════════════════════════
-- 1) `auth.uid()` داخل (select …) في ست سياسات: يُحسب مرة للاستعلام (InitPlan) بدل مرة لكل صف.
--    الشرط نفسه حرفياً، فلا تغيير في من يرى ماذا.
-- 2) stories: سياسة قراءة واحدة بدل اثنتين متداخلتين؛ «teachers manage stories» (FOR ALL) صارت
--    كتابة فقط (INSERT/UPDATE/DELETE)، والقراءة للجميع كما كانت.
-- 3) فهارس للمفاتيح الأجنبية المستعملة في الربط والحذف المتسلسل (من قائمة المستشار الـ42)، دون أعمدة
--    التدقيق (added_by وcreated_by وused_by وdecided_by وresolved_by وpassword_set_by وactor_id…).
-- يحرس ذلك الفحص 95.

-- ─── 1) السياسات الست ───
DROP POLICY IF EXISTS "own story progress" ON public.story_progress;
CREATE POLICY "own story progress" ON public.story_progress FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id OR public.is_teacher((select auth.uid())))
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "plan read student teacher guardian" ON public.memorization_plans;
CREATE POLICY "plan read student teacher guardian" ON public.memorization_plans
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = student_id
         OR public.teaches_student((select auth.uid()), student_id)
         OR public.is_guardian_of((select auth.uid()), student_id));

DROP POLICY IF EXISTS "ai conv own read" ON public.ai_conversations;
CREATE POLICY "ai conv own read" ON public.ai_conversations
  FOR SELECT TO authenticated USING (user_id = (select auth.uid()));
DROP POLICY IF EXISTS "ai conv own delete" ON public.ai_conversations;
CREATE POLICY "ai conv own delete" ON public.ai_conversations
  FOR DELETE TO authenticated USING (user_id = (select auth.uid()));
DROP POLICY IF EXISTS "ai msg own read" ON public.ai_messages;
CREATE POLICY "ai msg own read" ON public.ai_messages
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.ai_conversations c
     WHERE c.id = conversation_id AND c.user_id = (select auth.uid())));

-- ─── 2) stories ───
DROP POLICY IF EXISTS "anyone reads stories" ON public.stories;
DROP POLICY IF EXISTS "teachers manage stories" ON public.stories;
CREATE POLICY "anyone reads stories" ON public.stories FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "teachers insert stories" ON public.stories FOR INSERT TO authenticated
  WITH CHECK (public.is_teacher((select auth.uid())));
CREATE POLICY "teachers update stories" ON public.stories FOR UPDATE TO authenticated
  USING (public.is_teacher((select auth.uid()))) WITH CHECK (public.is_teacher((select auth.uid())));
CREATE POLICY "teachers delete stories" ON public.stories FOR DELETE TO authenticated
  USING (public.is_teacher((select auth.uid())));

-- ─── 3) فهارس المفاتيح الأجنبية ───
CREATE INDEX IF NOT EXISTS challenge_logs_student_id_idx ON public.challenge_logs (student_id);
CREATE INDEX IF NOT EXISTS challenge_parts_claimed_by_idx ON public.challenge_parts (claimed_by);
CREATE INDEX IF NOT EXISTS chat_mutes_user_id_idx ON public.chat_mutes (user_id);
CREATE INDEX IF NOT EXISTS exam_errors_result_id_idx ON public.exam_errors (result_id);
CREATE INDEX IF NOT EXISTS exam_results_exam_id_idx ON public.exam_results (exam_id);
CREATE INDEX IF NOT EXISTS guardian_weekly_sent_student_id_idx ON public.guardian_weekly_sent (student_id);
CREATE INDEX IF NOT EXISTS memorization_plans_teacher_id_idx ON public.memorization_plans (teacher_id);
CREATE INDEX IF NOT EXISTS message_reactions_user_id_idx ON public.message_reactions (user_id);
CREATE INDEX IF NOT EXISTS message_reports_reporter_id_idx ON public.message_reports (reporter_id);
CREATE INDEX IF NOT EXISTS messages_reply_to_idx ON public.messages (reply_to);
CREATE INDEX IF NOT EXISTS mushaf_records_halaqa_id_idx ON public.mushaf_records (halaqa_id);
CREATE INDEX IF NOT EXISTS mushaf_records_teacher_id_idx ON public.mushaf_records (teacher_id);
CREATE INDEX IF NOT EXISTS push_outbox_notification_id_idx ON public.push_outbox (notification_id);
CREATE INDEX IF NOT EXISTS recitation_sessions_assignment_id_idx ON public.recitation_sessions (assignment_id);
CREATE INDEX IF NOT EXISTS recitation_sessions_halaqa_id_idx ON public.recitation_sessions (halaqa_id);
CREATE INDEX IF NOT EXISTS room_consents_student_id_idx ON public.room_consents (student_id);
CREATE INDEX IF NOT EXISTS room_mutes_user_id_idx ON public.room_mutes (user_id);
CREATE INDEX IF NOT EXISTS room_reads_user_id_idx ON public.room_reads (user_id);
CREATE INDEX IF NOT EXISTS room_reports_reporter_id_idx ON public.room_reports (reporter_id);
CREATE INDEX IF NOT EXISTS story_progress_story_id_idx ON public.story_progress (story_id);
