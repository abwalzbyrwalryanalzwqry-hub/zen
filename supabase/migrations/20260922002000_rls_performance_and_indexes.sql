-- ════════════════════════════════════════════════════════════════════
-- أداء طبقة الأمان والفهارس
--
-- المشكلة 1: كل سياسات RLS تستدعي auth.uid() و is_teacher(auth.uid())
-- مباشرة، فتُنفَّذ الدالة **لكل صف** يُفحص. في استعلام يعيد 300 صف حضور
-- تُستدعى is_teacher 300 مرة، وكل استدعاء منها استعلام على user_roles.
-- تغليف النداء بـ (SELECT ...) يجعل PostgreSQL يحسبه مرة واحدة كـ InitPlan.
--
-- المشكلة 2: الجداول التي تُقرأ بمفتاح أجنبي (student_id, chat_id, user_id…)
-- بلا فهارس، فكل قراءة مسح كامل للجدول.
-- ════════════════════════════════════════════════════════════════════

-- ─────────── profiles ───────────
DROP POLICY IF EXISTS "users update own profile" ON public.profiles;
CREATE POLICY "users update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "users insert own profile" ON public.profiles;
CREATE POLICY "users insert own profile" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = (SELECT auth.uid()));

-- ─────────── user_roles ───────────
DROP POLICY IF EXISTS "users read own roles" ON public.user_roles;
CREATE POLICY "users read own roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE INDEX IF NOT EXISTS user_roles_user_idx ON public.user_roles (user_id);

-- ─────────── chats / messages ───────────
DROP POLICY IF EXISTS "chat participants read" ON public.chats;
CREATE POLICY "chat participants read" ON public.chats
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = ANY(participants));

DROP POLICY IF EXISTS "chat participants insert" ON public.chats;
CREATE POLICY "chat participants insert" ON public.chats
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = ANY(participants));

DROP POLICY IF EXISTS "read messages in own chats" ON public.messages;
CREATE POLICY "read messages in own chats" ON public.messages
  FOR SELECT TO authenticated
  USING (public.is_chat_participant(chat_id, (SELECT auth.uid())));

DROP POLICY IF EXISTS "send messages to own chats" ON public.messages;
CREATE POLICY "send messages to own chats" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = (SELECT auth.uid())
    AND public.is_chat_participant(chat_id, (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "update own messages" ON public.messages;
CREATE POLICY "update own messages" ON public.messages
  FOR UPDATE TO authenticated
  USING (sender_id = (SELECT auth.uid()))
  WITH CHECK (sender_id = (SELECT auth.uid()));

CREATE INDEX IF NOT EXISTS messages_sender_idx ON public.messages (sender_id);
-- عدّاد غير المقروء يقرأ بالمحادثة والوقت ويستثني رسائل المستخدم نفسه
CREATE INDEX IF NOT EXISTS messages_chat_created_desc_idx
  ON public.messages (chat_id, created_at DESC);

-- ─────────── progress ───────────
DROP POLICY IF EXISTS "read own or teacher reads all" ON public.progress;
CREATE POLICY "read own or teacher reads all" ON public.progress
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR (SELECT public.is_teacher((SELECT auth.uid()))));

DROP POLICY IF EXISTS "insert own progress" ON public.progress;
CREATE POLICY "insert own progress" ON public.progress
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "update own or teacher updates all" ON public.progress;
CREATE POLICY "update own or teacher updates all" ON public.progress
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()) OR (SELECT public.is_teacher((SELECT auth.uid()))))
  WITH CHECK (user_id = (SELECT auth.uid()) OR (SELECT public.is_teacher((SELECT auth.uid()))));

DROP POLICY IF EXISTS "delete own progress" ON public.progress;
CREATE POLICY "delete own progress" ON public.progress
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- ─────────── assignments ───────────
DROP POLICY IF EXISTS "students read own assignments" ON public.assignments;
CREATE POLICY "students read own assignments" ON public.assignments
  FOR SELECT TO authenticated
  USING (student_id = (SELECT auth.uid()) OR (SELECT public.is_teacher((SELECT auth.uid()))));

DROP POLICY IF EXISTS "students update own assignments" ON public.assignments;
CREATE POLICY "students update own assignments" ON public.assignments
  FOR UPDATE TO authenticated
  USING (student_id = (SELECT auth.uid()) OR (SELECT public.is_teacher((SELECT auth.uid()))))
  WITH CHECK (student_id = (SELECT auth.uid()) OR (SELECT public.is_teacher((SELECT auth.uid()))));

DROP POLICY IF EXISTS "teachers insert assignments" ON public.assignments;
CREATE POLICY "teachers insert assignments" ON public.assignments
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_teacher((SELECT auth.uid()))));

DROP POLICY IF EXISTS "teachers delete assignments" ON public.assignments;
CREATE POLICY "teachers delete assignments" ON public.assignments
  FOR DELETE TO authenticated
  USING ((SELECT public.is_teacher((SELECT auth.uid()))));

CREATE INDEX IF NOT EXISTS assignments_student_status_idx
  ON public.assignments (student_id, status, due_date);
CREATE INDEX IF NOT EXISTS assignments_halaqa_idx
  ON public.assignments (halaqa_id, created_at DESC);

-- ─────────── recitation_sessions ───────────
DROP POLICY IF EXISTS "read own or teacher" ON public.recitation_sessions;
CREATE POLICY "read own or teacher" ON public.recitation_sessions
  FOR SELECT TO authenticated
  USING (student_id = (SELECT auth.uid()) OR (SELECT public.is_teacher((SELECT auth.uid()))));

DROP POLICY IF EXISTS "students insert own recitations" ON public.recitation_sessions;
CREATE POLICY "students insert own recitations" ON public.recitation_sessions
  FOR INSERT TO authenticated
  WITH CHECK (student_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "update own or teacher" ON public.recitation_sessions;
CREATE POLICY "update own or teacher" ON public.recitation_sessions
  FOR UPDATE TO authenticated
  USING (student_id = (SELECT auth.uid()) OR (SELECT public.is_teacher((SELECT auth.uid()))))
  WITH CHECK (student_id = (SELECT auth.uid()) OR (SELECT public.is_teacher((SELECT auth.uid()))));

DROP POLICY IF EXISTS "delete own or teacher" ON public.recitation_sessions;
CREATE POLICY "delete own or teacher" ON public.recitation_sessions
  FOR DELETE TO authenticated
  USING (student_id = (SELECT auth.uid()) OR (SELECT public.is_teacher((SELECT auth.uid()))));

CREATE INDEX IF NOT EXISTS recitation_sessions_student_created_idx
  ON public.recitation_sessions (student_id, created_at DESC);
-- شاشة «بانتظار التقييم» تقرأ بالحالة: فهرس جزئي أصغر وأسرع
CREATE INDEX IF NOT EXISTS recitation_sessions_awaiting_idx
  ON public.recitation_sessions (created_at DESC)
  WHERE status = 'awaiting_teacher';

-- ─────────── recitation_assessments ───────────
DROP POLICY IF EXISTS "read own or teacher" ON public.recitation_assessments;
CREATE POLICY "read own or teacher" ON public.recitation_assessments
  FOR SELECT TO authenticated
  USING (student_id = (SELECT auth.uid()) OR (SELECT public.is_teacher((SELECT auth.uid()))));

DROP POLICY IF EXISTS "teachers write assessments" ON public.recitation_assessments;
CREATE POLICY "teachers write assessments" ON public.recitation_assessments
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_teacher((SELECT auth.uid()))));

DROP POLICY IF EXISTS "teachers update assessments" ON public.recitation_assessments;
CREATE POLICY "teachers update assessments" ON public.recitation_assessments
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_teacher((SELECT auth.uid()))))
  WITH CHECK ((SELECT public.is_teacher((SELECT auth.uid()))));

DROP POLICY IF EXISTS "teachers delete assessments" ON public.recitation_assessments;
CREATE POLICY "teachers delete assessments" ON public.recitation_assessments
  FOR DELETE TO authenticated
  USING ((SELECT public.is_teacher((SELECT auth.uid()))));

CREATE INDEX IF NOT EXISTS assessments_student_created_idx
  ON public.recitation_assessments (student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS assessments_session_idx
  ON public.recitation_assessments (session_id);

-- ─────────── attendance ───────────
DROP POLICY IF EXISTS "read own or teacher" ON public.attendance;
CREATE POLICY "read own or teacher" ON public.attendance
  FOR SELECT TO authenticated
  USING (student_id = (SELECT auth.uid()) OR (SELECT public.is_teacher((SELECT auth.uid()))));

DROP POLICY IF EXISTS "teachers insert attendance" ON public.attendance;
CREATE POLICY "teachers insert attendance" ON public.attendance
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_teacher((SELECT auth.uid()))));

DROP POLICY IF EXISTS "teachers update attendance" ON public.attendance;
CREATE POLICY "teachers update attendance" ON public.attendance
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_teacher((SELECT auth.uid()))))
  WITH CHECK ((SELECT public.is_teacher((SELECT auth.uid()))));

DROP POLICY IF EXISTS "teachers delete attendance" ON public.attendance;
CREATE POLICY "teachers delete attendance" ON public.attendance
  FOR DELETE TO authenticated
  USING ((SELECT public.is_teacher((SELECT auth.uid()))));

-- ─────────── notifications ───────────
DROP POLICY IF EXISTS "read own notifications" ON public.notifications;
CREATE POLICY "read own notifications" ON public.notifications
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "authenticated insert notifications" ON public.notifications;
CREATE POLICY "authenticated insert notifications" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) OR (SELECT public.is_teacher((SELECT auth.uid()))));

DROP POLICY IF EXISTS "update own notifications" ON public.notifications;
CREATE POLICY "update own notifications" ON public.notifications
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "delete own notifications" ON public.notifications;
CREATE POLICY "delete own notifications" ON public.notifications
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- شارة الإشعارات تقرأ غير المقروء فقط: فهرس جزئي
CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
  ON public.notifications (user_id, created_at DESC)
  WHERE read = false;
CREATE INDEX IF NOT EXISTS notifications_user_created_idx
  ON public.notifications (user_id, created_at DESC);

-- ─────────── centers / halaqat / halaqa_students ───────────
DROP POLICY IF EXISTS "teachers insert centers" ON public.centers;
CREATE POLICY "teachers insert centers" ON public.centers
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_teacher((SELECT auth.uid()))));

DROP POLICY IF EXISTS "teachers update centers" ON public.centers;
CREATE POLICY "teachers update centers" ON public.centers
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_teacher((SELECT auth.uid()))))
  WITH CHECK ((SELECT public.is_teacher((SELECT auth.uid()))));

DROP POLICY IF EXISTS "teachers delete centers" ON public.centers;
CREATE POLICY "teachers delete centers" ON public.centers
  FOR DELETE TO authenticated
  USING ((SELECT public.is_teacher((SELECT auth.uid()))));

DROP POLICY IF EXISTS "teachers insert halaqat" ON public.halaqat;
CREATE POLICY "teachers insert halaqat" ON public.halaqat
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_teacher((SELECT auth.uid()))));

DROP POLICY IF EXISTS "teachers update halaqat" ON public.halaqat;
CREATE POLICY "teachers update halaqat" ON public.halaqat
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_teacher((SELECT auth.uid()))))
  WITH CHECK ((SELECT public.is_teacher((SELECT auth.uid()))));

DROP POLICY IF EXISTS "teachers delete halaqat" ON public.halaqat;
CREATE POLICY "teachers delete halaqat" ON public.halaqat
  FOR DELETE TO authenticated
  USING ((SELECT public.is_teacher((SELECT auth.uid()))));

DROP POLICY IF EXISTS "read halaqa members" ON public.halaqa_students;
CREATE POLICY "read halaqa members" ON public.halaqa_students
  FOR SELECT TO authenticated
  USING (student_id = (SELECT auth.uid()) OR (SELECT public.is_teacher((SELECT auth.uid()))));

DROP POLICY IF EXISTS "teachers add members" ON public.halaqa_students;
CREATE POLICY "teachers add members" ON public.halaqa_students
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_teacher((SELECT auth.uid()))));

DROP POLICY IF EXISTS "teachers remove members" ON public.halaqa_students;
CREATE POLICY "teachers remove members" ON public.halaqa_students
  FOR DELETE TO authenticated
  USING ((SELECT public.is_teacher((SELECT auth.uid()))));

CREATE INDEX IF NOT EXISTS halaqa_students_student_idx ON public.halaqa_students (student_id);
CREATE INDEX IF NOT EXISTS halaqa_students_halaqa_idx ON public.halaqa_students (halaqa_id);
CREATE INDEX IF NOT EXISTS halaqat_center_idx ON public.halaqat (center_id);
CREATE INDEX IF NOT EXISTS halaqat_teacher_idx ON public.halaqat (teacher_id);

-- ─────────── mushaf_records ───────────
DROP POLICY IF EXISTS "read own or teacher reads all mushaf" ON public.mushaf_records;
CREATE POLICY "read own or teacher reads all mushaf" ON public.mushaf_records
  FOR SELECT TO authenticated
  USING (student_id = (SELECT auth.uid()) OR (SELECT public.is_teacher((SELECT auth.uid()))));

DROP POLICY IF EXISTS "teachers insert mushaf" ON public.mushaf_records;
CREATE POLICY "teachers insert mushaf" ON public.mushaf_records
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_teacher((SELECT auth.uid())))
    AND teacher_id = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS "teachers update mushaf" ON public.mushaf_records;
CREATE POLICY "teachers update mushaf" ON public.mushaf_records
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_teacher((SELECT auth.uid()))))
  WITH CHECK ((SELECT public.is_teacher((SELECT auth.uid()))));

DROP POLICY IF EXISTS "teachers delete mushaf" ON public.mushaf_records;
CREATE POLICY "teachers delete mushaf" ON public.mushaf_records
  FOR DELETE TO authenticated
  USING ((SELECT public.is_teacher((SELECT auth.uid()))));

-- ─────────── تحديث الإحصاءات بعد إضافة الفهارس ───────────
ANALYZE public.messages;
ANALYZE public.attendance;
ANALYZE public.assignments;
ANALYZE public.recitation_sessions;
ANALYZE public.notifications;
