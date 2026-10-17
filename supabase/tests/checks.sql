-- @@ 1. التسجيل: الدور دائماً student حتى لو طلب المستخدم teacher في بياناته
INSERT INTO auth.users (id, phone, raw_user_meta_data) VALUES
 ('11111111-1111-1111-1111-111111111111','+967711111111','{"name":"سالم","role":"teacher"}'),
 ('22222222-2222-2222-2222-222222222222','+967722222222','{"name":"بلال"}'),
 ('33333333-3333-3333-3333-333333333333','+967733333333','{"name":"الأستاذ يحيى"}');
SELECT p.name, p.role AS profile_role,
       (SELECT ur.role::text FROM public.user_roles ur WHERE ur.user_id = p.id) AS roles_table
FROM public.profiles p ORDER BY p.name;

-- @@ 2. رقم الهاتف انتقل إلى profile_contacts تلقائياً
SELECT (SELECT count(*) FROM public.profile_contacts) AS contacts,
       (SELECT count(*) FROM public.profile_contacts WHERE phone LIKE '+967%') AS yemeni;

-- @@ 3. الطالب لا يستطيع ترقية نفسه إلى معلم
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
DO $$
BEGIN
  UPDATE public.profiles SET role = 'teacher' WHERE id = '11111111-1111-1111-1111-111111111111';
EXCEPTION WHEN others THEN NULL;
END $$;
SELECT role AS role_after_attempt FROM public.profiles WHERE id = '11111111-1111-1111-1111-111111111111';
ROLLBACK;

-- @@ 4. الطالب لا يرى رقم هاتف طالب آخر
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
SELECT count(*) AS rows_visible_to_other_student FROM public.profile_contacts
 WHERE user_id = '11111111-1111-1111-1111-111111111111';
ROLLBACK;

-- @@ 5. يرى رقم نفسه فقط
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
SELECT count(*) AS own_rows FROM public.profile_contacts;
ROLLBACK;

-- @@ 6. منح أول معلّم يدوياً يزامن profiles.role
INSERT INTO public.user_roles (user_id, role) VALUES ('33333333-3333-3333-3333-333333333333','teacher')
ON CONFLICT DO NOTHING;
SELECT name, role FROM public.profiles WHERE id = '33333333-3333-3333-3333-333333333333';

-- @@ 7. طالب لا يستطيع إصدار رمز دعوة معلم
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
DO $$
DECLARE c text;
BEGIN
  c := public.create_teacher_invite('محاولة طالب');
  INSERT INTO public._check_log VALUES ('student_created_invite: ' || c);
EXCEPTION WHEN others THEN
  INSERT INTO public._check_log VALUES ('rejected: ' || SQLERRM);
END $$;
ROLLBACK;
SELECT 'see next block' AS note;

-- @@ 8. المعلّم يُصدر رمزاً، والطالب يفعّله فيصبح معلماً


DELETE FROM public._t;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '33333333-3333-3333-3333-333333333333';
INSERT INTO public._t SELECT public.create_teacher_invite('دعوة اختبار');
SET "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
SELECT public.redeem_teacher_invite((SELECT code FROM public._t)) AS redeemed;
RESET ROLE;
RESET "request.jwt.claim.sub";
SELECT name, role FROM public.profiles WHERE id = '11111111-1111-1111-1111-111111111111';

-- @@ 9. الرمز لا يُستخدم مرتين
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
DO $$
BEGIN
  PERFORM public.redeem_teacher_invite((SELECT code FROM public._t));
  INSERT INTO public._t VALUES ('REUSED!');
EXCEPTION WHEN others THEN
  INSERT INTO public._t VALUES ('rejected: ' || SQLERRM);
END $$;
RESET ROLE;
RESET "request.jwt.claim.sub";
SELECT code FROM public._t WHERE code LIKE 'rejected%' OR code = 'REUSED!';

-- @@ 10. الحضور: تسجيلان لنفس اليوم بحلقة NULL ⇒ صف واحد فقط
-- الأستاذ يحيى معلّم «حلقة الفجر» وفيها بلال؛ سالم معلّم بلا حلقات.
INSERT INTO public.centers (id, name, created_by)
VALUES ('cccc0000-0000-0000-0000-000000000001','مركز الاختبار','33333333-3333-3333-3333-333333333333');
INSERT INTO public.halaqat (id, center_id, name, teacher_id)
VALUES ('dddd0000-0000-0000-0000-000000000001','cccc0000-0000-0000-0000-000000000001',
        'حلقة الفجر','33333333-3333-3333-3333-333333333333');
INSERT INTO public.halaqa_students (halaqa_id, student_id)
VALUES ('dddd0000-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222');
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '33333333-3333-3333-3333-333333333333';
SELECT public.mark_attendance('22222222-2222-2222-2222-222222222222', NULL, current_date, 'present') IS NOT NULL AS first_call;
SELECT public.mark_attendance('22222222-2222-2222-2222-222222222222', NULL, current_date, 'absent', 'مرض') IS NOT NULL AS second_call;
RESET ROLE;
RESET "request.jwt.claim.sub";
SELECT count(*) AS attendance_rows, max(status) AS final_status FROM public.attendance;

-- @@ 11. الطالب لا يستطيع تسجيل حضور
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
DO $$
BEGIN
  PERFORM public.mark_attendance('22222222-2222-2222-2222-222222222222', NULL, current_date, 'present');
  INSERT INTO public._t VALUES ('STUDENT_MARKED_ATTENDANCE!');
EXCEPTION WHEN others THEN
  INSERT INTO public._t VALUES ('attendance rejected: ' || SQLERRM);
END $$;
RESET ROLE;
RESET "request.jwt.claim.sub";
SELECT code FROM public._t WHERE code LIKE 'attendance%' OR code LIKE 'STUDENT%';

-- @@ 12. الرسائل: عدّاد غير المقروء ثم تعليمها مقروءة
INSERT INTO public.chats (id, participants) VALUES
 ('aaaaaaaa-0000-0000-0000-000000000001', ARRAY['11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222']::uuid[]);
INSERT INTO public.messages (chat_id, sender_id, content) VALUES
 ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','السلام عليكم'),
 ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','هل سمّعت اليوم؟');
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
SELECT public.unread_total() AS unread_before;
SELECT public.mark_chat_seen('aaaaaaaa-0000-0000-0000-000000000001') AS marked;
SELECT public.unread_total() AS unread_after;
RESET ROLE;
RESET "request.jwt.claim.sub";
SELECT status, count(*) FROM public.messages GROUP BY status;

-- @@ 13. غير المشارك لا يستطيع تعليم المحادثة مقروءة
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '33333333-3333-3333-3333-333333333333';
DO $$
BEGIN
  PERFORM public.mark_chat_seen('aaaaaaaa-0000-0000-0000-000000000001');
  INSERT INTO public._t VALUES ('OUTSIDER_MARKED_SEEN!');
EXCEPTION WHEN others THEN
  INSERT INTO public._t VALUES ('outsider rejected: ' || SQLERRM);
END $$;
RESET ROLE;
RESET "request.jwt.claim.sub";
SELECT code FROM public._t WHERE code LIKE 'outsider%' OR code LIKE 'OUTSIDER%';

-- @@ 14. حصة الذكاء الاصطناعي: السماح ثم المنع عند تجاوز حد الدقيقة
SELECT (public.consume_ai_quota('22222222-2222-2222-2222-222222222222','chat',120,2))->>'allowed' AS call1,
       (public.consume_ai_quota('22222222-2222-2222-2222-222222222222','chat',120,2))->>'allowed' AS call2,
       (public.consume_ai_quota('22222222-2222-2222-2222-222222222222','chat',120,2))->>'allowed' AS call3_should_be_false;

-- @@ 15. الحصة تُحسب لكل ميزة على حدة
SELECT (public.consume_ai_quota('22222222-2222-2222-2222-222222222222','transcribe',40,8))->>'allowed' AS other_feature_allowed;

-- @@ 16. التخزين: الرفع في مجلد المستخدم نفسه مسموح، وفي مجلد غيره ممنوع
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
DO $$
BEGIN
  INSERT INTO storage.objects (bucket_id, name)
  VALUES ('recitations','22222222-2222-2222-2222-222222222222/own.webm');
  INSERT INTO public._t VALUES ('own upload: ok');
EXCEPTION WHEN others THEN
  INSERT INTO public._t VALUES ('own upload FAILED: ' || SQLERRM);
END $$;
DO $$
BEGIN
  INSERT INTO storage.objects (bucket_id, name)
  VALUES ('recitations','11111111-1111-1111-1111-111111111111/theirs.webm');
  INSERT INTO public._t VALUES ('other folder upload: ALLOWED!');
EXCEPTION WHEN others THEN
  INSERT INTO public._t VALUES ('other folder upload: rejected');
END $$;
RESET ROLE;
RESET "request.jwt.claim.sub";
SELECT code FROM public._t WHERE code LIKE '%upload%';

-- @@ 17. مرفقات المحادثة: المشارك يرفع، وغير المشارك لا
-- محادثة مشروعة (طالب ↔ معلّم حلقته): الرفع يتبع قاعدة الإرسال can_post_in_chat منذ المرحلة 0.
INSERT INTO public.chats (id, participants) VALUES
 ('aaaaaaaa-0000-0000-0000-000000000017', ARRAY['22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333']::uuid[]);
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
DO $$
BEGIN
  INSERT INTO storage.objects (bucket_id, name)
  VALUES ('chat-media','aaaaaaaa-0000-0000-0000-000000000017/22222222-2222-2222-2222-222222222222/v.webm');
  INSERT INTO public._t VALUES ('participant chat upload: ok');
EXCEPTION WHEN others THEN
  INSERT INTO public._t VALUES ('participant chat upload FAILED: ' || SQLERRM);
END $$;
SET "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
DO $$
BEGIN
  INSERT INTO storage.objects (bucket_id, name)
  VALUES ('chat-media','aaaaaaaa-0000-0000-0000-000000000017/11111111-1111-1111-1111-111111111111/x.webm');
  INSERT INTO public._t VALUES ('outsider chat upload: ALLOWED!');
EXCEPTION WHEN others THEN
  INSERT INTO public._t VALUES ('outsider chat upload: rejected');
END $$;
RESET ROLE;
RESET "request.jwt.claim.sub";
SELECT code FROM public._t WHERE code LIKE '%chat upload%';
DELETE FROM public.chats WHERE id = 'aaaaaaaa-0000-0000-0000-000000000017';

-- @@ 18. حد طول الرسالة وقيد المرفق
DO $$
BEGIN
  INSERT INTO public.messages (chat_id, sender_id, content, type)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','رسالة صوتية','voice');
  INSERT INTO public._t VALUES ('voice without media: ALLOWED!');
EXCEPTION WHEN others THEN
  INSERT INTO public._t VALUES ('voice without media: rejected');
END $$;
DO $$
BEGIN
  INSERT INTO public.messages (chat_id, sender_id, content)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111', repeat('ا', 5000));
  INSERT INTO public._t VALUES ('5000 chars: ALLOWED!');
EXCEPTION WHEN others THEN
  INSERT INTO public._t VALUES ('5000 chars: rejected');
END $$;
SELECT code FROM public._t WHERE code LIKE '%voice%' OR code LIKE '%chars%';

-- @@ 19. SM-2: أول مراجعة ناجحة ⇒ فاصل يوم، والثانية ⇒ ٤ أيام، والثالثة تتباعد
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
SELECT interval_days AS rep1 FROM public.apply_review('22222222-2222-2222-2222-222222222222','البقرة',1,5,95);
SELECT interval_days AS rep2 FROM public.apply_review('22222222-2222-2222-2222-222222222222','البقرة',1,5,95);
SELECT interval_days AS rep3, repetitions, ease
  FROM public.apply_review('22222222-2222-2222-2222-222222222222','البقرة',1,5,90);
RESET ROLE;
RESET "request.jwt.claim.sub";

-- @@ 20. SM-2: التعثّر يُصفّر المكرّرات ويعيد الفاصل إلى يوم ويزيد اللَّبس
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
SELECT interval_days AS after_lapse, repetitions
  FROM public.apply_review('22222222-2222-2222-2222-222222222222','البقرة',1,5,20);
RESET ROLE;
RESET "request.jwt.claim.sub";
SELECT lapses, repetitions, interval_days, ease >= 1.30 AS ease_floor_respected
  FROM public.review_cards WHERE surah_name = 'البقرة' AND from_ayah = 1;

-- @@ 21. SM-2: بطاقة واحدة فقط لكل مقطع، ومراجعات اليوم تُعيد المستحقة
SELECT count(*) AS cards FROM public.review_cards
 WHERE student_id = '22222222-2222-2222-2222-222222222222' AND surah_name = 'البقرة';
UPDATE public.review_cards SET due_date = now()::date - 1
 WHERE student_id = '22222222-2222-2222-2222-222222222222';
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
SELECT count(*) AS due_today FROM public.due_reviews(20);
RESET ROLE;
RESET "request.jwt.claim.sub";

-- @@ 22. لا أحد يُعدّل بطاقة مراجعة غيره، ولا يكتب في الجدول مباشرة
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '33333333-3333-3333-3333-333333333333';
DO $$
BEGIN
  PERFORM public.apply_review('22222222-2222-2222-2222-222222222222','الفاتحة',1,7,90);
  INSERT INTO public._t VALUES ('teacher review: ok');
EXCEPTION WHEN others THEN
  INSERT INTO public._t VALUES ('teacher review FAILED: ' || SQLERRM);
END $$;
SET "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
DO $$
BEGIN
  INSERT INTO public.review_cards (student_id, surah_name, from_ayah, to_ayah)
  VALUES ('22222222-2222-2222-2222-222222222222','مباشر',1,1);
  INSERT INTO public._t VALUES ('direct card insert: ALLOWED!');
EXCEPTION WHEN others THEN
  INSERT INTO public._t VALUES ('direct card insert: rejected');
END $$;
RESET ROLE;
RESET "request.jwt.claim.sub";
SELECT code FROM public._t WHERE code LIKE '%review%' OR code LIKE '%card insert%';

-- @@ 23. الاختبارات: الطالب يُنشئ اختباره ولا يُنشئ لغيره
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
DO $$
BEGIN
  INSERT INTO public.exams (id, student_id, title, scope_label, scope, blueprint, snapshot,
    question_count, difficulty, mode, seed, corpus_sha256, engine_version)
  VALUES ('eeee0000-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222',
    'اختبار الكهف','سورة الكهف · الآيات 1–20','{}'::jsonb,'{}'::jsonb,'{}'::jsonb,
    10,'medium','exam','seed1','abc','exam-engine/1.0.0');
  INSERT INTO public._t VALUES ('own exam insert: ok');
EXCEPTION WHEN others THEN
  INSERT INTO public._t VALUES ('own exam insert FAILED: ' || SQLERRM);
END $$;
DO $$
BEGIN
  INSERT INTO public.exams (student_id, title, scope_label, scope, blueprint, snapshot,
    question_count, difficulty, mode, seed, corpus_sha256, engine_version)
  VALUES ('33333333-3333-3333-3333-333333333333','اختبار لغيري','x','{}'::jsonb,'{}'::jsonb,'{}'::jsonb,
    10,'medium','exam','seed2','abc','exam-engine/1.0.0');
  INSERT INTO public._t VALUES ('exam for other: ALLOWED!');
EXCEPTION WHEN others THEN
  INSERT INTO public._t VALUES ('exam for other: rejected');
END $$;
RESET ROLE;
RESET "request.jwt.claim.sub";
SELECT code FROM public._t WHERE code LIKE '%exam%';

-- @@ 24. قيود الاختبار: عدد أسئلة ومستوى صعوبة ونسبة صحيحة فقط
DO $$
BEGIN
  INSERT INTO public.exams (student_id, title, scope_label, scope, blueprint, snapshot,
    question_count, difficulty, mode, seed, corpus_sha256, engine_version)
  VALUES ('22222222-2222-2222-2222-222222222222','عدد كبير','x','{}'::jsonb,'{}'::jsonb,'{}'::jsonb,
    99,'medium','exam','s','abc','v');
  INSERT INTO public._t VALUES ('99 questions: ALLOWED!');
EXCEPTION WHEN others THEN
  INSERT INTO public._t VALUES ('99 questions: rejected');
END $$;
DO $$
BEGIN
  INSERT INTO public.exams (student_id, title, scope_label, scope, blueprint, snapshot,
    question_count, difficulty, mode, seed, corpus_sha256, engine_version)
  VALUES ('22222222-2222-2222-2222-222222222222','مستوى وهمي','x','{}'::jsonb,'{}'::jsonb,'{}'::jsonb,
    10,'impossible','exam','s','abc','v');
  INSERT INTO public._t VALUES ('bad difficulty: ALLOWED!');
EXCEPTION WHEN others THEN
  INSERT INTO public._t VALUES ('bad difficulty: rejected');
END $$;
SELECT code FROM public._t WHERE code LIKE '%questions%' OR code LIKE '%difficulty%';

-- @@ 25. المحاولة المسلَّمة لا تُعدَّل بعد التسليم
INSERT INTO public.exam_attempts (id, exam_id, student_id, status)
VALUES ('aaaa0000-0000-0000-0000-000000000001','eeee0000-0000-0000-0000-000000000001',
        '22222222-2222-2222-2222-222222222222','submitted');
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
DO $$
DECLARE affected integer;
BEGIN
  UPDATE public.exam_attempts SET current_index = 99
   WHERE id = 'aaaa0000-0000-0000-0000-000000000001';
  GET DIAGNOSTICS affected = ROW_COUNT;
  INSERT INTO public._t VALUES ('submitted attempt update rows: ' || affected);
END $$;
RESET ROLE;
RESET "request.jwt.claim.sub";
SELECT code FROM public._t WHERE code LIKE '%submitted attempt%';

-- @@ 26. مواضع الخطأ تُرسَل إلى المراجعة المتباعدة مرة واحدة فقط
INSERT INTO public.exam_results (id, attempt_id, exam_id, student_id, score, possible, percentage, mastery)
VALUES ('fbcd0000-0000-0000-0000-000000000001','aaaa0000-0000-0000-0000-000000000001',
        'eeee0000-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222',
        6, 10, 60, 'needs_review');
INSERT INTO public.exam_errors (result_id, student_id, surah_number, surah_name, from_ayah, to_ayah, errors)
VALUES ('fbcd0000-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222',18,'الكهف',9,12,2),
       ('fbcd0000-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222',18,'الكهف',30,31,1);
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
SELECT public.send_exam_errors_to_review('fbcd0000-0000-0000-0000-000000000001') AS sent_first;
SELECT public.send_exam_errors_to_review('fbcd0000-0000-0000-0000-000000000001') AS sent_again;
RESET ROLE;
RESET "request.jwt.claim.sub";
SELECT surah_name, from_ayah, to_ayah, interval_days, last_score
  FROM public.review_cards WHERE surah_name = 'الكهف' ORDER BY from_ayah;

-- @@ 27. اختبار غيرك: لا تُرسل أخطاءه إلى مراجعتك ولا تقرأ نتائجه
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '44444444-4444-4444-4444-444444444444';
DO $$
BEGIN
  PERFORM public.send_exam_errors_to_review('fbcd0000-0000-0000-0000-000000000001');
  INSERT INTO public._t VALUES ('stranger review push: ALLOWED!');
EXCEPTION WHEN others THEN
  INSERT INTO public._t VALUES ('stranger review push: rejected');
END $$;
SELECT count(*) AS visible_results FROM public.exam_results;
RESET ROLE;
RESET "request.jwt.claim.sub";
SELECT code FROM public._t WHERE code LIKE '%stranger review%';

-- @@ 28. تقرير المعلّم: معلّم الحلقة يقرأ نتائج طلابه ومواضع خطئهم مع وصف الاختبار، ولا يكتب نتيجة باسمهم
-- الأستاذ يحيى معلّم «حلقة الفجر» وفيها بلال (أُعدّت في الفحص 10).
-- محاولة مسلَّمة بلا نتيجة، كي يكون الرفض من RLS لا من قيد التفرّد.
INSERT INTO public.exam_attempts (id, exam_id, student_id, status)
VALUES ('aaaa0000-0000-0000-0000-000000000002','eeee0000-0000-0000-0000-000000000001',
        '22222222-2222-2222-2222-222222222222','submitted');
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '33333333-3333-3333-3333-333333333333';
DO $$
DECLARE visible integer; spots integer; labelled integer;
BEGIN
  SELECT count(*) INTO visible FROM public.exam_results
   WHERE student_id = '22222222-2222-2222-2222-222222222222';
  SELECT count(*) INTO spots FROM public.exam_errors
   WHERE student_id = '22222222-2222-2222-2222-222222222222';
  SELECT count(*) INTO labelled FROM public.exam_results r
    JOIN public.exams e ON e.id = r.exam_id
   WHERE r.student_id = '22222222-2222-2222-2222-222222222222';
  IF visible = 0 OR spots = 0 OR labelled = 0 THEN
    INSERT INTO public._t VALUES ('teacher report read FAILED: ' || visible || '/' || spots || '/' || labelled);
  ELSE
    INSERT INTO public._t VALUES ('teacher report read: ok');
  END IF;
END $$;
DO $$
BEGIN
  INSERT INTO public.exam_results (attempt_id, exam_id, student_id, score, possible, percentage, mastery)
  VALUES ('aaaa0000-0000-0000-0000-000000000002','eeee0000-0000-0000-0000-000000000001',
          '22222222-2222-2222-2222-222222222222', 10, 10, 100, 'mastery');
  INSERT INTO public._t VALUES ('teacher forged result: ALLOWED!');
EXCEPTION WHEN insufficient_privilege THEN
  INSERT INTO public._t VALUES ('teacher forged result: rejected by RLS');
WHEN others THEN
  INSERT INTO public._t VALUES ('teacher forged result FAILED unexpectedly: ' || SQLERRM);
END $$;
RESET ROLE;
RESET "request.jwt.claim.sub";
SELECT code FROM public._t WHERE code LIKE 'teacher report%' OR code LIKE 'teacher forged%';

-- @@ 29. معلّم ليس معلّم حلقة الطالب: لا يرى اختباراته ولا يرسل أخطاءه إلى المراجعة
-- سالم صار معلّماً بدعوة (الفحص 8) لكنه لا يُدرّس بلال في أي حلقة.
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
DO $$
DECLARE r integer; e integer; x integer; a integer; t boolean;
BEGIN
  SELECT private.is_teacher('11111111-1111-1111-1111-111111111111') INTO t;
  SELECT count(*) INTO r FROM public.exam_results WHERE student_id = '22222222-2222-2222-2222-222222222222';
  SELECT count(*) INTO e FROM public.exam_errors WHERE student_id = '22222222-2222-2222-2222-222222222222';
  SELECT count(*) INTO x FROM public.exams WHERE student_id = '22222222-2222-2222-2222-222222222222';
  SELECT count(*) INTO a FROM public.exam_attempts WHERE student_id = '22222222-2222-2222-2222-222222222222';
  IF NOT t THEN
    INSERT INTO public._t VALUES ('other teacher setup FAILED: not a teacher');
  ELSIF r + e + x + a > 0 THEN
    INSERT INTO public._t VALUES ('other teacher read: ALLOWED! ' || r || '/' || e || '/' || x || '/' || a);
  ELSE
    INSERT INTO public._t VALUES ('other teacher read: 0 rows');
  END IF;
  BEGIN
    PERFORM public.send_exam_errors_to_review('fbcd0000-0000-0000-0000-000000000001');
    INSERT INTO public._t VALUES ('other teacher review push: ALLOWED!');
  EXCEPTION WHEN others THEN
    INSERT INTO public._t VALUES ('other teacher review push: rejected');
  END;
END $$;
RESET ROLE;
RESET "request.jwt.claim.sub";
SELECT code FROM public._t WHERE code LIKE 'other teacher%';

-- @@ 30. معلّم الحلقة يرسل أخطاء طالبه إلى المراجعة، وقائمة طلابه تضمّه وحده
INSERT INTO public.exam_attempts (id, exam_id, student_id, status)
VALUES ('aaaa0000-0000-0000-0000-000000000003','eeee0000-0000-0000-0000-000000000001',
        '22222222-2222-2222-2222-222222222222','submitted');
INSERT INTO public.exam_results (id, attempt_id, exam_id, student_id, score, possible, percentage, mastery)
VALUES ('fbcd0000-0000-0000-0000-000000000002','aaaa0000-0000-0000-0000-000000000003',
        'eeee0000-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222',
        5, 10, 50, 'weak');
INSERT INTO public.exam_errors (result_id, student_id, surah_number, surah_name, from_ayah, to_ayah, errors)
VALUES ('fbcd0000-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222',18,'الكهف',50,52,1);
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '33333333-3333-3333-3333-333333333333';
DO $$
DECLARE moved integer; ids text;
BEGIN
  moved := public.send_exam_errors_to_review('fbcd0000-0000-0000-0000-000000000002');
  INSERT INTO public._t VALUES ('halaqa teacher review push: ' || moved);
  SELECT string_agg(id::text, ',') INTO ids FROM public.my_halaqa_student_ids() AS id;
  IF ids = '22222222-2222-2222-2222-222222222222' THEN
    INSERT INTO public._t VALUES ('halaqa student list: ok');
  ELSE
    INSERT INTO public._t VALUES ('halaqa student list FAILED: ' || coalesce(ids, 'empty'));
  END IF;
EXCEPTION WHEN others THEN
  INSERT INTO public._t VALUES ('halaqa teacher review push FAILED: ' || SQLERRM);
END $$;
RESET ROLE;
RESET "request.jwt.claim.sub";
SELECT code FROM public._t WHERE code LIKE 'halaqa %';

-- @@ 31. معلّم ليس معلّم الحلقة: لا يرى تسميعات الطالب ولا صوته ولا تقدّمه ولا حضوره ولا يكتب فيها
INSERT INTO public.recitation_sessions (id, student_id, surah_name, from_ayah, to_ayah, audio_path)
VALUES ('abcd0000-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222',
        'الملك',1,10,'22222222-2222-2222-2222-222222222222/own.webm');
INSERT INTO public.progress (user_id, surah_name, from_ayah, to_ayah)
VALUES ('22222222-2222-2222-2222-222222222222','الملك',1,10);
INSERT INTO public.mushaf_records (student_id, teacher_id, page)
VALUES ('22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333',562);
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
DO $$
DECLARE seen integer; changed integer;
BEGIN
  SELECT (SELECT count(*) FROM public.recitation_sessions)
       + (SELECT count(*) FROM public.recitation_assessments)
       + (SELECT count(*) FROM public.progress)
       + (SELECT count(*) FROM public.review_cards)
       + (SELECT count(*) FROM public.mushaf_records)
       + (SELECT count(*) FROM public.attendance)
       + (SELECT count(*) FROM storage.objects WHERE bucket_id = 'recitations')
    INTO seen;
  INSERT INTO public._t VALUES ('non-halaqa teacher reads: ' || CASE WHEN seen = 0 THEN 'none' ELSE seen || ' rows ALLOWED!' END);

  UPDATE public.progress SET rating = 1 WHERE user_id = '22222222-2222-2222-2222-222222222222';
  GET DIAGNOSTICS changed = ROW_COUNT;
  UPDATE public.recitation_sessions SET status = 'reviewed' WHERE student_id = '22222222-2222-2222-2222-222222222222';
  GET DIAGNOSTICS seen = ROW_COUNT;
  INSERT INTO public._t VALUES ('non-halaqa teacher updates: ' || CASE WHEN changed + seen = 0 THEN 'none' ELSE 'ALLOWED!' END);

  BEGIN
    PERFORM public.mark_attendance('22222222-2222-2222-2222-222222222222', NULL, current_date - 1, 'present');
    INSERT INTO public._t VALUES ('non-halaqa teacher attendance: ALLOWED!');
  EXCEPTION WHEN others THEN
    INSERT INTO public._t VALUES ('non-halaqa teacher attendance: rejected');
  END;

  BEGIN
    INSERT INTO public.recitation_assessments (session_id, student_id, teacher_id, score, approved)
    VALUES ('abcd0000-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222',
            '11111111-1111-1111-1111-111111111111', 90, true);
    INSERT INTO public._t VALUES ('non-halaqa teacher assessment: ALLOWED!');
  EXCEPTION WHEN others THEN
    INSERT INTO public._t VALUES ('non-halaqa teacher assessment: rejected');
  END;

  BEGIN
    PERFORM public.apply_review('22222222-2222-2222-2222-222222222222','الملك',1,10,40);
    INSERT INTO public._t VALUES ('non-halaqa teacher review: ALLOWED!');
  EXCEPTION WHEN others THEN
    INSERT INTO public._t VALUES ('non-halaqa teacher review: rejected');
  END;
END $$;
RESET ROLE;
RESET "request.jwt.claim.sub";
SELECT code FROM public._t WHERE code LIKE 'non-halaqa teacher %';

-- @@ 32. معلّم الحلقة: يرى بيانات طالبه ويقيّم تسميعه ويسجّل حضوره، ولا يستخدم حلقة غيره
INSERT INTO public.halaqat (id, center_id, name, teacher_id)
VALUES ('dddd0000-0000-0000-0000-000000000002','cccc0000-0000-0000-0000-000000000001',
        'حلقة العصر','11111111-1111-1111-1111-111111111111');
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '33333333-3333-3333-3333-333333333333';
DO $$
DECLARE sessions integer; audio integer; prog integer; mushaf integer; changed integer;
BEGIN
  SELECT count(*) INTO sessions FROM public.recitation_sessions WHERE student_id = '22222222-2222-2222-2222-222222222222';
  SELECT count(*) INTO audio FROM storage.objects
   WHERE bucket_id = 'recitations' AND name LIKE '22222222-2222-2222-2222-222222222222/%';
  SELECT count(*) INTO prog FROM public.progress WHERE user_id = '22222222-2222-2222-2222-222222222222';
  SELECT count(*) INTO mushaf FROM public.mushaf_records WHERE student_id = '22222222-2222-2222-2222-222222222222';
  IF sessions > 0 AND audio > 0 AND prog > 0 AND mushaf > 0 THEN
    INSERT INTO public._t VALUES ('own teacher reads: ok');
  ELSE
    INSERT INTO public._t VALUES ('own teacher reads FAILED: ' || sessions || '/' || audio || '/' || prog || '/' || mushaf);
  END IF;

  UPDATE public.progress SET rating = 5, reviewed_by = '33333333-3333-3333-3333-333333333333'
   WHERE user_id = '22222222-2222-2222-2222-222222222222';
  GET DIAGNOSTICS changed = ROW_COUNT;
  INSERT INTO public._t VALUES ('own teacher progress: ' || CASE WHEN changed > 0 THEN 'ok' ELSE 'FAILED' END);

  INSERT INTO public.recitation_assessments (session_id, student_id, teacher_id, score, approved)
  VALUES ('abcd0000-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222',
          '33333333-3333-3333-3333-333333333333', 90, true);
  INSERT INTO public._t VALUES ('own teacher assessment: ok');

  PERFORM public.mark_attendance('22222222-2222-2222-2222-222222222222',
          'dddd0000-0000-0000-0000-000000000001', current_date - 1, 'late');
  INSERT INTO public._t VALUES ('own teacher attendance: ok');

  BEGIN
    PERFORM public.mark_attendance('22222222-2222-2222-2222-222222222222',
            'dddd0000-0000-0000-0000-000000000002', current_date - 1, 'present');
    INSERT INTO public._t VALUES ('own teacher foreign halaqa: ALLOWED!');
  EXCEPTION WHEN others THEN
    INSERT INTO public._t VALUES ('own teacher foreign halaqa: rejected');
  END;
EXCEPTION WHEN others THEN
  INSERT INTO public._t VALUES ('own teacher FAILED: ' || SQLERRM);
END $$;
RESET ROLE;
RESET "request.jwt.claim.sub";
SELECT code FROM public._t WHERE code LIKE 'own teacher %';

-- @@ 33. لا التفاف: معلّم آخر لا يستولي على حلقة غيره ولا يضيف إليها طلاباً ولا يحذفهم
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
DO $$
DECLARE changed integer;
BEGIN
  UPDATE public.halaqat SET teacher_id = '11111111-1111-1111-1111-111111111111'
   WHERE id = 'dddd0000-0000-0000-0000-000000000001';
  GET DIAGNOSTICS changed = ROW_COUNT;
  INSERT INTO public._t VALUES ('hijack halaqa: ' || CASE WHEN changed = 0 THEN 'rejected' ELSE 'ALLOWED!' END);

  DELETE FROM public.halaqa_students WHERE halaqa_id = 'dddd0000-0000-0000-0000-000000000001';
  GET DIAGNOSTICS changed = ROW_COUNT;
  INSERT INTO public._t VALUES ('hijack remove member: ' || CASE WHEN changed = 0 THEN 'rejected' ELSE 'ALLOWED!' END);

  BEGIN
    INSERT INTO public.halaqa_students (halaqa_id, student_id)
    VALUES ('dddd0000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111');
    INSERT INTO public._t VALUES ('hijack add member: ALLOWED!');
  EXCEPTION WHEN others THEN
    INSERT INTO public._t VALUES ('hijack add member: rejected');
  END;

  BEGIN
    INSERT INTO public.halaqat (center_id, name, teacher_id)
    VALUES ('cccc0000-0000-0000-0000-000000000001','حلقة باسم غيري','33333333-3333-3333-3333-333333333333');
    INSERT INTO public._t VALUES ('hijack create for other: ALLOWED!');
  EXCEPTION WHEN others THEN
    INSERT INTO public._t VALUES ('hijack create for other: rejected');
  END;
END $$;
-- وصاحب الحلقة يدير حلقته: يعدّل اسمها.
SET "request.jwt.claim.sub" = '33333333-3333-3333-3333-333333333333';
DO $$
DECLARE changed integer;
BEGIN
  UPDATE public.halaqat SET schedule = 'بعد الفجر' WHERE id = 'dddd0000-0000-0000-0000-000000000001';
  GET DIAGNOSTICS changed = ROW_COUNT;
  INSERT INTO public._t VALUES ('hijack owner edits: ' || CASE WHEN changed = 1 THEN 'ok' ELSE 'FAILED' END);
END $$;
RESET ROLE;
RESET "request.jwt.claim.sub";
SELECT code FROM public._t WHERE code LIKE 'hijack %';

-- @@ 34. الواجبات: معلّم الحلقة يُسند لطالبه ويراه، والمعلّم الآخر لا يرى ولا يُسند ولا يعدّل ولا يحذف
INSERT INTO public.assignments (id, student_id, teacher_id, halaqa_id, surah_name, from_ayah, to_ayah)
VALUES ('abcd0000-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222',
        '33333333-3333-3333-3333-333333333333','dddd0000-0000-0000-0000-000000000001','الملك',1,5);
-- حلقة لسالم في مركز أنشأه هو (لا يديرها الأستاذ يحيى).
INSERT INTO public.centers (id, name, created_by)
VALUES ('cccc0000-0000-0000-0000-000000000002','مركز سالم','11111111-1111-1111-1111-111111111111');
INSERT INTO public.halaqat (id, center_id, name, teacher_id)
VALUES ('dddd0000-0000-0000-0000-000000000003','cccc0000-0000-0000-0000-000000000002',
        'حلقة المغرب','11111111-1111-1111-1111-111111111111');
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '33333333-3333-3333-3333-333333333333';
DO $$
DECLARE seen integer;
BEGIN
  INSERT INTO public.assignments (student_id, teacher_id, halaqa_id, surah_name, from_ayah, to_ayah)
  VALUES ('22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333',
          'dddd0000-0000-0000-0000-000000000001','الملك',6,10);
  SELECT count(*) INTO seen FROM public.assignments WHERE student_id = '22222222-2222-2222-2222-222222222222';
  INSERT INTO public._t VALUES ('assignments own teacher: ' || CASE WHEN seen = 2 THEN 'ok' ELSE 'FAILED ' || seen END);
  BEGIN
    INSERT INTO public.assignments (student_id, teacher_id, surah_name)
    VALUES ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','باسم غيري');
    INSERT INTO public._t VALUES ('assignments impersonate: ALLOWED!');
  EXCEPTION WHEN others THEN
    INSERT INTO public._t VALUES ('assignments impersonate: rejected');
  END;
  BEGIN
    INSERT INTO public.assignments (student_id, teacher_id, halaqa_id, surah_name)
    VALUES ('22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333',
            'dddd0000-0000-0000-0000-000000000003','حلقة غيري');
    INSERT INTO public._t VALUES ('assignments foreign halaqa: ALLOWED!');
  EXCEPTION WHEN others THEN
    INSERT INTO public._t VALUES ('assignments foreign halaqa: rejected');
  END;
EXCEPTION WHEN others THEN
  INSERT INTO public._t VALUES ('assignments own teacher FAILED: ' || SQLERRM);
END $$;
SET "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
DO $$
DECLARE seen integer; changed integer; removed integer;
BEGIN
  SELECT count(*) INTO seen FROM public.assignments;
  UPDATE public.assignments SET status = 'done' WHERE student_id = '22222222-2222-2222-2222-222222222222';
  GET DIAGNOSTICS changed = ROW_COUNT;
  DELETE FROM public.assignments WHERE student_id = '22222222-2222-2222-2222-222222222222';
  GET DIAGNOSTICS removed = ROW_COUNT;
  INSERT INTO public._t VALUES ('assignments outsider touch: '
    || CASE WHEN seen + changed + removed = 0 THEN 'none' ELSE 'ALLOWED!' END);
  BEGIN
    INSERT INTO public.assignments (student_id, teacher_id, surah_name)
    VALUES ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','ليس طالبي');
    INSERT INTO public._t VALUES ('assignments outsider assign: ALLOWED!');
  EXCEPTION WHEN others THEN
    INSERT INTO public._t VALUES ('assignments outsider assign: rejected');
  END;
END $$;
-- والطالب يحدّث حالة واجبه بنفسه.
SET "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
DO $$
DECLARE changed integer;
BEGIN
  UPDATE public.assignments SET status = 'submitted' WHERE id = 'abcd0000-0000-0000-0000-000000000002';
  GET DIAGNOSTICS changed = ROW_COUNT;
  INSERT INTO public._t VALUES ('assignments student status: ' || CASE WHEN changed = 1 THEN 'ok' ELSE 'FAILED' END);
END $$;
RESET ROLE;
RESET "request.jwt.claim.sub";
SELECT code FROM public._t WHERE code LIKE 'assignments %';

-- @@ 35. محاسبتي: بيانات خاصة بصاحبها — لا يراها معلّم الحلقة ولا طالب آخر، ويوم واحد لكل مستخدم
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
DO $$
DECLARE n integer;
BEGIN
  INSERT INTO public.muhasaba_settings (user_id, onboarded_at, reminder_enabled)
  VALUES ('22222222-2222-2222-2222-222222222222', now(), true);
  INSERT INTO public.muhasaba_habits (id, user_id, title, preset_key, days)
  VALUES ('eeee0000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'الوتر', 'witr', NULL);
  INSERT INTO public.muhasaba_days (user_id, day, prayers, habits_done, mood, focus, note, goal_text)
  VALUES ('22222222-2222-2222-2222-222222222222', now()::date,
          '{"fajr":"on_time","isha":"late"}', ARRAY['eeee0000-0000-0000-0000-000000000001']::uuid[],
          'tired', ARRAY['sleep'], 'ملاحظة خاصة', 'غداً سأنام مبكراً');
  -- upsert بالمفتاح الفريد يحدّث الصف نفسه ولا يكرّره (مزامنة من جهاز آخر).
  INSERT INTO public.muhasaba_days (user_id, day, prayers)
  VALUES ('22222222-2222-2222-2222-222222222222', now()::date, '{"fajr":"late"}')
  ON CONFLICT (user_id, day) DO UPDATE SET prayers = EXCLUDED.prayers;
  SELECT count(*) INTO n FROM public.muhasaba_days WHERE user_id = '22222222-2222-2222-2222-222222222222';
  INSERT INTO public._t VALUES ('muhasaba owner write: ' || CASE WHEN n = 1 THEN 'ok' ELSE 'FAILED' END);
  SELECT count(*) INTO n FROM public.muhasaba_days WHERE prayers->>'fajr' = 'late';
  INSERT INTO public._t VALUES ('muhasaba upsert merge: ' || CASE WHEN n = 1 THEN 'ok' ELSE 'FAILED' END);

  BEGIN
    INSERT INTO public.muhasaba_days (user_id, day) VALUES ('22222222-2222-2222-2222-222222222222', now()::date);
    INSERT INTO public._t VALUES ('muhasaba duplicate day: ALLOWED!');
  EXCEPTION WHEN unique_violation THEN
    INSERT INTO public._t VALUES ('muhasaba duplicate day: rejected');
  END;
  BEGIN
    INSERT INTO public.muhasaba_habits (user_id, title, preset_key)
    VALUES ('22222222-2222-2222-2222-222222222222', 'الوتر', 'witr');
    INSERT INTO public._t VALUES ('muhasaba duplicate preset: ALLOWED!');
  EXCEPTION WHEN unique_violation THEN
    INSERT INTO public._t VALUES ('muhasaba duplicate preset: rejected');
  END;
  BEGIN
    INSERT INTO public.muhasaba_days (user_id, day, prayers)
    VALUES ('22222222-2222-2222-2222-222222222222', now()::date - 1, '{"fajr":"excellent"}');
    INSERT INTO public._t VALUES ('muhasaba bad status: ALLOWED!');
  EXCEPTION WHEN others THEN
    INSERT INTO public._t VALUES ('muhasaba bad status: rejected');
  END;
  BEGIN
    INSERT INTO public.muhasaba_days (user_id, day, prayers)
    VALUES ('22222222-2222-2222-2222-222222222222', now()::date - 2, '{"duha":"on_time"}');
    INSERT INTO public._t VALUES ('muhasaba bad prayer: ALLOWED!');
  EXCEPTION WHEN others THEN
    INSERT INTO public._t VALUES ('muhasaba bad prayer: rejected');
  END;
  BEGIN
    INSERT INTO public.muhasaba_days (user_id, day, mood)
    VALUES ('22222222-2222-2222-2222-222222222222', now()::date - 3, 'score_90');
    INSERT INTO public._t VALUES ('muhasaba bad mood: ALLOWED!');
  EXCEPTION WHEN others THEN
    INSERT INTO public._t VALUES ('muhasaba bad mood: rejected');
  END;
  BEGIN
    INSERT INTO public.muhasaba_days (user_id, day, goal_result)
    VALUES ('22222222-2222-2222-2222-222222222222', now()::date - 4, 'kept');
    INSERT INTO public._t VALUES ('muhasaba rating without goal: ALLOWED!');
  EXCEPTION WHEN others THEN
    INSERT INTO public._t VALUES ('muhasaba rating without goal: rejected');
  END;
  BEGIN
    INSERT INTO public.muhasaba_days (user_id, day) VALUES ('22222222-2222-2222-2222-222222222222', now()::date + 5);
    INSERT INTO public._t VALUES ('muhasaba future day: ALLOWED!');
  EXCEPTION WHEN others THEN
    INSERT INTO public._t VALUES ('muhasaba future day: rejected');
  END;
  BEGIN
    INSERT INTO public.muhasaba_days (user_id, day) VALUES ('33333333-3333-3333-3333-333333333333', now()::date);
    INSERT INTO public._t VALUES ('muhasaba write for other: ALLOWED!');
  EXCEPTION WHEN others THEN
    INSERT INTO public._t VALUES ('muhasaba write for other: rejected');
  END;
EXCEPTION WHEN others THEN
  INSERT INTO public._t VALUES ('muhasaba owner FAILED: ' || SQLERRM);
END $$;
-- معلّم حلقة الطالب (3333) لا يرى شيئاً ولا يعدّل — المحاسبة ليست تقريراً للمعلّم.
SET "request.jwt.claim.sub" = '33333333-3333-3333-3333-333333333333';
DO $$
DECLARE seen integer; changed integer;
BEGIN
  SELECT (SELECT count(*) FROM public.muhasaba_days) + (SELECT count(*) FROM public.muhasaba_habits)
       + (SELECT count(*) FROM public.muhasaba_settings) + (SELECT count(*) FROM public.muhasaba_week_goals)
    INTO seen;
  UPDATE public.muhasaba_days SET note = 'تعديل' WHERE user_id = '22222222-2222-2222-2222-222222222222';
  GET DIAGNOSTICS changed = ROW_COUNT;
  INSERT INTO public._t VALUES ('muhasaba halaqa teacher: '
    || CASE WHEN private.teaches_student('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222')
              AND seen + changed = 0 THEN 'none' ELSE 'ALLOWED!' END);
END $$;
-- ومستخدم آخر (1111) لا يرى ولا يحذف.
SET "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
DO $$
DECLARE seen integer; removed integer;
BEGIN
  SELECT count(*) INTO seen FROM public.muhasaba_days;
  DELETE FROM public.muhasaba_days;
  GET DIAGNOSTICS removed = ROW_COUNT;
  INSERT INTO public._t VALUES ('muhasaba other user: '
    || CASE WHEN seen + removed = 0 THEN 'none' ELSE 'ALLOWED!' END);
END $$;
-- anon لا يصل إطلاقاً.
RESET ROLE;
INSERT INTO public._t
SELECT 'muhasaba anon: ' || CASE WHEN has_table_privilege('anon', 'public.muhasaba_days', 'SELECT')
                                  OR has_table_privilege('anon', 'public.muhasaba_habits', 'SELECT')
                                  THEN 'ALLOWED!' ELSE 'rejected' END;
-- حصة مساعد محاسبتي مقبولة في جدول الاستهلاك.
DO $$
DECLARE r jsonb;
BEGIN
  r := public.consume_ai_quota('22222222-2222-2222-2222-222222222222', 'muhasaba', 20, 8);
  INSERT INTO public._t VALUES ('muhasaba ai quota: ' || CASE WHEN (r->>'allowed')::boolean THEN 'ok' ELSE 'FAILED' END);
EXCEPTION WHEN others THEN
  INSERT INTO public._t VALUES ('muhasaba ai quota FAILED: ' || SQLERRM);
END $$;
RESET "request.jwt.claim.sub";
SELECT code FROM public._t WHERE code LIKE 'muhasaba %';

-- @@ 36. الإشعارات: المعلّم يُشعر طلاب حلقاته فقط، والطالب لا يُشعر غيره
DELETE FROM public._t;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '33333333-3333-3333-3333-333333333333';
DO $$
BEGIN
  INSERT INTO public.notifications (user_id, title) VALUES ('22222222-2222-2222-2222-222222222222', 'واجب');
  INSERT INTO public._t VALUES ('notify own student: ok');
EXCEPTION WHEN others THEN
  INSERT INTO public._t VALUES ('notify own student FAILED: ' || SQLERRM);
END $$;
SET "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
DO $$
BEGIN
  INSERT INTO public.notifications (user_id, title) VALUES ('22222222-2222-2222-2222-222222222222', 'رسالة مزيّفة');
  INSERT INTO public._t VALUES ('notify foreign student: ALLOWED!');
EXCEPTION WHEN others THEN
  INSERT INTO public._t VALUES ('notify foreign student: rejected');
END $$;
SET "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
DO $$
BEGIN
  INSERT INTO public.notifications (user_id, title) VALUES ('33333333-3333-3333-3333-333333333333', 'من طالب');
  INSERT INTO public._t VALUES ('student notifies teacher: ALLOWED!');
EXCEPTION WHEN others THEN
  INSERT INTO public._t VALUES ('student notifies teacher: rejected');
END $$;
DO $$
BEGIN
  INSERT INTO public.notifications (user_id, title) VALUES ('22222222-2222-2222-2222-222222222222', 'تذكير لنفسي');
  INSERT INTO public._t VALUES ('notify self: ok');
EXCEPTION WHEN others THEN
  INSERT INTO public._t VALUES ('notify self FAILED: ' || SQLERRM);
END $$;
RESET ROLE;
RESET "request.jwt.claim.sub";
SELECT code FROM public._t WHERE code LIKE 'notify%' OR code LIKE 'student notifies%';

-- @@ 37. المراكز: لا يعدّل مركزاً أو يحذفه إلا منشئه، ولا يُنشأ مركز باسم غيرك
DELETE FROM public._t;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
DO $$
DECLARE changed integer;
BEGIN
  UPDATE public.centers SET name = 'مركز مخطوف' WHERE id = 'cccc0000-0000-0000-0000-000000000001';
  GET DIAGNOSTICS changed = ROW_COUNT;
  INSERT INTO public._t VALUES ('center foreign update: ' || CASE WHEN changed = 0 THEN 'rejected' ELSE 'ALLOWED!' END);
  DELETE FROM public.centers WHERE id = 'cccc0000-0000-0000-0000-000000000001';
  GET DIAGNOSTICS changed = ROW_COUNT;
  INSERT INTO public._t VALUES ('center foreign delete: ' || CASE WHEN changed = 0 THEN 'rejected' ELSE 'ALLOWED!' END);
  BEGIN
    INSERT INTO public.centers (name, created_by) VALUES ('مركز باسم غيري', '33333333-3333-3333-3333-333333333333');
    INSERT INTO public._t VALUES ('center impersonate insert: ALLOWED!');
  EXCEPTION WHEN others THEN
    INSERT INTO public._t VALUES ('center impersonate insert: rejected');
  END;
  BEGIN
    UPDATE public.centers SET created_by = '33333333-3333-3333-3333-333333333333'
     WHERE id = 'cccc0000-0000-0000-0000-000000000002';
    INSERT INTO public._t VALUES ('center hand-over: ALLOWED!');
  EXCEPTION WHEN others THEN
    INSERT INTO public._t VALUES ('center hand-over: rejected');
  END;
END $$;
SET "request.jwt.claim.sub" = '33333333-3333-3333-3333-333333333333';
DO $$
DECLARE changed integer;
BEGIN
  UPDATE public.centers SET city = 'صنعاء' WHERE id = 'cccc0000-0000-0000-0000-000000000001';
  GET DIAGNOSTICS changed = ROW_COUNT;
  INSERT INTO public._t VALUES ('center owner update: ' || CASE WHEN changed = 1 THEN 'ok' ELSE 'FAILED' END);
END $$;
SET "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
DO $$
BEGIN
  INSERT INTO public.centers (name, created_by) VALUES ('مركز طالب', '22222222-2222-2222-2222-222222222222');
  INSERT INTO public._t VALUES ('center student insert: ALLOWED!');
EXCEPTION WHEN others THEN
  INSERT INTO public._t VALUES ('center student insert: rejected');
END $$;
RESET ROLE;
RESET "request.jwt.claim.sub";
SELECT code FROM public._t WHERE code LIKE 'center %';

-- @@ 38. أعضاء الحلقات: يقرؤهم مدير الحلقة والطالب نفسه فقط
DELETE FROM public._t;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
INSERT INTO public._t
SELECT 'members other teacher: ' || CASE WHEN count(*) = 0 THEN 'none' ELSE 'ALLOWED!' END
  FROM public.halaqa_students WHERE halaqa_id = 'dddd0000-0000-0000-0000-000000000001';
SET "request.jwt.claim.sub" = '33333333-3333-3333-3333-333333333333';
INSERT INTO public._t
SELECT 'members own teacher: ' || CASE WHEN count(*) = 1 THEN 'ok' ELSE 'FAILED' END
  FROM public.halaqa_students WHERE halaqa_id = 'dddd0000-0000-0000-0000-000000000001';
SET "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
INSERT INTO public._t
SELECT 'members self: ' || CASE WHEN count(*) >= 1 AND bool_and(student_id = '22222222-2222-2222-2222-222222222222') THEN 'ok' ELSE 'FAILED' END
  FROM public.halaqa_students;
RESET ROLE;
RESET "request.jwt.claim.sub";
SELECT code FROM public._t WHERE code LIKE 'members %';

-- @@ 39. الانضمام إلى حلقة بموافقة الطالب: دعوة ثم قبول أو رفض، ولا إضافة مباشرة
DELETE FROM public._t;
INSERT INTO auth.users (id, phone, raw_user_meta_data) VALUES
 ('44444444-4444-4444-4444-444444444444','+967744444444','{"name":"عمر"}'),
 ('55555555-5555-5555-5555-555555555555','+967755555555','{"name":"زيد"}');
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '33333333-3333-3333-3333-333333333333';
DO $$
DECLARE inv uuid; inv2 uuid;
BEGIN
  BEGIN
    INSERT INTO public.halaqa_students (halaqa_id, student_id)
    VALUES ('dddd0000-0000-0000-0000-000000000001','44444444-4444-4444-4444-444444444444');
    INSERT INTO public._t VALUES ('invite direct add: ALLOWED!');
  EXCEPTION WHEN others THEN
    INSERT INTO public._t VALUES ('invite direct add: rejected');
  END;
  inv := public.invite_to_halaqa('dddd0000-0000-0000-0000-000000000001','44444444-4444-4444-4444-444444444444');
  inv2 := public.invite_to_halaqa('dddd0000-0000-0000-0000-000000000001','44444444-4444-4444-4444-444444444444');
  INSERT INTO public._t VALUES ('invite idempotent: ' || CASE WHEN inv = inv2 THEN 'ok' ELSE 'FAILED' END);
  INSERT INTO public._t VALUES ('invite no access before accept: '
    || CASE WHEN private.teaches_student('33333333-3333-3333-3333-333333333333','44444444-4444-4444-4444-444444444444')
            THEN 'ALLOWED!' ELSE 'none' END);
  PERFORM public.invite_to_halaqa('dddd0000-0000-0000-0000-000000000001','55555555-5555-5555-5555-555555555555');
  BEGIN
    PERFORM public.invite_to_halaqa('dddd0000-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222');
    INSERT INTO public._t VALUES ('invite existing member: ALLOWED!');
  EXCEPTION WHEN others THEN
    INSERT INTO public._t VALUES ('invite existing member: rejected');
  END;
END $$;
SET "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
DO $$
BEGIN
  PERFORM public.invite_to_halaqa('dddd0000-0000-0000-0000-000000000001','44444444-4444-4444-4444-444444444444');
  INSERT INTO public._t VALUES ('invite foreign halaqa: ALLOWED!');
EXCEPTION WHEN others THEN
  INSERT INTO public._t VALUES ('invite foreign halaqa: rejected');
END $$;
-- 5555 لا يستطيع الردّ على دعوة 4444، ثم يرفض دعوته هو.
SET "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555555';
DO $$
DECLARE other_inv uuid; own_inv uuid;
BEGIN
  SELECT id INTO other_inv FROM public.halaqa_invites WHERE student_id = '44444444-4444-4444-4444-444444444444';
  INSERT INTO public._t VALUES ('invite visible to other student: '
    || CASE WHEN other_inv IS NULL THEN 'none' ELSE 'ALLOWED!' END);
  SELECT id INTO own_inv FROM public.halaqa_invites WHERE student_id = '55555555-5555-5555-5555-555555555555';
  PERFORM public.respond_halaqa_invite(own_inv, false);
  INSERT INTO public._t VALUES ('invite decline: '
    || CASE WHEN EXISTS (SELECT 1 FROM public.halaqa_students WHERE student_id = '55555555-5555-5555-5555-555555555555')
            THEN 'FAILED' ELSE 'ok' END);
END $$;
RESET ROLE;
RESET "request.jwt.claim.sub";
INSERT INTO public._t SELECT 'invite id for hijack' || '|' || id::text FROM public.halaqa_invites
 WHERE student_id = '44444444-4444-4444-4444-444444444444' AND status = 'pending';
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555555';
DO $$
BEGIN
  PERFORM public.respond_halaqa_invite(
    split_part((SELECT code FROM public._t WHERE code LIKE 'invite id for hijack|%'), '|', 2)::uuid, true);
  INSERT INTO public._t VALUES ('invite hijack accept: ALLOWED!');
EXCEPTION WHEN others THEN
  INSERT INTO public._t VALUES ('invite hijack accept: rejected');
END $$;
-- 4444 يرى دعوته ويقبلها فيصبح عضواً، ولا يُعاد استخدام الدعوة.
SET "request.jwt.claim.sub" = '44444444-4444-4444-4444-444444444444';
DO $$
DECLARE inv uuid; res text;
BEGIN
  SELECT id INTO inv FROM public.halaqa_invites WHERE status = 'pending';
  res := public.respond_halaqa_invite(inv, true);
  INSERT INTO public._t VALUES ('invite accept: '
    || CASE WHEN res = 'accepted' AND EXISTS (
         SELECT 1 FROM public.halaqa_students
          WHERE student_id = '44444444-4444-4444-4444-444444444444'
            AND halaqa_id = 'dddd0000-0000-0000-0000-000000000001') THEN 'ok' ELSE 'FAILED' END);
  BEGIN
    PERFORM public.respond_halaqa_invite(inv, false);
    INSERT INTO public._t VALUES ('invite reuse: ALLOWED!');
  EXCEPTION WHEN others THEN
    INSERT INTO public._t VALUES ('invite reuse: rejected');
  END;
END $$;
RESET ROLE;
RESET "request.jwt.claim.sub";
INSERT INTO public._t VALUES ('invite teacher access after accept: '
  || CASE WHEN private.teaches_student('33333333-3333-3333-3333-333333333333','44444444-4444-4444-4444-444444444444')
          THEN 'ok' ELSE 'FAILED' END);
INSERT INTO public._t SELECT 'invite notifications: '
  || CASE WHEN (SELECT count(*) FROM public.notifications WHERE kind = 'halaqa_invite'
                 AND user_id IN ('44444444-4444-4444-4444-444444444444','55555555-5555-5555-5555-555555555555')) = 2
           AND (SELECT count(*) FROM public.notifications WHERE kind = 'halaqa_invite_response'
                 AND user_id = '33333333-3333-3333-3333-333333333333') = 2
          THEN 'ok' ELSE 'FAILED' END;
SELECT code FROM public._t WHERE code LIKE 'invite %' AND code NOT LIKE 'invite id for hijack%';

-- @@ 40. المحادثات: معلّم ↔ طالب حلقته، ومعلّم ↔ معلّم، وزملاء الحلقة — ولا غرباء
-- منذ المرحلة 1 محادثات الزملاء ممنوعة افتراضياً؛ هذا القسم يفترض أن المركز فعّلها (انظر 87).
UPDATE public.centers SET student_dm_enabled = true;
DELETE FROM public._t;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
DO $$
BEGIN
  BEGIN
    INSERT INTO public.chats (participants) VALUES
      (ARRAY['22222222-2222-2222-2222-222222222222','55555555-5555-5555-5555-555555555555']::uuid[]);
    INSERT INTO public._t VALUES ('chat student-stranger student: ALLOWED!');
  EXCEPTION WHEN others THEN
    INSERT INTO public._t VALUES ('chat student-stranger student: rejected');
  END;
  BEGIN
    INSERT INTO public.chats (participants) VALUES
      (ARRAY['22222222-2222-2222-2222-222222222222','44444444-4444-4444-4444-444444444444']::uuid[]);
    INSERT INTO public._t VALUES ('chat classmates: ok');
  EXCEPTION WHEN others THEN
    INSERT INTO public._t VALUES ('chat classmates FAILED: ' || SQLERRM);
  END;
  BEGIN
    INSERT INTO public.chats (participants) VALUES
      (ARRAY['22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333']::uuid[]);
    INSERT INTO public._t VALUES ('chat student-own teacher: ok');
  EXCEPTION WHEN others THEN
    INSERT INTO public._t VALUES ('chat student-own teacher FAILED: ' || SQLERRM);
  END;
  INSERT INTO public._t VALUES ('chat contacts student: '
    || CASE WHEN (SELECT array_agg(c ORDER BY c) FROM public.my_chat_contacts() c)
              = ARRAY['33333333-3333-3333-3333-333333333333','44444444-4444-4444-4444-444444444444']::uuid[]
            THEN 'ok' ELSE 'FAILED' END);
END $$;
SET "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
DO $$
BEGIN
  BEGIN
    INSERT INTO public.chats (participants) VALUES
      (ARRAY['11111111-1111-1111-1111-111111111111','44444444-4444-4444-4444-444444444444']::uuid[]);
    INSERT INTO public._t VALUES ('chat teacher-foreign student: ALLOWED!');
  EXCEPTION WHEN others THEN
    INSERT INTO public._t VALUES ('chat teacher-foreign student: rejected');
  END;
  BEGIN
    INSERT INTO public.chats (participants) VALUES
      (ARRAY['11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333']::uuid[]);
    INSERT INTO public._t VALUES ('chat teacher-teacher: ok');
  EXCEPTION WHEN others THEN
    INSERT INTO public._t VALUES ('chat teacher-teacher FAILED: ' || SQLERRM);
  END;
END $$;
SET "request.jwt.claim.sub" = '33333333-3333-3333-3333-333333333333';
DO $$
BEGIN
  BEGIN
    INSERT INTO public.chats (participants, is_group) VALUES
      (ARRAY['33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222',
             '44444444-4444-4444-4444-444444444444']::uuid[], true);
    INSERT INTO public._t VALUES ('chat group: ALLOWED!');
  EXCEPTION WHEN others THEN
    INSERT INTO public._t VALUES ('chat group: rejected');
  END;
  BEGIN
    INSERT INTO public.chats (participants) VALUES
      (ARRAY['22222222-2222-2222-2222-222222222222','44444444-4444-4444-4444-444444444444']::uuid[]);
    INSERT INTO public._t VALUES ('chat for others: ALLOWED!');
  EXCEPTION WHEN others THEN
    INSERT INTO public._t VALUES ('chat for others: rejected');
  END;
  INSERT INTO public._t VALUES ('chat contacts teacher: '
    || CASE WHEN (SELECT array_agg(c ORDER BY c) FROM public.my_chat_contacts() c)
              = ARRAY['11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',
                      '44444444-4444-4444-4444-444444444444']::uuid[]
            THEN 'ok' ELSE 'FAILED' END);
END $$;
RESET ROLE;
RESET "request.jwt.claim.sub";
SELECT code FROM public._t WHERE code LIKE 'chat %';

-- @@ 41. زملاء الحلقة: الخروج من الحلقة يمنع بدء محادثة جديدة، وزميل حلقة أخرى غريب
-- منذ المرحلة 1 محادثات الزملاء ممنوعة افتراضياً؛ هذا القسم يفترض أن المركز فعّلها (انظر 87).
UPDATE public.centers SET student_dm_enabled = true;
DELETE FROM public._t;
-- 5555 عضو في «حلقة العصر» فقط، و2222 في «حلقة الفجر» فقط.
INSERT INTO public.halaqa_students (halaqa_id, student_id)
VALUES ('dddd0000-0000-0000-0000-000000000002','55555555-5555-5555-5555-555555555555');
INSERT INTO public._t VALUES ('classmates other halaqa: '
  || CASE WHEN private.can_start_chat('22222222-2222-2222-2222-222222222222','55555555-5555-5555-5555-555555555555')
          THEN 'ALLOWED!' ELSE 'rejected' END);
INSERT INTO public._t VALUES ('classmates same halaqa: '
  || CASE WHEN private.can_start_chat('22222222-2222-2222-2222-222222222222','44444444-4444-4444-4444-444444444444')
          THEN 'ok' ELSE 'FAILED' END);
DELETE FROM public.halaqa_students
 WHERE halaqa_id = 'dddd0000-0000-0000-0000-000000000001'
   AND student_id = '44444444-4444-4444-4444-444444444444';
INSERT INTO public._t VALUES ('classmates after leaving: '
  || CASE WHEN private.can_start_chat('22222222-2222-2222-2222-222222222222','44444444-4444-4444-4444-444444444444')
          THEN 'ALLOWED!' ELSE 'rejected' END);
INSERT INTO public._t VALUES ('classmates self: '
  || CASE WHEN public.are_classmates('22222222-2222-2222-2222-222222222222','22222222-2222-2222-2222-222222222222')
          THEN 'ALLOWED!' ELSE 'rejected' END);
SELECT code FROM public._t WHERE code LIKE 'classmates %';
-- @@ 42. سلامة التسميعات: الطالب لا يكتب درجة آلية ولا يعتمد تسميعه، والخادم يكتب التحليل
DELETE FROM public._t;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
DO $$
DECLARE r record;
BEGIN
  INSERT INTO public.recitation_sessions
    (id, student_id, surah_name, from_ayah, to_ayah, audio_path, status, transcript, ai_score, ai_analysis)
  VALUES ('abcd0000-0000-0000-0000-000000000042','22222222-2222-2222-2222-222222222222',
          'الفاتحة',1,7,'22222222-2222-2222-2222-222222222222/p.webm','practice',
          'مزوّر', 100, '{"coach":"ممتاز"}');
  SELECT * INTO r FROM public.recitation_sessions WHERE id = 'abcd0000-0000-0000-0000-000000000042';
  INSERT INTO public._t VALUES ('recite insert forged ai: '
    || CASE WHEN r.ai_score IS NULL AND r.transcript IS NULL AND r.ai_analysis IS NULL AND r.status = 'practice'
            THEN 'ignored' ELSE 'ALLOWED!' END);

  UPDATE public.recitation_sessions SET ai_score = 99, transcript = 'مزوّر'
   WHERE id = 'abcd0000-0000-0000-0000-000000000042';
  SELECT * INTO r FROM public.recitation_sessions WHERE id = 'abcd0000-0000-0000-0000-000000000042';
  INSERT INTO public._t VALUES ('recite update forged ai: '
    || CASE WHEN r.ai_score IS NULL AND r.transcript IS NULL THEN 'ignored' ELSE 'ALLOWED!' END);

  BEGIN
    UPDATE public.recitation_sessions SET status = 'approved'
     WHERE id = 'abcd0000-0000-0000-0000-000000000042';
    INSERT INTO public._t VALUES ('recite self approve: ALLOWED!');
  EXCEPTION WHEN others THEN
    INSERT INTO public._t VALUES ('recite self approve: rejected');
  END;

  UPDATE public.recitation_sessions SET status = 'awaiting_teacher'
   WHERE id = 'abcd0000-0000-0000-0000-000000000042';
  SELECT * INTO r FROM public.recitation_sessions WHERE id = 'abcd0000-0000-0000-0000-000000000042';
  INSERT INTO public._t VALUES ('recite practice to teacher: '
    || CASE WHEN r.status = 'awaiting_teacher' THEN 'ok' ELSE 'FAILED' END);

  BEGIN
    UPDATE public.recitation_sessions SET status = 'practice'
     WHERE id = 'abcd0000-0000-0000-0000-000000000042';
    INSERT INTO public._t VALUES ('recite back to practice: ALLOWED!');
  EXCEPTION WHEN others THEN
    INSERT INTO public._t VALUES ('recite back to practice: rejected');
  END;
EXCEPTION WHEN others THEN
  INSERT INTO public._t VALUES ('recite student FAILED: ' || SQLERRM);
END $$;
-- معلّم الحلقة يعتمد، ولا يكتب درجة آلية هو أيضاً.
SET "request.jwt.claim.sub" = '33333333-3333-3333-3333-333333333333';
DO $$
DECLARE r record;
BEGIN
  UPDATE public.recitation_sessions SET status = 'approved', ai_score = 10
   WHERE id = 'abcd0000-0000-0000-0000-000000000042';
  SELECT * INTO r FROM public.recitation_sessions WHERE id = 'abcd0000-0000-0000-0000-000000000042';
  INSERT INTO public._t VALUES ('recite teacher approve: '
    || CASE WHEN r.status = 'approved' AND r.ai_score IS NULL THEN 'ok' ELSE 'FAILED' END);
EXCEPTION WHEN others THEN
  INSERT INTO public._t VALUES ('recite teacher approve FAILED: ' || SQLERRM);
END $$;
RESET ROLE;
RESET "request.jwt.claim.sub";
-- الخادم (service_role) يكتب نتيجة التحليل.
SET ROLE service_role;
UPDATE public.recitation_sessions SET transcript = 'الحمد لله رب العالمين', ai_score = 92,
       ai_analysis = '{"weakSpots":[]}'::jsonb
 WHERE id = 'abcd0000-0000-0000-0000-000000000042';
RESET ROLE;
INSERT INTO public._t SELECT 'recite server writes ai: '
  || CASE WHEN ai_score = 92 THEN 'ok' ELSE 'FAILED' END
  FROM public.recitation_sessions WHERE id = 'abcd0000-0000-0000-0000-000000000042';
SELECT code FROM public._t WHERE code LIKE 'recite %';

-- @@ 43. رموز ربط ولي الأمر: يصدرها الطالب أو معلّم حلقته فقط، وتُستخدم مرة واحدة، والتخمين محدود
DELETE FROM public._t;
INSERT INTO auth.users (id, phone, raw_user_meta_data) VALUES
 ('66666666-6666-6666-6666-666666666666','+967766666666','{"name":"أبو بلال"}'),
 ('77777777-7777-7777-7777-777777777777','+967777777777','{"name":"غريب"}');
CREATE TABLE IF NOT EXISTS public._codes (k text PRIMARY KEY, code text);
GRANT ALL ON public._codes TO authenticated;
SET ROLE authenticated;
-- غريب لا يصدر رمزاً لطالب ليس له.
SET "request.jwt.claim.sub" = '77777777-7777-7777-7777-777777777777';
DO $$ BEGIN
  PERFORM public.create_guardian_code('22222222-2222-2222-2222-222222222222');
  INSERT INTO public._t VALUES ('guardian code by stranger: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('guardian code by stranger: rejected');
END $$;
-- معلّم ليس معلّم حلقة الطالب.
SET "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
DO $$ BEGIN
  PERFORM public.create_guardian_code('22222222-2222-2222-2222-222222222222');
  INSERT INTO public._t VALUES ('guardian code by other teacher: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('guardian code by other teacher: rejected');
END $$;
-- معلّم الحلقة يصدر، ثم الطالب يصدر فيُلغى رمز المعلّم.
SET "request.jwt.claim.sub" = '33333333-3333-3333-3333-333333333333';
INSERT INTO public._codes SELECT 'teacher', public.create_guardian_code('22222222-2222-2222-2222-222222222222', 'father')->>'code';
SET "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
INSERT INTO public._codes SELECT 'student', public.create_guardian_code('22222222-2222-2222-2222-222222222222', 'father')->>'code';
-- ولي الأمر: رمز المعلّم أُلغي، ورمز الطالب يعمل مرة واحدة.
SET "request.jwt.claim.sub" = '66666666-6666-6666-6666-666666666666';
INSERT INTO public._t SELECT 'guardian superseded code: '
  || CASE WHEN (public.claim_guardian_code(code)->>'ok')::boolean THEN 'ALLOWED!' ELSE 'rejected' END
  FROM public._codes WHERE k = 'teacher';
INSERT INTO public._t SELECT 'guardian claim: '
  || CASE WHEN (public.claim_guardian_code(lower(substr(code,1,5)) || '-' || substr(code,6))->>'ok')::boolean
          THEN 'ok' ELSE 'FAILED' END
  FROM public._codes WHERE k = 'student';
SET "request.jwt.claim.sub" = '77777777-7777-7777-7777-777777777777';
INSERT INTO public._t SELECT 'guardian code reuse: '
  || CASE WHEN (public.claim_guardian_code(code)->>'ok')::boolean THEN 'REUSED!' ELSE 'rejected' END
  FROM public._codes WHERE k = 'student';
-- الغريب لا يُنشئ الربط مباشرة.
DO $$ BEGIN
  INSERT INTO public.guardian_links (guardian_id, student_id)
  VALUES ('77777777-7777-7777-7777-777777777777','22222222-2222-2222-2222-222222222222');
  INSERT INTO public._t VALUES ('guardian direct link: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('guardian direct link: rejected');
END $$;
-- التخمين: بعد 10 محاولات فاشلة يُقفل حتى مع رمز صحيح.
DO $$ BEGIN
  FOR i IN 1..10 LOOP PERFORM public.claim_guardian_code('0000000000'); END LOOP;
END $$;
SET "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
UPDATE public._codes SET code = public.create_guardian_code('22222222-2222-2222-2222-222222222222')->>'code' WHERE k = 'student';
SET "request.jwt.claim.sub" = '77777777-7777-7777-7777-777777777777';
INSERT INTO public._t SELECT 'guardian brute force lockout: '
  || CASE WHEN (public.claim_guardian_code(code)->>'ok')::boolean THEN 'ALLOWED!' ELSE 'locked' END
  FROM public._codes WHERE k = 'student';
RESET ROLE;
RESET "request.jwt.claim.sub";
INSERT INTO public._t SELECT 'guardian links: ' || string_agg(guardian_id::text, ',')
  FROM public.guardian_links WHERE student_id = '22222222-2222-2222-2222-222222222222';
INSERT INTO public._t SELECT 'guardian student notified: '
  || CASE WHEN count(*) = 1 THEN 'ok' ELSE 'FAILED' END
  FROM public.notifications WHERE user_id = '22222222-2222-2222-2222-222222222222' AND kind = 'guardian';
SELECT code FROM public._t WHERE code LIKE 'guardian %';

-- @@ 44. عرض ولي الأمر: يرى ابنه فقط، للقراءة، بلا محاسبة ولا هواتف ولا وصول مباشر للجداول
DELETE FROM public._t;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '66666666-6666-6666-6666-666666666666';
DO $$
DECLARE o jsonb; n integer;
BEGIN
  o := public.guardian_child_overview('22222222-2222-2222-2222-222222222222');
  INSERT INTO public._t VALUES ('overview own child: '
    || CASE WHEN o->'student'->>'name' IS NOT NULL
             AND jsonb_array_length(o->'halaqat') >= 1
             AND o->'halaqat'->0->>'teacher_name' IS NOT NULL
             AND o ? 'attendance_30d' AND o ? 'assessments' AND o ? 'exams' AND o ? 'mushaf'
            THEN 'ok' ELSE 'FAILED ' || o::text END);
  INSERT INTO public._t VALUES ('overview private data: '
    || CASE WHEN o::text LIKE '%muhasaba%' OR o::text LIKE '%+967%' OR o::text LIKE '%audio%'
            THEN 'LEAKED!' ELSE 'hidden' END);
  BEGIN
    PERFORM public.guardian_child_overview('44444444-4444-4444-4444-444444444444');
    INSERT INTO public._t VALUES ('overview other child: ALLOWED!');
  EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('overview other child: rejected');
  END;
  SELECT (SELECT count(*) FROM public.attendance)
       + (SELECT count(*) FROM public.recitation_sessions)
       + (SELECT count(*) FROM public.muhasaba_days)
       + (SELECT count(*) FROM public.exam_results) INTO n;
  INSERT INTO public._t VALUES ('overview direct tables: ' || CASE WHEN n = 0 THEN 'none' ELSE 'ALLOWED!' END);
  SELECT count(*) INTO n FROM public.my_guardian_children();
  INSERT INTO public._t VALUES ('overview children list: ' || CASE WHEN n = 1 THEN 'ok' ELSE 'FAILED' END);
END $$;
-- غريب لا يرى أولياء أمر الطالب، والطالب ومعلّمه يرونهم.
SET "request.jwt.claim.sub" = '77777777-7777-7777-7777-777777777777';
INSERT INTO public._t SELECT 'overview guardians to stranger: '
  || CASE WHEN count(*) = 0 THEN 'none' ELSE 'ALLOWED!' END
  FROM public.student_guardians('22222222-2222-2222-2222-222222222222');
SET "request.jwt.claim.sub" = '33333333-3333-3333-3333-333333333333';
INSERT INTO public._t SELECT 'overview guardians to teacher: '
  || CASE WHEN count(*) = 1 THEN 'ok' ELSE 'FAILED' END
  FROM public.student_guardians('22222222-2222-2222-2222-222222222222');
RESET ROLE;
RESET "request.jwt.claim.sub";
SELECT code FROM public._t WHERE code LIKE 'overview %';

-- @@ 45. إشعارات ولي الأمر: عند الغياب وعند تقييم التسميع
DELETE FROM public._t;
INSERT INTO public.attendance (student_id, halaqa_id, teacher_id, session_date, status)
VALUES ('22222222-2222-2222-2222-222222222222','dddd0000-0000-0000-0000-000000000001',
        '33333333-3333-3333-3333-333333333333', '2026-09-20', 'absent'),
       ('22222222-2222-2222-2222-222222222222','dddd0000-0000-0000-0000-000000000001',
        '33333333-3333-3333-3333-333333333333', '2026-09-21', 'present');
INSERT INTO public.recitation_assessments (session_id, student_id, teacher_id, score, approved)
VALUES ('abcd0000-0000-0000-0000-000000000042','22222222-2222-2222-2222-222222222222',
        '33333333-3333-3333-3333-333333333333', 88, true);
INSERT INTO public._t SELECT 'notify absence: ' || CASE WHEN count(*) = 1 THEN 'ok' ELSE 'FAILED' END
  FROM public.notifications WHERE user_id = '66666666-6666-6666-6666-666666666666' AND title LIKE 'غياب%';
INSERT INTO public._t SELECT 'notify assessment: ' || CASE WHEN count(*) = 1 THEN 'ok' ELSE 'FAILED' END
  FROM public.notifications WHERE user_id = '66666666-6666-6666-6666-666666666666' AND title LIKE 'اعتُمد تسميع%';
INSERT INTO public._t SELECT 'notify strangers: ' || CASE WHEN count(*) = 0 THEN 'none' ELSE 'LEAKED!' END
  FROM public.notifications WHERE user_id = '77777777-7777-7777-7777-777777777777';
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '66666666-6666-6666-6666-666666666666';
INSERT INTO public._t SELECT 'notify overview counts: '
  || CASE WHEN (o->'attendance_30d'->>'absent')::int >= 1 AND jsonb_array_length(o->'assessments') >= 1
          THEN 'ok' ELSE 'FAILED ' || o::text END
  FROM (SELECT public.guardian_child_overview('22222222-2222-2222-2222-222222222222') AS o) s;
RESET ROLE;
RESET "request.jwt.claim.sub";
SELECT code FROM public._t WHERE code LIKE 'notify %';

-- @@ 46. ولي الأمر ↔ معلّم ابنه فقط، وفكّ الربط يوقف المتابعة والمراسلة
DELETE FROM public._t;
INSERT INTO public._t VALUES ('gchat teacher of child: '
  || CASE WHEN private.can_start_chat('66666666-6666-6666-6666-666666666666','33333333-3333-3333-3333-333333333333')
          THEN 'ok' ELSE 'FAILED' END);
INSERT INTO public._t VALUES ('gchat other teacher: '
  || CASE WHEN private.can_start_chat('66666666-6666-6666-6666-666666666666','11111111-1111-1111-1111-111111111111')
          THEN 'ALLOWED!' ELSE 'rejected' END);
INSERT INTO public._t VALUES ('gchat other student: '
  || CASE WHEN private.can_start_chat('66666666-6666-6666-6666-666666666666','44444444-4444-4444-4444-444444444444')
          THEN 'ALLOWED!' ELSE 'rejected' END);
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '66666666-6666-6666-6666-666666666666';
INSERT INTO public._t SELECT 'gchat contacts: '
  || CASE WHEN array_agg(c ORDER BY c) = ARRAY['33333333-3333-3333-3333-333333333333'::uuid]
          THEN 'ok' ELSE 'FAILED ' || array_agg(c)::text END
  FROM public.my_chat_contacts() c;
-- الطالب يفكّ الربط بنفسه.
SET "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
DELETE FROM public.guardian_links WHERE student_id = '22222222-2222-2222-2222-222222222222';
SET "request.jwt.claim.sub" = '66666666-6666-6666-6666-666666666666';
DO $$ BEGIN
  PERFORM public.guardian_child_overview('22222222-2222-2222-2222-222222222222');
  INSERT INTO public._t VALUES ('gchat overview after unlink: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('gchat overview after unlink: rejected');
END $$;
RESET ROLE;
RESET "request.jwt.claim.sub";
INSERT INTO public._t VALUES ('gchat after unlink: '
  || CASE WHEN private.can_start_chat('66666666-6666-6666-6666-666666666666','33333333-3333-3333-3333-333333333333')
          THEN 'ALLOWED!' ELSE 'rejected' END);
SELECT code FROM public._t WHERE code LIKE 'gchat %';

-- @@ 47. طاقم المركز: الرمز يصدره منشئ المركز وحده، ويُستخدم مرة واحدة، والتخمين محدود
DELETE FROM public._t;
SET ROLE authenticated;
-- معلّم ليس منشئ المركز لا يصدر رمزاً.
SET "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
DO $$ BEGIN
  PERFORM public.create_center_staff_code('cccc0000-0000-0000-0000-000000000001', 'manager');
  INSERT INTO public._t VALUES ('staff code by non-owner: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('staff code by non-owner: rejected');
END $$;
SET "request.jwt.claim.sub" = '33333333-3333-3333-3333-333333333333';
INSERT INTO public._codes SELECT 'staff_sup', public.create_center_staff_code('cccc0000-0000-0000-0000-000000000001', 'supervisor')->>'code';
-- غريب: رمز خاطئ، ثم الصحيح.
SET "request.jwt.claim.sub" = '77777777-7777-7777-7777-777777777777';
INSERT INTO public._t SELECT 'staff wrong code: '
  || CASE WHEN (public.claim_center_staff_code('XXXXXXXXXX')->>'ok')::boolean THEN 'ALLOWED!' ELSE 'rejected' END;
INSERT INTO public._t SELECT 'staff claim: '
  || CASE WHEN (public.claim_center_staff_code(code)->>'ok')::boolean THEN 'ok' ELSE 'FAILED' END
  FROM public._codes WHERE k = 'staff_sup';
INSERT INTO public._t SELECT 'staff row visible to self: ' || CASE WHEN count(*) = 1 THEN 'ok' ELSE 'FAILED' END
  FROM public.center_staff WHERE user_id = '77777777-7777-7777-7777-777777777777' AND role = 'supervisor';
DO $$ BEGIN
  INSERT INTO public.center_staff (center_id, user_id, role)
  VALUES ('cccc0000-0000-0000-0000-000000000002', '77777777-7777-7777-7777-777777777777', 'manager');
  INSERT INTO public._t VALUES ('staff direct insert: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('staff direct insert: rejected');
END $$;
-- الرمز لا يُستخدم مرتين.
SET "request.jwt.claim.sub" = '44444444-4444-4444-4444-444444444444';
INSERT INTO public._t SELECT 'staff code reuse: '
  || CASE WHEN (public.claim_center_staff_code(code)->>'ok')::boolean THEN 'REUSED!' ELSE 'rejected' END
  FROM public._codes WHERE k = 'staff_sup';
INSERT INTO public._t SELECT 'staff hidden from outsider: ' || CASE WHEN count(*) = 0 THEN 'none' ELSE 'LEAKED!' END
  FROM public.center_staff;
DO $$ DECLARE i integer; r jsonb; BEGIN
  FOR i IN 1..12 LOOP r := public.claim_center_staff_code('BAD' || i); END LOOP;
  INSERT INTO public._t VALUES ('staff rate limit: '
    || CASE WHEN r->>'error' LIKE 'محاولات كثيرة%' THEN 'ok' ELSE 'FAILED ' || r::text END);
END $$;
-- المنشئ يرى طاقمه.
SET "request.jwt.claim.sub" = '33333333-3333-3333-3333-333333333333';
INSERT INTO public._t SELECT 'staff list to owner: ' || CASE WHEN count(*) = 1 THEN 'ok' ELSE 'FAILED' END
  FROM public.center_staff_list('cccc0000-0000-0000-0000-000000000001');
RESET ROLE;
RESET "request.jwt.claim.sub";
INSERT INTO public._t SELECT 'staff owner notified: ' || CASE WHEN count(*) = 1 THEN 'ok' ELSE 'FAILED' END
  FROM public.notifications WHERE user_id = '33333333-3333-3333-3333-333333333333' AND kind = 'center';
SELECT code FROM public._t WHERE code LIKE 'staff %';

-- @@ 48. لوحة المركز: لطاقمه فقط، بلا وصول مباشر لجداول الطلاب وبلا بيانات خاصة
DELETE FROM public._t;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '77777777-7777-7777-7777-777777777777';
DO $$
DECLARE d jsonb; n integer;
BEGIN
  d := public.center_dashboard('cccc0000-0000-0000-0000-000000000001', 30);
  INSERT INTO public._t VALUES ('dash supervisor: '
    || CASE WHEN jsonb_array_length(d->'halaqat') = 2
             AND (d->'totals'->>'students')::int = 2
             AND (d->'totals'->>'attendance_records')::int >= 2
             AND jsonb_array_length(d->'teachers') = 2
             AND (d->>'can_manage')::boolean = false
             AND d ? 'at_risk' AND d ? 'weekly'
            THEN 'ok' ELSE 'FAILED ' || d::text END);
  INSERT INTO public._t VALUES ('dash private data: '
    || CASE WHEN d::text LIKE '%+967%' OR d::text LIKE '%muhasaba%' OR d::text LIKE '%audio%'
            THEN 'LEAKED!' ELSE 'hidden' END);
  SELECT (SELECT count(*) FROM public.attendance)
       + (SELECT count(*) FROM public.recitation_sessions)
       + (SELECT count(*) FROM public.mushaf_records) INTO n;
  INSERT INTO public._t VALUES ('dash direct tables: ' || CASE WHEN n = 0 THEN 'none' ELSE 'ALLOWED!' END);
  BEGIN
    PERFORM public.center_dashboard('cccc0000-0000-0000-0000-000000000002', 30);
    INSERT INTO public._t VALUES ('dash other center: ALLOWED!');
  EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('dash other center: rejected');
  END;
  SELECT count(*) INTO n FROM public.my_managed_centers();
  INSERT INTO public._t VALUES ('dash my centers: ' || CASE WHEN n = 1 THEN 'ok' ELSE 'FAILED' END);
  SELECT count(*) INTO n FROM public.center_students('cccc0000-0000-0000-0000-000000000001');
  INSERT INTO public._t VALUES ('dash students list: ' || CASE WHEN n = 2 THEN 'ok' ELSE 'FAILED' END);
END $$;
SET "request.jwt.claim.sub" = '44444444-4444-4444-4444-444444444444';
DO $$ BEGIN
  PERFORM public.center_dashboard('cccc0000-0000-0000-0000-000000000001', 30);
  INSERT INTO public._t VALUES ('dash outsider: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('dash outsider: rejected');
END $$;
INSERT INTO public._t SELECT 'dash outsider students: ' || CASE WHEN count(*) = 0 THEN 'none' ELSE 'LEAKED!' END
  FROM public.center_students('cccc0000-0000-0000-0000-000000000001');
-- المنشئ يرى لوحته ويملك الإدارة.
SET "request.jwt.claim.sub" = '33333333-3333-3333-3333-333333333333';
INSERT INTO public._t SELECT 'dash owner: '
  || CASE WHEN (d->>'can_manage')::boolean THEN 'ok' ELSE 'FAILED' END
  FROM (SELECT public.center_dashboard('cccc0000-0000-0000-0000-000000000001') AS d) s;
RESET ROLE;
RESET "request.jwt.claim.sub";
SELECT code FROM public._t WHERE code LIKE 'dash %';

-- @@ 49. مواعيد الحلقات: يكتبها معلّم الحلقة أو مدير المركز، ويراها أعضاؤها فقط
DELETE FROM public._t;
SET ROLE authenticated;
-- المشرف لا يكتب المواعيد.
SET "request.jwt.claim.sub" = '77777777-7777-7777-7777-777777777777';
DO $$ BEGIN
  INSERT INTO public.halaqa_schedule (halaqa_id, weekday, start_time, end_time, created_by)
  VALUES ('dddd0000-0000-0000-0000-000000000001', 0, '16:00', '17:00', '77777777-7777-7777-7777-777777777777');
  INSERT INTO public._t VALUES ('sched by supervisor: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('sched by supervisor: rejected');
END $$;
-- معلّم الحلقة يكتب موعد حلقته.
SET "request.jwt.claim.sub" = '33333333-3333-3333-3333-333333333333';
INSERT INTO public.halaqa_schedule (halaqa_id, weekday, start_time, end_time, location, created_by)
VALUES ('dddd0000-0000-0000-0000-000000000001', 0, '05:30', '06:30', 'المسجد', '33333333-3333-3333-3333-333333333333');
DO $$ BEGIN
  INSERT INTO public.halaqa_schedule (halaqa_id, weekday, start_time, end_time, created_by)
  VALUES ('dddd0000-0000-0000-0000-000000000001', 1, '07:00', '06:00', '33333333-3333-3333-3333-333333333333');
  INSERT INTO public._t VALUES ('sched bad time: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('sched bad time: rejected');
END $$;
-- معلّم حلقة أخرى في المركز نفسه لا يكتب موعد حلقة ليست له.
SET "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
DO $$ BEGIN
  INSERT INTO public.halaqa_schedule (halaqa_id, weekday, start_time, end_time, created_by)
  VALUES ('dddd0000-0000-0000-0000-000000000001', 2, '16:00', '17:00', '11111111-1111-1111-1111-111111111111');
  INSERT INTO public._t VALUES ('sched other halaqa: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('sched other halaqa: rejected');
END $$;
INSERT INTO public.halaqa_schedule (halaqa_id, weekday, start_time, end_time, created_by)
VALUES ('dddd0000-0000-0000-0000-000000000002', 3, '15:30', '16:30', '11111111-1111-1111-1111-111111111111');
-- الطالب يرى موعد حلقته فقط.
SET "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
INSERT INTO public._t SELECT 'sched student sees own: '
  || CASE WHEN count(*) = 1 AND bool_and(halaqa_id = 'dddd0000-0000-0000-0000-000000000001') THEN 'ok' ELSE 'FAILED' END
  FROM public.halaqa_schedule;
INSERT INTO public._t SELECT 'sched my schedule: '
  || CASE WHEN count(*) = 1 AND bool_and(as_role = 'student' AND teacher_name IS NOT NULL) THEN 'ok' ELSE 'FAILED' END
  FROM public.my_halaqa_schedule();
SET "request.jwt.claim.sub" = '44444444-4444-4444-4444-444444444444';
INSERT INTO public._t SELECT 'sched outsider: ' || CASE WHEN count(*) = 0 THEN 'none' ELSE 'LEAKED!' END
  FROM public.halaqa_schedule;
-- المشرف يرى مواعيد مركزه.
SET "request.jwt.claim.sub" = '77777777-7777-7777-7777-777777777777';
INSERT INTO public._t SELECT 'sched supervisor reads: ' || CASE WHEN count(*) = 2 THEN 'ok' ELSE 'FAILED' END
  FROM public.halaqa_schedule;
RESET ROLE;
RESET "request.jwt.claim.sub";
SELECT code FROM public._t WHERE code LIKE 'sched %';

-- @@ 50. مدير المركز يدير المواعيد، والانسحاب من الطاقم يوقف الوصول
DELETE FROM public._t;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '33333333-3333-3333-3333-333333333333';
INSERT INTO public._codes SELECT 'staff_mgr', public.create_center_staff_code('cccc0000-0000-0000-0000-000000000001', 'manager')->>'code';
SET "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555555';
INSERT INTO public._t SELECT 'mgr claim: '
  || CASE WHEN (public.claim_center_staff_code(code)->>'role') = 'manager' THEN 'ok' ELSE 'FAILED' END
  FROM public._codes WHERE k = 'staff_mgr';
DO $$ BEGIN
  INSERT INTO public.halaqa_schedule (halaqa_id, weekday, start_time, end_time, online_url, created_by)
  VALUES ('dddd0000-0000-0000-0000-000000000002', 4, '19:00', '20:00', 'https://meet.example.com/x',
          '55555555-5555-5555-5555-555555555555');
  INSERT INTO public._t VALUES ('mgr writes schedule: ok');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('mgr writes schedule: FAILED ' || SQLERRM);
END $$;
DO $$ BEGIN
  INSERT INTO public.halaqa_schedule (halaqa_id, weekday, start_time, end_time, created_by)
  VALUES ('dddd0000-0000-0000-0000-000000000003', 4, '19:00', '20:00', '55555555-5555-5555-5555-555555555555');
  INSERT INTO public._t VALUES ('mgr other center: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('mgr other center: rejected');
END $$;
-- المشرف ينسحب بنفسه.
SET "request.jwt.claim.sub" = '77777777-7777-7777-7777-777777777777';
DELETE FROM public.center_staff WHERE user_id = '77777777-7777-7777-7777-777777777777';
DO $$ BEGIN
  PERFORM public.center_dashboard('cccc0000-0000-0000-0000-000000000001');
  INSERT INTO public._t VALUES ('mgr after leave: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('mgr after leave: rejected');
END $$;
-- عضو الطاقم لا يحذف غيره.
SET "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555555';
DELETE FROM public.center_staff WHERE center_id = 'cccc0000-0000-0000-0000-000000000001'
  AND user_id <> '55555555-5555-5555-5555-555555555555';
RESET ROLE;
RESET "request.jwt.claim.sub";
INSERT INTO public._t SELECT 'mgr staff count: ' || CASE WHEN count(*) = 1 THEN 'ok' ELSE 'FAILED' END
  FROM public.center_staff WHERE center_id = 'cccc0000-0000-0000-0000-000000000001';
SELECT code FROM public._t WHERE code LIKE 'mgr %';

-- @@ 51. تقرير الطالب: له ولمعلّمه ولطاقم مركزه فقط
DELETE FROM public._t;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
INSERT INTO public._t SELECT 'report self: '
  || CASE WHEN r->'student'->>'name' IS NOT NULL AND (r->'attendance_summary'->>'absent')::int >= 1
             AND jsonb_array_length(r->'assessments') >= 1 AND jsonb_array_length(r->'halaqat') = 1
          THEN 'ok' ELSE 'FAILED ' || r::text END
  FROM (SELECT public.student_report('22222222-2222-2222-2222-222222222222', '2026-09-01', '2026-12-31') AS r) s;
SET "request.jwt.claim.sub" = '33333333-3333-3333-3333-333333333333';
INSERT INTO public._t SELECT 'report teacher: '
  || CASE WHEN r ? 'mushaf' AND r ? 'exams' THEN 'ok' ELSE 'FAILED' END
  FROM (SELECT public.student_report('22222222-2222-2222-2222-222222222222', '2026-09-01', '2026-12-31') AS r) s;
-- مدير المركز (زيد) يرى تقرير طالب في مركزه.
SET "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555555';
INSERT INTO public._t SELECT 'report center manager: '
  || CASE WHEN r->'student'->>'id' = '22222222-2222-2222-2222-222222222222' THEN 'ok' ELSE 'FAILED' END
  FROM (SELECT public.student_report('22222222-2222-2222-2222-222222222222', '2026-09-01', '2026-12-31') AS r) s;
DO $$ DECLARE r jsonb; BEGIN
  r := public.student_report('22222222-2222-2222-2222-222222222222', '2026-09-01', '2026-12-31');
  INSERT INTO public._t VALUES ('report private data: '
    || CASE WHEN r::text LIKE '%+967%' OR r::text LIKE '%muhasaba%' OR r::text LIKE '%audio%'
            THEN 'LEAKED!' ELSE 'hidden' END);
END $$;
-- معلّم في المركز لا يدرّس الطالب وليس من طاقمه، والغريب: مرفوضان.
SET "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
DO $$ BEGIN
  PERFORM public.student_report('22222222-2222-2222-2222-222222222222', '2026-09-01', '2026-12-31');
  INSERT INTO public._t VALUES ('report other teacher: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('report other teacher: rejected');
END $$;
SET "request.jwt.claim.sub" = '77777777-7777-7777-7777-777777777777';
DO $$ BEGIN
  PERFORM public.student_report('22222222-2222-2222-2222-222222222222', '2026-09-01', '2026-12-31');
  INSERT INTO public._t VALUES ('report stranger: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('report stranger: rejected');
END $$;
SET "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
DO $$ BEGIN
  PERFORM public.student_report('22222222-2222-2222-2222-222222222222', '2024-01-01', '2026-12-31');
  INSERT INTO public._t VALUES ('report too long: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('report too long: rejected');
END $$;
RESET ROLE;
RESET "request.jwt.claim.sub";
SELECT code FROM public._t WHERE code LIKE 'report %';

-- @@ 52. التقرير الأسبوعي لولي الأمر: للخادم فقط، ومرة واحدة في الأسبوع
DELETE FROM public._t;
INSERT INTO public.guardian_links (guardian_id, student_id, relation)
VALUES ('66666666-6666-6666-6666-666666666666', '22222222-2222-2222-2222-222222222222', 'father');
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '66666666-6666-6666-6666-666666666666';
DO $$ BEGIN
  PERFORM public.send_guardian_weekly_reports();
  INSERT INTO public._t VALUES ('weekly by user: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('weekly by user: rejected');
END $$;
RESET ROLE;
RESET "request.jwt.claim.sub";
INSERT INTO public._t SELECT 'weekly first run: ' || CASE WHEN public.send_guardian_weekly_reports() = 1 THEN 'ok' ELSE 'FAILED' END;
INSERT INTO public._t SELECT 'weekly second run: ' || CASE WHEN public.send_guardian_weekly_reports() = 0 THEN 'ok' ELSE 'FAILED' END;
INSERT INTO public._t SELECT 'weekly notification: '
  || CASE WHEN count(*) = 1 AND bool_and(title LIKE 'التقرير الأسبوعي%' AND body <> '') THEN 'ok' ELSE 'FAILED' END
  FROM public.notifications WHERE user_id = '66666666-6666-6666-6666-666666666666' AND kind = 'guardian_weekly';
INSERT INTO public._t SELECT 'weekly strangers: ' || CASE WHEN count(*) = 0 THEN 'none' ELSE 'LEAKED!' END
  FROM public.notifications WHERE kind = 'guardian_weekly' AND user_id <> '66666666-6666-6666-6666-666666666666';
SELECT code FROM public._t WHERE code LIKE 'weekly %';

-- @@ 53. وحدات المصحف: 114 سورة و60 حزباً و30 جزءاً، تغطي الصفحات كلها، وللقراءة فقط
DELETE FROM public._t;
INSERT INTO public._t SELECT 'units counts: '
  || CASE WHEN (SELECT count(*) FROM public.quran_units WHERE kind = 'surah') = 114
           AND (SELECT count(*) FROM public.quran_units WHERE kind = 'hizb') = 60
           AND (SELECT count(*) FROM public.quran_units WHERE kind = 'juz') = 30 THEN 'ok' ELSE 'FAILED' END;
INSERT INTO public._t SELECT 'units ranges: '
  || CASE WHEN (SELECT first_page || '-' || last_page FROM public.quran_units WHERE kind = 'surah' AND no = 2) = '2-49'
           AND (SELECT first_page || '-' || last_page FROM public.quran_units WHERE kind = 'juz' AND no = 30) = '582-604'
           AND (SELECT count(DISTINCT p) FROM public.quran_units u, generate_series(u.first_page::int, u.last_page::int) p
                 WHERE u.kind = 'hizb') = 604 THEN 'ok' ELSE 'FAILED' END;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
DO $$ BEGIN
  UPDATE public.quran_units SET last_page = 1 WHERE kind = 'juz' AND no = 30;
  INSERT INTO public._t VALUES ('units write: ' || CASE WHEN FOUND THEN 'ALLOWED!' ELSE 'rejected' END);
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('units write: rejected');
END $$;
RESET ROLE;
RESET "request.jwt.claim.sub";
SELECT code FROM public._t WHERE code LIKE 'units %';

-- @@ 54. الورد اليومي: لليوم أو الأمس فقط، ولصاحبه، ويراه معلّمه لا الغريب
DELETE FROM public._t;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
INSERT INTO public.daily_wird (student_id, day, pages) VALUES
  ('22222222-2222-2222-2222-222222222222', public.zen_today(), 5),
  ('22222222-2222-2222-2222-222222222222', public.zen_today() - 1, NULL);
DO $$ BEGIN
  INSERT INTO public.daily_wird (student_id, day) VALUES ('22222222-2222-2222-2222-222222222222', public.zen_today() - 3);
  INSERT INTO public._t VALUES ('wird backfill: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('wird backfill: rejected');
END $$;
DO $$ BEGIN
  INSERT INTO public.daily_wird (student_id, day) VALUES ('44444444-4444-4444-4444-444444444444', public.zen_today());
  INSERT INTO public._t VALUES ('wird for other: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('wird for other: rejected');
END $$;
INSERT INTO public._t SELECT 'wird streak self: '
  || CASE WHEN (a->'streak'->>'current')::int >= 2 AND (a->'streak'->>'wird_today')::boolean
          THEN 'ok' ELSE 'FAILED ' || (a->'streak')::text END
  FROM (SELECT public.student_achievements('22222222-2222-2222-2222-222222222222') AS a) s;
SET "request.jwt.claim.sub" = '33333333-3333-3333-3333-333333333333';
INSERT INTO public._t SELECT 'wird teacher reads: ' || CASE WHEN count(*) = 2 THEN 'ok' ELSE 'FAILED' END
  FROM public.daily_wird WHERE student_id = '22222222-2222-2222-2222-222222222222';
SET "request.jwt.claim.sub" = '77777777-7777-7777-7777-777777777777';
INSERT INTO public._t SELECT 'wird outsider: ' || CASE WHEN count(*) = 0 THEN 'none' ELSE 'LEAKED!' END
  FROM public.daily_wird;
RESET ROLE;
RESET "request.jwt.claim.sub";
SELECT code FROM public._t WHERE code LIKE 'wird %';

-- @@ 55. الأوسمة: تُمنح من سجل المصحف تلقائياً، ولا يكتبها المستخدم، ولا يراها الغريب
DELETE FROM public._t;
DELETE FROM public.notifications WHERE kind IN ('achievement', 'certificate');
INSERT INTO public.mushaf_records (student_id, teacher_id, halaqa_id, page, kind)
SELECT '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333',
       'dddd0000-0000-0000-0000-000000000001', p, 'memorize'
  FROM generate_series(582, 604) p;
INSERT INTO public._t SELECT 'badges juz30: '
  || CASE WHEN EXISTS (SELECT 1 FROM public.student_badges WHERE student_id = '22222222-2222-2222-2222-222222222222' AND kind = 'juz' AND no = 30)
           AND EXISTS (SELECT 1 FROM public.student_badges WHERE student_id = '22222222-2222-2222-2222-222222222222' AND kind = 'hizb' AND no = 60)
           AND EXISTS (SELECT 1 FROM public.student_badges WHERE student_id = '22222222-2222-2222-2222-222222222222' AND kind = 'surah' AND no = 114)
           AND NOT EXISTS (SELECT 1 FROM public.student_badges WHERE student_id = '22222222-2222-2222-2222-222222222222' AND kind = 'juz' AND no = 29)
          THEN 'ok' ELSE 'FAILED' END;
INSERT INTO public._t SELECT 'badges certificate pending: '
  || CASE WHEN count(*) = 1 AND bool_and(status = 'pending' AND student_name = 'بلال') THEN 'ok' ELSE 'FAILED' END
  FROM public.certificates WHERE student_id = '22222222-2222-2222-2222-222222222222';
INSERT INTO public._t SELECT 'badges notified: '
  || CASE WHEN (SELECT count(*) FROM public.notifications WHERE user_id = '22222222-2222-2222-2222-222222222222' AND kind = 'achievement') >= 1
           AND (SELECT count(*) FROM public.notifications WHERE user_id = '66666666-6666-6666-6666-666666666666' AND kind = 'achievement') >= 1
           AND (SELECT count(*) FROM public.notifications WHERE user_id = '33333333-3333-3333-3333-333333333333' AND kind = 'certificate') = 1
          THEN 'ok' ELSE 'FAILED' END;
INSERT INTO public._t SELECT 'badges strangers: ' || CASE WHEN count(*) = 0 THEN 'none' ELSE 'LEAKED!' END
  FROM public.notifications WHERE kind IN ('achievement', 'certificate')
   AND user_id NOT IN ('22222222-2222-2222-2222-222222222222', '66666666-6666-6666-6666-666666666666',
                       '33333333-3333-3333-3333-333333333333');
-- صياغة تصلح للابن والبنت (20261207100000): لا «لابنك» في العنوان، والاسم في النص.
INSERT INTO public._t SELECT 'badges guardian neutral: '
  || CASE WHEN count(*) >= 1 AND bool_and(title = 'إنجاز جديد' AND body LIKE 'بلال: %') THEN 'ok' ELSE 'FAILED' END
  FROM public.notifications WHERE user_id = '66666666-6666-6666-6666-666666666666' AND kind = 'achievement';
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
DO $$ BEGIN
  INSERT INTO public.student_badges (student_id, kind, no) VALUES ('22222222-2222-2222-2222-222222222222', 'juz', 1);
  INSERT INTO public._t VALUES ('badges self award: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('badges self award: rejected');
END $$;
DO $$ BEGIN
  PERFORM public.award_badges('22222222-2222-2222-2222-222222222222');
  INSERT INTO public._t VALUES ('badges call award: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('badges call award: rejected');
END $$;
INSERT INTO public._t SELECT 'badges self view: '
  || CASE WHEN jsonb_array_length(a->'badges') >= 3 AND (a->>'memorized_pages')::int >= 23 THEN 'ok' ELSE 'FAILED' END
  FROM (SELECT public.student_achievements('22222222-2222-2222-2222-222222222222') AS a) s;
SET "request.jwt.claim.sub" = '66666666-6666-6666-6666-666666666666';
INSERT INTO public._t SELECT 'badges guardian view: ' || CASE WHEN count(*) >= 3 THEN 'ok' ELSE 'FAILED' END
  FROM public.student_badges WHERE student_id = '22222222-2222-2222-2222-222222222222';
SET "request.jwt.claim.sub" = '77777777-7777-7777-7777-777777777777';
INSERT INTO public._t SELECT 'badges outsider rows: ' || CASE WHEN count(*) = 0 THEN 'none' ELSE 'LEAKED!' END
  FROM (SELECT 1 FROM public.student_badges UNION ALL SELECT 1 FROM public.certificates) x;
DO $$ BEGIN
  PERFORM public.student_achievements('22222222-2222-2222-2222-222222222222');
  INSERT INTO public._t VALUES ('badges outsider view: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('badges outsider view: rejected');
END $$;
RESET ROLE;
RESET "request.jwt.claim.sub";
SELECT code FROM public._t WHERE code LIKE 'badges %';

-- @@ 56. الشهادة: يعتمدها معلّم الطالب وحده
DELETE FROM public._t;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
DO $$ BEGIN
  PERFORM public.decide_certificate((SELECT id FROM public.certificates LIMIT 1), true);
  INSERT INTO public._t VALUES ('cert self approve: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('cert self approve: rejected');
END $$;
SET "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
DO $$ BEGIN
  PERFORM public.decide_certificate(
    (SELECT id FROM public.certificates WHERE student_id = '22222222-2222-2222-2222-222222222222'), true);
  INSERT INTO public._t VALUES ('cert other teacher: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('cert other teacher: rejected');
END $$;
SET "request.jwt.claim.sub" = '33333333-3333-3333-3333-333333333333';
INSERT INTO public._t SELECT 'cert pending list: ' || CASE WHEN count(*) = 1 THEN 'ok' ELSE 'FAILED' END
  FROM public.my_pending_certificates();
DO $$ BEGIN
  UPDATE public.certificates SET status = 'approved';
  INSERT INTO public._t VALUES ('cert direct update: ' || CASE WHEN FOUND THEN 'ALLOWED!' ELSE 'rejected' END);
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('cert direct update: rejected');
END $$;
INSERT INTO public._t SELECT 'cert approve: ' || CASE WHEN (r->>'status') = 'approved' THEN 'ok' ELSE 'FAILED' END
  FROM (SELECT public.decide_certificate(
    (SELECT id FROM public.certificates WHERE student_id = '22222222-2222-2222-2222-222222222222'), true, 'ما شاء الله') AS r) s;
RESET ROLE;
RESET "request.jwt.claim.sub";
INSERT INTO public._t SELECT 'cert stored: '
  || CASE WHEN status = 'approved' AND decided_by = '33333333-3333-3333-3333-333333333333'
           AND teacher_note = 'ما شاء الله' AND length(serial) = 10 THEN 'ok' ELSE 'FAILED' END
  FROM public.certificates WHERE student_id = '22222222-2222-2222-2222-222222222222';
INSERT INTO public._t SELECT 'cert notified: ' || CASE WHEN count(*) = 1 THEN 'ok' ELSE 'FAILED' END
  FROM public.notifications WHERE user_id = '22222222-2222-2222-2222-222222222222' AND title = 'اعتُمدت شهادتك';
INSERT INTO public._t SELECT 'cert guardian neutral: '
  || CASE WHEN count(*) = 1 AND bool_and(title = 'شهادة إتمام' AND body LIKE 'بلال: إتمام حفظ الجزء %، واعتُمدت الشهادة.') THEN 'ok' ELSE 'FAILED' END
  FROM public.notifications WHERE user_id = '66666666-6666-6666-6666-666666666666' AND kind = 'certificate';
SELECT code FROM public._t WHERE code LIKE 'cert %';

-- @@ 57. لوحة الشرف: يفعّلها المعلّم، ويراها أعضاء الحلقة، ولا درجات فيها
DELETE FROM public._t;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
INSERT INTO public._t SELECT 'honor off: ' || CASE WHEN (b->>'enabled')::boolean = false
         AND jsonb_array_length(b->'rows') = 0 THEN 'ok' ELSE 'FAILED' END
  FROM (SELECT public.halaqa_honor_board('dddd0000-0000-0000-0000-000000000001') AS b) s;
DO $$ BEGIN
  PERFORM public.set_honor_board('dddd0000-0000-0000-0000-000000000001', true);
  INSERT INTO public._t VALUES ('honor student enables: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('honor student enables: rejected');
END $$;
SET "request.jwt.claim.sub" = '33333333-3333-3333-3333-333333333333';
SELECT public.set_honor_board('dddd0000-0000-0000-0000-000000000001', true);
SET "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
INSERT INTO public._t SELECT 'honor member view: '
  || CASE WHEN jsonb_array_length(b->'rows') = 1 AND (b->'rows'->0->>'is_me')::boolean
           AND (b->'rows'->0->>'active_30')::int >= 2 AND (b->'rows'->0->>'badges')::int >= 3
          THEN 'ok' ELSE 'FAILED ' || b::text END
  FROM (SELECT public.halaqa_honor_board('dddd0000-0000-0000-0000-000000000001') AS b) s;
INSERT INTO public._t SELECT 'honor no scores: '
  || CASE WHEN b::text NOT LIKE '%score%' AND b::text NOT LIKE '%phone%' THEN 'ok' ELSE 'LEAKED!' END
  FROM (SELECT public.halaqa_honor_board('dddd0000-0000-0000-0000-000000000001') AS b) s;
SET "request.jwt.claim.sub" = '77777777-7777-7777-7777-777777777777';
DO $$ BEGIN
  PERFORM public.halaqa_honor_board('dddd0000-0000-0000-0000-000000000001');
  INSERT INTO public._t VALUES ('honor outsider: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('honor outsider: rejected');
END $$;
RESET ROLE;
RESET "request.jwt.claim.sub";
SELECT code FROM public._t WHERE code LIKE 'honor %';

-- @@ 58. التحديات الجماعية: ينشئها المعلّم، ويشارك فيها الأعضاء فقط، وتُعلَن عند اكتمالها
DELETE FROM public._t;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
DO $$ BEGIN
  INSERT INTO public.halaqa_challenges (halaqa_id, title, kind, target, starts_on, ends_on, created_by)
  VALUES ('dddd0000-0000-0000-0000-000000000001', 'تحدي طالب', 'pages', 10, public.zen_today(), public.zen_today() + 7,
          '22222222-2222-2222-2222-222222222222');
  INSERT INTO public._t VALUES ('chal student creates: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('chal student creates: rejected');
END $$;
SET "request.jwt.claim.sub" = '33333333-3333-3333-3333-333333333333';
INSERT INTO public.halaqa_challenges (id, halaqa_id, title, kind, target, starts_on, ends_on, created_by) VALUES
  ('eeee0000-0000-0000-0000-000000000001', 'dddd0000-0000-0000-0000-000000000001', 'ختمة رمضان', 'khatma', 30,
   public.zen_today(), public.zen_today() + 29, '33333333-3333-3333-3333-333333333333'),
  ('eeee0000-0000-0000-0000-000000000002', 'dddd0000-0000-0000-0000-000000000001', 'مئة صفحة', 'pages', 100,
   public.zen_today(), public.zen_today() + 7, '33333333-3333-3333-3333-333333333333');
DO $$ BEGIN
  INSERT INTO public.halaqa_challenges (halaqa_id, title, kind, target, starts_on, ends_on, created_by)
  VALUES ('dddd0000-0000-0000-0000-000000000003', 'ليست حلقتي', 'pages', 10, public.zen_today(), public.zen_today(),
          '33333333-3333-3333-3333-333333333333');
  INSERT INTO public._t VALUES ('chal other halaqa: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('chal other halaqa: rejected');
END $$;
SET "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
DO $$ BEGIN
  INSERT INTO public.challenge_parts (challenge_id, part, claimed_by)
  VALUES ('eeee0000-0000-0000-0000-000000000001', 1, '22222222-2222-2222-2222-222222222222');
  INSERT INTO public._t VALUES ('chal direct part: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('chal direct part: rejected');
END $$;
INSERT INTO public._t SELECT 'chal claim: ' || CASE WHEN (public.challenge_part_action('eeee0000-0000-0000-0000-000000000001', 1, 'claim')->>'ok')::boolean THEN 'ok' ELSE 'FAILED' END;
INSERT INTO public._t SELECT 'chal taken: ' || CASE WHEN public.challenge_part_action('eeee0000-0000-0000-0000-000000000001', 1, 'claim')->>'error' = 'taken' THEN 'ok' ELSE 'FAILED' END;
SELECT public.challenge_part_action('eeee0000-0000-0000-0000-000000000001', 2, 'claim');
SELECT public.challenge_part_action('eeee0000-0000-0000-0000-000000000001', 3, 'claim');
INSERT INTO public._t SELECT 'chal claim limit: ' || CASE WHEN public.challenge_part_action('eeee0000-0000-0000-0000-000000000001', 4, 'claim')->>'error' = 'limit' THEN 'ok' ELSE 'FAILED' END;
SELECT public.challenge_part_action('eeee0000-0000-0000-0000-000000000001', 3, 'release');
DO $$ BEGIN
  FOR i IN 1..30 LOOP
    IF i >= 3 THEN PERFORM public.challenge_part_action('eeee0000-0000-0000-0000-000000000001', i, 'claim'); END IF;
    PERFORM public.challenge_part_action('eeee0000-0000-0000-0000-000000000001', i, 'done');
  END LOOP;
END $$;
DO $$ BEGIN
  PERFORM public.log_challenge_pages('eeee0000-0000-0000-0000-000000000002', 700);
  INSERT INTO public._t VALUES ('chal too many pages: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('chal too many pages: rejected');
END $$;
SELECT public.log_challenge_pages('eeee0000-0000-0000-0000-000000000002', 40);
INSERT INTO public._t SELECT 'chal view: '
  || CASE WHEN (k->>'progress')::int = 30 AND k->>'completed_at' IS NOT NULL
           AND jsonb_array_length(k->'parts') = 30
           AND (pg->>'progress')::int = 40 AND (pg->>'my_pages')::int = 40 AND pg->>'completed_at' IS NULL
           AND v->'challenges'->0->>'id' = 'eeee0000-0000-0000-0000-000000000002'
           AND NOT (v->>'can_manage')::boolean AND (v->>'is_member')::boolean
          THEN 'ok' ELSE 'FAILED ' || v::text END
  FROM (SELECT v,
               (SELECT e FROM jsonb_array_elements(v->'challenges') e WHERE e->>'kind' = 'khatma') AS k,
               (SELECT e FROM jsonb_array_elements(v->'challenges') e WHERE e->>'kind' = 'pages') AS pg
          FROM (SELECT public.halaqa_challenges_view('dddd0000-0000-0000-0000-000000000001') AS v) s0) s;
SET "request.jwt.claim.sub" = '55555555-5555-5555-5555-555555555555';
DO $$ BEGIN
  PERFORM public.log_challenge_pages('eeee0000-0000-0000-0000-000000000002', 5);
  INSERT INTO public._t VALUES ('chal non-member logs: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('chal non-member logs: rejected');
END $$;
SET "request.jwt.claim.sub" = '77777777-7777-7777-7777-777777777777';
DO $$ BEGIN
  PERFORM public.halaqa_challenges_view('dddd0000-0000-0000-0000-000000000001');
  INSERT INTO public._t VALUES ('chal outsider view: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('chal outsider view: rejected');
END $$;
INSERT INTO public._t SELECT 'chal outsider rows: ' || CASE WHEN count(*) = 0 THEN 'none' ELSE 'LEAKED!' END
  FROM public.halaqa_challenges;
RESET ROLE;
RESET "request.jwt.claim.sub";
INSERT INTO public._t SELECT 'chal completion notified: '
  || CASE WHEN count(*) = 2 THEN 'ok' ELSE 'FAILED' END
  FROM public.notifications WHERE kind = 'challenge' AND title = 'اكتمل التحدي';
SELECT code FROM public._t WHERE code LIKE 'chal %';

-- @@ 59. التقوية: دوال المحادثات للمسجّلين فقط، ومسار البحث ثابت
SELECT 'hardening ' || f || ': '
  || CASE WHEN has_function_privilege('anon', f, 'EXECUTE') THEN 'anon ALLOWED!'
          WHEN NOT has_function_privilege('authenticated', f, 'EXECUTE') THEN 'authenticated FAILED'
          ELSE 'ok' END AS code
  FROM unnest(ARRAY['private.is_chat_participant(uuid, uuid)', 'public.mark_chat_seen(uuid)',
                    'public.unread_counts()', 'public.unread_total()']) AS f
UNION ALL
SELECT 'hardening search_path ' || p.proname || ': '
  || CASE WHEN p.proconfig @> ARRAY['search_path=""'] THEN 'ok' ELSE 'FAILED ' || coalesce(p.proconfig::text, 'null') END
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname IN ('storage_folder_uuid', 'sm2_quality')
UNION ALL
SELECT 'hardening sm2 still works: '
  || CASE WHEN public.sm2_quality(90) = 4 AND public.storage_folder_uuid('11111111-1111-1111-1111-111111111111/x.webm') IS NOT NULL
          AND public.storage_folder_uuid('bad/x') IS NULL THEN 'ok' ELSE 'FAILED' END;

-- @@ 60. غرف الحلقة: قناة الإعلانات تُنشأ لكل حلقة، ويكتب فيها المشرف وحده، ويُشعَر الطلاب وأولياء الأمور
DELETE FROM public._t;
DELETE FROM public.center_staff WHERE user_id = '77777777-7777-7777-7777-777777777777';
INSERT INTO public.halaqa_students (halaqa_id, student_id)
VALUES ('dddd0000-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444')
ON CONFLICT DO NOTHING;
INSERT INTO public._t SELECT 'room ann exists: '
  || CASE WHEN count(*) = (SELECT count(*) FROM public.halaqat) THEN 'ok' ELSE 'FAILED' END
  FROM public.halaqa_rooms WHERE kind = 'announcements';
CREATE TEMP TABLE _room AS
  SELECT id FROM public.halaqa_rooms
   WHERE halaqa_id = 'dddd0000-0000-0000-0000-000000000001' AND kind = 'announcements';
GRANT SELECT ON _room TO authenticated;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
DO $$ BEGIN
  PERFORM public.post_room_message((SELECT id FROM _room), 'إعلان من طالب');
  INSERT INTO public._t VALUES ('room student announces: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('room student announces: rejected');
END $$;
DO $$ BEGIN
  INSERT INTO public.room_messages (room_id, sender_id, content)
  VALUES ((SELECT id FROM _room), '22222222-2222-2222-2222-222222222222', 'مباشر');
  INSERT INTO public._t VALUES ('room direct insert: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('room direct insert: rejected');
END $$;
SET "request.jwt.claim.sub" = '33333333-3333-3333-3333-333333333333';
SELECT public.post_room_message((SELECT id FROM _room), 'الدرس غداً بعد الفجر');
SET "request.jwt.claim.sub" = '66666666-6666-6666-6666-666666666666';
INSERT INTO public._t SELECT 'room guardian reads: '
  || CASE WHEN count(*) = 1 THEN 'ok' ELSE 'FAILED' END FROM public.room_messages;
INSERT INTO public._t SELECT 'room guardian role: '
  || CASE WHEN private.room_role('66666666-6666-6666-6666-666666666666', (SELECT id FROM _room)) = 'reader'
          THEN 'ok' ELSE 'FAILED' END;
SET "request.jwt.claim.sub" = '77777777-7777-7777-7777-777777777777';
INSERT INTO public._t SELECT 'room outsider rows: '
  || CASE WHEN count(*) = 0 THEN 'none' ELSE 'LEAKED!' END FROM public.room_messages;
DO $$ BEGIN
  PERFORM public.room_messages_page((SELECT id FROM _room));
  INSERT INTO public._t VALUES ('room outsider page: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('room outsider page: rejected');
END $$;
RESET ROLE;
RESET "request.jwt.claim.sub";
INSERT INTO public._t SELECT 'room notified: '
  || CASE WHEN count(*) = 3 THEN 'ok' ELSE 'FAILED ' || count(*) END
  FROM public.notifications WHERE kind = 'announcement'
   AND user_id IN ('22222222-2222-2222-2222-222222222222', '44444444-4444-4444-4444-444444444444',
                   '66666666-6666-6666-6666-666666666666');
SELECT code FROM public._t WHERE code LIKE 'room %';

-- @@ 61. نقاش الحلقة: يفعّله المشرف، ولا يدخله الطالب قبل موافقة ولي أمره
DELETE FROM public._t;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
DO $$ BEGIN
  PERFORM public.set_discussion('dddd0000-0000-0000-0000-000000000001', true);
  INSERT INTO public._t VALUES ('disc student enables: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('disc student enables: rejected');
END $$;
SET "request.jwt.claim.sub" = '33333333-3333-3333-3333-333333333333';
SELECT public.set_discussion('dddd0000-0000-0000-0000-000000000001', true, true);
RESET ROLE;
DROP TABLE IF EXISTS _disc;
CREATE TEMP TABLE _disc AS
  SELECT id FROM public.halaqa_rooms
   WHERE halaqa_id = 'dddd0000-0000-0000-0000-000000000001' AND kind = 'discussion';
GRANT SELECT ON _disc TO authenticated;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
DO $$ BEGIN
  PERFORM public.post_room_message((SELECT id FROM _disc), 'قبل الموافقة');
  INSERT INTO public._t VALUES ('disc before consent: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('disc before consent: rejected');
END $$;
-- الطالب لا يوافق عن نفسه، والمعلّم لا يوافق عن طالب له وليّ أمر.
DO $$ BEGIN
  PERFORM public.set_room_consent('dddd0000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', true);
  INSERT INTO public._t VALUES ('disc self consent: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('disc self consent: rejected');
END $$;
SET "request.jwt.claim.sub" = '33333333-3333-3333-3333-333333333333';
DO $$ BEGIN
  PERFORM public.set_room_consent('dddd0000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', true);
  INSERT INTO public._t VALUES ('disc teacher overrides guardian: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('disc teacher overrides guardian: rejected');
END $$;
-- 4444 بلا وليّ أمر: يوافق المعلّم.
SELECT public.set_room_consent('dddd0000-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', true);
SET "request.jwt.claim.sub" = '66666666-6666-6666-6666-666666666666';
INSERT INTO public._t SELECT 'disc guardian sees request: '
  || CASE WHEN jsonb_array_length(public.guardian_room_consents()) = 1 THEN 'ok' ELSE 'FAILED' END;
SELECT public.set_room_consent('dddd0000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', true);
INSERT INTO public._t SELECT 'disc guardian not member: '
  || CASE WHEN private.room_role('66666666-6666-6666-6666-666666666666', (SELECT id FROM _disc)) IS NULL
          THEN 'ok' ELSE 'LEAKED!' END;
SET "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
INSERT INTO public._t SELECT 'disc after consent: '
  || CASE WHEN public.post_room_message((SELECT id FROM _disc), 'السلام عليكم') IS NOT NULL THEN 'ok' ELSE 'FAILED' END;
-- الغريب لا يكتب في النقاش، ومعلّم حلقة أخرى ليس مشرفاً عليه.
SET "request.jwt.claim.sub" = '77777777-7777-7777-7777-777777777777';
DO $$ BEGIN
  PERFORM public.post_room_message((SELECT id FROM _disc), 'من الخارج');
  INSERT INTO public._t VALUES ('disc outsider: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('disc outsider: rejected');
END $$;
INSERT INTO public._t SELECT 'disc other teacher: '
  || CASE WHEN private.room_role('11111111-1111-1111-1111-111111111111', (SELECT id FROM _disc)) IS NULL
          THEN 'none' ELSE 'LEAKED! ' || private.room_role('11111111-1111-1111-1111-111111111111', (SELECT id FROM _disc)) END;
RESET ROLE;
RESET "request.jwt.claim.sub";
SELECT code FROM public._t WHERE code LIKE 'disc %';

-- @@ 62. الكتم: يوقف المشرف مشاركة عضو مؤقتاً، ولا يُكتم المشرف
DELETE FROM public._t;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
DO $$ BEGIN
  PERFORM public.mute_room_member((SELECT id FROM _disc), '44444444-4444-4444-4444-444444444444', 2);
  INSERT INTO public._t VALUES ('mute by student: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('mute by student: rejected');
END $$;
SET "request.jwt.claim.sub" = '33333333-3333-3333-3333-333333333333';
SELECT public.mute_room_member((SELECT id FROM _disc), '44444444-4444-4444-4444-444444444444', 2);
DO $$ BEGIN
  PERFORM public.mute_room_member((SELECT id FROM _disc), '33333333-3333-3333-3333-333333333333', 2);
  INSERT INTO public._t VALUES ('mute moderator: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('mute moderator: rejected');
END $$;
SET "request.jwt.claim.sub" = '44444444-4444-4444-4444-444444444444';
DO $$ BEGIN
  PERFORM public.post_room_message((SELECT id FROM _disc), 'وأنا مكتوم');
  INSERT INTO public._t VALUES ('mute posts: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('mute posts: rejected');
END $$;
INSERT INTO public._t SELECT 'mute visible to user: '
  || CASE WHEN public.room_info((SELECT id FROM _disc))->>'muted_until' IS NOT NULL THEN 'ok' ELSE 'FAILED' END;
SET "request.jwt.claim.sub" = '33333333-3333-3333-3333-333333333333';
SELECT public.mute_room_member((SELECT id FROM _disc), '44444444-4444-4444-4444-444444444444', 0);
SET "request.jwt.claim.sub" = '44444444-4444-4444-4444-444444444444';
INSERT INTO public._t SELECT 'mute lifted: '
  || CASE WHEN public.post_room_message((SELECT id FROM _disc), 'عدت') IS NOT NULL THEN 'ok' ELSE 'FAILED' END;
RESET ROLE;
RESET "request.jwt.claim.sub";
SELECT code FROM public._t WHERE code LIKE 'mute %';

-- @@ 63. الإبلاغ والحذف: يبلّغ العضو، ويحسم المشرف، ولا يحذف أحد رسالة غيره
DELETE FROM public._t;
DROP TABLE IF EXISTS _msg;
CREATE TEMP TABLE _msg AS
  SELECT id FROM public.room_messages
   WHERE sender_id = '22222222-2222-2222-2222-222222222222' AND content = 'السلام عليكم';
GRANT SELECT ON _msg TO authenticated;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '44444444-4444-4444-4444-444444444444';
DO $$ BEGIN
  PERFORM public.delete_room_message((SELECT id FROM _msg));
  INSERT INTO public._t VALUES ('rep delete others: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('rep delete others: rejected');
END $$;
SELECT public.report_room_message((SELECT id FROM _msg), 'غير لائق');
SELECT public.report_room_message((SELECT id FROM _msg), 'مكرر');
SET "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
DO $$ BEGIN
  PERFORM public.report_room_message((SELECT id FROM _msg), 'نفسي');
  INSERT INTO public._t VALUES ('rep own: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('rep own: rejected');
END $$;
DO $$ BEGIN
  PERFORM public.room_open_reports((SELECT id FROM _disc));
  INSERT INTO public._t VALUES ('rep member lists: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('rep member lists: rejected');
END $$;
SET "request.jwt.claim.sub" = '33333333-3333-3333-3333-333333333333';
INSERT INTO public._t SELECT 'rep listed once: '
  || CASE WHEN jsonb_array_length(r) = 1 AND (r->0->>'reports')::int = 1 THEN 'ok' ELSE 'FAILED ' || r::text END
  FROM (SELECT public.room_open_reports((SELECT id FROM _disc)) AS r) s;
SELECT public.resolve_room_reports((SELECT id FROM _msg), true);
INSERT INTO public._t SELECT 'rep deleted: '
  || CASE WHEN content IS NULL AND deleted_at IS NOT NULL THEN 'ok' ELSE 'FAILED' END
  FROM public.room_messages WHERE id = (SELECT id FROM _msg);
INSERT INTO public._t SELECT 'rep resolved: '
  || CASE WHEN jsonb_array_length(public.room_open_reports((SELECT id FROM _disc))) = 0 THEN 'ok' ELSE 'FAILED' END;
RESET ROLE;
RESET "request.jwt.claim.sub";
INSERT INTO public._t SELECT 'rep teacher notified: '
  || CASE WHEN count(*) = 1 THEN 'ok' ELSE 'FAILED' END
  FROM public.notifications WHERE kind = 'room_report' AND user_id = '33333333-3333-3333-3333-333333333333';
SELECT code FROM public._t WHERE code LIKE 'rep %';

-- @@ 64. الخروج من الحلقة يقطع الوصول، وإيقاف النقاش يخفيه عن الأعضاء
DELETE FROM public._t;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '44444444-4444-4444-4444-444444444444';
INSERT INTO public._t SELECT 'leave rooms listed: '
  || CASE WHEN jsonb_array_length(public.my_rooms()) = 2 THEN 'ok' ELSE 'FAILED ' || public.my_rooms()::text END;
RESET ROLE;
DELETE FROM public.halaqa_students
 WHERE halaqa_id = 'dddd0000-0000-0000-0000-000000000001' AND student_id = '44444444-4444-4444-4444-444444444444';
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '44444444-4444-4444-4444-444444444444';
INSERT INTO public._t SELECT 'leave rows: '
  || CASE WHEN count(*) = 0 THEN 'none' ELSE 'LEAKED!' END FROM public.room_messages;
INSERT INTO public._t SELECT 'leave list: '
  || CASE WHEN jsonb_array_length(public.my_rooms()) = 0 THEN 'ok' ELSE 'LEAKED!' END;
SET "request.jwt.claim.sub" = '33333333-3333-3333-3333-333333333333';
SELECT public.set_discussion('dddd0000-0000-0000-0000-000000000001', false, true);
SET "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
DO $$ BEGIN
  PERFORM public.post_room_message((SELECT id FROM _disc), 'بعد الإيقاف');
  INSERT INTO public._t VALUES ('leave disabled posts: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('leave disabled posts: rejected');
END $$;
INSERT INTO public._t SELECT 'leave teacher still reads: '
  || CASE WHEN private.room_role('33333333-3333-3333-3333-333333333333', (SELECT id FROM _disc)) = 'mod'
          THEN 'ok' ELSE 'FAILED' END;
RESET ROLE;
RESET "request.jwt.claim.sub";
SELECT code FROM public._t WHERE code LIKE 'leave %';

-- @@ 65. التثبيت وغير المقروء: المشرف يثبّت رسالة واحدة، والعدّاد يُصفَّر بالقراءة
DELETE FROM public._t;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '33333333-3333-3333-3333-333333333333';
SELECT public.post_room_message((SELECT id FROM _room), 'تذكير: الاختبار الخميس');
SELECT public.pin_room_message(m.id, true) FROM public.room_messages m
 WHERE m.room_id = (SELECT id FROM _room) AND m.content = 'تذكير: الاختبار الخميس';
SET "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
DO $$ BEGIN
  PERFORM public.pin_room_message((SELECT id FROM public.room_messages WHERE room_id = (SELECT id FROM _room) LIMIT 1), true);
  INSERT INTO public._t VALUES ('pin by student: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('pin by student: rejected');
END $$;
INSERT INTO public._t SELECT 'pin shown: '
  || CASE WHEN public.room_info((SELECT id FROM _room))->'pinned'->>'content' = 'تذكير: الاختبار الخميس'
          THEN 'ok' ELSE 'FAILED' END;
INSERT INTO public._t SELECT 'pin unread: '
  || CASE WHEN (e->>'unread')::int = 2 AND NOT (e->>'can_post')::boolean THEN 'ok' ELSE 'FAILED ' || e::text END
  FROM jsonb_array_elements(public.my_rooms()) e WHERE e->>'kind' = 'announcements';
SELECT public.mark_room_read((SELECT id FROM _room));
INSERT INTO public._t SELECT 'pin read: '
  || CASE WHEN (e->>'unread')::int = 0 THEN 'ok' ELSE 'FAILED' END
  FROM jsonb_array_elements(public.my_rooms()) e WHERE e->>'kind' = 'announcements';
RESET ROLE;
RESET "request.jwt.claim.sub";
SELECT code FROM public._t WHERE code LIKE 'pin %';

-- @@ 66. مراقبة الأخطاء: التسجيل عبر الدالة فقط، ولا يقرأ أحد الجدول غير service_role
DELETE FROM public._t;
GRANT ALL ON public._t TO anon;
SET ROLE anon;
RESET "request.jwt.claim.sub";
INSERT INTO public._t SELECT 'err anon log: '
  || CASE WHEN public.log_client_error('boom anon', NULL, '/auth/email?token=secret', 'UA') THEN 'ok' ELSE 'FAILED' END;
DO $$ BEGIN
  PERFORM count(*) FROM public.client_errors;
  INSERT INTO public._t VALUES ('err anon read: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('err anon read: rejected');
END $$;
RESET ROLE;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
SELECT public.log_client_error('boom student', E'Error: x\n at f (a.js:1)', '/today', 'UA', 'r1');
SELECT public.log_client_error('boom student', E'Error: x\n at f (a.js:1)', '/today', 'UA', 'r1');
DO $$ BEGIN
  PERFORM count(*) FROM public.client_errors;
  INSERT INTO public._t VALUES ('err student read: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('err student read: rejected');
END $$;
DO $$ BEGIN
  INSERT INTO public.client_errors (fingerprint, message) VALUES ('x', 'forged');
  INSERT INTO public._t VALUES ('err student insert: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('err student insert: rejected');
END $$;
DO $$ BEGIN
  PERFORM public.error_summary(7);
  INSERT INTO public._t VALUES ('err student summary: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('err student summary: rejected');
END $$;
RESET ROLE;
RESET "request.jwt.claim.sub";
INSERT INTO public._t SELECT 'err dedup: '
  || CASE WHEN count(*) = 1 AND max(occurrences) = 2 THEN 'ok' ELSE 'FAILED' END
  FROM public.client_errors WHERE message = 'boom student';
INSERT INTO public._t SELECT 'err query stripped: '
  || CASE WHEN url = '/auth/email' THEN 'ok' ELSE 'LEAKED! ' || url END
  FROM public.client_errors WHERE message = 'boom anon';
SELECT code FROM public._t WHERE code LIKE 'err %';

-- @@ 67. مراقبة الأخطاء: حدّ 30 خطأً مختلفاً في الساعة لكل مستخدم
DELETE FROM public._t;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '33333333-3333-3333-3333-333333333333';
SELECT public.log_client_error('flood ' || g) FROM generate_series(1, 40) g;
RESET ROLE;
RESET "request.jwt.claim.sub";
INSERT INTO public._t SELECT 'flood capped: '
  || CASE WHEN count(*) = 30 THEN 'ok' ELSE 'FAILED ' || count(*) END
  FROM public.client_errors WHERE message LIKE 'flood %';
SELECT code FROM public._t WHERE code LIKE 'flood %';

-- @@ 68. نوع الحساب: تفضيل واجهة فقط، ولا يمنح صلاحية
DELETE FROM public._t;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '66666666-6666-6666-6666-666666666666';
SELECT public.set_account_kind('guardian');
DO $$ BEGIN
  PERFORM public.set_account_kind('teacher');
  INSERT INTO public._t VALUES ('kind teacher: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('kind teacher: rejected');
END $$;
INSERT INTO public._t SELECT 'kind home: '
  || CASE WHEN (c ->> 'account_kind') = 'guardian' AND (c ->> 'children')::int >= 1
               AND (c ->> 'is_teacher')::boolean = false THEN 'ok' ELSE 'FAILED ' || c::text END
  FROM public.my_home_context() c;
INSERT INTO public._t SELECT 'kind no role: '
  || CASE WHEN NOT private.is_teacher('66666666-6666-6666-6666-666666666666') THEN 'ok' ELSE 'LEAKED!' END;
RESET ROLE;
RESET "request.jwt.claim.sub";
SELECT code FROM public._t WHERE code LIKE 'kind %';

-- @@ 69. تصدير البيانات: بيانات صاحب الحساب وحده
DELETE FROM public._t;
INSERT INTO public.notifications (user_id, title) VALUES
 ('22222222-2222-2222-2222-222222222222', 'تصدير: لبلال'),
 ('33333333-3333-3333-3333-333333333333', 'تصدير: للمعلّم');
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
INSERT INTO public._t SELECT 'export own: '
  || CASE WHEN d::text LIKE '%تصدير: لبلال%' AND (d -> 'profile' ->> 'id') = '22222222-2222-2222-2222-222222222222'
          THEN 'ok' ELSE 'FAILED' END
  FROM public.export_my_data() d;
INSERT INTO public._t SELECT 'export others: '
  || CASE WHEN d::text LIKE '%تصدير: للمعلّم%' THEN 'LEAKED!' ELSE 'none' END
  FROM public.export_my_data() d;
RESET ROLE;
RESET "request.jwt.claim.sub";
SET ROLE anon;
DO $$ BEGIN
  PERFORM public.export_my_data();
  RAISE NOTICE 'x';
EXCEPTION WHEN others THEN NULL;
END $$;
RESET ROLE;
INSERT INTO public._t SELECT 'export anon grant: '
  || CASE WHEN has_function_privilege('anon', 'public.export_my_data()', 'execute') THEN 'ALLOWED!' ELSE 'rejected' END;
SELECT code FROM public._t WHERE code LIKE 'export %';

-- @@ 70. حذف الحساب: يحذف بياناته كلها ويُبقي غيره، ويرفض حذف مدير وحيد لمركز فيه آخرون
DELETE FROM public._t;
INSERT INTO auth.users (id, phone, raw_user_meta_data) VALUES
 ('99999999-9999-9999-9999-999999999999', '+967799999999', '{"name":"مغادر"}'),
 ('88888888-8888-8888-8888-888888888888', '+967788888888', '{"name":"مدير"}');
INSERT INTO public.notifications (user_id, title) VALUES ('99999999-9999-9999-9999-999999999999', 'حذف');
INSERT INTO public.guardian_links (guardian_id, student_id, relation)
VALUES ('99999999-9999-9999-9999-999999999999', '22222222-2222-2222-2222-222222222222', 'father');
INSERT INTO public.centers (id, name, created_by)
VALUES ('cccc0000-0000-0000-0000-000000000099', 'مركز الحذف', '88888888-8888-8888-8888-888888888888');
INSERT INTO public.center_staff (center_id, user_id, role) VALUES
 ('cccc0000-0000-0000-0000-000000000099', '88888888-8888-8888-8888-888888888888', 'manager'),
 ('cccc0000-0000-0000-0000-000000000099', '33333333-3333-3333-3333-333333333333', 'supervisor');
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '99999999-9999-9999-9999-999999999999';
DO $$ BEGIN
  PERFORM public.delete_my_account('نعم');
  INSERT INTO public._t VALUES ('del no confirm: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('del no confirm: rejected');
END $$;
SELECT public.delete_my_account('احذف حسابي');
SET "request.jwt.claim.sub" = '88888888-8888-8888-8888-888888888888';
DO $$ BEGIN
  PERFORM public.delete_my_account('احذف حسابي');
  INSERT INTO public._t VALUES ('del sole manager: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('del sole manager: rejected');
END $$;
RESET ROLE;
RESET "request.jwt.claim.sub";
INSERT INTO public._t SELECT 'del gone: '
  || CASE WHEN NOT EXISTS (SELECT 1 FROM auth.users WHERE id = '99999999-9999-9999-9999-999999999999')
           AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = '99999999-9999-9999-9999-999999999999')
           AND NOT EXISTS (SELECT 1 FROM public.notifications WHERE user_id = '99999999-9999-9999-9999-999999999999')
           AND NOT EXISTS (SELECT 1 FROM public.guardian_links WHERE guardian_id = '99999999-9999-9999-9999-999999999999')
      THEN 'ok' ELSE 'FAILED' END;
INSERT INTO public._t SELECT 'del others kept: '
  || CASE WHEN EXISTS (SELECT 1 FROM public.profiles WHERE id = '22222222-2222-2222-2222-222222222222')
           AND EXISTS (SELECT 1 FROM public.centers WHERE id = 'cccc0000-0000-0000-0000-000000000099')
           AND EXISTS (SELECT 1 FROM auth.users WHERE id = '88888888-8888-8888-8888-888888888888')
      THEN 'ok' ELSE 'FAILED' END;
-- معلّم حلقات ودرجات: يُحذف حسابه وتبقى الحلقة وسجلات طلابها
DO $$ BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
  PERFORM public.delete_my_account('احذف حسابي');
  INSERT INTO public._t VALUES ('del teacher: ok');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('del teacher: FAILED ' || SQLERRM);
END $$;
RESET ROLE;
INSERT INTO public._t SELECT 'del halaqa kept: '
  || CASE WHEN EXISTS (SELECT 1 FROM public.halaqat WHERE id = 'dddd0000-0000-0000-0000-000000000001')
           AND EXISTS (SELECT 1 FROM public.halaqa_students WHERE student_id = '22222222-2222-2222-2222-222222222222')
      THEN 'ok' ELSE 'FAILED' END;
SELECT code FROM public._t WHERE code LIKE 'del %';

-- @@ 71. اشتراكات Push: صاحبها وحده يراها، ولا إدراج مباشر، ولا سرقة رابط جهاز غيره
DELETE FROM public._t;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
SELECT public.save_push_subscription('https://push.example.com/salem',
  'B' || repeat('a', 86), repeat('k', 22), 'test');
DO $$ BEGIN
  INSERT INTO public.push_subscriptions (user_id, endpoint, p256dh, auth)
  VALUES ('11111111-1111-1111-1111-111111111111', 'https://push.example.com/direct', 'B' || repeat('a', 86), repeat('k', 22));
  INSERT INTO public._t VALUES ('push direct insert: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('push direct insert: rejected');
END $$;
SET "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
INSERT INTO public._t SELECT 'push others read: '
  || CASE WHEN count(*) = 0 THEN 'none' ELSE 'LEAKED!' END FROM public.push_subscriptions;
DO $$ BEGIN
  PERFORM public.save_push_subscription('https://push.example.com/salem', 'B' || repeat('z', 86), repeat('x', 22), NULL);
  INSERT INTO public._t VALUES ('push hijack: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('push hijack: rejected');
END $$;
SELECT public.remove_push_subscription('https://push.example.com/salem');
SET "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
INSERT INTO public._t SELECT 'push own read: '
  || CASE WHEN count(*) = 1 THEN 'ok' ELSE 'FAILED' END FROM public.push_subscriptions;
RESET ROLE;
RESET "request.jwt.claim.sub";
INSERT INTO public._t SELECT 'push outbox anon/auth: '
  || CASE WHEN has_table_privilege('authenticated', 'public.push_outbox', 'select')
            OR has_table_privilege('anon', 'public.push_subscriptions', 'select')
          THEN 'ALLOWED!' ELSE 'rejected' END;
SELECT code FROM public._t WHERE code LIKE 'push %';

-- @@ 72. من الإشعار إلى صندوق الإرسال: الفئة المعطّلة لا تُرسَل، وساعات الهدوء تؤجّل
DELETE FROM public._t;
DELETE FROM public.push_outbox;
-- الجهاز = رمز FCM (منذ 20261225100000 لا يُعدّ اشتراك الويب القديم جهازاً؛ يُحذف في 73 كرمز زائل).
INSERT INTO public.native_push_tokens (user_id, token, platform)
VALUES ('11111111-1111-1111-1111-111111111111', 'salem_tok:APA91b' || repeat('s', 40), 'android');
INSERT INTO public.notifications (user_id, kind, title, body, link)
VALUES ('11111111-1111-1111-1111-111111111111', 'assignment', 'واجب جديد', 'سورة الملك', '/today');
INSERT INTO public._t SELECT 'queue subscribed: '
  || CASE WHEN count(*) = 1 AND min(category) = 'assignments' AND min(url) = '/today' THEN 'ok' ELSE 'FAILED' END
  FROM public.push_outbox WHERE user_id = '11111111-1111-1111-1111-111111111111';
INSERT INTO public.notifications (user_id, kind, title)
VALUES ('22222222-2222-2222-2222-222222222222', 'assignment', 'بلا اشتراك');
INSERT INTO public._t SELECT 'queue unsubscribed: '
  || CASE WHEN count(*) = 0 THEN 'none' ELSE 'FAILED' END
  FROM public.push_outbox WHERE user_id = '22222222-2222-2222-2222-222222222222';
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
DO $$ BEGIN
  PERFORM public.set_notification_prefs(true, '{"hacked": true}', NULL, NULL, 'Asia/Aden', NULL, NULL);
  INSERT INTO public._t VALUES ('queue bad prefs: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('queue bad prefs: rejected');
END $$;
DO $$ BEGIN
  PERFORM public.set_notification_prefs(true, '{}', NULL, NULL, 'Mars/Olympus', NULL, NULL);
  INSERT INTO public._t VALUES ('queue bad tz: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('queue bad tz: rejected');
END $$;
-- التقييم معطّل، وساعات الهدوء تشمل اليوم كله تقريباً (من الآن إلى ما بعد 23 ساعة)
SELECT public.set_notification_prefs(true, '{"grades": false}',
  ((now() AT TIME ZONE 'Asia/Aden') - interval '1 minute')::time,
  ((now() AT TIME ZONE 'Asia/Aden') - interval '2 minutes')::time,
  'Asia/Aden', NULL, NULL);
RESET ROLE;
RESET "request.jwt.claim.sub";
DELETE FROM public.push_outbox;
INSERT INTO public.notifications (user_id, kind, title)
VALUES ('11111111-1111-1111-1111-111111111111', 'assessment', 'تقييم'),
       ('11111111-1111-1111-1111-111111111111', 'announcement', 'إعلان');
INSERT INTO public._t SELECT 'queue category off: '
  || CASE WHEN NOT EXISTS (SELECT 1 FROM public.push_outbox WHERE category = 'grades') THEN 'ok' ELSE 'FAILED' END;
INSERT INTO public._t SELECT 'queue quiet deferred: '
  || CASE WHEN min(send_after) > now() + interval '22 hours' THEN 'ok' ELSE 'FAILED ' || min(send_after)::text END
  FROM public.push_outbox WHERE category = 'rooms';
SELECT code FROM public._t WHERE code LIKE 'queue %';

-- @@ 73. التذكيرات اليومية والإرسال: مرة في اليوم، وللخادم وحده، ويُحذف الاشتراك المنتهي
DELETE FROM public._t;
DELETE FROM public.push_outbox;
UPDATE public.notification_prefs SET quiet_start = NULL, quiet_end = NULL,
  wird_time = '11:50', muhasaba_time = '13:00'
 WHERE user_id = '11111111-1111-1111-1111-111111111111';
-- ساعة ثابتة حتى لا يتأثر الفحص بوقت تشغيله. ثم بعد 4 ساعات: فات وقت الورد فلا تذكير قديم.
SELECT public.enqueue_daily_reminders('2026-10-01 12:00+03');
SELECT public.enqueue_daily_reminders('2026-10-01 12:05+03');
SELECT public.enqueue_daily_reminders('2026-10-02 16:30+03');
UPDATE public.push_outbox SET send_after = now() - interval '1 second';
INSERT INTO public._t SELECT 'send reminders once: '
  || CASE WHEN count(*) FILTER (WHERE category = 'wird') = 1
           AND count(*) FILTER (WHERE category = 'muhasaba') = 0 THEN 'ok' ELSE 'FAILED ' || count(*) END
  FROM public.push_outbox;
INSERT INTO public._t SELECT 'send grants: '
  || CASE WHEN has_function_privilege('authenticated', 'public.enqueue_daily_reminders(timestamptz)', 'execute')
            OR has_function_privilege('authenticated', 'public.claim_push_batch(integer)', 'execute')
            OR has_function_privilege('authenticated', 'public.finish_push(uuid, text[], text[])', 'execute')
            OR has_function_privilege('anon', 'public.claim_push_batch(integer)', 'execute')
          THEN 'ALLOWED!' ELSE 'rejected' END;
SET ROLE service_role;
CREATE TEMP TABLE _claim AS SELECT * FROM public.claim_push_batch(10);
CREATE TEMP TABLE _claim2 AS SELECT * FROM public.claim_push_batch(10);
SELECT public.finish_push(id, '{}', ARRAY['salem_tok:APA91b' || repeat('s', 40)]) FROM _claim;
RESET ROLE;
INSERT INTO public._t SELECT 'send claim: '
  || CASE WHEN count(*) = 1 AND jsonb_array_length(min(subscriptions::text)::jsonb) = 1 THEN 'ok' ELSE 'FAILED' END FROM _claim;
INSERT INTO public._t SELECT 'send claim again: '
  || CASE WHEN count(*) = 0 THEN 'none' ELSE 'FAILED' END FROM _claim2;
INSERT INTO public._t SELECT 'send gone removed: '
  || CASE WHEN NOT EXISTS (SELECT 1 FROM public.native_push_tokens WHERE token = 'salem_tok:APA91b' || repeat('s', 40))
           AND EXISTS (SELECT 1 FROM public.push_outbox o JOIN _claim c ON c.id = o.id WHERE o.sent_at IS NOT NULL)
      THEN 'ok' ELSE 'FAILED' END;
DROP TABLE _claim, _claim2;
SELECT code FROM public._t WHERE code LIKE 'send %';

-- @@ 74. ملخّص أسبوع الطالب: لمعلّمه وحده، ومن بياناته الفعلية
DELETE FROM public._t;
INSERT INTO auth.users (id, phone, raw_user_meta_data) VALUES
 ('a1a1a1a1-0000-0000-0000-000000000001', '+967711110001', '{"name":"معلّم الخطة"}'),
 ('b1b1b1b1-0000-0000-0000-000000000001', '+967711110002', '{"name":"طالب الخطة"}');
INSERT INTO public.user_roles (user_id, role) VALUES ('a1a1a1a1-0000-0000-0000-000000000001', 'teacher')
  ON CONFLICT DO NOTHING;
INSERT INTO public.centers (id, name, created_by)
VALUES ('cccc0000-0000-0000-0000-0000000000a1', 'مركز الخطة', 'a1a1a1a1-0000-0000-0000-000000000001');
INSERT INTO public.halaqat (id, center_id, name, teacher_id)
VALUES ('dddd0000-0000-0000-0000-0000000000a1', 'cccc0000-0000-0000-0000-0000000000a1', 'حلقة الخطة', 'a1a1a1a1-0000-0000-0000-000000000001');
INSERT INTO public.halaqa_students (halaqa_id, student_id)
VALUES ('dddd0000-0000-0000-0000-0000000000a1', 'b1b1b1b1-0000-0000-0000-000000000001');
INSERT INTO public.attendance (student_id, halaqa_id, teacher_id, session_date, status) VALUES
 ('b1b1b1b1-0000-0000-0000-000000000001', 'dddd0000-0000-0000-0000-0000000000a1', 'a1a1a1a1-0000-0000-0000-000000000001', current_date, 'present'),
 ('b1b1b1b1-0000-0000-0000-000000000001', 'dddd0000-0000-0000-0000-0000000000a1', 'a1a1a1a1-0000-0000-0000-000000000001', current_date - 1, 'absent');
INSERT INTO public.recitation_sessions (id, student_id, surah_name, from_ayah, to_ayah, status)
VALUES ('eeee0000-0000-0000-0000-0000000000a1', 'b1b1b1b1-0000-0000-0000-000000000001', 'الملك', 1, 5, 'approved');
INSERT INTO public.recitation_assessments (session_id, student_id, teacher_id, score, approved, errors)
VALUES ('eeee0000-0000-0000-0000-0000000000a1', 'b1b1b1b1-0000-0000-0000-000000000001',
        'a1a1a1a1-0000-0000-0000-000000000001', 80, true,
        '[{"type":"tajweed","note":"مد"},{"type":"tajweed","note":"غنة"},{"type":"memorization","note":"نسيان"}]');
INSERT INTO public.review_cards (student_id, surah_name, from_ayah, to_ayah, ease, lapses, due_date)
VALUES ('b1b1b1b1-0000-0000-0000-000000000001', 'الملك', 1, 5, 1.8, 2, current_date - 1);
SET ROLE authenticated;
SET "request.jwt.claim.sub" = 'a1a1a1a1-0000-0000-0000-000000000001';
CREATE TEMP TABLE _wk AS SELECT public.teacher_student_week('b1b1b1b1-0000-0000-0000-000000000001') AS j;
SET "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
DO $$ BEGIN
  PERFORM public.teacher_student_week('b1b1b1b1-0000-0000-0000-000000000001');
  INSERT INTO public._t VALUES ('week outsider: LEAKED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('week outsider: rejected');
END $$;
SET "request.jwt.claim.sub" = 'b1b1b1b1-0000-0000-0000-000000000001';
DO $$ BEGIN
  PERFORM public.teacher_student_week('b1b1b1b1-0000-0000-0000-000000000001');
  INSERT INTO public._t VALUES ('week self: LEAKED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('week self: rejected');
END $$;
RESET ROLE;
RESET "request.jwt.claim.sub";
INSERT INTO public._t SELECT 'week facts: '
  || CASE WHEN (j->'attendance'->>'present')::int = 1 AND (j->'attendance'->>'absent')::int = 1
           AND (j->>'avg_score')::int = 80 AND (j->'error_counts'->>'tajweed')::int = 2
           AND (j->'reviews'->>'due')::int = 1 AND jsonb_array_length(j->'reviews'->'weak') = 1
      THEN 'ok' ELSE 'FAILED ' || j::text END FROM _wk;
INSERT INTO public._t SELECT 'week anon: '
  || CASE WHEN has_function_privilege('anon', 'public.teacher_student_week(uuid, integer)', 'execute')
     THEN 'ALLOWED!' ELSE 'rejected' END;
DROP TABLE _wk;
SELECT code FROM public._t WHERE code LIKE 'week %';

-- @@ 75. خطة الحفظ: يقترحها الطالب أو معلّمه، ولا يعتمدها إلا المعلّم، ولا تُكتب مباشرة
DELETE FROM public._t;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = 'b1b1b1b1-0000-0000-0000-000000000001';
DO $$ BEGIN
  PERFORM public.propose_memorization_plan('b1b1b1b1-0000-0000-0000-000000000001',
    '[{"day":1,"kind":"new","surah_name":"الملك","from_ayah":6,"to_ayah":3}]');
  INSERT INTO public._t VALUES ('plan bad range: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('plan bad range: rejected');
END $$;
DO $$ BEGIN
  PERFORM public.propose_memorization_plan('b1b1b1b1-0000-0000-0000-000000000001',
    '[{"day":9,"kind":"new","surah_name":"الملك","from_ayah":1,"to_ayah":3}]');
  INSERT INTO public._t VALUES ('plan bad day: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('plan bad day: rejected');
END $$;
SELECT public.propose_memorization_plan('b1b1b1b1-0000-0000-0000-000000000001',
  '[{"day":1,"kind":"review","surah_name":"الملك","from_ayah":1,"to_ayah":5}]', 'أول');
SELECT public.propose_memorization_plan('b1b1b1b1-0000-0000-0000-000000000001',
  '[{"day":1,"kind":"new","surah_name":"الملك","from_ayah":6,"to_ayah":8},{"day":2,"kind":"review","surah_name":"الملك","from_ayah":1,"to_ayah":5}]', 'ثانٍ');
DO $$ BEGIN
  INSERT INTO public.memorization_plans (student_id, items, status)
  VALUES ('b1b1b1b1-0000-0000-0000-000000000001', '[]', 'approved');
  INSERT INTO public._t VALUES ('plan direct insert: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('plan direct insert: rejected');
END $$;
DO $$ BEGIN
  PERFORM public.decide_memorization_plan(
    (SELECT id FROM public.memorization_plans WHERE rationale = 'ثانٍ'), true);
  INSERT INTO public._t VALUES ('plan self approve: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('plan self approve: rejected');
END $$;
SET "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
INSERT INTO public._t SELECT 'plan outsider read: '
  || CASE WHEN count(*) = 0 THEN 'rejected' ELSE 'LEAKED!' END FROM public.memorization_plans;
DO $$ BEGIN
  PERFORM public.propose_memorization_plan('b1b1b1b1-0000-0000-0000-000000000001',
    '[{"day":1,"kind":"new","surah_name":"الملك","from_ayah":1,"to_ayah":3}]');
  INSERT INTO public._t VALUES ('plan outsider propose: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('plan outsider propose: rejected');
END $$;
SET "request.jwt.claim.sub" = 'a1a1a1a1-0000-0000-0000-000000000001';
SELECT public.decide_memorization_plan(
  (SELECT id FROM public.memorization_plans WHERE rationale = 'ثانٍ'), true, 'بارك الله فيك',
  '[{"day":1,"kind":"new","surah_name":"الملك","from_ayah":6,"to_ayah":7}]');
DO $$ BEGIN
  PERFORM public.decide_memorization_plan(
    (SELECT id FROM public.memorization_plans WHERE rationale = 'ثانٍ'), false);
  INSERT INTO public._t VALUES ('plan decide twice: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('plan decide twice: rejected');
END $$;
RESET ROLE;
RESET "request.jwt.claim.sub";
INSERT INTO public._t SELECT 'plan states: '
  || CASE WHEN (SELECT status FROM public.memorization_plans WHERE rationale = 'أول') = 'superseded'
           AND (SELECT status || ':' || (items->0->>'to_ayah') || ':' || teacher_id::text
                  FROM public.memorization_plans WHERE rationale = 'ثانٍ')
               = 'approved:7:a1a1a1a1-0000-0000-0000-000000000001'
      THEN 'ok' ELSE 'FAILED' END;
INSERT INTO public._t SELECT 'plan notified: '
  || CASE WHEN EXISTS (SELECT 1 FROM public.notifications
                        WHERE user_id = 'a1a1a1a1-0000-0000-0000-000000000001' AND kind = 'plan')
           AND EXISTS (SELECT 1 FROM public.notifications
                        WHERE user_id = 'b1b1b1b1-0000-0000-0000-000000000001' AND kind = 'plan'
                          AND title LIKE 'اعتمد%')
           AND public.push_category('plan') = 'assignments'
      THEN 'ok' ELSE 'FAILED' END;
SELECT code FROM public._t WHERE code LIKE 'plan %';

-- @@ 76. حصص الميزتين الجديدتين مقبولة، والخطة تُحذف مع الحساب
DELETE FROM public._t;
SET ROLE service_role;
SELECT public.consume_ai_quota('a1a1a1a1-0000-0000-0000-000000000001', 'teacher_summary', 10, 5);
SELECT public.consume_ai_quota('b1b1b1b1-0000-0000-0000-000000000001', 'plan', 10, 5);
RESET ROLE;
INSERT INTO public._t SELECT 'aiq features: '
  || CASE WHEN count(*) = 2 THEN 'ok' ELSE 'FAILED ' || count(*) END
  FROM public.ai_usage_events WHERE feature IN ('teacher_summary', 'plan');
SET ROLE authenticated;
SET "request.jwt.claim.sub" = 'b1b1b1b1-0000-0000-0000-000000000001';
SELECT public.delete_my_account('احذف حسابي');
RESET ROLE;
RESET "request.jwt.claim.sub";
INSERT INTO public._t SELECT 'aiq plan deleted: '
  || CASE WHEN NOT EXISTS (SELECT 1 FROM public.memorization_plans
                            WHERE student_id = 'b1b1b1b1-0000-0000-0000-000000000001')
      THEN 'ok' ELSE 'FAILED' END;
SELECT code FROM public._t WHERE code LIKE 'aiq %';

-- @@ 77. رموز FCM الأصلية: صاحبها وحده يراها، ولا إدراج مباشر، والصيغة مقيّدة
DELETE FROM public._t;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
SELECT public.save_native_push_token('fcm_token-ahmad:APA91b' || repeat('x', 40), 'android');
SELECT public.save_native_push_token('fcm_token-ahmad:APA91b' || repeat('x', 40), 'android');
DO $$ BEGIN
  INSERT INTO public.native_push_tokens (user_id, token, platform)
  VALUES ('22222222-2222-2222-2222-222222222222', 'direct_insert_token_' || repeat('y', 30), 'android');
  INSERT INTO public._t VALUES ('native direct insert: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('native direct insert: rejected');
END $$;
DO $$ BEGIN
  PERFORM public.save_native_push_token('https://evil.example.com/x' || repeat('z', 30), 'android');
  INSERT INTO public._t VALUES ('native bad token: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('native bad token: rejected');
END $$;
DO $$ BEGIN
  PERFORM public.save_native_push_token('ok_token_' || repeat('q', 30), 'windows');
  INSERT INTO public._t VALUES ('native bad platform: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('native bad platform: rejected');
END $$;
INSERT INTO public._t SELECT 'native own read: '
  || CASE WHEN count(*) = 1 THEN 'ok' ELSE 'FAILED ' || count(*) END FROM public.native_push_tokens;
SET "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
INSERT INTO public._t SELECT 'native others read: '
  || CASE WHEN count(*) = 0 THEN 'none' ELSE 'LEAKED!' END FROM public.native_push_tokens;
SELECT public.remove_native_push_token('fcm_token-ahmad:APA91b' || repeat('x', 40));
RESET ROLE;
RESET "request.jwt.claim.sub";
INSERT INTO public._t SELECT 'native others remove: '
  || CASE WHEN count(*) = 1 THEN 'rejected' ELSE 'ALLOWED!' END FROM public.native_push_tokens;
INSERT INTO public._t SELECT 'native anon: '
  || CASE WHEN has_table_privilege('anon', 'public.native_push_tokens', 'select')
            OR has_function_privilege('anon', 'public.save_native_push_token(text, text)', 'execute')
          THEN 'ALLOWED!' ELSE 'rejected' END;
SELECT code FROM public._t WHERE code LIKE 'native %';

-- @@ 78. الجهاز الأصلي وحده يكفي للإرسال، ويُحجز رمزه، ويُحذف إن انتهى
DELETE FROM public._t;
DELETE FROM public.push_outbox;
INSERT INTO public.notifications (user_id, kind, title, link)
VALUES ('22222222-2222-2222-2222-222222222222', 'assignment', 'واجب على الهاتف', '/today');
INSERT INTO public._t SELECT 'fcm queued: '
  || CASE WHEN count(*) = 1 THEN 'ok' ELSE 'FAILED ' || count(*) END
  FROM public.push_outbox WHERE user_id = '22222222-2222-2222-2222-222222222222';
SET ROLE service_role;
CREATE TEMP TABLE _nclaim AS SELECT * FROM public.claim_push_batch(10);
SELECT public.finish_push(id, '{}', ARRAY['fcm_token-ahmad:APA91b' || repeat('x', 40)]) FROM _nclaim;
RESET ROLE;
INSERT INTO public._t SELECT 'fcm claim: '
  || CASE WHEN count(*) = 1
           AND (min(subscriptions::text)::jsonb) -> 0 ->> 'platform' = 'android'
           AND (min(subscriptions::text)::jsonb) -> 0 ->> 'token' LIKE 'fcm_token-ahmad:%'
      THEN 'ok' ELSE 'FAILED' END FROM _nclaim;
INSERT INTO public._t SELECT 'fcm gone removed: '
  || CASE WHEN NOT EXISTS (SELECT 1 FROM public.native_push_tokens
                            WHERE user_id = '22222222-2222-2222-2222-222222222222')
           AND EXISTS (SELECT 1 FROM public.push_outbox o JOIN _nclaim c ON c.id = o.id WHERE o.sent_at IS NOT NULL)
      THEN 'ok' ELSE 'FAILED' END;
DROP TABLE _nclaim;
INSERT INTO public.notifications (user_id, kind, title)
VALUES ('22222222-2222-2222-2222-222222222222', 'assignment', 'بلا جهاز الآن');
INSERT INTO public._t SELECT 'fcm no device: '
  || CASE WHEN count(*) = 1 THEN 'none' ELSE 'FAILED' END
  FROM public.push_outbox WHERE user_id = '22222222-2222-2222-2222-222222222222';
SELECT code FROM public._t WHERE code LIKE 'fcm %';

-- @@ 79. اسم المستخدم: التوحيد والبريد الداخلي يطابقان العميل (src/lib/username.ts)
SELECT 'uname normalize: ' || CASE WHEN public.normalize_username(' Ahmad_1 ') = 'ahmad_1'
            AND public.normalize_username('أحمدُ.٢٠') = 'احمد.20'
            AND public.normalize_username('ـمحمد') = 'محمد' THEN 'ok' ELSE 'FAILED' END AS code
UNION ALL SELECT 'uname email: ' || CASE WHEN public.username_email('ahmad_1') = 'e0f254fd64d099e6e86ff329a55e3867@users.zen.invalid'
            AND public.username_email('احمد.20') = '9c6ef66886f40adeb0ae9fec81de5be9@users.zen.invalid'
            THEN 'ok' ELSE 'FAILED' END
UNION ALL SELECT 'uname validity: ' || CASE WHEN public.is_valid_username('ahmad_1') AND public.is_valid_username('احمد.20')
            AND NOT public.is_valid_username('ab') AND NOT public.is_valid_username('1abc')
            AND NOT public.is_valid_username('a..b') AND NOT public.is_valid_username('abc.')
            AND NOT public.is_valid_username('a b c') AND NOT public.is_valid_username(repeat('a', 25))
            THEN 'ok' ELSE 'FAILED' END;

-- @@ 80. التسجيل باسم مستخدم: حساب مؤكَّد بلا بريد حقيقي، طالب، ورمز استرداد
DROP TABLE IF EXISTS public._reg;
CREATE TABLE public._reg (k text PRIMARY KEY, v jsonb);
GRANT ALL ON public._reg TO anon, authenticated;
DELETE FROM public._t;
SET ROLE anon;
INSERT INTO public._reg VALUES ('a', public.register_username_account('Ahmad_1', 'secret-pass-1', 'أحمد'));
INSERT INTO public._reg VALUES ('b', public.register_username_account('خالد.ط', 'secret-pass-2', NULL));
DO $$ BEGIN
  PERFORM public.register_username_account('AHMAD_1', 'another-pass', 'منتحل');
  INSERT INTO public._t VALUES ('uname duplicate: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('uname duplicate: rejected ' || left(SQLERRM, 14));
END $$;
DO $$ BEGIN
  PERFORM public.register_username_account('1bad', 'secret-pass', NULL);
  INSERT INTO public._t VALUES ('uname invalid: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('uname invalid: rejected');
END $$;
DO $$ BEGIN
  PERFORM public.register_username_account('shortpw', '1234567', NULL);
  INSERT INTO public._t VALUES ('uname weak password: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('uname weak password: rejected');
END $$;
DO $$ BEGIN
  PERFORM public.register_username_account('admin', 'secret-pass', NULL);
  INSERT INTO public._t VALUES ('uname reserved: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('uname reserved: rejected');
END $$;
INSERT INTO public._t SELECT 'uname anon tables: '
  || CASE WHEN has_table_privilege('anon', 'public.account_usernames', 'select')
            OR has_table_privilege('anon', 'public.account_secrets', 'select')
            OR has_table_privilege('authenticated', 'public.account_secrets', 'select')
          THEN 'ALLOWED!' ELSE 'rejected' END;
RESET ROLE;
INSERT INTO public._t SELECT 'uname user row: '
  || CASE WHEN u.email = public.username_email('ahmad_1') AND u.email_confirmed_at IS NOT NULL
           AND u.encrypted_password = extensions.crypt('secret-pass-1', u.encrypted_password)
           AND u.confirmation_token = '' AND u.aud = 'authenticated'
           AND p.name = 'أحمد' AND p.role = 'student'
           AND NOT public.has_role(u.id, 'teacher')
           AND EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id = u.id AND i.provider = 'email'
                        AND i.identity_data ->> 'email' = u.email)
      THEN 'ok' ELSE 'FAILED' END
  FROM auth.users u JOIN public.profiles p ON p.id = u.id
  JOIN public.account_usernames n ON n.user_id = u.id WHERE n.username = 'ahmad_1';
INSERT INTO public._t SELECT 'uname default name: '
  || CASE WHEN p.name = 'خالد.ط' THEN 'ok' ELSE 'FAILED ' || p.name END
  FROM public.profiles p JOIN public.account_usernames n ON n.user_id = p.id WHERE n.username = 'خالد.ط';
INSERT INTO public._t SELECT 'uname recovery code: '
  || CASE WHEN (SELECT v ->> 'recovery_code' FROM public._reg WHERE k = 'a') ~ '^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$'
           AND (SELECT v ->> 'username' FROM public._reg WHERE k = 'a') = 'ahmad_1'
      THEN 'ok' ELSE 'FAILED' END;
SELECT code FROM public._t WHERE code LIKE 'uname %' ORDER BY code;

-- @@ 81. الاسترداد برمز الاسترداد: يعمل مرة، يُنهي الجلسات، ويُقفل بعد 5 أخطاء
DELETE FROM public._t;
INSERT INTO auth.sessions (user_id) SELECT user_id FROM public.account_usernames WHERE username = 'ahmad_1';
INSERT INTO auth.refresh_tokens (token, user_id, session_id)
  SELECT 'rt', s.user_id::text, s.id FROM auth.sessions s JOIN public.account_usernames n ON n.user_id = s.user_id
   WHERE n.username = 'ahmad_1';
SET ROLE anon;
INSERT INTO public._t SELECT 'recover wrong code: '
  || CASE WHEN (public.reset_password_with_recovery_code('ahmad_1', 'AAAA-AAAA-AAAA-AAAA', 'new-pass-123') ->> 'ok')::boolean
          THEN 'ALLOWED!' ELSE 'rejected' END;
INSERT INTO public._t SELECT 'recover unknown user: '
  || CASE WHEN (public.reset_password_with_recovery_code('nobody_here', 'AAAA-AAAA-AAAA-AAAA', 'new-pass-123') ->> 'ok')::boolean
          THEN 'ALLOWED!' ELSE 'rejected' END;
INSERT INTO public._reg SELECT 'a2', public.reset_password_with_recovery_code(
  'AHMAD_1', lower(replace(v ->> 'recovery_code', '-', ' ')), 'new-pass-123') FROM public._reg WHERE k = 'a';
INSERT INTO public._t SELECT 'recover reuse old code: '
  || CASE WHEN (public.reset_password_with_recovery_code('ahmad_1', v ->> 'recovery_code', 'x-pass-12345') ->> 'ok')::boolean
          THEN 'REUSED!' ELSE 'rejected' END FROM public._reg WHERE k = 'a';
RESET ROLE;
INSERT INTO public._t SELECT 'recover ok: '
  || CASE WHEN (r.v ->> 'ok')::boolean AND r.v ->> 'recovery_code' <> a.v ->> 'recovery_code'
           AND u.encrypted_password = extensions.crypt('new-pass-123', u.encrypted_password)
           AND NOT EXISTS (SELECT 1 FROM auth.sessions WHERE user_id = u.id)
           AND NOT EXISTS (SELECT 1 FROM auth.refresh_tokens WHERE user_id = u.id::text)
      THEN 'ok' ELSE 'FAILED' END
  FROM public._reg r, public._reg a, auth.users u
 WHERE r.k = 'a2' AND a.k = 'a' AND u.email = public.username_email('ahmad_1');
SET ROLE anon;
DO $$ DECLARE i int; BEGIN
  FOR i IN 1..5 LOOP
    PERFORM public.reset_password_with_recovery_code('خالد.ط', 'BBBB-BBBB-BBBB-BBBB', 'new-pass-123');
  END LOOP;
END $$;
DO $$ BEGIN
  PERFORM public.reset_password_with_recovery_code('خالد.ط', (SELECT v ->> 'recovery_code' FROM public._reg WHERE k = 'b'), 'new-pass-123');
  INSERT INTO public._t VALUES ('recover lockout: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('recover lockout: rejected');
END $$;
RESET ROLE;
SELECT code FROM public._t WHERE code LIKE 'recover %' ORDER BY code;

-- @@ 82. المعلّم يعيّن كلمة مرور طالبه فقط، لا لغيره ولا لمعلّم
DELETE FROM public._t;
DELETE FROM public.auth_rate_events;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('77777777-7777-7777-7777-777777777771', 'teacher.pw@test.local', '{"name":"معلم كلمات المرور"}'),
  ('77777777-7777-7777-7777-777777777772', 'other.teacher@test.local', '{"name":"معلم آخر"}');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('77777777-7777-7777-7777-777777777771', 'teacher'), ('77777777-7777-7777-7777-777777777772', 'teacher');
INSERT INTO public.halaqat (id, center_id, name, teacher_id) VALUES
  ('dddd0000-0000-0000-0000-00000000077a', 'cccc0000-0000-0000-0000-000000000001', 'حلقة كلمات المرور',
   '77777777-7777-7777-7777-777777777771');
INSERT INTO public.halaqa_students (halaqa_id, student_id)
  SELECT 'dddd0000-0000-0000-0000-00000000077a', user_id FROM public.account_usernames WHERE username = 'ahmad_1';
INSERT INTO public.halaqa_students (halaqa_id, student_id)
  VALUES ('dddd0000-0000-0000-0000-00000000077a', '77777777-7777-7777-7777-777777777772');
INSERT INTO auth.sessions (user_id) SELECT user_id FROM public.account_usernames WHERE username = 'ahmad_1';
SELECT set_config('zen.t_ahmad', user_id::text, false) FROM public.account_usernames WHERE username = 'ahmad_1';
SELECT set_config('zen.t_khalid', user_id::text, false) FROM public.account_usernames WHERE username = 'خالد.ط';
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '77777777-7777-7777-7777-777777777771';
INSERT INTO public._t SELECT 'tpw info: '
  || CASE WHEN (public.student_login_info(user_id) ->> 'username') = 'ahmad_1'
           AND (public.student_login_info(user_id) ->> 'can_set_password')::boolean
      THEN 'ok' ELSE 'FAILED' END FROM (SELECT current_setting('zen.t_ahmad')::uuid AS user_id) x;
INSERT INTO public._t SELECT 'tpw own student: '
  || CASE WHEN (public.teacher_set_student_password(current_setting('zen.t_ahmad')::uuid, 'teacher-set-1') ->> 'username') = 'ahmad_1'
      THEN 'ok' ELSE 'FAILED' END;
DO $$ BEGIN
  PERFORM public.teacher_set_student_password(
    current_setting('zen.t_khalid')::uuid, 'teacher-set-2');
  INSERT INTO public._t VALUES ('tpw not my student: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('tpw not my student: rejected');
END $$;
DO $$ BEGIN
  PERFORM public.teacher_set_student_password('77777777-7777-7777-7777-777777777772', 'teacher-set-3');
  INSERT INTO public._t VALUES ('tpw teacher target: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('tpw teacher target: rejected');
END $$;
DO $$ BEGIN
  PERFORM public.teacher_set_student_password(
    current_setting('zen.t_ahmad')::uuid, 'short');
  INSERT INTO public._t VALUES ('tpw weak: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('tpw weak: rejected');
END $$;
-- طالب يحاول تعيين كلمة مرور زميل.
SET "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
DO $$ BEGIN
  PERFORM public.teacher_set_student_password(
    current_setting('zen.t_ahmad')::uuid, 'student-set-1');
  INSERT INTO public._t VALUES ('tpw by student: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('tpw by student: rejected');
END $$;
INSERT INTO public._t SELECT 'tpw info outsider: '
  || CASE WHEN public.student_login_info(current_setting('zen.t_ahmad')::uuid) IS NULL THEN 'none' ELSE 'LEAKED!' END;
RESET ROLE;
RESET "request.jwt.claim.sub";
INSERT INTO public._t SELECT 'tpw applied: '
  || CASE WHEN u.encrypted_password = extensions.crypt('teacher-set-1', u.encrypted_password)
           AND s.must_change_password AND s.password_set_by = '77777777-7777-7777-7777-777777777771'
           AND NOT EXISTS (SELECT 1 FROM auth.sessions WHERE user_id = u.id)
           AND EXISTS (SELECT 1 FROM public.password_resets_audit a WHERE a.user_id = u.id AND a.method = 'teacher')
      THEN 'ok' ELSE 'FAILED' END
  FROM auth.users u JOIN public.account_secrets s ON s.user_id = u.id
 WHERE u.email = public.username_email('ahmad_1');
INSERT INTO public._t SELECT 'tpw other untouched: '
  || CASE WHEN u.encrypted_password = extensions.crypt('secret-pass-2', u.encrypted_password)
      THEN 'ok' ELSE 'FAILED' END
  FROM auth.users u WHERE u.email = public.username_email('خالد.ط');
SELECT code FROM public._t WHERE code LIKE 'tpw %' ORDER BY code;

-- @@ 83. حسابي: تنبيه تغيير كلمة المرور، والتغيير بمعرفة الحالية، وتحويل حساب قديم إلى اسم مستخدم
DELETE FROM public._t;
SELECT set_config('request.jwt.claim.sub', user_id::text, false) FROM public.account_usernames WHERE username = 'ahmad_1';
SET ROLE authenticated;
INSERT INTO public._t SELECT 'me must change: '
  || CASE WHEN (public.my_login_info() ->> 'must_change_password')::boolean
           AND public.my_login_info() ->> 'username' = 'ahmad_1' THEN 'ok' ELSE 'FAILED' END;
DO $$ BEGIN
  PERFORM public.change_my_password('wrong-current', 'mine-new-123');
  INSERT INTO public._t VALUES ('me wrong current: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('me wrong current: rejected');
END $$;
SELECT public.change_my_password('teacher-set-1', 'mine-new-123');
INSERT INTO public._t SELECT 'me changed: '
  || CASE WHEN NOT (public.my_login_info() ->> 'must_change_password')::boolean THEN 'ok' ELSE 'FAILED' END;
INSERT INTO public._t SELECT 'me new code: '
  || CASE WHEN public.regenerate_recovery_code('mine-new-123') ~ '^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$' THEN 'ok' ELSE 'FAILED' END;
DO $$ BEGIN
  PERFORM public.claim_username('second_name', 'mine-new-123');
  INSERT INTO public._t VALUES ('me claim twice: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('me claim twice: rejected');
END $$;
-- حساب بالهاتف (بلا كلمة مرور) يختار اسم مستخدم.
SET "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
DO $$ BEGIN
  PERFORM public.claim_username('Ahmad_1', 'bilal-pass-1');
  INSERT INTO public._t VALUES ('me claim taken: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('me claim taken: rejected');
END $$;
INSERT INTO public._t SELECT 'me claim: '
  || CASE WHEN public.claim_username('بلال', 'bilal-pass-1') ->> 'username' = 'بلال' THEN 'ok' ELSE 'FAILED' END;
RESET ROLE;
RESET "request.jwt.claim.sub";
INSERT INTO public._t SELECT 'me claim applied: '
  || CASE WHEN u.email = public.username_email('بلال') AND u.phone = '+967722222222'
           AND u.encrypted_password = extensions.crypt('bilal-pass-1', u.encrypted_password)
           AND EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id = u.id AND i.provider = 'email')
      THEN 'ok' ELSE 'FAILED' END
  FROM auth.users u WHERE u.id = '22222222-2222-2222-2222-222222222222';
DROP TABLE public._reg;
SELECT code FROM public._t WHERE code LIKE 'me %' ORDER BY code;

-- @@ 84. «أنا معلّم»: رمز المؤسس الأول يفعّل أول معلّم مرة واحدة، والدعوة تعمل من نفس المدخل، والتخمين يُقفل
DELETE FROM public._t;
INSERT INTO auth.users (id, phone, raw_user_meta_data) VALUES
 ('f0000000-0000-0000-0000-000000000001','+967700000101','{"name":"المؤسس"}'),
 ('f0000000-0000-0000-0000-000000000002','+967700000102','{"name":"معلّم مدعو"}'),
 ('f0000000-0000-0000-0000-000000000003','+967700000103','{"name":"مخمّن"}');
INSERT INTO public._t SELECT 'fc first code seeded: '
  || CASE WHEN count(*) = 1 AND bool_and(code ~ '^ZEN(-[0-9A-F]{5}){4}$') THEN 'ok' ELSE 'FAILED' END
  FROM public.founder_codes;
-- العميل لا يرى رموز المؤسس ولا يُصدرها.
SET ROLE authenticated;
SET "request.jwt.claim.sub" = 'f0000000-0000-0000-0000-000000000003';
DO $$ BEGIN
  PERFORM count(*) FROM public.founder_codes;
  INSERT INTO public._t VALUES ('fc read by client: LEAKED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('fc read by client: rejected');
END $$;
DO $$ BEGIN
  PERFORM public.issue_founder_code('محاولة', NULL);
  INSERT INTO public._t VALUES ('fc issue by client: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('fc issue by client: rejected');
END $$;
RESET ROLE;
-- المؤسس يكتب الرمز بأحرف صغيرة ودون البادئة.
SELECT set_config('zen.fc', lower(replace(replace(code, 'ZEN-', ''), '-', ' ')), false) FROM public.founder_codes;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = 'f0000000-0000-0000-0000-000000000001';
INSERT INTO public._t SELECT 'fc founder: ' || public.activate_teacher_role(current_setting('zen.fc'));
INSERT INTO public._t SELECT 'fc founder again: ' || public.activate_teacher_role(current_setting('zen.fc'));
-- المؤسس معلّم الآن: يُصدر دعوة، ويُنشئ مركزاً.
SELECT set_config('zen.inv', public.create_teacher_invite('من المؤسس'), false);
INSERT INTO public.centers (name, created_by) VALUES ('مركز المؤسس', 'f0000000-0000-0000-0000-000000000001');
INSERT INTO public._t VALUES ('fc founder created center: ok');
-- الرمز نفسه لا يُستخدم لغيره.
SET "request.jwt.claim.sub" = 'f0000000-0000-0000-0000-000000000003';
INSERT INTO public._t SELECT 'fc reuse: ' || public.activate_teacher_role(current_setting('zen.fc'));
-- الدعوة من نفس المدخل.
SET "request.jwt.claim.sub" = 'f0000000-0000-0000-0000-000000000002';
INSERT INTO public._t SELECT 'fc invite: ' || public.activate_teacher_role(lower(current_setting('zen.inv')));
-- التخمين: 5 أخطاء ⇒ قفل، حتى مع رمز صحيح بعدها.
SET "request.jwt.claim.sub" = 'f0000000-0000-0000-0000-000000000003';
SELECT public.activate_teacher_role('ZEN-00000-00000-00000-0000' || g) FROM generate_series(1, 5) g;
RESET ROLE;
SELECT set_config('zen.fc2', public.issue_founder_code('ثانٍ', 30), false);
SET ROLE authenticated;
SET "request.jwt.claim.sub" = 'f0000000-0000-0000-0000-000000000003';
INSERT INTO public._t SELECT 'fc locked: ' || public.activate_teacher_role(current_setting('zen.fc2'));
RESET ROLE;
RESET "request.jwt.claim.sub";
INSERT INTO public._t SELECT 'fc roles: '
  || CASE WHEN public.has_role('f0000000-0000-0000-0000-000000000001', 'teacher')
           AND public.has_role('f0000000-0000-0000-0000-000000000002', 'teacher')
           AND NOT public.has_role('f0000000-0000-0000-0000-000000000003', 'teacher')
           AND (SELECT used_by FROM public.founder_codes WHERE note LIKE 'الرمز الأول%') = 'f0000000-0000-0000-0000-000000000001'
      THEN 'ok' ELSE 'FAILED' END;
-- القيم المتوقعة: founder ثم already، reuse=used، invite، locked.
INSERT INTO public._t SELECT 'fc statuses: '
  || CASE WHEN (SELECT count(*) FROM public._t WHERE code IN (
       'fc founder: founder', 'fc founder again: already', 'fc reuse: used', 'fc invite: invite', 'fc locked: locked')) = 5
      THEN 'ok' ELSE 'FAILED' END;
SELECT code FROM public._t WHERE code LIKE 'fc %' ORDER BY code;

-- @@ 85. رمز المؤسس داخل التطبيق: يراه صاحب التطبيق وحده، ويختفي بعد تفعيل دوره
DELETE FROM public._t;
INSERT INTO auth.users (id, phone, raw_user_meta_data) VALUES
 ('f0000000-0000-0000-0000-000000000004','+967700000104','{"name":"صاحب التطبيق"}');
-- الافتراضي: صاحب التطبيق هو أقدم حساب حقيقي، والضيف لا يُحتسب.
INSERT INTO public._t SELECT 'fo default owner = oldest: '
  || CASE WHEN public.app_owner_id() = (SELECT id FROM auth.users WHERE NOT is_anonymous
                                         ORDER BY created_at, id LIMIT 1)
      THEN 'ok' ELSE 'FAILED' END;
INSERT INTO public.app_owner (id, user_id) VALUES (true, 'f0000000-0000-0000-0000-000000000004');
SET ROLE authenticated;
DO $$ BEGIN
  PERFORM count(*) FROM public.app_owner;
  INSERT INTO public._t VALUES ('fo owner table read by client: LEAKED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('fo owner table read by client: rejected');
END $$;
-- معلّم قائم ⇒ already، وغير صاحب التطبيق لا يرى رمزاً.
SET "request.jwt.claim.sub" = 'f0000000-0000-0000-0000-000000000002';
INSERT INTO public._t SELECT 'fo teacher: '
  || CASE WHEN public.founder_code_for_me() = '{"status":"already"}'::jsonb THEN 'ok' ELSE 'FAILED' END;
SET "request.jwt.claim.sub" = 'f0000000-0000-0000-0000-000000000003';
INSERT INTO public._t SELECT 'fo outsider: '
  || CASE WHEN public.founder_code_for_me() = '{"status":"not_owner"}'::jsonb THEN 'ok' ELSE 'FAILED' END;
-- صاحب التطبيق يرى رمزاً صالحاً، ويفعّل به دوره، ثم لا يُعرض عليه رمز.
SET "request.jwt.claim.sub" = 'f0000000-0000-0000-0000-000000000004';
SELECT set_config('zen.fo', public.founder_code_for_me() ->> 'code', false);
INSERT INTO public._t SELECT 'fo owner sees code: '
  || CASE WHEN current_setting('zen.fo') ~ '^ZEN(-[0-9A-F]{5}){4}$' THEN 'ok' ELSE 'FAILED' END;
INSERT INTO public._t SELECT 'fo owner activates: '
  || CASE WHEN public.activate_teacher_role(current_setting('zen.fo')) = 'founder' THEN 'ok' ELSE 'FAILED' END;
INSERT INTO public._t SELECT 'fo owner after: '
  || CASE WHEN public.founder_code_for_me() = '{"status":"already"}'::jsonb THEN 'ok' ELSE 'FAILED' END;
RESET ROLE;
-- لا رموز صالحة متبقية ⇒ يُصدر رمزاً جديداً لصاحب التطبيق تلقائياً.
UPDATE public.app_owner SET user_id = 'f0000000-0000-0000-0000-000000000003';
DELETE FROM public.teacher_code_attempts WHERE user_id = 'f0000000-0000-0000-0000-000000000003';
INSERT INTO public._t SELECT 'fo no unused codes left: '
  || CASE WHEN NOT EXISTS (SELECT 1 FROM public.founder_codes WHERE used_by IS NULL
                            AND (expires_at IS NULL OR expires_at > now())) THEN 'ok' ELSE 'FAILED' END;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = 'f0000000-0000-0000-0000-000000000003';
INSERT INTO public._t SELECT 'fo auto-issued: '
  || CASE WHEN public.founder_code_for_me() ->> 'code' ~ '^ZEN(-[0-9A-F]{5}){4}$' THEN 'ok' ELSE 'FAILED' END;
RESET ROLE;
RESET "request.jwt.claim.sub";
DELETE FROM public.app_owner;
SELECT code FROM public._t WHERE code LIKE 'fo %' ORDER BY code;

-- @@ 86. المحادثات — المرحلة 0: لا تعديل مباشر، لا رسائل «ذكاء» مزوّرة، والإرسال يتبع العلاقة، ومحادثة واحدة لكل زوج
DELETE FROM public._t;
-- أطراف مستقلة لهذا القسم: معلّم وطالب في حلقته.
INSERT INTO auth.users (id, phone, raw_user_meta_data) VALUES
 ('86868686-0000-0000-0000-000000000001','+967700008601','{"name":"معلّم ٨٦"}'),
 ('86868686-0000-0000-0000-000000000002','+967700008602','{"name":"طالب ٨٦"}');
INSERT INTO public.user_roles (user_id, role) VALUES ('86868686-0000-0000-0000-000000000001','teacher') ON CONFLICT DO NOTHING;
INSERT INTO public.centers (id, name, created_by) VALUES ('cccc0000-0000-0000-0000-000000000086','مركز ٨٦','86868686-0000-0000-0000-000000000001');
INSERT INTO public.halaqat (id, center_id, name, teacher_id) VALUES
 ('dddd0000-0000-0000-0000-000000000086','cccc0000-0000-0000-0000-000000000086','حلقة ٨٦','86868686-0000-0000-0000-000000000001');
INSERT INTO public.halaqa_students (halaqa_id, student_id) VALUES ('dddd0000-0000-0000-0000-000000000086','86868686-0000-0000-0000-000000000002');
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '86868686-0000-0000-0000-000000000002';
SELECT set_config('zen.c86', public.get_or_create_direct_chat('86868686-0000-0000-0000-000000000001')::text, false);
DO $$
DECLARE
  _c uuid := current_setting('zen.c86')::uuid;
  _m uuid;
BEGIN
  INSERT INTO public._t SELECT 'p0 same pair same chat: '
    || CASE WHEN public.get_or_create_direct_chat('86868686-0000-0000-0000-000000000001') = _c
             AND (SELECT count(*) FROM public.chats WHERE is_group = false
                   AND '86868686-0000-0000-0000-000000000002' = ANY(participants)
                   AND '86868686-0000-0000-0000-000000000001' = ANY(participants)) = 1
            THEN 'ok' ELSE 'FAILED' END;
  BEGIN
    INSERT INTO public.chats (participants) VALUES
      (ARRAY['86868686-0000-0000-0000-000000000001','86868686-0000-0000-0000-000000000002']::uuid[]);
    INSERT INTO public._t VALUES ('p0 duplicate pair insert: ALLOWED!');
  EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('p0 duplicate pair insert: rejected');
  END;

  INSERT INTO public.messages (chat_id, sender_id, content) VALUES
    (_c, '86868686-0000-0000-0000-000000000002', 'السلام عليكم يا أستاذ') RETURNING id INTO _m;
  INSERT INTO public._t VALUES ('p0 text send: ok');

  BEGIN
    INSERT INTO public.messages (chat_id, sender_id, content, type) VALUES
      (_c, '86868686-0000-0000-0000-000000000002', 'فتوى مزوّرة', 'ai');
    INSERT INTO public._t VALUES ('p0 fake ai message: ALLOWED!');
  EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('p0 fake ai message: rejected');
  END;
  BEGIN
    INSERT INTO public.messages (chat_id, sender_id, content, created_at) VALUES
      (_c, '86868686-0000-0000-0000-000000000002', 'من المستقبل', now() + interval '1 year');
    INSERT INTO public._t VALUES ('p0 forged created_at: ALLOWED!');
  EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('p0 forged created_at: rejected');
  END;
  BEGIN
    UPDATE public.messages SET chat_id = 'aaaaaaaa-0000-0000-0000-000000000001' WHERE id = _m;
    INSERT INTO public._t VALUES ('p0 move message: ALLOWED!');
  EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('p0 move message: rejected');
  END;
  BEGIN
    UPDATE public.messages SET type = 'ai' WHERE id = _m;
    INSERT INTO public._t VALUES ('p0 retype message: ALLOWED!');
  EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('p0 retype message: rejected');
  END;
  BEGIN
    UPDATE public.chats SET last_message = 'مزيّفة', is_group = true WHERE id = _c;
    INSERT INTO public._t VALUES ('p0 edit chat row: ALLOWED!');
  EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('p0 edit chat row: rejected');
  END;
  BEGIN
    INSERT INTO public.messages (chat_id, sender_id, content, type, media_path) VALUES
      (_c, '86868686-0000-0000-0000-000000000002', 'صورة', 'image',
       'aaaaaaaa-0000-0000-0000-000000000001/86868686-0000-0000-0000-000000000002/x.png');
    INSERT INTO public._t VALUES ('p0 foreign media path: ALLOWED!');
  EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('p0 foreign media path: rejected');
  END;

  PERFORM public.edit_message(_m, 'السلام عليكم ورحمة الله يا أستاذ');
  INSERT INTO public._t SELECT 'p0 edit own text: '
    || CASE WHEN (SELECT edited_at IS NOT NULL AND content LIKE '%ورحمة الله%' FROM public.messages WHERE id = _m)
             AND (SELECT last_message LIKE '%ورحمة الله%' FROM public.chats WHERE id = _c)
            THEN 'ok' ELSE 'FAILED' END;
END $$;

-- الطرف الآخر لا يعدّل رسالة غيره، ولا بعد انتهاء المهلة.
SET "request.jwt.claim.sub" = '86868686-0000-0000-0000-000000000001';
DO $$
BEGIN
  PERFORM public.edit_message((SELECT id FROM public.messages WHERE chat_id = current_setting('zen.c86')::uuid
                                ORDER BY created_at LIMIT 1), 'تعديل من غير صاحبها');
  INSERT INTO public._t VALUES ('p0 edit others message: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('p0 edit others message: rejected');
END $$;
RESET ROLE;
UPDATE public.messages SET created_at = now() - interval '20 minutes'
 WHERE chat_id = current_setting('zen.c86')::uuid;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '86868686-0000-0000-0000-000000000002';
DO $$
BEGIN
  PERFORM public.edit_message((SELECT id FROM public.messages WHERE chat_id = current_setting('zen.c86')::uuid
                                ORDER BY created_at LIMIT 1), 'تعديل متأخر');
  INSERT INTO public._t VALUES ('p0 edit after window: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('p0 edit after window: rejected');
END $$;
RESET ROLE;

-- انتهاء العلاقة: خروج الطالب من حلقة المعلّم يوقف الإرسال، وتبقى الرسائل للقراءة.
CREATE TEMP TABLE _p0_hs AS
  SELECT * FROM public.halaqa_students
   WHERE student_id = '86868686-0000-0000-0000-000000000002'
     AND halaqa_id IN (SELECT id FROM public.halaqat WHERE teacher_id = '86868686-0000-0000-0000-000000000001');
DELETE FROM public.halaqa_students hs USING _p0_hs t
 WHERE hs.halaqa_id = t.halaqa_id AND hs.student_id = t.student_id;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '86868686-0000-0000-0000-000000000002';
DO $$
BEGIN
  INSERT INTO public.messages (chat_id, sender_id, content) VALUES
    (current_setting('zen.c86')::uuid, '86868686-0000-0000-0000-000000000002', 'بعد الخروج');
  INSERT INTO public._t VALUES ('p0 send after relation ended: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('p0 send after relation ended: rejected');
END $$;
INSERT INTO public._t SELECT 'p0 history still readable: '
  || CASE WHEN (SELECT count(*) FROM public.messages WHERE chat_id = current_setting('zen.c86')::uuid) >= 1
          THEN 'ok' ELSE 'FAILED' END;
RESET ROLE;
INSERT INTO public.halaqa_students SELECT * FROM _p0_hs ON CONFLICT DO NOTHING;
DROP TABLE _p0_hs;
RESET "request.jwt.claim.sub";

INSERT INTO public._t SELECT 'p0 anon has no chat privileges: '
  || CASE WHEN NOT has_table_privilege('anon', 'public.messages', 'SELECT')
           AND NOT has_table_privilege('anon', 'public.chats', 'INSERT')
           AND NOT has_table_privilege('authenticated', 'public.messages', 'DELETE')
           AND NOT has_table_privilege('authenticated', 'public.messages', 'TRUNCATE')
          THEN 'ok' ELSE 'FAILED' END;
-- النتيجة المتوقعة كاملة: أي اختلاف (قبولٌ لما يجب رفضه أو العكس) يُفشل القسم.
SELECT code FROM public._t WHERE code LIKE 'p0 %'
UNION ALL
SELECT 'FAILED: expected ' || array_to_string(ARRAY['p0 anon has no chat privileges: ok','p0 duplicate pair insert: rejected','p0 edit after window: rejected','p0 edit chat row: rejected','p0 edit others message: rejected','p0 edit own text: ok','p0 fake ai message: rejected','p0 foreign media path: rejected','p0 forged created_at: rejected','p0 history still readable: ok','p0 move message: rejected','p0 retype message: rejected','p0 same pair same chat: ok','p0 send after relation ended: rejected','p0 text send: ok'], ' | ')
 WHERE (SELECT array_agg(code ORDER BY code) FROM public._t WHERE code LIKE 'p0 %')
       IS DISTINCT FROM ARRAY['p0 anon has no chat privileges: ok','p0 duplicate pair insert: rejected','p0 edit after window: rejected','p0 edit chat row: rejected','p0 edit others message: rejected','p0 edit own text: ok','p0 fake ai message: rejected','p0 foreign media path: rejected','p0 forged created_at: rejected','p0 history still readable: ok','p0 move message: rejected','p0 retype message: rejected','p0 same pair same chat: ok','p0 send after relation ended: rejected','p0 text send: ok']
ORDER BY 1;

-- @@ 87. المحادثات — المرحلة 1: الزملاء بإذن المركز، واطلاع المعلّم لا ولي الأمر، والبلاغ والحظر، ولا أرقام ولا روابط
DELETE FROM public._t;
-- T معلّم ومنشئ المركز، A وB طالبان في حلقته، G ولي أمر A، T2 معلّم في مركز آخر، T3 معلّم في المركز نفسه.
INSERT INTO auth.users (id, phone, raw_user_meta_data) VALUES
 ('87878787-0000-0000-0000-000000000001','+967700008701','{"name":"معلّم ٨٧"}'),
 ('87878787-0000-0000-0000-000000000002','+967700008702','{"name":"أحمد ٨٧"}'),
 ('87878787-0000-0000-0000-000000000003','+967700008703','{"name":"بكر ٨٧"}'),
 ('87878787-0000-0000-0000-000000000004','+967700008704','{"name":"ولي ٨٧"}'),
 ('87878787-0000-0000-0000-000000000005','+967700008705','{"name":"معلّم آخر ٨٧"}'),
 ('87878787-0000-0000-0000-000000000006','+967700008706','{"name":"زميل ٨٧"}');
INSERT INTO public.user_roles (user_id, role) VALUES
 ('87878787-0000-0000-0000-000000000001','teacher'),
 ('87878787-0000-0000-0000-000000000005','teacher'),
 ('87878787-0000-0000-0000-000000000006','teacher') ON CONFLICT DO NOTHING;
INSERT INTO public.centers (id, name, created_by) VALUES
 ('cccc0000-0000-0000-0000-000000000087','مركز ٨٧','87878787-0000-0000-0000-000000000001'),
 ('cccc0000-0000-0000-0000-000000000088','مركز آخر','87878787-0000-0000-0000-000000000005');
INSERT INTO public.halaqat (id, center_id, name, teacher_id) VALUES
 ('dddd0000-0000-0000-0000-000000000087','cccc0000-0000-0000-0000-000000000087','حلقة ٨٧','87878787-0000-0000-0000-000000000001'),
 ('dddd0000-0000-0000-0000-000000000088','cccc0000-0000-0000-0000-000000000088','حلقة أخرى','87878787-0000-0000-0000-000000000005'),
 ('dddd0000-0000-0000-0000-000000000089','cccc0000-0000-0000-0000-000000000087','حلقة الزميل','87878787-0000-0000-0000-000000000006');
INSERT INTO public.halaqa_students (halaqa_id, student_id) VALUES
 ('dddd0000-0000-0000-0000-000000000087','87878787-0000-0000-0000-000000000002'),
 ('dddd0000-0000-0000-0000-000000000087','87878787-0000-0000-0000-000000000003');
INSERT INTO public.guardian_links (guardian_id, student_id) VALUES
 ('87878787-0000-0000-0000-000000000004','87878787-0000-0000-0000-000000000002');

CREATE OR REPLACE FUNCTION public._p1_try(_label text, _sql text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE _sql;
  INSERT INTO public._t VALUES (_label || ': ok');
EXCEPTION WHEN others THEN
  INSERT INTO public._t VALUES (_label || ': rejected');
END $$;
GRANT EXECUTE ON FUNCTION public._p1_try(text, text) TO authenticated;
CREATE OR REPLACE FUNCTION public._p1_as(_uid text) RETURNS void
LANGUAGE sql AS $$ SELECT set_config('request.jwt.claim.sub', _uid, false) $$;
GRANT EXECUTE ON FUNCTION public._p1_as(text) TO authenticated;

SET ROLE authenticated;
-- القرار 1: ممنوعة افتراضياً، والطالب لا يغيّر الإعداد، والمدير يغيّره.
SELECT public._p1_as('87878787-0000-0000-0000-000000000002');
SELECT public._p1_try('p1 classmates default', $q$SELECT public.get_or_create_direct_chat('87878787-0000-0000-0000-000000000003')$q$);
INSERT INTO public._t SELECT 'p1 contacts hide classmate by default: '
  || CASE WHEN '87878787-0000-0000-0000-000000000003'::uuid NOT IN (SELECT public.my_chat_contacts()) THEN 'ok' ELSE 'FAILED' END;
SELECT public._p1_try('p1 student enables dm', $q$SELECT public.set_center_chat_settings('cccc0000-0000-0000-0000-000000000087', true)$q$);
SELECT public._p1_as('87878787-0000-0000-0000-000000000001');
SELECT public._p1_try('p1 manager enables dm', $q$SELECT public.set_center_chat_settings('cccc0000-0000-0000-0000-000000000087', true)$q$);
SELECT public._p1_as('87878787-0000-0000-0000-000000000002');
SELECT set_config('zen.c87', public.get_or_create_direct_chat('87878787-0000-0000-0000-000000000003')::text, false);
SELECT public._p1_try('p1 classmates text', format($q$INSERT INTO public.messages (chat_id, sender_id, content) VALUES (%L, '87878787-0000-0000-0000-000000000002', 'السلام عليكم، راجعت البقرة 255')$q$, current_setting('zen.c87')));
-- C6: لا أرقام ولا روابط بين الطلاب.
SELECT public._p1_try('p1 phone number', format($q$INSERT INTO public.messages (chat_id, sender_id, content) VALUES (%L, '87878787-0000-0000-0000-000000000002', 'رقمي 77 123 4567')$q$, current_setting('zen.c87')));
SELECT public._p1_try('p1 arabic digits phone', format($q$INSERT INTO public.messages (chat_id, sender_id, content) VALUES (%L, '87878787-0000-0000-0000-000000000002', 'كلمني ٧٧١٢٣٤٥٦٧')$q$, current_setting('zen.c87')));
SELECT public._p1_try('p1 link', format($q$INSERT INTO public.messages (chat_id, sender_id, content) VALUES (%L, '87878787-0000-0000-0000-000000000002', 'ادخل wa.me/abc')$q$, current_setting('zen.c87')));
-- القرار 2: المعلّم يقرأ ولا يكتب، وولي الأمر لا يرى شيئاً.
SELECT public._p1_as('87878787-0000-0000-0000-000000000001');
INSERT INTO public._t SELECT 'p1 teacher reads student chat: '
  || CASE WHEN (SELECT count(*) FROM public.messages WHERE chat_id = current_setting('zen.c87')::uuid) = 1
           AND (public.chat_context(current_setting('zen.c87')::uuid) ->> 'supervisor')::boolean
           AND NOT (public.chat_context(current_setting('zen.c87')::uuid) ->> 'can_post')::boolean
           AND jsonb_array_length(public.supervised_chats()) = 1
          THEN 'ok' ELSE 'FAILED' END;
SELECT public._p1_try('p1 teacher posts in student chat', format($q$INSERT INTO public.messages (chat_id, sender_id, content) VALUES (%L, '87878787-0000-0000-0000-000000000001', 'x')$q$, current_setting('zen.c87')));
SELECT public._p1_as('87878787-0000-0000-0000-000000000004');
INSERT INTO public._t SELECT 'p1 guardian reads student chat: '
  || CASE WHEN (SELECT count(*) FROM public.messages WHERE chat_id = current_setting('zen.c87')::uuid) = 0
           AND (SELECT count(*) FROM public.chats WHERE id = current_setting('zen.c87')::uuid) = 0
          THEN 'none' ELSE 'LEAKED!' END;
SELECT public._p1_try('p1 guardian chat context', format($q$SELECT public.chat_context(%L)$q$, current_setting('zen.c87')));
SELECT public._p1_as('87878787-0000-0000-0000-000000000005');
INSERT INTO public._t SELECT 'p1 other teacher reads student chat: '
  || CASE WHEN (SELECT count(*) FROM public.messages WHERE chat_id = current_setting('zen.c87')::uuid) = 0
          THEN 'none' ELSE 'LEAKED!' END;
-- C2: البلاغ يصل إلى المعلّم، ولا يراجعه الطالب.
SELECT public._p1_as('87878787-0000-0000-0000-000000000003');
SELECT public._p1_try('p1 report message', format($q$SELECT public.report_message((SELECT id FROM public.messages WHERE chat_id = %L LIMIT 1), 'إزعاج')$q$, current_setting('zen.c87')));
INSERT INTO public._t SELECT 'p1 student sees reports: '
  || CASE WHEN jsonb_array_length(public.open_message_reports()) = 0 THEN 'none' ELSE 'LEAKED!' END;
SELECT public._p1_as('87878787-0000-0000-0000-000000000001');
INSERT INTO public._t SELECT 'p1 teacher sees report: '
  || CASE WHEN jsonb_array_length(public.open_message_reports()) = 1 THEN 'ok' ELSE 'FAILED' END;
SELECT public._p1_as('87878787-0000-0000-0000-000000000002');
SELECT public._p1_try('p1 reported student resolves', $q$SELECT public.resolve_message_report((SELECT (public.open_message_reports() -> 0 ->> 'id')::uuid))$q$);
SELECT public._p1_as('87878787-0000-0000-0000-000000000001');
SELECT public._p1_try('p1 teacher resolves', $q$SELECT public.resolve_message_report((public.open_message_reports() -> 0 ->> 'id')::uuid)$q$);
-- C2: الحظر يوقف الإرسال في الاتجاهين ويخفي جهة الاتصال، ورفعه يعيده.
SELECT public._p1_as('87878787-0000-0000-0000-000000000003');
SELECT public.set_user_block('87878787-0000-0000-0000-000000000002', true);
SELECT public._p1_as('87878787-0000-0000-0000-000000000002');
SELECT public._p1_try('p1 send to blocker', format($q$INSERT INTO public.messages (chat_id, sender_id, content) VALUES (%L, '87878787-0000-0000-0000-000000000002', 'مرحباً')$q$, current_setting('zen.c87')));
INSERT INTO public._t SELECT 'p1 blocker hidden from contacts: '
  || CASE WHEN '87878787-0000-0000-0000-000000000003'::uuid NOT IN (SELECT public.my_chat_contacts()) THEN 'ok' ELSE 'FAILED' END;
SELECT public._p1_as('87878787-0000-0000-0000-000000000003');
SELECT public.set_user_block('87878787-0000-0000-0000-000000000002', false);
SELECT public._p1_as('87878787-0000-0000-0000-000000000002');
SELECT public._p1_try('p1 send after unblock', format($q$INSERT INTO public.messages (chat_id, sender_id, content) VALUES (%L, '87878787-0000-0000-0000-000000000002', 'عدنا')$q$, current_setting('zen.c87')));
-- إيقاف الإعداد يوقف الإرسال، ويبقى السجل.
SELECT public._p1_as('87878787-0000-0000-0000-000000000001');
SELECT public.set_center_chat_settings('cccc0000-0000-0000-0000-000000000087', false);
SELECT public._p1_as('87878787-0000-0000-0000-000000000002');
SELECT public._p1_try('p1 send after center disables', format($q$INSERT INTO public.messages (chat_id, sender_id, content) VALUES (%L, '87878787-0000-0000-0000-000000000002', 'هل ما زال؟')$q$, current_setting('zen.c87')));
-- S10: معلّم ↔ معلّم في المركز نفسه فقط.
SELECT public._p1_as('87878787-0000-0000-0000-000000000001');
SELECT public._p1_try('p1 teacher same center', $q$SELECT public.get_or_create_direct_chat('87878787-0000-0000-0000-000000000006')$q$);
SELECT public._p1_try('p1 teacher other center', $q$SELECT public.get_or_create_direct_chat('87878787-0000-0000-0000-000000000005')$q$);
RESET ROLE;
RESET "request.jwt.claim.sub";
INSERT INTO public._t SELECT 'p1 teacher notified of report: '
  || CASE WHEN EXISTS (SELECT 1 FROM public.notifications
                        WHERE user_id = '87878787-0000-0000-0000-000000000001' AND kind = 'chat_report')
          THEN 'ok' ELSE 'FAILED' END;
INSERT INTO public._t SELECT 'p1 contact info detector: '
  || CASE WHEN public.has_contact_info('https://x.com') AND public.has_contact_info('+967 777-123-456')
           AND NOT public.has_contact_info('راجع البقرة 2:255 ثم آل عمران 1-20')
          THEN 'ok' ELSE 'FAILED' END;
DROP FUNCTION public._p1_try(text, text);
DROP FUNCTION public._p1_as(text);
-- النتيجة المتوقعة كاملة: أي اختلاف (قبولٌ لما يجب رفضه أو العكس) يُفشل القسم.
SELECT code FROM public._t WHERE code LIKE 'p1 %'
UNION ALL
SELECT 'FAILED: expected ' || array_to_string(ARRAY['p1 arabic digits phone: rejected','p1 blocker hidden from contacts: ok','p1 classmates default: rejected','p1 classmates text: ok','p1 contact info detector: ok','p1 contacts hide classmate by default: ok','p1 guardian chat context: rejected','p1 guardian reads student chat: none','p1 link: rejected','p1 manager enables dm: ok','p1 other teacher reads student chat: none','p1 phone number: rejected','p1 report message: ok','p1 reported student resolves: rejected','p1 send after center disables: rejected','p1 send after unblock: ok','p1 send to blocker: rejected','p1 student enables dm: rejected','p1 student sees reports: none','p1 teacher notified of report: ok','p1 teacher other center: rejected','p1 teacher posts in student chat: rejected','p1 teacher reads student chat: ok','p1 teacher resolves: ok','p1 teacher same center: ok','p1 teacher sees report: ok'], ' | ')
 WHERE (SELECT array_agg(code ORDER BY code) FROM public._t WHERE code LIKE 'p1 %')
       IS DISTINCT FROM ARRAY['p1 arabic digits phone: rejected','p1 blocker hidden from contacts: ok','p1 classmates default: rejected','p1 classmates text: ok','p1 contact info detector: ok','p1 contacts hide classmate by default: ok','p1 guardian chat context: rejected','p1 guardian reads student chat: none','p1 link: rejected','p1 manager enables dm: ok','p1 other teacher reads student chat: none','p1 phone number: rejected','p1 report message: ok','p1 reported student resolves: rejected','p1 send after center disables: rejected','p1 send after unblock: ok','p1 send to blocker: rejected','p1 student enables dm: rejected','p1 student sees reports: none','p1 teacher notified of report: ok','p1 teacher other center: rejected','p1 teacher posts in student chat: rejected','p1 teacher reads student chat: ok','p1 teacher resolves: ok','p1 teacher same center: ok','p1 teacher sees report: ok']
ORDER BY 1;

-- @@ 88. المحادثات — المرحلة 2: إشعار مجمَّع للرسالة الخاصة، والكتم، والإرسال بلا تكرار، وصندوق الوارد، والبحث العربي
DELETE FROM public._t;
INSERT INTO auth.users (id, phone, raw_user_meta_data) VALUES
 ('88888888-0000-0000-0000-000000000001','+967700008801','{"name":"معلّم ٨٨"}'),
 ('88888888-0000-0000-0000-000000000002','+967700008802','{"name":"طالب ٨٨"}');
INSERT INTO public.user_roles (user_id, role) VALUES ('88888888-0000-0000-0000-000000000001','teacher') ON CONFLICT DO NOTHING;
INSERT INTO public.centers (id, name, created_by) VALUES ('cccc0000-0000-0000-0000-000000000880','مركز ٨٨','88888888-0000-0000-0000-000000000001');
INSERT INTO public.halaqat (id, center_id, name, teacher_id) VALUES
 ('dddd0000-0000-0000-0000-000000000880','cccc0000-0000-0000-0000-000000000880','حلقة ٨٨','88888888-0000-0000-0000-000000000001');
INSERT INTO public.halaqa_students (halaqa_id, student_id) VALUES ('dddd0000-0000-0000-0000-000000000880','88888888-0000-0000-0000-000000000002');
INSERT INTO public.chats (id, participants) VALUES
 ('aaaaaaaa-0000-0000-0000-000000000088', ARRAY['88888888-0000-0000-0000-000000000001','88888888-0000-0000-0000-000000000002']::uuid[]);

CREATE OR REPLACE FUNCTION public._p2_unread() RETURNS bigint LANGUAGE sql AS $$
  SELECT count(*) FROM public.notifications
   WHERE user_id = '88888888-0000-0000-0000-000000000001' AND kind = 'chat_message' AND read = false $$;

SET ROLE authenticated;
SET "request.jwt.claim.sub" = '88888888-0000-0000-0000-000000000002';
INSERT INTO public.messages (chat_id, sender_id, content, client_id) VALUES
 ('aaaaaaaa-0000-0000-0000-000000000088','88888888-0000-0000-0000-000000000002','السلام عليكم يا شيخ','c0c0c0c0-0000-0000-0000-000000000001');
INSERT INTO public.messages (chat_id, sender_id, content) VALUES
 ('aaaaaaaa-0000-0000-0000-000000000088','88888888-0000-0000-0000-000000000002','إِنَّ الصَّلاةَ كانت عَلى المؤمنين');
DO $$
BEGIN
  INSERT INTO public.messages (chat_id, sender_id, content, client_id) VALUES
   ('aaaaaaaa-0000-0000-0000-000000000088','88888888-0000-0000-0000-000000000002','السلام عليكم يا شيخ','c0c0c0c0-0000-0000-0000-000000000001');
  INSERT INTO public._t VALUES ('p2 duplicate client_id: ALLOWED!');
EXCEPTION WHEN unique_violation THEN INSERT INTO public._t VALUES ('p2 duplicate client_id: rejected');
END $$;
RESET ROLE;
INSERT INTO public._t SELECT 'p2 collapsed notification: '
  || CASE WHEN public._p2_unread() = 1
           AND (SELECT body FROM public.notifications WHERE user_id = '88888888-0000-0000-0000-000000000001'
                 AND kind = 'chat_message') LIKE 'إِنَّ%'
          THEN 'ok' ELSE 'FAILED ' || public._p2_unread() END;

-- المعلّم يفتح المحادثة: تُقرأ الإشعارات، ولا إشعار جديد وهو يقرأ.
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '88888888-0000-0000-0000-000000000001';
SELECT public.mark_chat_seen('aaaaaaaa-0000-0000-0000-000000000088');
INSERT INTO public._t SELECT 'p2 inbox: '
  || CASE WHEN jsonb_array_length(public.my_inbox()) = 1
           AND public.my_inbox() -> 0 -> 'peer' ->> 'name' = 'طالب ٨٨'
           AND (public.my_inbox() -> 0 ->> 'unread')::int = 0
          THEN 'ok' ELSE 'FAILED ' || public.my_inbox()::text END;
INSERT INTO public._t SELECT 'p2 arabic search: '
  || CASE WHEN (SELECT count(*) FROM public.search_my_messages('الصلاه كانت علي')) = 1
           AND (SELECT count(*) FROM public.search_my_messages('%')) = 0
          THEN 'ok' ELSE 'FAILED' END;
SET "request.jwt.claim.sub" = '88888888-0000-0000-0000-000000000002';
INSERT INTO public.messages (chat_id, sender_id, content) VALUES
 ('aaaaaaaa-0000-0000-0000-000000000088','88888888-0000-0000-0000-000000000002','وأنت تقرأ');
RESET ROLE;
INSERT INTO public._t SELECT 'p2 opening chat clears and suppresses: '
  || CASE WHEN public._p2_unread() = 0 THEN 'ok' ELSE 'FAILED ' || public._p2_unread() END;

-- بعد مغادرة المحادثة يعود الإشعار، والكتم يوقفه.
UPDATE public.chat_reads SET last_read_at = now() - interval '5 minutes'
 WHERE chat_id = 'aaaaaaaa-0000-0000-0000-000000000088';
UPDATE public.notifications SET read = true WHERE user_id = '88888888-0000-0000-0000-000000000001';
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '88888888-0000-0000-0000-000000000002';
INSERT INTO public.messages (chat_id, sender_id, content) VALUES
 ('aaaaaaaa-0000-0000-0000-000000000088','88888888-0000-0000-0000-000000000002','بعد المغادرة');
RESET ROLE;
INSERT INTO public._t SELECT 'p2 notified after leaving: '
  || CASE WHEN public._p2_unread() = 1 THEN 'ok' ELSE 'FAILED ' || public._p2_unread() END;
UPDATE public.notifications SET read = true WHERE user_id = '88888888-0000-0000-0000-000000000001';
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '88888888-0000-0000-0000-000000000001';
SELECT public.set_chat_mute('aaaaaaaa-0000-0000-0000-000000000088', 8);
SET "request.jwt.claim.sub" = '88888888-0000-0000-0000-000000000002';
DO $$
BEGIN
  PERFORM public.set_chat_mute('aaaaaaaa-0000-0000-0000-000000000001', 8);
  INSERT INTO public._t VALUES ('p2 mute foreign chat: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('p2 mute foreign chat: rejected');
END $$;
RESET ROLE;
UPDATE public.chat_reads SET last_read_at = now() - interval '5 minutes'
 WHERE chat_id = 'aaaaaaaa-0000-0000-0000-000000000088';
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '88888888-0000-0000-0000-000000000002';
INSERT INTO public.messages (chat_id, sender_id, content) VALUES
 ('aaaaaaaa-0000-0000-0000-000000000088','88888888-0000-0000-0000-000000000002','وهي مكتومة');
RESET ROLE;
RESET "request.jwt.claim.sub";
INSERT INTO public._t SELECT 'p2 muted chat silent: '
  || CASE WHEN public._p2_unread() = 0 THEN 'ok' ELSE 'FAILED ' || public._p2_unread() END;
INSERT INTO public._t SELECT 'p2 normalize_ar: '
  || CASE WHEN public.normalize_ar('إِنَّ الصَّلاةَ') = public.normalize_ar('ان الصلاه') THEN 'ok' ELSE 'FAILED' END;
DROP FUNCTION public._p2_unread();
-- النتيجة المتوقعة كاملة: أي اختلاف (قبولٌ لما يجب رفضه أو العكس) يُفشل القسم.
SELECT code FROM public._t WHERE code LIKE 'p2 %'
UNION ALL
SELECT 'FAILED: expected ' || array_to_string(ARRAY['p2 arabic search: ok','p2 collapsed notification: ok','p2 duplicate client_id: rejected','p2 inbox: ok','p2 mute foreign chat: rejected','p2 muted chat silent: ok','p2 normalize_ar: ok','p2 notified after leaving: ok','p2 opening chat clears and suppresses: ok'], ' | ')
 WHERE (SELECT array_agg(code ORDER BY code) FROM public._t WHERE code LIKE 'p2 %')
       IS DISTINCT FROM ARRAY['p2 arabic search: ok','p2 collapsed notification: ok','p2 duplicate client_id: rejected','p2 inbox: ok','p2 mute foreign chat: rejected','p2 muted chat silent: ok','p2 normalize_ar: ok','p2 notified after leaving: ok','p2 opening chat clears and suppresses: ok']
ORDER BY 1;

-- @@ 89. المحادثات — المرحلة 3: الرد، والحذف للجميع، والتفاعلات، وإخفاء المُبلَّغ عنه في النقاش، وقراءة الإعلانات
DELETE FROM public._t;
INSERT INTO auth.users (id, phone, raw_user_meta_data) VALUES
 ('89898989-0000-0000-0000-000000000001','+967700008901','{"name":"معلّم ٨٩"}'),
 ('89898989-0000-0000-0000-000000000002','+967700008902','{"name":"أ ٨٩"}'),
 ('89898989-0000-0000-0000-000000000003','+967700008903','{"name":"ب ٨٩"}'),
 ('89898989-0000-0000-0000-000000000004','+967700008904','{"name":"ج ٨٩"}'),
 ('89898989-0000-0000-0000-000000000005','+967700008905','{"name":"د ٨٩"}');
INSERT INTO public.user_roles (user_id, role) VALUES ('89898989-0000-0000-0000-000000000001','teacher') ON CONFLICT DO NOTHING;
INSERT INTO public.centers (id, name, created_by) VALUES ('cccc0000-0000-0000-0000-000000000890','مركز ٨٩','89898989-0000-0000-0000-000000000001');
INSERT INTO public.halaqat (id, center_id, name, teacher_id) VALUES
 ('dddd0000-0000-0000-0000-000000000890','cccc0000-0000-0000-0000-000000000890','حلقة ٨٩','89898989-0000-0000-0000-000000000001');
INSERT INTO public.halaqa_students (halaqa_id, student_id) VALUES
 ('dddd0000-0000-0000-0000-000000000890','89898989-0000-0000-0000-000000000002'),
 ('dddd0000-0000-0000-0000-000000000890','89898989-0000-0000-0000-000000000003'),
 ('dddd0000-0000-0000-0000-000000000890','89898989-0000-0000-0000-000000000004'),
 ('dddd0000-0000-0000-0000-000000000890','89898989-0000-0000-0000-000000000005');
INSERT INTO public.chats (id, participants) VALUES
 ('aaaaaaaa-0000-0000-0000-000000000089', ARRAY['89898989-0000-0000-0000-000000000001','89898989-0000-0000-0000-000000000002']::uuid[]);
INSERT INTO public.messages (id, chat_id, sender_id, content) VALUES
 ('eeee0000-0000-0000-0000-000000000891','aaaaaaaa-0000-0000-0000-000000000089','89898989-0000-0000-0000-000000000001','احفظ صفحة اليوم');
INSERT INTO public.chats (id, participants) VALUES
 ('aaaaaaaa-0000-0000-0000-000000000890', ARRAY['89898989-0000-0000-0000-000000000001','89898989-0000-0000-0000-000000000003']::uuid[]);
INSERT INTO public.messages (id, chat_id, sender_id, content) VALUES
 ('eeee0000-0000-0000-0000-000000000893','aaaaaaaa-0000-0000-0000-000000000890','89898989-0000-0000-0000-000000000001','محادثة أخرى');

CREATE OR REPLACE FUNCTION public._p3_try(_label text, _sql text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE _sql;
  INSERT INTO public._t VALUES (_label || ': ok');
EXCEPTION WHEN others THEN
  INSERT INTO public._t VALUES (_label || ': rejected');
END $$;
GRANT EXECUTE ON FUNCTION public._p3_try(text, text) TO authenticated;
CREATE OR REPLACE FUNCTION public._p3_as(_uid text) RETURNS void
LANGUAGE sql AS $$ SELECT set_config('request.jwt.claim.sub', _uid, false) $$;
GRANT EXECUTE ON FUNCTION public._p3_as(text) TO authenticated;

SET ROLE authenticated;
SELECT public._p3_as('89898989-0000-0000-0000-000000000002');
SELECT public._p3_try('p3 reply in chat', $q$INSERT INTO public.messages (chat_id, sender_id, content, reply_to) VALUES ('aaaaaaaa-0000-0000-0000-000000000089','89898989-0000-0000-0000-000000000002','إن شاء الله','eeee0000-0000-0000-0000-000000000891')$q$);
SELECT public._p3_try('p3 reply across chats', $q$INSERT INTO public.messages (chat_id, sender_id, content, reply_to) VALUES ('aaaaaaaa-0000-0000-0000-000000000089','89898989-0000-0000-0000-000000000002','x','eeee0000-0000-0000-0000-000000000893')$q$);
SELECT public._p3_try('p3 react', $q$SELECT public.toggle_reaction('eeee0000-0000-0000-0000-000000000891','🤲')$q$);
INSERT INTO public._t SELECT 'p3 reaction added: '
  || CASE WHEN (SELECT count(*) FROM public.message_reactions WHERE message_id = 'eeee0000-0000-0000-0000-000000000891') = 1
          THEN 'ok' ELSE 'FAILED' END;
SELECT set_config('zen.toggled', public.toggle_reaction('eeee0000-0000-0000-0000-000000000891','🤲')::text, false);
INSERT INTO public._t SELECT 'p3 reaction removed: '
  || CASE WHEN current_setting('zen.toggled') = 'false'
           AND (SELECT count(*) FROM public.message_reactions WHERE message_id = 'eeee0000-0000-0000-0000-000000000891') = 0
          THEN 'ok' ELSE 'FAILED' END;
SELECT public._p3_try('p3 react unknown emoji', $q$SELECT public.toggle_reaction('eeee0000-0000-0000-0000-000000000891','💩')$q$);
SELECT public._p3_try('p3 delete others message', $q$SELECT public.delete_message('eeee0000-0000-0000-0000-000000000891')$q$);
SELECT public._p3_as('89898989-0000-0000-0000-000000000003');
SELECT public._p3_try('p3 outsider reacts', $q$SELECT public.toggle_reaction('eeee0000-0000-0000-0000-000000000891','👍')$q$);
SELECT public._p3_as('89898989-0000-0000-0000-000000000001');
SELECT public.toggle_reaction('eeee0000-0000-0000-0000-000000000891','✅');
SELECT public._p3_try('p3 delete own message', $q$SELECT public.delete_message('eeee0000-0000-0000-0000-000000000891')$q$);
SELECT public._p3_try('p3 edit deleted', $q$SELECT public.edit_message('eeee0000-0000-0000-0000-000000000891','عودة')$q$);
INSERT INTO public._t SELECT 'p3 deleted state: '
  || CASE WHEN (SELECT deleted_at IS NOT NULL FROM public.messages WHERE id = 'eeee0000-0000-0000-0000-000000000891')
           AND NOT EXISTS (SELECT 1 FROM public.message_reactions WHERE message_id = 'eeee0000-0000-0000-0000-000000000891')
           AND (SELECT count(*) FROM public.search_my_messages('صفحة اليوم')) = 0
          THEN 'ok' ELSE 'FAILED' END;

-- النقاش: 3 بلاغات تخفي الرسالة عن الجميع إلا المشرف ومرسلها، والإبقاء يعيدها.
SELECT set_config('zen.room89', public.set_discussion('dddd0000-0000-0000-0000-000000000890', true, false)::text, false);
SELECT public._p3_as('89898989-0000-0000-0000-000000000002');
SELECT set_config('zen.rm89', public.post_room_message(current_setting('zen.room89')::uuid, 'رسالة مزعجة')::text, false);
SELECT public._p3_as('89898989-0000-0000-0000-000000000003');
SELECT public.report_room_message(current_setting('zen.rm89')::uuid, 'إزعاج');
SELECT public._p3_as('89898989-0000-0000-0000-000000000004');
SELECT public.report_room_message(current_setting('zen.rm89')::uuid, NULL);
INSERT INTO public._t SELECT 'p3 two reports keep visible: '
  || CASE WHEN (SELECT content FROM public.room_messages WHERE id = current_setting('zen.rm89')::uuid) IS NOT NULL
          THEN 'ok' ELSE 'FAILED' END;
SELECT public._p3_as('89898989-0000-0000-0000-000000000005');
SELECT public.report_room_message(current_setting('zen.rm89')::uuid, NULL);
INSERT INTO public._t SELECT 'p3 hidden after 3 reports: '
  || CASE WHEN (SELECT content FROM public.room_messages WHERE id = current_setting('zen.rm89')::uuid) IS NULL
           AND (SELECT (x ->> 'hidden')::boolean AND x ->> 'content' IS NULL
                  FROM jsonb_array_elements(public.room_messages_page(current_setting('zen.room89')::uuid)) x
                 WHERE x ->> 'id' = current_setting('zen.rm89'))
          THEN 'ok' ELSE 'LEAKED!' END;
SELECT public._p3_try('p3 hidden table direct read', $q$SELECT count(*) FROM public.room_hidden_contents$q$);
SELECT public._p3_as('89898989-0000-0000-0000-000000000001');
INSERT INTO public._t SELECT 'p3 moderator sees hidden: '
  || CASE WHEN (SELECT x ->> 'content'
                  FROM jsonb_array_elements(public.room_messages_page(current_setting('zen.room89')::uuid)) x
                 WHERE x ->> 'id' = current_setting('zen.rm89')) = 'رسالة مزعجة'
          THEN 'ok' ELSE 'FAILED' END;
SELECT public.resolve_room_reports(current_setting('zen.rm89')::uuid, false);
INSERT INTO public._t SELECT 'p3 keep restores: '
  || CASE WHEN (SELECT content FROM public.room_messages WHERE id = current_setting('zen.rm89')::uuid) = 'رسالة مزعجة'
          THEN 'ok' ELSE 'FAILED' END;
-- قراءة الإعلانات وشارة الغرف.
RESET ROLE;
SELECT set_config('zen.ann89', (SELECT id::text FROM public.halaqa_rooms
                                 WHERE halaqa_id = 'dddd0000-0000-0000-0000-000000000890' AND kind = 'announcements'), false);
SET ROLE authenticated;
SELECT public.post_room_message(current_setting('zen.ann89')::uuid, 'غداً اختبار الجزء');
SELECT public._p3_as('89898989-0000-0000-0000-000000000002');
INSERT INTO public._t SELECT 'p3 badge counts rooms: '
  || CASE WHEN public.unread_total() >= 1 THEN 'ok' ELSE 'FAILED' END;
SELECT public.mark_room_read(current_setting('zen.ann89')::uuid);
SELECT public._p3_try('p3 student read stats', $q$SELECT public.room_read_stats(current_setting('zen.ann89')::uuid)$q$);
SELECT public._p3_as('89898989-0000-0000-0000-000000000001');
INSERT INTO public._t SELECT 'p3 read receipts: '
  || CASE WHEN (public.room_read_stats(current_setting('zen.ann89')::uuid) ->> 'total')::int = 4
           AND (SELECT max(v::int) FROM jsonb_each_text(public.room_read_stats(current_setting('zen.ann89')::uuid) -> 'messages') t(k, v)) = 1
          THEN 'ok' ELSE 'FAILED ' || public.room_read_stats(current_setting('zen.ann89')::uuid)::text END;
RESET ROLE;
RESET "request.jwt.claim.sub";
DROP FUNCTION public._p3_try(text, text);
DROP FUNCTION public._p3_as(text);
-- النتيجة المتوقعة كاملة: أي اختلاف (قبولٌ لما يجب رفضه أو العكس) يُفشل القسم.
SELECT code FROM public._t WHERE code LIKE 'p3 %'
UNION ALL
SELECT 'FAILED: expected ' || array_to_string(ARRAY['p3 badge counts rooms: ok','p3 delete others message: rejected','p3 delete own message: ok','p3 deleted state: ok','p3 edit deleted: rejected','p3 hidden after 3 reports: ok','p3 hidden table direct read: rejected','p3 keep restores: ok','p3 moderator sees hidden: ok','p3 outsider reacts: rejected','p3 react unknown emoji: rejected','p3 react: ok','p3 reaction added: ok','p3 reaction removed: ok','p3 read receipts: ok','p3 reply across chats: rejected','p3 reply in chat: ok','p3 student read stats: rejected','p3 two reports keep visible: ok'], ' | ')
 WHERE (SELECT array_agg(code ORDER BY code) FROM public._t WHERE code LIKE 'p3 %')
       IS DISTINCT FROM ARRAY['p3 badge counts rooms: ok','p3 delete others message: rejected','p3 delete own message: ok','p3 deleted state: ok','p3 edit deleted: rejected','p3 hidden after 3 reports: ok','p3 hidden table direct read: rejected','p3 keep restores: ok','p3 moderator sees hidden: ok','p3 outsider reacts: rejected','p3 react unknown emoji: rejected','p3 react: ok','p3 reaction added: ok','p3 reaction removed: ok','p3 read receipts: ok','p3 reply across chats: rejected','p3 reply in chat: ok','p3 student read stats: rejected','p3 two reports keep visible: ok']
ORDER BY 1;
-- @@ 90. المساعد — المرحلة 4: المحادثات المحفوظة للخادم فقط، والتقييم، والحصة المتبقية والاسترجاع
DELETE FROM public._t;
INSERT INTO auth.users (id, phone, raw_user_meta_data) VALUES
 ('90909090-0000-0000-0000-000000000001','+967700009001','{"name":"أ ٩٠"}'),
 ('90909090-0000-0000-0000-000000000002','+967700009002','{"name":"ب ٩٠"}');
-- الخادم (service_role) هو من يكتب المحادثة.
INSERT INTO public.ai_conversations (id, user_id, title) VALUES
 ('abab0000-0000-0000-0000-000000000901','90909090-0000-0000-0000-000000000001','خطة حفظ');
INSERT INTO public.ai_messages (id, conversation_id, role, content) VALUES
 ('acac0000-0000-0000-0000-000000000901','abab0000-0000-0000-0000-000000000901','user','اقترح خطة'),
 ('acac0000-0000-0000-0000-000000000902','abab0000-0000-0000-0000-000000000901','assistant','إليك الخطة');
SELECT public.consume_ai_quota('90909090-0000-0000-0000-000000000001','chat',120,8);
SELECT public.consume_ai_quota('90909090-0000-0000-0000-000000000001','chat',120,8);
SELECT public.refund_ai_quota('90909090-0000-0000-0000-000000000001','chat');

CREATE OR REPLACE FUNCTION public._p4_expect(_label text, _sql text, _ok boolean) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE got boolean;
BEGIN
  BEGIN
    EXECUTE _sql;
    got := true;
  EXCEPTION WHEN others THEN
    got := false;
  END;
  INSERT INTO public._t VALUES (_label || ': ' || CASE WHEN got = _ok THEN 'ok' ELSE 'FAILED' END);
END $$;
GRANT EXECUTE ON FUNCTION public._p4_expect(text, text, boolean) TO authenticated;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '90909090-0000-0000-0000-000000000001', false);
INSERT INTO public._t SELECT 'p4 owner reads history: '
  || CASE WHEN (SELECT count(*) FROM public.ai_messages) = 2 THEN 'ok' ELSE 'FAILED' END;
INSERT INTO public._t SELECT 'p4 usage after refund: '
  || CASE WHEN public.my_ai_usage('chat') = 1 THEN 'ok' ELSE 'FAILED' END;
SELECT public._p4_expect('p4 client cannot forge assistant', $q$INSERT INTO public.ai_messages (conversation_id, role, content) VALUES ('abab0000-0000-0000-0000-000000000901','assistant','مزيّف')$q$, false);
SELECT public._p4_expect('p4 client cannot create conversation', $q$INSERT INTO public.ai_conversations (user_id, title) VALUES ('90909090-0000-0000-0000-000000000001','x')$q$, false);
SELECT public._p4_expect('p4 client cannot refund', $q$SELECT public.refund_ai_quota('90909090-0000-0000-0000-000000000001','chat')$q$, false);
SELECT public._p4_expect('p4 rate assistant', $q$SELECT public.rate_ai_message('acac0000-0000-0000-0000-000000000902', 1::smallint)$q$, true);
SELECT public._p4_expect('p4 rate user message', $q$SELECT public.rate_ai_message('acac0000-0000-0000-0000-000000000901', 1::smallint)$q$, false);
SELECT public._p4_expect('p4 bad rating', $q$SELECT public.rate_ai_message('acac0000-0000-0000-0000-000000000902', 5::smallint)$q$, false);
SELECT set_config('request.jwt.claim.sub', '90909090-0000-0000-0000-000000000002', false);
INSERT INTO public._t SELECT 'p4 other user sees nothing: '
  || CASE WHEN (SELECT count(*) FROM public.ai_messages) = 0
           AND (SELECT count(*) FROM public.ai_conversations) = 0 THEN 'ok' ELSE 'FAILED' END;
SELECT public._p4_expect('p4 other user cannot rate', $q$SELECT public.rate_ai_message('acac0000-0000-0000-0000-000000000902', -1::smallint)$q$, false);
DELETE FROM public.ai_conversations WHERE id = 'abab0000-0000-0000-0000-000000000901';
SELECT set_config('request.jwt.claim.sub', '90909090-0000-0000-0000-000000000001', false);
INSERT INTO public._t SELECT 'p4 other user cannot delete: '
  || CASE WHEN (SELECT count(*) FROM public.ai_conversations) = 1 THEN 'ok' ELSE 'FAILED' END;
DELETE FROM public.ai_conversations WHERE id = 'abab0000-0000-0000-0000-000000000901';
RESET ROLE;
INSERT INTO public._t SELECT 'p4 owner deletes (cascade): '
  || CASE WHEN (SELECT count(*) FROM public.ai_messages WHERE conversation_id = 'abab0000-0000-0000-0000-000000000901') = 0
          THEN 'ok' ELSE 'FAILED' END;
RESET "request.jwt.claim.sub";
DROP FUNCTION public._p4_expect(text, text, boolean);
SELECT code FROM public._t WHERE code LIKE 'p4 %' ORDER BY code;
-- @@ 91. الأداء — المرحلة 5: حلقة من 40 طالباً، و500 رسالة في النقاش، و40 محادثة للمعلّم
DELETE FROM public._t;
INSERT INTO auth.users (id, phone, raw_user_meta_data)
SELECT ('91919191-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, '+96770091' || lpad(g::text, 4, '0'),
       jsonb_build_object('name', 'طالب ' || g)
  FROM generate_series(0, 40) g;
INSERT INTO public.user_roles (user_id, role) VALUES ('91919191-0000-0000-0000-000000000000','teacher') ON CONFLICT DO NOTHING;
INSERT INTO public.centers (id, name, created_by) VALUES ('cccc0000-0000-0000-0000-000000000910','مركز ٩١','91919191-0000-0000-0000-000000000000');
INSERT INTO public.halaqat (id, center_id, name, teacher_id) VALUES
 ('dddd0000-0000-0000-0000-000000000910','cccc0000-0000-0000-0000-000000000910','حلقة ٩١','91919191-0000-0000-0000-000000000000');
INSERT INTO public.halaqa_students (halaqa_id, student_id)
SELECT 'dddd0000-0000-0000-0000-000000000910', ('91919191-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid
  FROM generate_series(1, 40) g;
INSERT INTO public.halaqa_rooms (halaqa_id, kind, enabled, consent_required)
VALUES ('dddd0000-0000-0000-0000-000000000910', 'discussion', true, false);
SELECT set_config('zen.room91', (SELECT id::text FROM public.halaqa_rooms
                                  WHERE halaqa_id = 'dddd0000-0000-0000-0000-000000000910' AND kind = 'discussion'), false);
INSERT INTO public.room_messages (room_id, sender_id, content, created_at)
SELECT current_setting('zen.room91')::uuid,
       ('91919191-0000-0000-0000-' || lpad((1 + g % 40)::text, 12, '0'))::uuid,
       'مراجعة الجزء ' || g, now() - (g || ' minutes')::interval
  FROM generate_series(1, 500) g;
INSERT INTO public.chats (id, participants)
SELECT ('aaaaaaaa-0000-0000-0091-' || lpad(g::text, 12, '0'))::uuid,
       ARRAY['91919191-0000-0000-0000-000000000000', ('91919191-0000-0000-0000-' || lpad(g::text, 12, '0'))]::uuid[]
  FROM generate_series(1, 40) g;
INSERT INTO public.messages (chat_id, sender_id, content, created_at)
SELECT ('aaaaaaaa-0000-0000-0091-' || lpad((1 + g % 40)::text, 12, '0'))::uuid,
       ('91919191-0000-0000-0000-' || lpad((1 + g % 40)::text, 12, '0'))::uuid,
       'السلام عليكم ' || g, now() - (g || ' seconds')::interval
  FROM generate_series(1, 2000) g;

CREATE OR REPLACE FUNCTION public._p5_time(_label text, _sql text, _max_ms int) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE t0 timestamptz; ms numeric;
BEGIN
  t0 := clock_timestamp();
  EXECUTE _sql;
  ms := extract(epoch FROM clock_timestamp() - t0) * 1000;
  INSERT INTO public._t VALUES (_label || ': ' || CASE WHEN ms <= _max_ms THEN 'ok' ELSE 'FAILED' END
                                || ' (' || round(ms) || 'ms)');
END $$;
GRANT EXECUTE ON FUNCTION public._p5_time(text, text, int) TO authenticated;
ANALYZE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '91919191-0000-0000-0000-000000000000', false);
-- حدود سخيّة لبيئة الاختبار؛ الغرض كشف الانحدار (مسح كامل أو N+1)، لا القياس الدقيق.
SELECT public._p5_time('p5 teacher inbox (40 chats, 2000 msgs)', $q$SELECT public.my_inbox()$q$, 800);
SELECT public._p5_time('p5 room page (500 msgs)', $q$SELECT public.room_messages_page(current_setting('zen.room91')::uuid)$q$, 800);
SELECT public._p5_time('p5 room older page', $q$SELECT public.room_messages_page(current_setting('zen.room91')::uuid, now() - interval '200 minutes')$q$, 800);
SELECT public._p5_time('p5 my rooms', $q$SELECT public.my_rooms()$q$, 800);
SELECT public._p5_time('p5 unread total', $q$SELECT public.unread_total()$q$, 800);
SELECT public._p5_time('p5 search', $q$SELECT public.search_my_messages('عليكم', 30)$q$, 1500);
SELECT public._p5_time('p5 chat page (RLS)', $q$SELECT id FROM public.messages WHERE chat_id = 'aaaaaaaa-0000-0000-0091-000000000001' ORDER BY created_at DESC LIMIT 50$q$, 500);
SELECT set_config('request.jwt.claim.sub', '91919191-0000-0000-0000-000000000007', false);
SELECT public._p5_time('p5 student rooms', $q$SELECT public.my_rooms()$q$, 800);
SELECT set_config('request.jwt.claim.sub', '91919191-0000-0000-0000-000000000000', false);
SELECT public._p5_time('p5 read stats (40 members)', $q$SELECT public.room_read_stats(current_setting('zen.room91')::uuid)$q$, 800);
RESET ROLE;
RESET "request.jwt.claim.sub";
DROP FUNCTION public._p5_time(text, text, int);
SELECT code FROM public._t WHERE code LIKE 'p5 %' ORDER BY code;

-- @@ 92. المرحلة 6.1: المعلّم ينشئ حساب طالب باسم مستخدم في حلقته فقط، ويُلزَم الطالب بتغيير كلمة المرور
DELETE FROM public._t;
CREATE TABLE public._tc (k text PRIMARY KEY, v jsonb);
GRANT ALL ON public._tc TO authenticated;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '77777777-7777-7777-7777-777777777771';
INSERT INTO public._tc SELECT 'tc1', public.teacher_create_student(
  'dddd0000-0000-0000-0000-00000000077a', 'Tc_Student1', 'teacher-made-1', '  طالب   جديد ');
DO $$ BEGIN
  PERFORM public.teacher_create_student('dddd0000-0000-0000-0000-00000000077a', 'tc_student1', 'teacher-made-2', 'منتحل');
  INSERT INTO public._t VALUES ('tc duplicate username: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('tc duplicate username: rejected');
END $$;
DO $$ BEGIN
  PERFORM public.teacher_create_student('dddd0000-0000-0000-0000-00000000077a', 'admin', 'teacher-made-3', 'محجوز');
  INSERT INTO public._t VALUES ('tc reserved username: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('tc reserved username: rejected');
END $$;
DO $$ BEGIN
  PERFORM public.teacher_create_student('dddd0000-0000-0000-0000-00000000077a', 'tc_weak', 'short', 'ضعيف');
  INSERT INTO public._t VALUES ('tc weak password: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('tc weak password: rejected');
END $$;
DO $$ BEGIN
  PERFORM public.teacher_create_student('dddd0000-0000-0000-0000-00000000077a', 'tc_noname', 'teacher-made-4', ' ا ');
  INSERT INTO public._t VALUES ('tc short name: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('tc short name: rejected');
END $$;
DO $$ BEGIN
  PERFORM public.teacher_create_student(NULL, 'tc_nohalaqa', 'teacher-made-5', 'بلا حلقة');
  INSERT INTO public._t VALUES ('tc no halaqa: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('tc no halaqa: rejected');
END $$;
-- معلّم آخر (عضو في الحلقة لكنه لا يديرها) وطالب: مرفوضان.
SET "request.jwt.claim.sub" = '77777777-7777-7777-7777-777777777772';
DO $$ BEGIN
  PERFORM public.teacher_create_student('dddd0000-0000-0000-0000-00000000077a', 'tc_other', 'teacher-made-6', 'دخيل');
  INSERT INTO public._t VALUES ('tc other teacher: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('tc other teacher: rejected');
END $$;
SET "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
DO $$ BEGIN
  PERFORM public.teacher_create_student('dddd0000-0000-0000-0000-00000000077a', 'tc_student_made', 'teacher-made-7', 'دخيل');
  INSERT INTO public._t VALUES ('tc student caller: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('tc student caller: rejected');
END $$;
RESET "request.jwt.claim.sub";
RESET ROLE;
INSERT INTO public._t SELECT 'tc anon execute: '
  || CASE WHEN has_function_privilege('anon', 'public.teacher_create_student(uuid, text, text, text)', 'execute')
          THEN 'ALLOWED!' ELSE 'rejected' END;
INSERT INTO public._t SELECT 'tc created: '
  || CASE WHEN r.v ->> 'username' = 'tc_student1'
           AND r.v ->> 'recovery_code' ~ '^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$'
           AND u.email = public.username_email('tc_student1') AND u.email_confirmed_at IS NOT NULL
           AND u.encrypted_password = extensions.crypt('teacher-made-1', u.encrypted_password)
           AND p.name = 'طالب جديد'
           AND s.must_change_password AND s.password_set_by = '77777777-7777-7777-7777-777777777771'
           AND EXISTS (SELECT 1 FROM public.halaqa_students hs
                        WHERE hs.halaqa_id = 'dddd0000-0000-0000-0000-00000000077a' AND hs.student_id = u.id)
           AND EXISTS (SELECT 1 FROM public.auth_rate_events e WHERE e.kind = 'teacher_create')
      THEN 'ok' ELSE 'FAILED' END
  FROM public._tc r
  JOIN auth.users u ON u.id = (r.v ->> 'student_id')::uuid
  JOIN public.profiles p ON p.id = u.id
  JOIN public.account_secrets s ON s.user_id = u.id
 WHERE r.k = 'tc1';
INSERT INTO public._t SELECT 'tc no extra accounts: '
  || CASE WHEN (SELECT count(*) FROM public.account_usernames WHERE username LIKE 'tc\_%') = 1
      THEN 'ok' ELSE 'FAILED' END;
DROP TABLE public._tc;
SELECT code FROM public._t WHERE code LIKE 'tc %' ORDER BY code;

-- @@ 93. المرحلة 6.4: نبضة المجدول للخادم وحده، وتعود بهدوء بلا شبكة ولا أسرار
DELETE FROM public._t;
INSERT INTO public._t SELECT 'pt anon execute: '
  || CASE WHEN has_function_privilege('anon', 'public.push_dispatch_tick()', 'execute')
          THEN 'ALLOWED!' ELSE 'rejected' END;
INSERT INTO public._t SELECT 'pt authenticated execute: '
  || CASE WHEN has_function_privilege('authenticated', 'public.push_dispatch_tick()', 'execute')
          THEN 'ALLOWED!' ELSE 'rejected' END;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
DO $$ BEGIN
  PERFORM public.push_dispatch_tick();
  INSERT INTO public._t VALUES ('pt user call: ALLOWED!');
EXCEPTION WHEN insufficient_privilege THEN INSERT INTO public._t VALUES ('pt user call: rejected');
END $$;
RESET "request.jwt.claim.sub";
RESET ROLE;
UPDATE public.push_outbox SET sent_at = now() WHERE sent_at IS NULL AND failed_at IS NULL;
INSERT INTO public._t SELECT 'pt idle: ' || CASE WHEN public.push_dispatch_tick() = 'idle' THEN 'ok' ELSE 'FAILED' END;
INSERT INTO public.push_outbox (user_id, category, title, send_after)
VALUES ('22222222-2222-2222-2222-222222222222', 'test', 'نبضة', now() - interval '1 minute');
-- لا pg_net في قاعدة الاختبار: تعود بهدوء ولا ترمي.
INSERT INTO public._t SELECT 'pt due without pg_net: '
  || CASE WHEN public.push_dispatch_tick() IN ('no_pg_net', 'not_configured') THEN 'ok' ELSE 'FAILED' END;
DELETE FROM public.push_outbox WHERE category = 'test' AND title = 'نبضة';
SELECT code FROM public._t WHERE code LIKE 'pt %' ORDER BY code;

-- @@ 94. المرحلة 7.1: لا دالة مشغّل قابلة للتنفيذ من العميل، وما يبقى لـ anon هو الأربع الموثَّقة فقط (والرابعة التحقق العام 1.23.0)
DELETE FROM public._t;
INSERT INTO public._t
SELECT 'ss trigger fn executable: ' || p.proname || ' ALLOWED!'
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.prorettype IN ('trigger'::regtype, 'event_trigger'::regtype)
   AND (has_function_privilege('anon', p.oid, 'execute')
        OR has_function_privilege('authenticated', p.oid, 'execute'));
INSERT INTO public._t
SELECT 'ss anon definer: ' || p.oid::regprocedure::text || ' ALLOWED!'
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.prosecdef AND has_function_privilege('anon', p.oid, 'execute')
   AND p.proname NOT IN ('log_client_error', 'register_username_account', 'reset_password_with_recovery_code',
                         'verify_certificate_public');
INSERT INTO public._t SELECT 'ss documented anon functions: '
  || CASE WHEN (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.prosecdef
                   AND has_function_privilege('anon', p.oid, 'execute')) = 4
      THEN 'ok' ELSE 'FAILED' END;
-- نداء دالة مشغّل عبر RPC مرفوض بالصلاحية قبل أي شيء آخر.
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
DO $$ BEGIN
  PERFORM public.touch_ai_conversation();
  INSERT INTO public._t VALUES ('ss rpc trigger fn: ALLOWED!');
EXCEPTION WHEN insufficient_privilege THEN INSERT INTO public._t VALUES ('ss rpc trigger fn: rejected');
END $$;
RESET "request.jwt.claim.sub";
RESET ROLE;
-- المشغّلات نفسها ما زالت تعمل: كل الأقسام السابقة (رسائل، محادثات، مساعد…) تُنفَّذ بدور authenticated
-- بعد هذا الترحيل وتمرّ بمشغّلاته، فنجاحها هو الدليل.
-- عنوان الطلب: cf-connecting-ip يغلب x-forwarded-for الذي يرسله العميل.
SELECT set_config('request.headers', '{"x-forwarded-for":"6.6.6.6, 1.1.1.1","cf-connecting-ip":"9.9.9.9"}', false);
INSERT INTO public._t SELECT 'ss request ip cf: ' || CASE WHEN public._request_ip() = '9.9.9.9' THEN 'ok' ELSE 'FAILED' END;
SELECT set_config('request.headers', '{"x-forwarded-for":"6.6.6.6, 1.1.1.1"}', false);
INSERT INTO public._t SELECT 'ss request ip xff fallback: ' || CASE WHEN public._request_ip() = '6.6.6.6' THEN 'ok' ELSE 'FAILED' END;
SELECT set_config('request.headers', '', false);
INSERT INTO public._t SELECT 'ss request ip none: ' || CASE WHEN public._request_ip() = 'unknown' THEN 'ok' ELSE 'FAILED' END;
SELECT code FROM public._t WHERE code LIKE 'ss %' ORDER BY code;

-- @@ 95. المرحلة 7.3: auth.uid() محسوب مرة في كل السياسات، وقراءة القصص بسياسة واحدة، وفهارس المفاتيح الأجنبية
DELETE FROM public._t;
-- أي سياسة جديدة تنادي auth.uid()/auth.jwt()/auth.role() دون (select …) تفشل هنا.
INSERT INTO public._t
SELECT 'ri unwrapped auth call: ' || tablename || ' / ' || policyname || ' FAILED'
  FROM pg_policies
 WHERE schemaname IN ('public', 'storage')
   AND regexp_replace(coalesce(qual, '') || ' ' || coalesce(with_check, ''),
                      '\( SELECT auth\.(uid|role|jwt)\(\) AS \w+\)', '', 'g') ~ 'auth\.(uid|role|jwt)\(\)';
INSERT INTO public._t SELECT 'ri stories one select policy: '
  || CASE WHEN (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'stories'
                 AND cmd IN ('SELECT', 'ALL')) = 1 THEN 'ok' ELSE 'FAILED' END;
INSERT INTO public._t
SELECT 'ri fk without index: ' || fk || ' FAILED' FROM (
  SELECT c.conrelid::regclass::text || '(' || a.attname || ')' AS fk
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
   WHERE c.contype = 'f' AND c.connamespace = 'public'::regnamespace AND array_length(c.conkey, 1) = 1
     AND NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid = c.conrelid AND i.indkey[0] = c.conkey[1])
) x
WHERE fk IN ('challenge_logs(student_id)', 'challenge_parts(claimed_by)', 'chat_mutes(user_id)',
             'exam_errors(result_id)', 'exam_results(exam_id)', 'guardian_weekly_sent(student_id)',
             'memorization_plans(teacher_id)', 'message_reactions(user_id)', 'message_reports(reporter_id)',
             'messages(reply_to)', 'mushaf_records(halaqa_id)', 'mushaf_records(teacher_id)',
             'push_outbox(notification_id)', 'recitation_sessions(assignment_id)',
             'recitation_sessions(halaqa_id)', 'room_consents(student_id)', 'room_mutes(user_id)',
             'room_reads(user_id)', 'room_reports(reporter_id)', 'story_progress(story_id)');
-- السلوك لم يتغيّر: الزائر والطالب يقرآن، والمعلّم وحده يكتب.
INSERT INTO public.stories (id, prophet, title) VALUES ('95959595-0000-0000-0000-000000000001', 'نوح', 'قصة اختبار');
SET ROLE anon;
INSERT INTO public._t SELECT 'ri anon reads stories: '
  || CASE WHEN EXISTS (SELECT 1 FROM public.stories WHERE id = '95959595-0000-0000-0000-000000000001')
      THEN 'ok' ELSE 'FAILED' END;
RESET ROLE;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
DO $$ BEGIN
  INSERT INTO public.stories (prophet, title) VALUES ('هود', 'من طالب');
  INSERT INTO public._t VALUES ('ri student writes story: ALLOWED!');
EXCEPTION WHEN insufficient_privilege THEN INSERT INTO public._t VALUES ('ri student writes story: rejected');
END $$;
UPDATE public.stories SET title = 'عبث' WHERE id = '95959595-0000-0000-0000-000000000001';
SET "request.jwt.claim.sub" = '77777777-7777-7777-7777-777777777771';
UPDATE public.stories SET title = 'قصة معدَّلة' WHERE id = '95959595-0000-0000-0000-000000000001';
RESET "request.jwt.claim.sub";
RESET ROLE;
INSERT INTO public._t SELECT 'ri only teacher updates story: '
  || CASE WHEN (SELECT title FROM public.stories WHERE id = '95959595-0000-0000-0000-000000000001') = 'قصة معدَّلة'
      THEN 'ok' ELSE 'FAILED' END;
DELETE FROM public.stories WHERE id = '95959595-0000-0000-0000-000000000001';
SELECT code FROM public._t WHERE code LIKE 'ri %' ORDER BY code;

-- @@ 96. المرحلة 7.2: دوال شروط السياسات في private، ولا تُطلب عبر /rpc من public
DELETE FROM public._t;
-- كل دالة SECURITY DEFINER في public تستدعيها سياسة يجب أن تكون مما تناديه الواجهة فعلاً.
INSERT INTO public._t
SELECT DISTINCT 'pp policy uses public definer: ' || p.proname || ' FAILED'
  FROM pg_depend d
  JOIN pg_policy pol ON d.classid = 'pg_policy'::regclass AND d.objid = pol.oid
  JOIN pg_proc p ON d.refclassid = 'pg_proc'::regclass AND d.refobjid = p.oid
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.prosecdef AND p.proname NOT IN ('can_post_in_chat');
INSERT INTO public._t
SELECT 'pp public copy executable: ' || p.proname || ' ALLOWED!'
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('can_manage_schedule', 'can_read_chat', 'can_read_room', 'can_start_chat',
                     'can_view_center', 'can_view_schedule', 'is_guardian_of', 'is_teacher',
                     'manages_halaqa', 'owns_center', 'supervises_chat', 'teaches_student')
   AND (has_function_privilege('anon', p.oid, 'execute')
        OR has_function_privilege('authenticated', p.oid, 'execute'));
INSERT INTO public._t SELECT 'pp private copies: '
  || CASE WHEN (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'private') >= 16 THEN 'ok' ELSE 'FAILED' END; -- 13 + شرطا الصوت (9.7) + مولّد رمز الشهادة (10.2)؛ والفحص 118 يعدّ تكملة 7.2
INSERT INTO public._t SELECT 'pp service role keeps public: '
  || CASE WHEN has_function_privilege('service_role', 'public.teaches_student(uuid, uuid)', 'execute')
      THEN 'ok' ELSE 'FAILED' END;
-- الطالب ينادي الشرط عبر /rpc (public) فيُرفض، والسياسة نفسها تعمل (الأقسام السابقة كلها).
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
DO $$ BEGIN
  PERFORM public.teaches_student('22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222');
  INSERT INTO public._t VALUES ('pp rpc public predicate: ALLOWED!');
EXCEPTION WHEN insufficient_privilege THEN INSERT INTO public._t VALUES ('pp rpc public predicate: rejected');
END $$;
RESET "request.jwt.claim.sub";
RESET ROLE;
SELECT code FROM public._t WHERE code LIKE 'pp %' ORDER BY code;

-- @@ 97. المرحلة 7.7: تنبيه الأخطاء كل ساعة لصاحب التطبيق، و«صحة التطبيق» له وحده
DELETE FROM public._t;
INSERT INTO public.app_owner (id, user_id) VALUES (true, 'f0000000-0000-0000-0000-000000000004')
  ON CONFLICT (id) DO UPDATE SET user_id = excluded.user_id;
DELETE FROM public.error_alert_runs;
DELETE FROM public.notifications WHERE kind = 'app_health';
-- أخطاء في الساعة الماضية تتجاوز الحد.
INSERT INTO public.client_errors (fingerprint, message, url, occurrences, last_seen_at, stack, user_id)
VALUES ('al1', 'boom alert', '/today', 60, date_trunc('hour', now()) - interval '30 minutes', 'SECRET STACK',
        '22222222-2222-2222-2222-222222222222');
SELECT set_config('zen.ea', public.app_error_alert_tick(50) ->> 'notified', false);
INSERT INTO public._t SELECT 'ea tick notifies: '
  || CASE WHEN current_setting('zen.ea') = 'true'
           AND (SELECT count(*) FROM public.notifications WHERE kind = 'app_health'
                 AND user_id = 'f0000000-0000-0000-0000-000000000004') = 1 THEN 'ok' ELSE 'FAILED' END;
INSERT INTO public._t SELECT 'ea second run same hour: '
  || CASE WHEN public.app_error_alert_tick(50) ->> 'status' = 'already'
           AND (SELECT count(*) FROM public.notifications WHERE kind = 'app_health') = 1 THEN 'ok' ELSE 'FAILED' END;
-- ساعة لاحقة ما زالت ضمن 6 ساعات: لا إشعار ثانٍ.
UPDATE public.error_alert_runs SET hour = hour - interval '2 hours';
INSERT INTO public._t SELECT 'ea cooldown: '
  || CASE WHEN public.app_error_alert_tick(50) ->> 'notified' = 'false'
           AND (SELECT count(*) FROM public.notifications WHERE kind = 'app_health') = 1 THEN 'ok' ELSE 'FAILED' END;
-- تحت الحد: لا إشعار.
DELETE FROM public.error_alert_runs;
INSERT INTO public._t SELECT 'ea below threshold: '
  || CASE WHEN public.app_error_alert_tick(1000) ->> 'notified' = 'false' THEN 'ok' ELSE 'FAILED' END;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
DO $$ BEGIN
  PERFORM public.app_error_alert_tick(1);
  INSERT INTO public._t VALUES ('ea user runs tick: ALLOWED!');
EXCEPTION WHEN insufficient_privilege THEN INSERT INTO public._t VALUES ('ea user runs tick: rejected');
END $$;
DO $$ BEGIN
  PERFORM count(*) FROM public.error_alert_runs;
  INSERT INTO public._t VALUES ('ea user reads runs: ALLOWED!');
EXCEPTION WHEN insufficient_privilege THEN INSERT INTO public._t VALUES ('ea user reads runs: rejected');
END $$;
INSERT INTO public._t SELECT 'ea non-owner health: '
  || CASE WHEN public.app_health(7) = '{"status":"not_owner"}'::jsonb AND NOT public.is_app_owner()
      THEN 'ok' ELSE 'ALLOWED!' END;
SET "request.jwt.claim.sub" = 'f0000000-0000-0000-0000-000000000004';
INSERT INTO public._t SELECT 'ea owner health: '
  || CASE WHEN public.is_app_owner() AND public.app_health(7) ->> 'status' = 'ok'
           AND (public.app_health(7) ->> 'errors_24h')::int >= 60
           AND jsonb_typeof(public.app_health(7) -> 'top') = 'array'
           AND public.app_health(7) -> 'top' -> 0 ->> 'message' = 'boom alert' THEN 'ok' ELSE 'FAILED' END;
INSERT INTO public._t SELECT 'ea health hides stack and users: '
  || CASE WHEN public.app_health(7)::text !~ '(SECRET STACK|22222222-2222)' THEN 'ok' ELSE 'LEAKED!' END;
RESET ROLE;
RESET "request.jwt.claim.sub";
SET ROLE anon;
DO $$ BEGIN
  PERFORM public.app_health(7);
  INSERT INTO public._t VALUES ('ea anon health: ALLOWED!');
EXCEPTION WHEN insufficient_privilege THEN INSERT INTO public._t VALUES ('ea anon health: rejected');
END $$;
RESET ROLE;
DELETE FROM public.client_errors WHERE fingerprint = 'al1';
DELETE FROM public.app_owner;
SELECT code FROM public._t WHERE code LIKE 'ea %' ORDER BY code;

-- @@ 98. المرحلة 8.2: طابور اليوم للطالب نفسه، وقراءة لولي أمره، ولا لغيرهما
DELETE FROM public._t;
INSERT INTO auth.users (id, phone, raw_user_meta_data) VALUES
 ('98989898-0000-0000-0000-000000000001','+967700009801','{"name":"طالب ٩٨"}'),
 ('98989898-0000-0000-0000-000000000002','+967700009802','{"name":"وليّ ٩٨"}'),
 ('98989898-0000-0000-0000-000000000003','+967700009803','{"name":"غريب ٩٨"}');
INSERT INTO public.guardian_links (guardian_id, student_id, relation)
VALUES ('98989898-0000-0000-0000-000000000002', '98989898-0000-0000-0000-000000000001', 'father');
INSERT INTO public.assignments (student_id, surah_name, from_ayah, to_ayah, kind, status, due_date)
VALUES ('98989898-0000-0000-0000-000000000001', 'الملك', 1, 5, 'memorize', 'pending', public.zen_today()),
       ('98989898-0000-0000-0000-000000000001', 'الملك', 6, 10, 'memorize', 'approved', public.zen_today() - 3);
SET session_replication_role = replica; -- بلا مشغّل updated_at: واجب قديم أُنجز قبل 3 أيام
UPDATE public.assignments SET updated_at = now() - interval '3 days'
 WHERE student_id = '98989898-0000-0000-0000-000000000001' AND status = 'approved';
SET session_replication_role = origin;
INSERT INTO public.review_cards (student_id, surah_name, from_ayah, to_ayah, due_date)
VALUES ('98989898-0000-0000-0000-000000000001', 'النبأ', 1, 10, public.zen_today() - 1),
       ('98989898-0000-0000-0000-000000000001', 'النبأ', 11, 20, public.zen_today() + 5);
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '98989898-0000-0000-0000-000000000001';
SELECT set_config('zen.q', public.my_today_queue()::text, false);
INSERT INTO public._t SELECT 'tq own kinds: ' || CASE WHEN (
  SELECT string_agg(i ->> 'kind' || CASE WHEN (i ->> 'done')::boolean THEN '✓' ELSE '' END, ',')
    FROM jsonb_array_elements(current_setting('zen.q')::jsonb -> 'items') i)
  = 'assignment,review,wird' THEN 'ok' ELSE 'FAILED' END;
-- 5 آيات حفظ ×2 = 10، و10 آيات مراجعة ×0.5 = 5، والورد 15.
INSERT INTO public._t SELECT 'tq minutes: ' || CASE WHEN
  (current_setting('zen.q')::jsonb ->> 'total_minutes')::int = 30 THEN 'ok' ELSE 'FAILED' END;
-- المراجعة اليوم تشطب بند المراجعة، وتسجيل الورد يشطب الورد.
SELECT public.apply_review('98989898-0000-0000-0000-000000000001', 'النبأ', 1, 10, 95);
INSERT INTO public.daily_wird (student_id, day, pages) VALUES ('98989898-0000-0000-0000-000000000001', public.zen_today(), 2);
INSERT INTO public._t SELECT 'tq after review+wird: ' || CASE WHEN (
  SELECT string_agg(i ->> 'kind' || CASE WHEN (i ->> 'done')::boolean THEN '✓' ELSE '' END, ',')
    FROM jsonb_array_elements(public.my_today_queue() -> 'items') i)
  = 'assignment,review✓,wird✓' THEN 'ok' ELSE 'FAILED' END;
SET "request.jwt.claim.sub" = '98989898-0000-0000-0000-000000000002';
INSERT INTO public._t SELECT 'tq guardian reads: '
  || CASE WHEN jsonb_array_length(public.guardian_today_queue('98989898-0000-0000-0000-000000000001') -> 'items') = 3
      THEN 'ok' ELSE 'FAILED' END;
SET "request.jwt.claim.sub" = '98989898-0000-0000-0000-000000000003';
DO $$ BEGIN
  PERFORM public.guardian_today_queue('98989898-0000-0000-0000-000000000001');
  INSERT INTO public._t VALUES ('tq stranger guardian read: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('tq stranger guardian read: rejected');
END $$;
INSERT INTO public._t SELECT 'tq stranger own queue empty: '
  || CASE WHEN (SELECT count(*) FROM jsonb_array_elements(public.my_today_queue() -> 'items') i
                 WHERE i ->> 'kind' <> 'wird') = 0 THEN 'ok' ELSE 'LEAKED!' END;
-- معلّم (ليس ولي أمر) لا يقرأ طابور الطالب عبر دالة ولي الأمر.
SET "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
DO $$ BEGIN
  PERFORM public.guardian_today_queue('98989898-0000-0000-0000-000000000001');
  INSERT INTO public._t VALUES ('tq teacher via guardian fn: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('tq teacher via guardian fn: rejected');
END $$;
DO $$ BEGIN
  PERFORM public.today_queue_for('98989898-0000-0000-0000-000000000001');
  INSERT INTO public._t VALUES ('tq internal fn: ALLOWED!');
EXCEPTION WHEN insufficient_privilege THEN INSERT INTO public._t VALUES ('tq internal fn: rejected');
END $$;
RESET "request.jwt.claim.sub";
RESET ROLE;
SELECT code FROM public._t WHERE code LIKE 'tq %' ORDER BY code;

-- @@ 99. المرحلة 8.4: حصة التسميع المباشر (live_recite) بحدّ الدقيقة، ولا تنفيذ من العميل
DELETE FROM public._t;
DELETE FROM public.ai_usage_events WHERE user_id = '98989898-0000-0000-0000-000000000001' AND feature = 'live_recite';
INSERT INTO public._t
SELECT 'lr minute cap: ' || CASE WHEN string_agg(r, ',' ORDER BY n) = 'true,true,false' THEN 'ok' ELSE 'FAILED ' || string_agg(r, ',' ORDER BY n) END
  FROM (SELECT n, (public.consume_ai_quota('98989898-0000-0000-0000-000000000001', 'live_recite', 450, 2)) ->> 'allowed' AS r
          FROM generate_series(1, 3) n) x;
SELECT public.refund_ai_quota('98989898-0000-0000-0000-000000000001', 'live_recite');
INSERT INTO public._t SELECT 'lr refund: ' || CASE WHEN count(*) = 1 THEN 'ok' ELSE 'FAILED ' || count(*) END
  FROM public.ai_usage_events WHERE user_id = '98989898-0000-0000-0000-000000000001' AND feature = 'live_recite';
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '98989898-0000-0000-0000-000000000001';
DO $$ BEGIN
  PERFORM public.consume_ai_quota('98989898-0000-0000-0000-000000000001', 'live_recite', 100000, 100000);
  INSERT INTO public._t VALUES ('lr client quota: ALLOWED!');
EXCEPTION WHEN insufficient_privilege THEN INSERT INTO public._t VALUES ('lr client quota: rejected');
END $$;
RESET "request.jwt.claim.sub";
RESET ROLE;
SELECT code FROM public._t WHERE code LIKE 'lr %' ORDER BY code;

-- @@ 100. المرحلة 9.1: سجل الحلقة في معاملة واحدة، لمدير الحلقة فقط، ولطلابها فقط، وبلا تكرار
DELETE FROM public._t;
INSERT INTO auth.users (id, phone, raw_user_meta_data) VALUES
 ('10010010-0000-0000-0000-000000000001','+967700010001','{"name":"معلّم السجل"}'),
 ('10010010-0000-0000-0000-000000000002','+967700010002','{"name":"معلّم آخر"}'),
 ('10010010-0000-0000-0000-000000000003','+967700010003','{"name":"طالب الحلقة"}'),
 ('10010010-0000-0000-0000-000000000004','+967700010004','{"name":"طالب غريب"}');
INSERT INTO public.user_roles (user_id, role) VALUES
 ('10010010-0000-0000-0000-000000000001','teacher'), ('10010010-0000-0000-0000-000000000002','teacher')
ON CONFLICT DO NOTHING;
INSERT INTO public.centers (id, name, created_by)
VALUES ('10010010-0000-0000-0000-0000000000cc', 'مركز السجل', '10010010-0000-0000-0000-000000000001');
INSERT INTO public.halaqat (id, center_id, name, teacher_id)
VALUES ('10010010-0000-0000-0000-0000000000aa', '10010010-0000-0000-0000-0000000000cc', 'حلقة السجل', '10010010-0000-0000-0000-000000000001');
INSERT INTO public.halaqa_students (halaqa_id, student_id)
VALUES ('10010010-0000-0000-0000-0000000000aa', '10010010-0000-0000-0000-000000000003');
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '10010010-0000-0000-0000-000000000001';
SELECT set_config('zen.r1', public.record_halaqa_session('10010010-0000-0000-0000-0000000000aa', public.zen_today(),
  '[{"student_id":"10010010-0000-0000-0000-000000000003","status":"present","surah_name":"الملك","from_ayah":1,"to_ayah":10,"grade":4,"error_type":"tajweed"}]')::text, false);
INSERT INTO public._t SELECT 'reg first: ' || CASE WHEN current_setting('zen.r1')::jsonb = '{"created":1,"updated":0,"reviews":1}' THEN 'ok' ELSE 'FAILED ' || current_setting('zen.r1') END;
-- إعادة الإرسال نفسه (صندوق بلا اتصال): تحديث، بلا صف جديد ولا جدولة ثانية.
SELECT set_config('zen.r2', public.record_halaqa_session('10010010-0000-0000-0000-0000000000aa', public.zen_today(),
  '[{"student_id":"10010010-0000-0000-0000-000000000003","status":"late","surah_name":"الملك","from_ayah":1,"to_ayah":12,"grade":5}]')::text, false);
INSERT INTO public._t SELECT 'reg repeat: ' || CASE WHEN current_setting('zen.r2')::jsonb = '{"created":0,"updated":1,"reviews":0}' THEN 'ok' ELSE 'FAILED ' || current_setting('zen.r2') END;
RESET ROLE;
INSERT INTO public._t SELECT 'reg no dup: ' || CASE WHEN
  (SELECT count(*) FROM public.attendance WHERE student_id = '10010010-0000-0000-0000-000000000003') = 1
  AND (SELECT count(*) FROM public.recitation_sessions WHERE student_id = '10010010-0000-0000-0000-000000000003') = 1
  AND (SELECT count(*) FROM public.recitation_assessments WHERE student_id = '10010010-0000-0000-0000-000000000003') = 1
  AND (SELECT repetitions FROM public.review_cards WHERE student_id = '10010010-0000-0000-0000-000000000003') = 1
  AND (SELECT status FROM public.attendance WHERE student_id = '10010010-0000-0000-0000-000000000003') = 'late'
  AND (SELECT to_ayah FROM public.recitation_sessions WHERE student_id = '10010010-0000-0000-0000-000000000003') = 12
  AND (SELECT score FROM public.recitation_assessments WHERE student_id = '10010010-0000-0000-0000-000000000003') = 95
  THEN 'ok' ELSE 'FAILED' END;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '10010010-0000-0000-0000-000000000001';
DO $$ BEGIN
  PERFORM public.record_halaqa_session('10010010-0000-0000-0000-0000000000aa', public.zen_today(),
    '[{"student_id":"10010010-0000-0000-0000-000000000003","status":"present"},{"student_id":"10010010-0000-0000-0000-000000000004","status":"present"}]');
  INSERT INTO public._t VALUES ('reg outsider student: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('reg outsider student: rejected ' || SQLERRM);
END $$;
INSERT INTO public._t SELECT 'reg sheet: ' || CASE WHEN
  (SELECT (x -> 0 -> 'entry' ->> 'to_ayah')::int FROM (SELECT public.halaqa_register_sheet('10010010-0000-0000-0000-0000000000aa', public.zen_today()) x) t) = 12
  THEN 'ok' ELSE 'FAILED' END;
SET "request.jwt.claim.sub" = '10010010-0000-0000-0000-000000000002';
DO $$ BEGIN
  PERFORM public.record_halaqa_session('10010010-0000-0000-0000-0000000000aa', public.zen_today(),
    '[{"student_id":"10010010-0000-0000-0000-000000000003","status":"absent"}]');
  INSERT INTO public._t VALUES ('reg other teacher: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('reg other teacher: rejected');
END $$;
DO $$ BEGIN
  PERFORM public.halaqa_register_sheet('10010010-0000-0000-0000-0000000000aa', public.zen_today());
  INSERT INTO public._t VALUES ('reg other teacher sheet: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('reg other teacher sheet: rejected');
END $$;
INSERT INTO public._t SELECT 'reg entries hidden: ' || CASE WHEN count(*) = 0 THEN 'ok' ELSE 'LEAKED!' END
  FROM public.halaqa_register_entries;
SET "request.jwt.claim.sub" = '10010010-0000-0000-0000-000000000003';
DO $$ BEGIN
  PERFORM public.record_halaqa_session('10010010-0000-0000-0000-0000000000aa', public.zen_today(),
    '[{"student_id":"10010010-0000-0000-0000-000000000003","status":"present"}]');
  INSERT INTO public._t VALUES ('reg student self: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('reg student self: rejected');
END $$;
RESET "request.jwt.claim.sub";
RESET ROLE;
-- الرفض أبطل المعاملة كلها: الطالب الغريب لم يُسجَّل له حضور.
INSERT INTO public._t SELECT 'reg atomic: ' || CASE WHEN count(*) = 0 THEN 'ok' ELSE 'FAILED' END
  FROM public.attendance WHERE student_id = '10010010-0000-0000-0000-000000000004';
SELECT code FROM public._t WHERE code LIKE 'reg %' ORDER BY code;

-- @@ 101. المرحلة 9.2: الحضور برمز QR — رمز ساري لحلقة الطالب مرة واحدة، والمنتهي وحلقة أخرى مرفوضان
DELETE FROM public._t;
INSERT INTO auth.users (id, phone, raw_user_meta_data) VALUES
 ('10110110-0000-0000-0000-000000000005','+967700010105','{"name":"طالب حلقة ثانية"}');
INSERT INTO public.halaqat (id, center_id, name, teacher_id)
VALUES ('10110110-0000-0000-0000-0000000000bb', '10010010-0000-0000-0000-0000000000cc', 'حلقة ثانية', '10010010-0000-0000-0000-000000000002');
INSERT INTO public.halaqa_students (halaqa_id, student_id)
VALUES ('10110110-0000-0000-0000-0000000000bb', '10110110-0000-0000-0000-000000000005');
DELETE FROM public.attendance WHERE student_id = '10010010-0000-0000-0000-000000000003' AND session_date = public.zen_today();
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '10010010-0000-0000-0000-000000000001';
SELECT set_config('zen.code', public.issue_attendance_code('10010010-0000-0000-0000-0000000000aa') ->> 'code', false);
INSERT INTO public._t SELECT 'qr code format: ' || CASE WHEN current_setting('zen.code') ~ '^[0-9]{6}$' THEN 'ok' ELSE 'FAILED' END;
INSERT INTO public._t SELECT 'qr table hidden: ' || CASE WHEN has_table_privilege('authenticated', 'public.attendance_codes', 'SELECT') THEN 'LEAKED!' ELSE 'ok' END;
-- معلّم حلقة أخرى لا يصدر رمزاً لهذه الحلقة.
SET "request.jwt.claim.sub" = '10010010-0000-0000-0000-000000000002';
DO $$ BEGIN
  PERFORM public.issue_attendance_code('10010010-0000-0000-0000-0000000000aa');
  INSERT INTO public._t VALUES ('qr other teacher issue: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('qr other teacher issue: rejected');
END $$;
-- طالب حلقة أخرى يمسح الرمز: مرفوض.
SET "request.jwt.claim.sub" = '10110110-0000-0000-0000-000000000005';
INSERT INTO public._t SELECT 'qr other halaqa student: '
  || CASE WHEN public.check_in(current_setting('zen.code')) ->> 'status' = 'invalid' THEN 'rejected' ELSE 'ALLOWED!' END;
-- طالب الحلقة: يسجَّل، ثم الإعادة «already».
SET "request.jwt.claim.sub" = '10010010-0000-0000-0000-000000000003';
INSERT INTO public._t SELECT 'qr check in: ' || (public.check_in(current_setting('zen.code')) ->> 'status');
INSERT INTO public._t SELECT 'qr again: ' || (public.check_in(current_setting('zen.code')) ->> 'status');
RESET ROLE;
INSERT INTO public._t SELECT 'qr one row: ' || CASE WHEN count(*) = 1 THEN 'ok' ELSE 'FAILED' END
  FROM public.attendance WHERE student_id = '10010010-0000-0000-0000-000000000003' AND session_date = public.zen_today();
-- رمز منتهٍ مرفوض.
UPDATE public.attendance_codes SET expires_at = now() - interval '1 second' WHERE code = current_setting('zen.code');
DELETE FROM public.attendance WHERE student_id = '10010010-0000-0000-0000-000000000003' AND session_date = public.zen_today();
DELETE FROM public.attendance_checkin_attempts;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '10010010-0000-0000-0000-000000000003';
INSERT INTO public._t SELECT 'qr expired: '
  || CASE WHEN public.check_in(current_setting('zen.code')) ->> 'status' = 'invalid' THEN 'rejected' ELSE 'ALLOWED!' END;
-- التخمين: بعد 5 محاولات في الدقيقة يُوقف.
DO $$ BEGIN
  FOR i IN 1..4 LOOP PERFORM public.check_in('000000'); END LOOP;
  PERFORM public.check_in('000001');
  INSERT INTO public._t VALUES ('qr brute force: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('qr brute force: ' || CASE WHEN SQLERRM = 'TOO_MANY_ATTEMPTS' THEN 'rejected' ELSE 'FAILED ' || SQLERRM END);
END $$;
RESET "request.jwt.claim.sub";
RESET ROLE;
SELECT code FROM public._t WHERE code LIKE 'qr %' ORDER BY code;

-- @@ 102. المرحلة 9.3: استيراد الطلاب جماعياً — نتيجة لكل صف، والخاطئ لا يُفسد الباقي، ومعلّم آخر مرفوض
DELETE FROM public._t;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '10010010-0000-0000-0000-000000000001';
SELECT set_config('zen.bulk', public.teacher_create_students_bulk('10010010-0000-0000-0000-0000000000aa', '[
  {"name":"طالب أول","username":"bulk_one","password":"bulk-pass-01"},
  {"name":"طالب مكرر","username":"bulk_one","password":"bulk-pass-02"},
  {"name":"طالب ثان","username":"bulk_two","password":"bulk-pass-03"},
  {"name":"ا","username":"bulk_three","password":"bulk-pass-04"}
]'::jsonb)::text, false);
RESET ROLE;
INSERT INTO public._t SELECT 'bulk counts: ' || CASE WHEN (b ->> 'created') = '2' AND (b ->> 'failed') = '2' THEN 'ok' ELSE 'FAILED ' || b::text END
  FROM (SELECT current_setting('zen.bulk')::jsonb AS b) x;
INSERT INTO public._t SELECT 'bulk dup error: ' || CASE WHEN b -> 'rows' -> 1 ->> 'error' = 'username_taken' AND (b -> 'rows' -> 0 ->> 'recovery_code') IS NOT NULL THEN 'ok' ELSE 'FAILED ' || b::text END
  FROM (SELECT current_setting('zen.bulk')::jsonb AS b) x;
INSERT INTO public._t SELECT 'bulk in halaqa: ' || CASE WHEN count(*) = 2 THEN 'ok' ELSE 'FAILED' END
  FROM public.halaqa_students hs JOIN public.account_usernames au ON au.user_id = hs.student_id
 WHERE hs.halaqa_id = '10010010-0000-0000-0000-0000000000aa' AND au.username LIKE 'bulk_%';
INSERT INTO public._t SELECT 'bulk no partial: ' || CASE WHEN count(*) = 0 THEN 'ok' ELSE 'LEAKED!' END
  FROM public.account_usernames WHERE username = 'bulk_three';
INSERT INTO public._t SELECT 'bulk must change: ' || CASE WHEN bool_and(s.must_change_password) THEN 'ok' ELSE 'FAILED' END
  FROM public.account_secrets s JOIN public.account_usernames au ON au.user_id = s.user_id WHERE au.username LIKE 'bulk_%';
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '10010010-0000-0000-0000-000000000002';
DO $$ BEGIN
  PERFORM public.teacher_create_students_bulk('10010010-0000-0000-0000-0000000000aa', '[{"name":"دخيل","username":"bulk_x","password":"bulk-pass-09"}]');
  INSERT INTO public._t VALUES ('bulk other teacher: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('bulk other teacher: rejected');
END $$;
SET "request.jwt.claim.sub" = '10010010-0000-0000-0000-000000000001';
DO $$ BEGIN
  PERFORM public.teacher_create_students_bulk('10010010-0000-0000-0000-0000000000aa',
    (SELECT jsonb_agg(jsonb_build_object('name','طالب','username','bulk_n' || g,'password','bulk-pass-99')) FROM generate_series(1,101) g));
  INSERT INTO public._t VALUES ('bulk 101 rows: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('bulk 101 rows: rejected');
END $$;
RESET "request.jwt.claim.sub";
RESET ROLE;
INSERT INTO public._t SELECT 'bulk anon: ' || CASE WHEN has_function_privilege('anon', 'public.teacher_create_students_bulk(uuid, jsonb)', 'EXECUTE') THEN 'LEAKED!' ELSE 'ok' END;
SELECT code FROM public._t WHERE code LIKE 'bulk %' ORDER BY code;

-- @@ 103. المرحلة 9.4: الإنذار المبكر — الأسباب الأربعة، والمنتظم لا يظهر، ومعلّم آخر وطالب مرفوضان
DELETE FROM public._t;
SET session_replication_role = replica;
INSERT INTO auth.users (id, phone, raw_user_meta_data) VALUES
 ('10310310-0000-0000-0000-00000000000a','+967700010301','{"name":"غائب"}'),
 ('10310310-0000-0000-0000-00000000000b','+967700010302','{"name":"منتظم"}'),
 ('10310310-0000-0000-0000-00000000000c','+967700010303','{"name":"متأخر المراجعة"}'),
 ('10310310-0000-0000-0000-00000000000d','+967700010304','{"name":"منقطع"}'),
 ('10310310-0000-0000-0000-00000000000e','+967700010305','{"name":"ضعيف"}');
INSERT INTO public.profiles (id, name) VALUES
 ('10310310-0000-0000-0000-00000000000a','غائب'), ('10310310-0000-0000-0000-00000000000b','منتظم'),
 ('10310310-0000-0000-0000-00000000000c','متأخر المراجعة'), ('10310310-0000-0000-0000-00000000000d','منقطع'),
 ('10310310-0000-0000-0000-00000000000e','ضعيف')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
INSERT INTO public.halaqat (id, center_id, name, teacher_id)
VALUES ('10310310-0000-0000-0000-0000000000aa', '10010010-0000-0000-0000-0000000000cc', 'حلقة الإنذار', '10010010-0000-0000-0000-000000000001');
INSERT INTO public.halaqa_students (halaqa_id, student_id)
SELECT '10310310-0000-0000-0000-0000000000aa', ('10310310-0000-0000-0000-00000000000' || x)::uuid FROM unnest(ARRAY['a','b','c','d','e']) x;
-- الغائب: حاضر قبل 5 أيام ثم 3 غيابات (ومعذور بينها لا يقطع).
INSERT INTO public.attendance (student_id, halaqa_id, session_date, status) VALUES
 ('10310310-0000-0000-0000-00000000000a','10310310-0000-0000-0000-0000000000aa', public.zen_today() - 5, 'present'),
 ('10310310-0000-0000-0000-00000000000a','10310310-0000-0000-0000-0000000000aa', public.zen_today() - 4, 'absent'),
 ('10310310-0000-0000-0000-00000000000a','10310310-0000-0000-0000-0000000000aa', public.zen_today() - 3, 'excused'),
 ('10310310-0000-0000-0000-00000000000a','10310310-0000-0000-0000-0000000000aa', public.zen_today() - 2, 'absent'),
 ('10310310-0000-0000-0000-00000000000a','10310310-0000-0000-0000-0000000000aa', public.zen_today() - 1, 'absent'),
 ('10310310-0000-0000-0000-00000000000b','10310310-0000-0000-0000-0000000000aa', public.zen_today(), 'present'),
 ('10310310-0000-0000-0000-00000000000c','10310310-0000-0000-0000-0000000000aa', public.zen_today(), 'present'),
 ('10310310-0000-0000-0000-00000000000e','10310310-0000-0000-0000-0000000000aa', public.zen_today(), 'present');
INSERT INTO public.recitation_sessions (id, student_id, halaqa_id, surah_name, status, session_date)
SELECT ('10310310-0000-0000-0001-00000000000' || g)::uuid,
       CASE WHEN g <= 5 THEN '10310310-0000-0000-0000-00000000000e'::uuid ELSE '10310310-0000-0000-0000-00000000000b'::uuid END,
       '10310310-0000-0000-0000-0000000000aa', 'الملك', 'approved', public.zen_today()
  FROM generate_series(1, 6) g;
INSERT INTO public.recitation_assessments (session_id, student_id, score, approved)
SELECT ('10310310-0000-0000-0001-00000000000' || g)::uuid,
       CASE WHEN g <= 5 THEN '10310310-0000-0000-0000-00000000000e'::uuid ELSE '10310310-0000-0000-0000-00000000000b'::uuid END,
       CASE WHEN g <= 5 THEN 55 ELSE 95 END, true
  FROM generate_series(1, 6) g;
INSERT INTO public.review_cards (student_id, surah_name, from_ayah, to_ayah, due_date)
SELECT '10310310-0000-0000-0000-00000000000c', 'البقرة', g, g, public.zen_today() - 3 FROM generate_series(1, 21) g;
SET session_replication_role = DEFAULT;

SET ROLE authenticated;
SET "request.jwt.claim.sub" = '10010010-0000-0000-0000-000000000001';
CREATE TEMP TABLE _risk ON COMMIT DROP AS
SELECT e ->> 'name' AS name, e -> 'reasons' AS reasons FROM jsonb_array_elements(public.at_risk_students('10310310-0000-0000-0000-0000000000aa')) e;
RESET ROLE;
INSERT INTO public._t SELECT 'risk absences: ' || CASE WHEN reasons ? 'absences' THEN 'ok' ELSE 'FAILED ' || reasons::text END FROM _risk WHERE name = 'غائب';
INSERT INTO public._t SELECT 'risk low grade: ' || CASE WHEN reasons ? 'low_grade' AND NOT reasons ? 'inactive' THEN 'ok' ELSE 'FAILED ' || reasons::text END FROM _risk WHERE name = 'ضعيف';
INSERT INTO public._t SELECT 'risk overdue: ' || CASE WHEN reasons ? 'overdue' THEN 'ok' ELSE 'FAILED ' || reasons::text END FROM _risk WHERE name = 'متأخر المراجعة';
INSERT INTO public._t SELECT 'risk inactive: ' || CASE WHEN reasons ? 'inactive' THEN 'ok' ELSE 'FAILED ' || reasons::text END FROM _risk WHERE name = 'منقطع';
INSERT INTO public._t SELECT 'risk regular hidden: ' || CASE WHEN count(*) = 0 THEN 'ok' ELSE 'FAILED' END FROM _risk WHERE name = 'منتظم';
INSERT INTO public._t SELECT 'risk count: ' || CASE WHEN count(*) = 4 THEN 'ok' ELSE 'FAILED ' || count(*) END FROM _risk;
SET ROLE authenticated;
INSERT INTO public._t SELECT 'risk all mine: ' || CASE WHEN jsonb_array_length(public.at_risk_students(NULL)) >= 4 THEN 'ok' ELSE 'FAILED' END;
SET "request.jwt.claim.sub" = '10010010-0000-0000-0000-000000000002';
DO $$ BEGIN
  PERFORM public.at_risk_students('10310310-0000-0000-0000-0000000000aa');
  INSERT INTO public._t VALUES ('risk other teacher: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('risk other teacher: rejected');
END $$;
INSERT INTO public._t SELECT 'risk other teacher all: ' || CASE WHEN public.at_risk_students(NULL) @> '[{"halaqa_name":"حلقة الإنذار"}]' THEN 'LEAKED!' ELSE 'ok' END;
SET "request.jwt.claim.sub" = '10310310-0000-0000-0000-00000000000a';
DO $$ BEGIN
  PERFORM public.at_risk_students('10310310-0000-0000-0000-0000000000aa');
  INSERT INTO public._t VALUES ('risk student: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('risk student: rejected');
END $$;
RESET "request.jwt.claim.sub";
RESET ROLE;
SELECT code FROM public._t WHERE code LIKE 'risk %' ORDER BY code;

-- @@ 104. المرحلة 9.5: جدولة رسائل الغرف — للمشرف فقط، وتُنشر مرة واحدة، والملغاة لا تُنشر، وغير المشرف تفشل
DELETE FROM public._t;
-- حلقة 103 أُنشئت بـ replica فلم يعمل مشغّل غرفة الإعلانات.
INSERT INTO public.halaqa_rooms (halaqa_id, kind) VALUES ('10310310-0000-0000-0000-0000000000aa', 'announcements')
ON CONFLICT (halaqa_id, kind) DO NOTHING;
CREATE TEMP TABLE _sroom AS
  SELECT id FROM public.halaqa_rooms WHERE halaqa_id = '10310310-0000-0000-0000-0000000000aa' AND kind = 'announcements';
GRANT SELECT ON _sroom TO authenticated;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '10010010-0000-0000-0000-000000000001';
SELECT set_config('zen.s1', public.schedule_room_message((SELECT id FROM _sroom), 'تذكير: الحلقة غداً بعد الفجر', now() + interval '3 minutes')::text, false);
SELECT set_config('zen.s2', public.schedule_room_message((SELECT id FROM _sroom), 'رسالة ستُلغى', now() + interval '3 minutes')::text, false);
DO $$ BEGIN
  PERFORM public.schedule_room_message((SELECT id FROM _sroom), 'مبكر جداً', now() + interval '30 seconds');
  INSERT INTO public._t VALUES ('sched too early: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('sched too early: rejected');
END $$;
INSERT INTO public._t SELECT 'sched cancel: ' || CASE WHEN public.cancel_scheduled_room_message(current_setting('zen.s2')::uuid) THEN 'ok' ELSE 'FAILED' END;
INSERT INTO public._t SELECT 'sched cancel twice: ' || CASE WHEN public.cancel_scheduled_room_message(current_setting('zen.s2')::uuid) THEN 'FAILED' ELSE 'ok' END;
INSERT INTO public._t SELECT 'sched list: ' || CASE WHEN jsonb_array_length(public.room_scheduled_list((SELECT id FROM _sroom))) = 2 THEN 'ok' ELSE 'FAILED' END;
INSERT INTO public._t SELECT 'sched table hidden: ' || CASE WHEN has_table_privilege('authenticated', 'public.room_scheduled_messages', 'SELECT') THEN 'LEAKED!' ELSE 'ok' END;
SET "request.jwt.claim.sub" = '10310310-0000-0000-0000-00000000000a';
DO $$ BEGIN
  PERFORM public.schedule_room_message((SELECT id FROM _sroom), 'طالب يجدول', now() + interval '1 hour');
  INSERT INTO public._t VALUES ('sched student: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('sched student: rejected');
END $$;
DO $$ BEGIN
  PERFORM public.room_schedule_tick();
  INSERT INTO public._t VALUES ('sched tick by client: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('sched tick by client: rejected');
END $$;
RESET "request.jwt.claim.sub";
RESET ROLE;
-- مستحقة الآن، وصف مزروع باسم طالب (ليس مشرفاً) ليفشل.
UPDATE public.room_scheduled_messages SET scheduled_at = now() - interval '1 minute' WHERE room_id = (SELECT id FROM _sroom);
INSERT INTO public.room_scheduled_messages (room_id, sender_id, content, scheduled_at)
VALUES ((SELECT id FROM _sroom), '10310310-0000-0000-0000-00000000000a', 'ليس مشرفاً', now() - interval '1 minute');
INSERT INTO public._t SELECT 'sched tick 1: ' || CASE WHEN public.room_schedule_tick() = '{"sent": 1, "failed": 1}'::jsonb THEN 'ok' ELSE 'FAILED' END;
INSERT INTO public._t SELECT 'sched tick 2 idempotent: ' || CASE WHEN public.room_schedule_tick() = '{"sent": 0, "failed": 0}'::jsonb THEN 'ok' ELSE 'FAILED' END;
INSERT INTO public._t SELECT 'sched posted once: ' || CASE WHEN count(*) = 1 THEN 'ok' ELSE 'FAILED ' || count(*) END
  FROM public.room_messages WHERE room_id = (SELECT id FROM _sroom) AND content = 'تذكير: الحلقة غداً بعد الفجر';
INSERT INTO public._t SELECT 'sched cancelled not posted: ' || CASE WHEN count(*) = 0 THEN 'ok' ELSE 'LEAKED!' END
  FROM public.room_messages WHERE room_id = (SELECT id FROM _sroom) AND content IN ('رسالة ستُلغى', 'ليس مشرفاً');
INSERT INTO public._t SELECT 'sched notified: ' || CASE WHEN count(*) >= 5 THEN 'ok' ELSE 'FAILED ' || count(*) END
  FROM public.notifications WHERE kind = 'announcement' AND body = 'تذكير: الحلقة غداً بعد الفجر';
INSERT INTO public._t SELECT 'sched failed recorded: ' || CASE WHEN status = 'failed' AND error IS NOT NULL THEN 'ok' ELSE 'FAILED' END
  FROM public.room_scheduled_messages WHERE content = 'ليس مشرفاً';
INSERT INTO public._t SELECT 'sched sender is teacher: ' || CASE WHEN bool_and(sender_id = '10010010-0000-0000-0000-000000000001') THEN 'ok' ELSE 'FAILED' END
  FROM public.room_messages WHERE room_id = (SELECT id FROM _sroom);
SELECT code FROM public._t WHERE code LIKE 'sched %' ORDER BY code;

-- @@ 105. المرحلة 9.6: الإشارات — تُحلَّل على الخادم، ولأعضاء الغرفة فقط، وليست للمرسل، والمعرّف لا يُعدّ رقم تواصل
DELETE FROM public._t;
INSERT INTO public.halaqa_rooms (halaqa_id, kind, enabled, consent_required)
VALUES ('10310310-0000-0000-0000-0000000000aa', 'discussion', true, false)
ON CONFLICT (halaqa_id, kind) DO UPDATE SET enabled = true, consent_required = false;
CREATE TEMP TABLE _mroom AS
  SELECT id FROM public.halaqa_rooms WHERE halaqa_id = '10310310-0000-0000-0000-0000000000aa' AND kind = 'discussion';
GRANT SELECT ON _mroom TO authenticated;
DELETE FROM public.notifications WHERE kind = 'room' AND title LIKE '% أشار إليك';
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '10310310-0000-0000-0000-00000000000a';
INSERT INTO public._t SELECT 'mention candidates: ' || CASE
  WHEN c @> '[{"name":"ضعيف"}]' AND c @> '[{"mod":true}]' AND NOT c @> '[{"name":"غائب"}]' THEN 'ok' ELSE 'FAILED ' || c::text END
  FROM (SELECT public.room_mention_candidates((SELECT id FROM _mroom)) AS c) x;
SELECT public.post_room_message((SELECT id FROM _mroom),
  'السلام عليكم @[ضعيف](10310310-0000-0000-0000-00000000000e) و @[منتظم](10310310-0000-0000-0000-00000000000b) و @[دخيل](10110110-0000-0000-0000-000000000005) و @[أنا](10310310-0000-0000-0000-00000000000a)');
RESET ROLE;
INSERT INTO public._t SELECT 'mention notified members: ' || CASE WHEN count(*) = 2 THEN 'ok' ELSE 'FAILED ' || count(*) END
  FROM public.notifications WHERE kind = 'room' AND title = 'غائب أشار إليك'
   AND user_id IN ('10310310-0000-0000-0000-00000000000e', '10310310-0000-0000-0000-00000000000b');
INSERT INTO public._t SELECT 'mention outsider: ' || CASE WHEN count(*) = 0 THEN 'ok' ELSE 'LEAKED!' END
  FROM public.notifications WHERE kind = 'room' AND title LIKE '% أشار إليك'
   AND user_id IN ('10110110-0000-0000-0000-000000000005', '10310310-0000-0000-0000-00000000000a');
INSERT INTO public._t SELECT 'mention body plain: ' || CASE WHEN bool_and(body NOT LIKE '%10310310%' AND body LIKE '%@ضعيف%') THEN 'ok' ELSE 'FAILED' END
  FROM public.notifications WHERE kind = 'room' AND title = 'غائب أشار إليك';
INSERT INTO public._t SELECT 'mention stored markup: ' || CASE WHEN count(*) = 1 THEN 'ok' ELSE 'FAILED' END
  FROM public.room_messages WHERE room_id = (SELECT id FROM _mroom) AND content LIKE '%@[ضعيف](10310310-0000-0000-0000-00000000000e)%';
-- أكثر من 5 إشارات: 5 إشعارات فقط.
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '10010010-0000-0000-0000-000000000001';
SELECT public.post_room_message((SELECT id FROM _mroom),
  '@[a](10310310-0000-0000-0000-00000000000a) @[b](10310310-0000-0000-0000-00000000000b) @[c](10310310-0000-0000-0000-00000000000c) @[d](10310310-0000-0000-0000-00000000000d) @[e](10310310-0000-0000-0000-00000000000e) @[a2](10310310-0000-0000-0000-00000000000a)');
-- رقم هاتف حقيقي من طالب ما زال مرفوضاً.
SET "request.jwt.claim.sub" = '10310310-0000-0000-0000-00000000000b';
DO $$ BEGIN
  PERFORM public.post_room_message((SELECT id FROM _mroom), 'اتصل بي 777123456 @[غائب](10310310-0000-0000-0000-00000000000a)');
  INSERT INTO public._t VALUES ('mention phone still blocked: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('mention phone still blocked: rejected');
END $$;
SET "request.jwt.claim.sub" = '10110110-0000-0000-0000-000000000005';
INSERT INTO public._t SELECT 'mention outsider candidates: ' || CASE WHEN public.room_mention_candidates((SELECT id FROM _mroom)) = '[]'::jsonb THEN 'ok' ELSE 'LEAKED!' END;
RESET "request.jwt.claim.sub";
RESET ROLE;
INSERT INTO public._t SELECT 'mention max 5: ' || CASE WHEN count(*) = 5 THEN 'ok' ELSE 'FAILED ' || count(*) END
  FROM public.notifications WHERE kind = 'room' AND title LIKE '% أشار إليك' AND body LIKE '@a %';
SELECT code FROM public._t WHERE code LIKE 'mention %' ORDER BY code;

-- @@ 106. المرحلة 11.1: موافقة وليّ الأمر — المربوط ينتظر وليّه، وغير المربوط ينضم، ولا يوافق غير وليّه
DELETE FROM public._t;
INSERT INTO auth.users (id, phone, raw_user_meta_data) VALUES
 ('10610610-0000-0000-0000-0000000000f1','+967700010601','{"name":"وليّ أمر"}'),
 ('10610610-0000-0000-0000-0000000000f2','+967700010602','{"name":"وليّ آخر"}');
INSERT INTO public.profiles (id, name) VALUES
 ('10610610-0000-0000-0000-0000000000f1','وليّ أمر'), ('10610610-0000-0000-0000-0000000000f2','وليّ آخر')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.guardian_links (guardian_id, student_id)
VALUES ('10610610-0000-0000-0000-0000000000f1', '10310310-0000-0000-0000-00000000000d');
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '10010010-0000-0000-0000-000000000001';
SELECT set_config('zen.inv_c', public.invite_to_halaqa('10010010-0000-0000-0000-0000000000aa', '10310310-0000-0000-0000-00000000000c')::text, false);
SELECT set_config('zen.inv_d', public.invite_to_halaqa('10010010-0000-0000-0000-0000000000aa', '10310310-0000-0000-0000-00000000000d')::text, false);
SET "request.jwt.claim.sub" = '10310310-0000-0000-0000-00000000000c';
INSERT INTO public._t SELECT 'gconsent unlinked: ' || public.respond_halaqa_invite(current_setting('zen.inv_c')::uuid, true);
SET "request.jwt.claim.sub" = '10310310-0000-0000-0000-00000000000d';
INSERT INTO public._t SELECT 'gconsent linked: ' || public.respond_halaqa_invite(current_setting('zen.inv_d')::uuid, true);
RESET ROLE;
INSERT INTO public._t SELECT 'gconsent not joined yet: ' || CASE WHEN count(*) = 0 THEN 'ok' ELSE 'LEAKED!' END
  FROM public.halaqa_students WHERE halaqa_id = '10010010-0000-0000-0000-0000000000aa' AND student_id = '10310310-0000-0000-0000-00000000000d';
INSERT INTO public._t SELECT 'gconsent guardian notified: ' || CASE WHEN count(*) = 1 THEN 'ok' ELSE 'FAILED' END
  FROM public.notifications WHERE user_id = '10610610-0000-0000-0000-0000000000f1' AND title = 'طلب موافقة على حلقة';
SET ROLE authenticated;
-- دعوة ثانية لا تُنشأ بينما الأولى تنتظر وليّ الأمر.
SET "request.jwt.claim.sub" = '10010010-0000-0000-0000-000000000001';
INSERT INTO public._t SELECT 'gconsent no duplicate: ' || CASE WHEN public.invite_to_halaqa('10010010-0000-0000-0000-0000000000aa', '10310310-0000-0000-0000-00000000000d')::text = current_setting('zen.inv_d') THEN 'ok' ELSE 'FAILED' END;
-- الطالب نفسه ووليّ آخر والمعلّم لا يوافقون.
SET "request.jwt.claim.sub" = '10310310-0000-0000-0000-00000000000d';
DO $$ BEGIN
  PERFORM public.guardian_approve_invite(current_setting('zen.inv_d')::uuid, true);
  INSERT INTO public._t VALUES ('gconsent student self: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('gconsent student self: rejected');
END $$;
SET "request.jwt.claim.sub" = '10610610-0000-0000-0000-0000000000f2';
DO $$ BEGIN
  PERFORM public.guardian_approve_invite(current_setting('zen.inv_d')::uuid, true);
  INSERT INTO public._t VALUES ('gconsent other guardian: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('gconsent other guardian: rejected');
END $$;
INSERT INTO public._t SELECT 'gconsent other guardian list: ' || CASE WHEN public.guardian_pending_invites() = '[]'::jsonb THEN 'ok' ELSE 'LEAKED!' END;
SET "request.jwt.claim.sub" = '10010010-0000-0000-0000-000000000001';
DO $$ BEGIN
  PERFORM public.guardian_approve_invite(current_setting('zen.inv_d')::uuid, true);
  INSERT INTO public._t VALUES ('gconsent teacher: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('gconsent teacher: rejected');
END $$;
SET "request.jwt.claim.sub" = '10610610-0000-0000-0000-0000000000f1';
INSERT INTO public._t SELECT 'gconsent guardian list: ' || CASE WHEN public.guardian_pending_invites() @> '[{"halaqa_name":"حلقة المعلّم"}]' OR jsonb_array_length(public.guardian_pending_invites()) = 1 THEN 'ok' ELSE 'FAILED' END;
INSERT INTO public._t SELECT 'gconsent approve: ' || public.guardian_approve_invite(current_setting('zen.inv_d')::uuid, true);
DO $$ BEGIN
  PERFORM public.guardian_approve_invite(current_setting('zen.inv_d')::uuid, false);
  INSERT INTO public._t VALUES ('gconsent twice: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('gconsent twice: rejected');
END $$;
RESET "request.jwt.claim.sub";
RESET ROLE;
INSERT INTO public._t SELECT 'gconsent joined: ' || CASE WHEN count(*) = 2 THEN 'ok' ELSE 'FAILED ' || count(*) END
  FROM public.halaqa_students WHERE halaqa_id = '10010010-0000-0000-0000-0000000000aa'
   AND student_id IN ('10310310-0000-0000-0000-00000000000c', '10310310-0000-0000-0000-00000000000d');
INSERT INTO public._t SELECT 'gconsent recorded: ' || CASE WHEN guardian_id = '10610610-0000-0000-0000-0000000000f1' AND guardian_at IS NOT NULL THEN 'ok' ELSE 'FAILED' END
  FROM public.halaqa_invites WHERE id = current_setting('zen.inv_d')::uuid;
DELETE FROM public.halaqa_students WHERE halaqa_id = '10010010-0000-0000-0000-0000000000aa'
   AND student_id IN ('10310310-0000-0000-0000-00000000000c', '10310310-0000-0000-0000-00000000000d');
SELECT code FROM public._t WHERE code LIKE 'gconsent %' ORDER BY code;

-- @@ 107. المرحلة 9.7: الصوت في الغرف — الرفع لمجلد المرسل في غرفته، وموافقة وليّ الأمر، والقراءة للغرفة ولغير المحذوف
DELETE FROM public._t;
CREATE TEMP TABLE _vroom AS
  SELECT id FROM public.halaqa_rooms WHERE halaqa_id = '10310310-0000-0000-0000-0000000000aa' AND kind = 'discussion';
GRANT SELECT ON _vroom TO authenticated;
SELECT set_config('zen.vpath', (SELECT id FROM _vroom)::text || '/10310310-0000-0000-0000-00000000000a/v1.webm', false);
SET ROLE authenticated;
-- طالب غير مربوط بوليّ أمر: يرفع لمجلده في غرفته.
SET "request.jwt.claim.sub" = '10310310-0000-0000-0000-00000000000a';
INSERT INTO storage.objects (bucket_id, name) VALUES ('room-media', current_setting('zen.vpath'));
DO $$ BEGIN
  INSERT INTO storage.objects (bucket_id, name)
  VALUES ('room-media', (SELECT id FROM _vroom)::text || '/10310310-0000-0000-0000-00000000000b/spoof.webm');
  INSERT INTO public._t VALUES ('voice upload other folder: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('voice upload other folder: rejected');
END $$;
DO $$ BEGIN
  PERFORM public.post_room_voice((SELECT id FROM _vroom), current_setting('zen.vpath'), 61);
  INSERT INTO public._t VALUES ('voice 61s: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('voice 61s: rejected');
END $$;
SELECT set_config('zen.vmsg', public.post_room_voice((SELECT id FROM _vroom), current_setting('zen.vpath'), 12)::text, false);
INSERT INTO public._t SELECT 'voice page: ' || CASE WHEN p @> jsonb_build_array(jsonb_build_object('kind', 'voice', 'media_path', current_setting('zen.vpath'), 'duration_seconds', 12)) THEN 'ok' ELSE 'FAILED' END
  FROM (SELECT public.room_messages_page((SELECT id FROM _vroom)) AS p) x;
-- المربوط بوليّ أمر بلا موافقة صريحة: لا صوت.
SET "request.jwt.claim.sub" = '10310310-0000-0000-0000-00000000000d';
INSERT INTO public._t SELECT 'voice my allowed: ' || CASE WHEN public.my_room_voice_allowed((SELECT id FROM _vroom)) THEN 'ALLOWED!' ELSE 'rejected' END;
INSERT INTO public._t SELECT 'voice guardian no consent: ' || CASE WHEN private.room_voice_allowed('10310310-0000-0000-0000-00000000000d', (SELECT id FROM _vroom)) THEN 'ALLOWED!' ELSE 'rejected' END;
DO $$ BEGIN
  INSERT INTO storage.objects (bucket_id, name)
  VALUES ('room-media', (SELECT id FROM _vroom)::text || '/10310310-0000-0000-0000-00000000000d/v.webm');
  INSERT INTO public._t VALUES ('voice guardian upload: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('voice guardian upload: rejected');
END $$;
-- زميل في الغرفة يقرأ، والدخيل لا.
SET "request.jwt.claim.sub" = '10310310-0000-0000-0000-00000000000b';
INSERT INTO public._t SELECT 'voice member read: ' || CASE WHEN count(*) = 1 THEN 'ok' ELSE 'FAILED' END
  FROM storage.objects WHERE bucket_id = 'room-media' AND name = current_setting('zen.vpath');
SET "request.jwt.claim.sub" = '10110110-0000-0000-0000-000000000005';
INSERT INTO public._t SELECT 'voice outsider read: ' || CASE WHEN count(*) = 0 THEN 'ok' ELSE 'LEAKED!' END
  FROM storage.objects WHERE bucket_id = 'room-media' AND name = current_setting('zen.vpath');
RESET ROLE;
-- موافقة وليّ الأمر ⇒ يُسمح.
INSERT INTO public.room_consents (halaqa_id, student_id, granted_by)
VALUES ('10310310-0000-0000-0000-0000000000aa', '10310310-0000-0000-0000-00000000000d', '10610610-0000-0000-0000-0000000000f1')
ON CONFLICT DO NOTHING;
INSERT INTO public._t SELECT 'voice guardian consent: ' || CASE WHEN private.room_voice_allowed('10310310-0000-0000-0000-00000000000d', (SELECT id FROM _vroom)) THEN 'ok' ELSE 'FAILED' END;
-- حذف الرسالة يمنع قراءة الملف.
UPDATE public.room_messages SET content = NULL, deleted_at = now() WHERE id = current_setting('zen.vmsg')::uuid;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '10310310-0000-0000-0000-00000000000b';
INSERT INTO public._t SELECT 'voice deleted read: ' || CASE WHEN count(*) = 0 THEN 'ok' ELSE 'LEAKED!' END
  FROM storage.objects WHERE bucket_id = 'room-media' AND name = current_setting('zen.vpath');
INSERT INTO public._t SELECT 'voice deleted page: ' || CASE WHEN p @> '[{"kind":"voice","media_path":null}]' THEN 'ok' ELSE 'FAILED' END
  FROM (SELECT public.room_messages_page((SELECT id FROM _vroom)) AS p) x;
RESET "request.jwt.claim.sub";
RESET ROLE;
SELECT code FROM public._t WHERE code LIKE 'voice %' ORDER BY code;

-- @@ 108. المرحلة 10.2: التحقق من الشهادة برمزها — للمعتمدة فقط، وبلا معرّفات، وبحدّ 10 في الدقيقة
DELETE FROM public._t;
INSERT INTO public.certificates (student_id, juz, status, student_name, teacher_name, decided_at)
VALUES ('10010010-0000-0000-0000-000000000003', 29, 'approved', 'طالب التحقق', 'معلّم', now()),
       ('10010010-0000-0000-0000-000000000003', 28, 'pending', 'طالب التحقق', 'معلّم', NULL)
ON CONFLICT (student_id, juz) DO UPDATE SET status = EXCLUDED.status, decided_at = EXCLUDED.decided_at;
SELECT set_config('zen.vc_ok', (SELECT verify_code FROM public.certificates WHERE student_id = '10010010-0000-0000-0000-000000000003' AND juz = 29), false);
SELECT set_config('zen.vc_pending', (SELECT verify_code FROM public.certificates WHERE student_id = '10010010-0000-0000-0000-000000000003' AND juz = 28), false);
INSERT INTO public._t SELECT 'vc format: ' || CASE WHEN bool_and(verify_code ~ '^[A-HJ-NP-Z2-9]{16}$') AND count(DISTINCT verify_code) = count(*) THEN 'ok' ELSE 'FAILED' END
  FROM public.certificates;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '10010010-0000-0000-0000-000000000002';
INSERT INTO public._t SELECT 'vc valid: ' || CASE WHEN r->>'status' = 'valid' AND r->>'juz' = '29' AND r->>'student_name' = 'طالب التحقق' AND NOT r ? 'student_id' AND NOT r ? 'id' THEN 'ok' ELSE 'FAILED ' || r::text END
  FROM (SELECT public.verify_certificate(lower(substr(current_setting('zen.vc_ok'), 1, 8)) || '-' || substr(current_setting('zen.vc_ok'), 9)) AS r) x;
INSERT INTO public._t SELECT 'vc pending: ' || CASE WHEN public.verify_certificate(current_setting('zen.vc_pending'))->>'status' = 'invalid' THEN 'ok' ELSE 'LEAKED!' END;
INSERT INTO public._t SELECT 'vc garbage: ' || CASE WHEN public.verify_certificate('x'' OR 1=1 --')->>'status' = 'invalid' THEN 'ok' ELSE 'FAILED' END;
DO $$ BEGIN
  PERFORM count(*) FROM public.certificate_verify_attempts;
  INSERT INTO public._t VALUES ('vc attempts table: ALLOWED!');
EXCEPTION WHEN insufficient_privilege THEN INSERT INTO public._t VALUES ('vc attempts table: rejected');
END $$;
SELECT public.verify_certificate('AAAAAAAAAAAAAAAA') FROM generate_series(1, 7);
INSERT INTO public._t SELECT 'vc rate limit: ' || CASE WHEN public.verify_certificate(current_setting('zen.vc_ok'))->>'status' = 'rate_limited' THEN 'ok' ELSE 'FAILED' END;
-- الطالب يرى رمز المعتمدة فقط في إنجازاته.
SET "request.jwt.claim.sub" = '10010010-0000-0000-0000-000000000003';
INSERT INTO public._t SELECT 'vc achievements: ' || CASE
    WHEN a->'certificates' @> jsonb_build_array(jsonb_build_object('juz', 29, 'verify_code', current_setting('zen.vc_ok')))
     AND a->'certificates' @> '[{"juz":28,"verify_code":null}]' THEN 'ok' ELSE 'FAILED' END
  FROM (SELECT public.student_achievements('10010010-0000-0000-0000-000000000003') AS a) x;
RESET "request.jwt.claim.sub";
SET ROLE anon;
DO $$ BEGIN
  PERFORM public.verify_certificate('AAAAAAAAAAAAAAAA');
  INSERT INTO public._t VALUES ('vc anon: ALLOWED!');
EXCEPTION WHEN insufficient_privilege THEN INSERT INTO public._t VALUES ('vc anon: rejected');
END $$;
RESET ROLE;
DELETE FROM public.certificate_verify_attempts;
DELETE FROM public.certificates WHERE student_id = '10010010-0000-0000-0000-000000000003' AND juz IN (28, 29);
SELECT code FROM public._t WHERE code LIKE 'vc %' ORDER BY code;

-- @@ 109. المرحلة 10.3: مؤشرات المركز — الحفظ الشهري والانتظام والتسرّب لكل حلقة، ولمن يرى المركز فقط
DELETE FROM public._t;
INSERT INTO auth.users (id, phone, raw_user_meta_data) VALUES
 ('10910910-0000-0000-0000-000000000001','+967700010901','{"name":"نشِط"}'),
 ('10910910-0000-0000-0000-000000000002','+967700010902','{"name":"منقطع"}'),
 ('10910910-0000-0000-0000-000000000003','+967700010903','{"name":"جديد"}');
INSERT INTO public.profiles (id, name) VALUES
 ('10910910-0000-0000-0000-000000000001','نشِط'), ('10910910-0000-0000-0000-000000000002','منقطع'),
 ('10910910-0000-0000-0000-000000000003','جديد') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.centers (id, name, created_by)
VALUES ('10910910-0000-0000-0000-0000000000cc', 'مركز المؤشرات', '10010010-0000-0000-0000-000000000001');
INSERT INTO public.halaqat (id, center_id, name, teacher_id)
VALUES ('10910910-0000-0000-0000-0000000000aa', '10910910-0000-0000-0000-0000000000cc', 'حلقة المؤشرات', '10010010-0000-0000-0000-000000000001');
INSERT INTO public.halaqa_students (halaqa_id, student_id)
SELECT '10910910-0000-0000-0000-0000000000aa', id FROM auth.users WHERE id::text LIKE '10910910-0000-0000-0000-00000000000_';
-- النشط: 10 صفحات هذا الشهر وحضور، والمنقطع: حفظ قبل 60 يوماً وغياب، والجديد: لا شيء.
INSERT INTO public.mushaf_records (student_id, teacher_id, halaqa_id, page, kind, session_date)
SELECT '10910910-0000-0000-0000-000000000001', '10010010-0000-0000-0000-000000000001', '10910910-0000-0000-0000-0000000000aa', p, 'memorize', current_date - 1
  FROM generate_series(1, 10) p;
INSERT INTO public.mushaf_records (student_id, teacher_id, halaqa_id, page, kind, session_date)
VALUES ('10910910-0000-0000-0000-000000000002', '10010010-0000-0000-0000-000000000001', '10910910-0000-0000-0000-0000000000aa', 50, 'memorize', current_date - 60);
INSERT INTO public.attendance (student_id, halaqa_id, teacher_id, session_date, status) VALUES
 ('10910910-0000-0000-0000-000000000001', '10910910-0000-0000-0000-0000000000aa', '10010010-0000-0000-0000-000000000001', current_date - 2, 'present'),
 ('10910910-0000-0000-0000-000000000001', '10910910-0000-0000-0000-0000000000aa', '10010010-0000-0000-0000-000000000001', current_date - 3, 'late'),
 ('10910910-0000-0000-0000-000000000002', '10910910-0000-0000-0000-0000000000aa', '10010010-0000-0000-0000-000000000001', current_date - 2, 'absent'),
 ('10910910-0000-0000-0000-000000000002', '10910910-0000-0000-0000-0000000000aa', '10010010-0000-0000-0000-000000000001', current_date - 3, 'absent');
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '10010010-0000-0000-0000-000000000001';
CREATE TEMP TABLE _k AS SELECT public.center_kpis('10910910-0000-0000-0000-0000000000cc', 3) AS k;
INSERT INTO public._t SELECT 'kpi halaqa: ' || CASE WHEN k->'halaqat'->0 @> '{"students":3,"pages_30":10,"regularity":50,"dropouts":2,"dropout_rate":67}'
                                         AND (k->'halaqat'->0->>'pages_per_student')::numeric = 3.3 THEN 'ok' ELSE 'FAILED ' || (k->'halaqat')::text END FROM _k;
INSERT INTO public._t SELECT 'kpi months: ' || CASE WHEN jsonb_array_length(k->'monthly') = 3
                                        AND (k->'monthly'->2->>'month') = to_char(current_date, 'YYYY-MM') THEN 'ok' ELSE 'FAILED' END FROM _k;
INSERT INTO public._t SELECT 'kpi no names: ' || CASE WHEN k::text NOT LIKE '%نشِط%' AND k::text NOT LIKE '%منقطع%' THEN 'ok' ELSE 'LEAKED!' END FROM _k;
SET "request.jwt.claim.sub" = '10010010-0000-0000-0000-000000000002';
DO $$ BEGIN
  PERFORM public.center_kpis('10910910-0000-0000-0000-0000000000cc');
  INSERT INTO public._t VALUES ('kpi other teacher: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('kpi other teacher: rejected');
END $$;
SET "request.jwt.claim.sub" = '10910910-0000-0000-0000-000000000001';
DO $$ BEGIN
  PERFORM public.center_kpis('10910910-0000-0000-0000-0000000000cc');
  INSERT INTO public._t VALUES ('kpi student: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('kpi student: rejected');
END $$;
RESET "request.jwt.claim.sub";
SET ROLE anon;
DO $$ BEGIN
  PERFORM public.center_kpis('10910910-0000-0000-0000-0000000000cc');
  INSERT INTO public._t VALUES ('kpi anon: ALLOWED!');
EXCEPTION WHEN insufficient_privilege THEN INSERT INTO public._t VALUES ('kpi anon: rejected');
END $$;
RESET ROLE;
SELECT code FROM public._t WHERE code LIKE 'kpi %' ORDER BY code;

-- @@ 110. المرحلة 10.4: المشرف التعليمي يقرأ لوحة المركز ومؤشراته وتقارير طلابه ولا يكتب شيئاً
DELETE FROM public._t;
INSERT INTO auth.users (id, phone, raw_user_meta_data) VALUES
 ('11011010-0000-0000-0000-0000000000a5','+967700011001','{"name":"مشرف تعليمي"}');
INSERT INTO public.profiles (id, name) VALUES ('11011010-0000-0000-0000-0000000000a5', 'مشرف تعليمي') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.center_staff (center_id, user_id, role, added_by)
VALUES ('10910910-0000-0000-0000-0000000000cc', '11011010-0000-0000-0000-0000000000a5', 'supervisor', '10010010-0000-0000-0000-000000000001');
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '11011010-0000-0000-0000-0000000000a5';
-- يقرأ.
INSERT INTO public._t SELECT 'sup dashboard: ' || CASE WHEN (d->>'can_manage')::boolean = false AND (d->'totals'->>'students')::int = 3 THEN 'ok' ELSE 'FAILED' END
  FROM (SELECT public.center_dashboard('10910910-0000-0000-0000-0000000000cc', 30) AS d) x;
INSERT INTO public._t SELECT 'sup kpis: ' || CASE WHEN jsonb_array_length(public.center_kpis('10910910-0000-0000-0000-0000000000cc')->'halaqat') = 1 THEN 'ok' ELSE 'FAILED' END;
INSERT INTO public._t SELECT 'sup student report: ' || CASE WHEN r->'student'->>'name' = 'نشِط' THEN 'ok' ELSE 'FAILED' END
  FROM (SELECT public.student_report('10910910-0000-0000-0000-000000000001', current_date - 30, current_date) AS r) x;
-- لا يكتب: الدوال.
DO $$
DECLARE
  h uuid := '10910910-0000-0000-0000-0000000000aa';
  c uuid := '10910910-0000-0000-0000-0000000000cc';
  s uuid := '10910910-0000-0000-0000-000000000001';
  probe text;
BEGIN
  FOREACH probe IN ARRAY ARRAY['staff_code', 'invite', 'register', 'attendance_code', 'bulk', 'at_risk', 'register_sheet'] LOOP
    BEGIN
      CASE probe
        WHEN 'staff_code' THEN PERFORM public.create_center_staff_code(c, 'supervisor');
        WHEN 'invite' THEN PERFORM public.invite_to_halaqa(h, '10310310-0000-0000-0000-00000000000a');
        WHEN 'register' THEN PERFORM public.record_halaqa_session(h, current_date, jsonb_build_array(jsonb_build_object('student_id', s, 'status', 'present')));
        WHEN 'attendance_code' THEN PERFORM public.issue_attendance_code(h);
        WHEN 'bulk' THEN PERFORM public.teacher_create_students_bulk(h, '[{"name":"x"}]'::jsonb);
        WHEN 'at_risk' THEN PERFORM public.at_risk_students(h);
        WHEN 'register_sheet' THEN PERFORM public.halaqa_register_sheet(h, current_date);
      END CASE;
      INSERT INTO public._t VALUES ('sup write ' || probe || ': ALLOWED!');
    EXCEPTION WHEN others THEN
      INSERT INTO public._t VALUES ('sup write ' || probe || ': rejected');
    END;
  END LOOP;
END $$;
-- لا يكتب: الجداول مباشرة.
DO $$ BEGIN
  INSERT INTO public.halaqa_schedule (halaqa_id, weekday, start_time, end_time)
  VALUES ('10910910-0000-0000-0000-0000000000aa', 1, '05:00', '06:00');
  INSERT INTO public._t VALUES ('sup table schedule: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('sup table schedule: rejected');
END $$;
DO $$ BEGIN
  INSERT INTO public.attendance (student_id, halaqa_id, teacher_id, session_date, status)
  VALUES ('10910910-0000-0000-0000-000000000003', '10910910-0000-0000-0000-0000000000aa', '11011010-0000-0000-0000-0000000000a5', current_date, 'present');
  INSERT INTO public._t VALUES ('sup table attendance: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('sup table attendance: rejected');
END $$;
WITH u AS (UPDATE public.halaqat SET name = 'مُعدَّلة' WHERE id = '10910910-0000-0000-0000-0000000000aa' RETURNING 1)
INSERT INTO public._t SELECT 'sup table halaqa update: ' || CASE WHEN count(*) = 0 THEN 'rejected' ELSE 'ALLOWED!' END FROM u;
DO $$ BEGIN
  UPDATE public.center_staff SET role = 'manager' WHERE user_id = '11011010-0000-0000-0000-0000000000a5';
  INSERT INTO public._t VALUES ('sup self promote: ALLOWED!');
EXCEPTION WHEN insufficient_privilege THEN INSERT INTO public._t VALUES ('sup self promote: rejected');
END $$;
-- لا إشراف غرف: قارئ الإعلانات فقط، ولا دور في النقاش.
RESET ROLE;
INSERT INTO public._t SELECT 'sup rooms: ' || CASE
    WHEN bool_and(CASE r.kind WHEN 'announcements' THEN COALESCE(private.room_role('11011010-0000-0000-0000-0000000000a5', r.id), 'none') = 'reader'
                              ELSE private.room_role('11011010-0000-0000-0000-0000000000a5', r.id) IS NULL END)
    THEN 'ok' ELSE 'FAILED' END
  FROM public.halaqa_rooms r WHERE r.halaqa_id = '10910910-0000-0000-0000-0000000000aa';
SET ROLE authenticated;
RESET "request.jwt.claim.sub";
RESET ROLE;
INSERT INTO public._t SELECT 'sup role unchanged: ' || CASE WHEN role = 'supervisor' THEN 'ok' ELSE 'FAILED' END
  FROM public.center_staff WHERE user_id = '11011010-0000-0000-0000-0000000000a5';
INSERT INTO public._t SELECT 'sup halaqa name unchanged: ' || CASE WHEN name = 'حلقة المؤشرات' THEN 'ok' ELSE 'FAILED' END
  FROM public.halaqat WHERE id = '10910910-0000-0000-0000-0000000000aa';
SELECT code FROM public._t WHERE code LIKE 'sup %' ORDER BY code;

-- @@ 111. المرحلة 11.2: التقرير الشهري لوليّ الأمر — مرة واحدة لكل (وليّ، ابن، شهر)، وللخادم فقط
DELETE FROM public._t;
INSERT INTO public.guardian_links (guardian_id, student_id)
VALUES ('10610610-0000-0000-0000-0000000000f2', '10910910-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;
-- حفظ في الشهر الماضي للطالب النشط.
INSERT INTO public.mushaf_records (student_id, teacher_id, halaqa_id, page, kind, session_date)
SELECT '10910910-0000-0000-0000-000000000001', '10010010-0000-0000-0000-000000000001', '10910910-0000-0000-0000-0000000000aa',
       p, 'memorize', (date_trunc('month', current_date) - interval '1 month')::date + 3
  FROM generate_series(200, 206) p;
CREATE TEMP TABLE _m AS SELECT public.send_guardian_monthly_reports() AS n1, public.send_guardian_monthly_reports() AS n2;
INSERT INTO public._t SELECT 'mr first run: ' || CASE WHEN n1 >= 2 THEN 'ok' ELSE 'FAILED ' || n1 END FROM _m;
INSERT INTO public._t SELECT 'mr second run: ' || CASE WHEN n2 = 0 THEN 'ok' ELSE 'FAILED ' || n2 END FROM _m;
-- العدد المتوقع من السجل نفسه لا رقماً ثابتاً: في أول أيام الشهر (أو آخرها بتوقيت UTC) تقع سجلات
-- «الأيام الأخيرة» من فحوص سابقة في الشهر الماضي فتُحسب معه، فكان الفحص يفشل حسب تاريخ التشغيل.
INSERT INTO public._t SELECT 'mr notification: ' || CASE WHEN count(*) = 1 AND bool_and(body LIKE '%حفظ ' || (
      SELECT count(DISTINCT page) FROM public.mushaf_records
       WHERE student_id = '10910910-0000-0000-0000-000000000001' AND kind = 'memorize'
         AND session_date >= (date_trunc('month', current_date) - interval '1 month')::date
         AND session_date < date_trunc('month', current_date)::date
      HAVING count(DISTINCT page) >= 7) || ' صفحة%')
    AND bool_and(link = '/family?child=10910910-0000-0000-0000-000000000001&month=' || to_char(date_trunc('month', current_date) - interval '1 month', 'YYYY-MM'))
    THEN 'ok' ELSE 'FAILED' END
  FROM public.notifications WHERE user_id = '10610610-0000-0000-0000-0000000000f2' AND kind = 'guardian_monthly';
INSERT INTO public._t SELECT 'mr category: ' || public.push_category('guardian_monthly');
-- شهر آخر صريح يُرسل من جديد.
INSERT INTO public._t SELECT 'mr other month: ' || CASE WHEN public.send_guardian_monthly_reports((current_date - interval '3 months')::date) >= 2 THEN 'ok' ELSE 'FAILED' END;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '10610610-0000-0000-0000-0000000000f2';
DO $$ BEGIN
  PERFORM public.send_guardian_monthly_reports();
  INSERT INTO public._t VALUES ('mr client send: ALLOWED!');
EXCEPTION WHEN insufficient_privilege THEN INSERT INTO public._t VALUES ('mr client send: rejected');
END $$;
DO $$ BEGIN
  PERFORM public.monthly_summary_text('10910910-0000-0000-0000-000000000001', current_date);
  INSERT INTO public._t VALUES ('mr client summary: ALLOWED!');
EXCEPTION WHEN insufficient_privilege THEN INSERT INTO public._t VALUES ('mr client summary: rejected');
END $$;
DO $$ BEGIN
  PERFORM count(*) FROM public.guardian_monthly_sent;
  INSERT INTO public._t VALUES ('mr client table: ALLOWED!');
EXCEPTION WHEN insufficient_privilege THEN INSERT INTO public._t VALUES ('mr client table: rejected');
END $$;
RESET "request.jwt.claim.sub";
RESET ROLE;
SELECT code FROM public._t WHERE code LIKE 'mr %' ORDER BY code;

-- @@ 112. المرحلة 11.3: الأهداف العائلية — يضعها وليّ الابن وحده، ويقرؤها هو والابن، والتقدّم من السجل
DELETE FROM public._t;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '10610610-0000-0000-0000-0000000000f2';
SELECT set_config('zen.goal1', public.set_family_goal('10910910-0000-0000-0000-000000000001', 'pages', 5, 'خمس صفحات', 'نزهة الجمعة')::text, false);
SELECT public.set_family_goal('10910910-0000-0000-0000-000000000001', 'attendance', 20);
SELECT public.set_family_goal('10910910-0000-0000-0000-000000000001', 'streak', 7);
DO $$ BEGIN
  PERFORM public.set_family_goal('10910910-0000-0000-0000-000000000001', 'juz', 1);
  INSERT INTO public._t VALUES ('fg fourth goal: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('fg fourth goal: rejected');
END $$;
DO $$ BEGIN
  PERFORM public.set_family_goal('10910910-0000-0000-0000-000000000002', 'pages', 5);
  INSERT INTO public._t VALUES ('fg not my child: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('fg not my child: rejected');
END $$;
DO $$ BEGIN
  PERFORM count(*) FROM public.family_goals;
  INSERT INTO public._t VALUES ('fg table direct: ALLOWED!');
EXCEPTION WHEN insufficient_privilege THEN INSERT INTO public._t VALUES ('fg table direct: rejected');
END $$;
RESET ROLE;
UPDATE public.family_goals SET starts_on = current_date - 7 WHERE id = current_setting('zen.goal1')::uuid;
SET ROLE authenticated;
-- الابن يقرأ، والقراءة تُتمّ الهدف المكتمل.
SET "request.jwt.claim.sub" = '10910910-0000-0000-0000-000000000001';
INSERT INTO public._t SELECT 'fg student reads: ' || CASE WHEN jsonb_array_length(g) = 3
    AND g @> '[{"kind":"pages","target":5,"progress":5,"status":"done","reward":"نزهة الجمعة","mine":false}]' THEN 'ok' ELSE 'FAILED ' || g::text END
  FROM (SELECT public.family_goals_for('10910910-0000-0000-0000-000000000001') AS g) x;
DO $$ BEGIN
  PERFORM public.set_family_goal('10910910-0000-0000-0000-000000000001', 'pages', 1);
  INSERT INTO public._t VALUES ('fg student sets: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('fg student sets: rejected');
END $$;
DO $$ BEGIN
  PERFORM public.cancel_family_goal((SELECT (e->>'id')::uuid FROM jsonb_array_elements(public.family_goals_for('10910910-0000-0000-0000-000000000001')) e WHERE e->>'kind' = 'streak'));
  INSERT INTO public._t VALUES ('fg student cancels: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('fg student cancels: rejected');
END $$;
-- غريب لا يقرأ.
SET "request.jwt.claim.sub" = '10610610-0000-0000-0000-0000000000f1';
DO $$ BEGIN
  PERFORM public.family_goals_for('10910910-0000-0000-0000-000000000001');
  INSERT INTO public._t VALUES ('fg stranger reads: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('fg stranger reads: rejected');
END $$;
-- الوليّ يرى الإتمام ويلغي هدفاً.
SET "request.jwt.claim.sub" = '10610610-0000-0000-0000-0000000000f2';
SELECT public.cancel_family_goal((SELECT (e->>'id')::uuid FROM jsonb_array_elements(public.family_goals_for('10910910-0000-0000-0000-000000000001')) e WHERE e->>'kind' = 'streak'));
INSERT INTO public._t SELECT 'fg guardian view: ' || CASE WHEN jsonb_array_length(g) = 2 AND g @> '[{"kind":"pages","status":"done","mine":true}]' THEN 'ok' ELSE 'FAILED ' || g::text END
  FROM (SELECT public.family_goals_for('10910910-0000-0000-0000-000000000001') AS g) x;
RESET "request.jwt.claim.sub";
RESET ROLE;
INSERT INTO public._t SELECT 'fg notified once: ' || CASE WHEN count(*) = 2 THEN 'ok' ELSE 'FAILED ' || count(*) END
  FROM public.notifications WHERE title IN ('أتممت هدفك العائلي', 'أتمّ ابنك هدفه');
SET ROLE anon;
DO $$ BEGIN
  PERFORM public.family_goals_for('10910910-0000-0000-0000-000000000001');
  INSERT INTO public._t VALUES ('fg anon: ALLOWED!');
EXCEPTION WHEN insufficient_privilege THEN INSERT INTO public._t VALUES ('fg anon: rejected');
END $$;
RESET ROLE;
SELECT code FROM public._t WHERE code LIKE 'fg %' ORDER BY code;

-- @@ 113. المرحلة 12.2: سياق الحفظ للمساعد بموافقة يمكن سحبها، والملخّص للخادم فقط
DELETE FROM public._t;
INSERT INTO public._t SELECT 'ac before consent: ' || CASE WHEN public.ai_memo_context('10910910-0000-0000-0000-000000000001') IS NULL THEN 'ok' ELSE 'LEAKED!' END;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '10910910-0000-0000-0000-000000000001';
INSERT INTO public._t SELECT 'ac default off: ' || CASE WHEN (public.my_ai_consent()->>'memo_context')::boolean = false THEN 'ok' ELSE 'FAILED' END;
INSERT INTO public._t SELECT 'ac grant: ' || CASE WHEN (public.set_ai_consent(true)->>'memo_context')::boolean THEN 'ok' ELSE 'FAILED' END;
DO $$ BEGIN
  PERFORM public.ai_memo_context('10910910-0000-0000-0000-000000000001');
  INSERT INTO public._t VALUES ('ac client reads context: ALLOWED!');
EXCEPTION WHEN insufficient_privilege THEN INSERT INTO public._t VALUES ('ac client reads context: rejected');
END $$;
DO $$ BEGIN
  PERFORM count(*) FROM public.ai_consents;
  INSERT INTO public._t VALUES ('ac table direct: ALLOWED!');
EXCEPTION WHEN insufficient_privilege THEN INSERT INTO public._t VALUES ('ac table direct: rejected');
END $$;
RESET ROLE;
INSERT INTO public._t SELECT 'ac with consent: ' || CASE WHEN c ? 'queue' AND (c->>'memorized_pages')::int >= 7 AND jsonb_typeof(c->'errors') = 'array' THEN 'ok' ELSE 'FAILED ' || COALESCE(c::text, 'null') END
  FROM (SELECT public.ai_memo_context('10910910-0000-0000-0000-000000000001') AS c) x;
-- موافقة طالب لا تكشف غيره.
INSERT INTO public._t SELECT 'ac other user: ' || CASE WHEN public.ai_memo_context('10910910-0000-0000-0000-000000000002') IS NULL THEN 'ok' ELSE 'LEAKED!' END;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '10910910-0000-0000-0000-000000000001';
INSERT INTO public._t SELECT 'ac revoke: ' || CASE WHEN (x->>'memo_context')::boolean = false AND x->>'revoked_at' IS NOT NULL AND x->>'granted_at' IS NOT NULL THEN 'ok' ELSE 'FAILED' END
  FROM (SELECT public.set_ai_consent(false) AS x) y;
RESET "request.jwt.claim.sub";
RESET ROLE;
INSERT INTO public._t SELECT 'ac after revoke: ' || CASE WHEN public.ai_memo_context('10910910-0000-0000-0000-000000000001') IS NULL THEN 'ok' ELSE 'LEAKED!' END;
SET ROLE anon;
DO $$ BEGIN
  PERFORM public.set_ai_consent(true);
  INSERT INTO public._t VALUES ('ac anon: ALLOWED!');
EXCEPTION WHEN insufficient_privilege THEN INSERT INTO public._t VALUES ('ac anon: rejected');
END $$;
RESET ROLE;
SELECT code FROM public._t WHERE code LIKE 'ac %' ORDER BY code;

-- @@ 114. المرحلة 12.3: حصة مسودّات المعلّم (teacher_draft) مقبولة وتُعاد، وغير المعروف مرفوض
DELETE FROM public._t;
INSERT INTO public._t SELECT 'td quota: ' || CASE WHEN (public.consume_ai_quota('10010010-0000-0000-0000-000000000001', 'teacher_draft', 40, 8)->>'allowed')::boolean THEN 'ok' ELSE 'FAILED' END;
SELECT public.refund_ai_quota('10010010-0000-0000-0000-000000000001', 'teacher_draft');
INSERT INTO public._t SELECT 'td refunded: ' || CASE WHEN count(*) = 0 THEN 'ok' ELSE 'FAILED ' || count(*) END
  FROM public.ai_usage_events WHERE user_id = '10010010-0000-0000-0000-000000000001' AND feature = 'teacher_draft';
DO $$ BEGIN
  INSERT INTO public.ai_usage_events (user_id, feature) VALUES ('10010010-0000-0000-0000-000000000001', 'send_to_guardian');
  INSERT INTO public._t VALUES ('td unknown feature: ALLOWED!');
EXCEPTION WHEN check_violation THEN INSERT INTO public._t VALUES ('td unknown feature: rejected');
END $$;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '10010010-0000-0000-0000-000000000002';
-- المعلّم الآخر لا يجمع حقائق طالب ليس في حلقاته (أساس المسودّتين).
DO $$ BEGIN
  PERFORM public.teacher_student_week('10010010-0000-0000-0000-000000000003', 7);
  INSERT INTO public._t VALUES ('td other teacher facts: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('td other teacher facts: rejected');
END $$;
RESET "request.jwt.claim.sub";
RESET ROLE;
SELECT code FROM public._t WHERE code LIKE 'td %' ORDER BY code;

-- @@ 115. المرحلة 13.4: عدّادات مجمّعة بلا هوية، بموافقة صريحة، ولا تتبّع لمن دون 13، ولوحة للمالك فقط
DELETE FROM public._t;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '10010010-0000-0000-0000-000000000001';
INSERT INTO public._t SELECT 'ua default off: ' || CASE WHEN (public.my_analytics_consent()->>'granted')::boolean = false THEN 'ok' ELSE 'FAILED' END;
INSERT INTO public._t SELECT 'ua no consent ignored: ' || CASE WHEN public.track_usage(ARRAY['app_open']) = 0 THEN 'ok' ELSE 'LEAKED!' END;
DO $$ BEGIN
  PERFORM public.set_analytics_consent(true, false);
  INSERT INTO public._t VALUES ('ua grant without 13+: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('ua grant without 13+: rejected');
END $$;
INSERT INTO public._t SELECT 'ua grant: ' || CASE WHEN (public.set_analytics_consent(true, true)->>'granted')::boolean THEN 'ok' ELSE 'FAILED' END;
INSERT INTO public._t SELECT 'ua track dedup+allowlist: ' || CASE WHEN n = 2 THEN 'ok' ELSE 'FAILED ' || n END
  FROM (SELECT public.track_usage(ARRAY['app_open', 'app_open', 'mushaf_open', 'evil_event'], 'android') AS n) x;
DO $$ BEGIN
  PERFORM count(*) FROM public.usage_daily;
  INSERT INTO public._t VALUES ('ua table direct: ALLOWED!');
EXCEPTION WHEN insufficient_privilege THEN INSERT INTO public._t VALUES ('ua table direct: rejected');
END $$;
DO $$ BEGIN
  PERFORM public.usage_summary(7);
  INSERT INTO public._t VALUES ('ua non-owner summary: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('ua non-owner summary: rejected');
END $$;
-- طالب مرتبط بوليّ أمر (القسم 111): لا يُمنح التتبّع حتى مع الإقرار.
SET "request.jwt.claim.sub" = '10910910-0000-0000-0000-000000000001';
INSERT INTO public._t SELECT 'ua linked child not eligible: ' || CASE WHEN (public.my_analytics_consent()->>'eligible')::boolean = false THEN 'ok' ELSE 'FAILED' END;
DO $$ BEGIN
  PERFORM public.set_analytics_consent(true, true);
  INSERT INTO public._t VALUES ('ua linked child grant: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('ua linked child grant: rejected');
END $$;
INSERT INTO public._t SELECT 'ua linked child ignored: ' || CASE WHEN public.track_usage(ARRAY['app_open']) = 0 THEN 'ok' ELSE 'LEAKED!' END;
RESET "request.jwt.claim.sub";
RESET ROLE;
-- لا عمود معرّف في العدّادات.
INSERT INTO public._t SELECT 'ua no identity column: ' || CASE WHEN NOT EXISTS (
  SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'usage_daily'
     AND column_name ~ '(user|student|id$)') THEN 'ok' ELSE 'LEAKED!' END;
INSERT INTO public._t SELECT 'ua counted once: ' || CASE WHEN sum(count) = 2 THEN 'ok' ELSE 'FAILED ' || sum(count) END
  FROM public.usage_daily WHERE day = (now() AT TIME ZONE 'utc')::date;
INSERT INTO public.app_owners (user_id) VALUES ('10010010-0000-0000-0000-000000000002');
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '10010010-0000-0000-0000-000000000002';
INSERT INTO public._t SELECT 'ua owner summary: ' || CASE WHEN jsonb_array_length(s->'rows') = 2 AND (s->>'consented')::int = 1 THEN 'ok' ELSE 'FAILED ' || s::text END
  FROM (SELECT public.usage_summary(7) AS s) x;
-- سحب الموافقة يوقف العدّ فوراً.
SET "request.jwt.claim.sub" = '10010010-0000-0000-0000-000000000001';
SELECT public.set_analytics_consent(false);
INSERT INTO public._t SELECT 'ua revoked ignored: ' || CASE WHEN public.track_usage(ARRAY['exam_done']) = 0 THEN 'ok' ELSE 'LEAKED!' END;
RESET "request.jwt.claim.sub";
SET ROLE anon;
DO $$ BEGIN
  PERFORM public.track_usage(ARRAY['app_open']);
  INSERT INTO public._t VALUES ('ua anon: ALLOWED!');
EXCEPTION WHEN insufficient_privilege THEN INSERT INTO public._t VALUES ('ua anon: rejected');
END $$;
RESET ROLE;
SELECT code FROM public._t WHERE code LIKE 'ua %' ORDER BY code;

-- @@ 116. المرحلة 14.4: لوحة المركز بصيغتها المجمَّعة — نفس المفاتيح، ولطاقم المركز فقط، والفهارس موجودة
DELETE FROM public._t;
INSERT INTO public._t SELECT 'perf indexes: ' || CASE WHEN count(*) = 7 THEN 'ok' ELSE 'FAILED ' || count(*) END
  FROM pg_indexes WHERE schemaname = 'public' AND indexname IN (
    'attendance_student_date_idx', 'attendance_date_idx', 'recitation_assessments_student_created_idx',
    'recitation_assessments_teacher_created_idx', 'recitation_sessions_student_created_idx',
    'exam_results_student_created_idx', 'assignments_teacher_created_idx');
-- مركز قائم ومنشئه (أيّاً كان بعد الأقسام السابقة).
CREATE TEMP TABLE _perf_c ON COMMIT DROP AS SELECT id, created_by FROM public.centers WHERE created_by IS NOT NULL ORDER BY created_at LIMIT 1;
SELECT set_config('request.jwt.claim.sub', (SELECT created_by::text FROM _perf_c), false);
GRANT SELECT ON _perf_c TO authenticated;
SET ROLE authenticated;
INSERT INTO public._t SELECT 'perf keys: ' || CASE WHEN
    (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(d) k) = ARRAY['at_risk','can_manage','center','halaqat','period_days','since','teachers','totals','weekly']
    AND (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(d->'totals') k) = ARRAY['assessments','at_risk','attendance_rate','attendance_records','avg_exam','avg_score','exams','halaqat','pages_memorized','students','teachers','weekly_slots']
    AND (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(d->'halaqat'->0) k) = ARRAY['absent','assessments','avg_exam','avg_score','excused','id','late','name','pages_memorized','present','slots','students','teacher_id','teacher_name']
    AND (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(d->'teachers'->0) k) = ARRAY['assessments','assignments','attendance_marked','halaqat','id','last_activity','name','students']
  THEN 'ok' ELSE 'FAILED ' || d::text END
  FROM (SELECT public.center_dashboard((SELECT id FROM _perf_c), 30) AS d) s;
SET "request.jwt.claim.sub" = '10910910-0000-0000-0000-000000000003';
DO $$ BEGIN
  PERFORM public.center_dashboard((SELECT id FROM _perf_c), 30);
  INSERT INTO public._t VALUES ('perf outsider: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('perf outsider: rejected');
END $$;
RESET "request.jwt.claim.sub";
SET ROLE anon;
DO $$ BEGIN
  PERFORM public.center_dashboard('cccc0000-0000-0000-0000-000000000001', 30);
  INSERT INTO public._t VALUES ('perf anon: ALLOWED!');
EXCEPTION WHEN insufficient_privilege THEN INSERT INTO public._t VALUES ('perf anon: rejected');
END $$;
RESET ROLE;
SELECT code FROM public._t WHERE code LIKE 'perf %' ORDER BY code;

-- @@ 117. إزالة الفهارس المكرّرة — القديمان محذوفان، والبديلان باقيان، ولا فهرس مكرّر في public
DELETE FROM public._t;
INSERT INTO public._t SELECT 'dup old dropped: ' || CASE WHEN count(*) = 0 THEN 'ok' ELSE 'FAILED ' || count(*) END
  FROM pg_indexes WHERE schemaname = 'public'
   AND indexname IN ('exam_results_student_idx', 'assessments_student_created_idx');
INSERT INTO public._t SELECT 'dup replacements kept: ' || CASE WHEN count(*) = 2 THEN 'ok' ELSE 'FAILED ' || count(*) END
  FROM pg_indexes WHERE schemaname = 'public'
   AND indexname IN ('exam_results_student_created_idx', 'recitation_assessments_student_created_idx');
INSERT INTO public._t SELECT 'dup none left: ' || CASE WHEN count(*) = 0 THEN 'ok' ELSE 'FAILED ' || string_agg(names, ' | ') END
  FROM (
    SELECT string_agg(i.indexrelid::regclass::text, ',') AS names
      FROM pg_index i JOIN pg_class t ON t.oid = i.indrelid JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = 'public'
     GROUP BY i.indrelid, i.indkey::text, i.indclass::text, i.indoption::text,
              coalesce(pg_get_expr(i.indexprs, i.indrelid), ''), coalesce(pg_get_expr(i.indpred, i.indrelid), '')
    HAVING count(*) > 1
  ) d;
SELECT code FROM public._t WHERE code LIKE 'dup %' ORDER BY code;

-- @@ 118. تكملة 7.2: بقية دوال الشروط الداخلية في private، ولا تُطلب عبر /rpc من public
DELETE FROM public._t;
INSERT INTO public._t
SELECT 'pp2 public copy executable: ' || p.proname || ' ALLOWED!'
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('are_classmates', 'are_dm_classmates', 'can_view_student_report', 'guardian_meets_teacher',
                     'has_role', 'is_blocked_between', 'is_chat_participant', 'is_halaqa_member',
                     'is_room_moderator', 'is_student_pair_chat', 'manages_center', 'room_role',
                     'teachers_share_center')
   AND (has_function_privilege('anon', p.oid, 'execute')
        OR has_function_privilege('authenticated', p.oid, 'execute'));
INSERT INTO public._t SELECT 'pp2 private copies: '
  || CASE WHEN count(DISTINCT p.proname) = 13 THEN 'ok' ELSE 'FAILED ' || count(DISTINCT p.proname) END
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'private'
   AND p.proname IN ('are_classmates', 'are_dm_classmates', 'can_view_student_report', 'guardian_meets_teacher',
                     'has_role', 'is_blocked_between', 'is_chat_participant', 'is_halaqa_member',
                     'is_room_moderator', 'is_student_pair_chat', 'manages_center', 'room_role',
                     'teachers_share_center');
-- لا سياسة تعتمد على نسخة public من هذه الدوال.
INSERT INTO public._t
SELECT DISTINCT 'pp2 policy uses public copy: ' || p.proname || ' FAILED'
  FROM pg_depend d
  JOIN pg_policy pol ON d.classid = 'pg_policy'::regclass AND d.objid = pol.oid
  JOIN pg_proc p ON d.refclassid = 'pg_proc'::regclass AND d.refobjid = p.oid
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('are_classmates', 'are_dm_classmates', 'can_view_student_report', 'guardian_meets_teacher',
                     'has_role', 'is_blocked_between', 'is_chat_participant', 'is_halaqa_member',
                     'is_room_moderator', 'is_student_pair_chat', 'manages_center', 'room_role',
                     'teachers_share_center');
INSERT INTO public._t SELECT 'pp2 service role keeps public: '
  || CASE WHEN has_function_privilege('service_role', 'public.has_role(uuid, public.app_role)', 'execute')
      THEN 'ok' ELSE 'FAILED' END;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
DO $$ BEGIN
  PERFORM public.has_role('11111111-1111-1111-1111-111111111111', 'teacher');
  INSERT INTO public._t VALUES ('pp2 rpc has_role: ALLOWED!');
EXCEPTION WHEN insufficient_privilege THEN INSERT INTO public._t VALUES ('pp2 rpc has_role: rejected');
END $$;
DO $$ BEGIN
  PERFORM public.is_chat_participant(gen_random_uuid(), '11111111-1111-1111-1111-111111111111');
  INSERT INTO public._t VALUES ('pp2 rpc is_chat_participant: ALLOWED!');
EXCEPTION WHEN insufficient_privilege THEN INSERT INTO public._t VALUES ('pp2 rpc is_chat_participant: rejected');
END $$;
RESET "request.jwt.claim.sub";
RESET ROLE;
SELECT code FROM public._t WHERE code LIKE 'pp2 %' ORDER BY code;

-- @@ 119. المرحلة 0.6: تاريخ المراجعة المتباعدة بتوقيت التطبيق (zen_today) لا UTC، في الجدولة والاستحقاق
DELETE FROM public._t;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
INSERT INTO public._t
SELECT 'srs due from zen_today: ' || CASE WHEN r.due_date = public.zen_today() + r.interval_days THEN 'ok' ELSE 'FAILED ' || r.due_date END
  FROM public.apply_review('22222222-2222-2222-2222-222222222222', 'الإخلاص', 1, 4, 95) r;
RESET ROLE;
-- كرت مستحق «اليوم» بتوقيت التطبيق يظهر، وكرت الغد لا يظهر.
UPDATE public.review_cards SET due_date = public.zen_today()
 WHERE student_id = '22222222-2222-2222-2222-222222222222' AND surah_name = 'الإخلاص';
SET ROLE authenticated;
INSERT INTO public._t SELECT 'srs due today listed: ' || CASE WHEN count(*) = 1 THEN 'ok' ELSE 'FAILED' END
  FROM public.due_reviews(100) WHERE surah_name = 'الإخلاص';
RESET ROLE;
UPDATE public.review_cards SET due_date = public.zen_today() + 1
 WHERE student_id = '22222222-2222-2222-2222-222222222222' AND surah_name = 'الإخلاص';
SET ROLE authenticated;
INSERT INTO public._t SELECT 'srs due tomorrow hidden: ' || CASE WHEN count(*) = 0 THEN 'ok' ELSE 'FAILED' END
  FROM public.due_reviews(100) WHERE surah_name = 'الإخلاص';
RESET "request.jwt.claim.sub";
RESET ROLE;
INSERT INTO public._t SELECT 'srs no utc date in functions: ' || CASE WHEN count(*) = 0 THEN 'ok' ELSE 'FAILED' END
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname IN ('apply_review', 'due_reviews')
   AND p.prosrc LIKE '%now()::date%';
SELECT code FROM public._t WHERE code LIKE 'srs %' ORDER BY code;

-- @@ 120. H4: حالة القراءة مع الحساب: «الأحدث يغلب» لكل حقل، ولا كتابة مباشرة، ولا قراءة لغير صاحبها
DELETE FROM public._t;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
INSERT INTO public._t
SELECT 'qrs first sync: ' || CASE WHEN r->'bookmarks' = '[{"id":"1:1"}]'::jsonb AND r->'khatmah' = 'null'::jsonb
  THEN 'ok' ELSE 'FAILED ' || r::text END
  FROM public.sync_quran_state('[{"id":"1:1"}]'::jsonb, now() - interval '1 hour') r;
-- أقدم من المحفوظ: لا يغلب. أحدث: يغلب. حقل آخر لا يتأثر.
INSERT INTO public._t
SELECT 'qrs older loses: ' || CASE WHEN r->'bookmarks' = '[{"id":"1:1"}]'::jsonb THEN 'ok' ELSE 'FAILED' END
  FROM public.sync_quran_state('[]'::jsonb, now() - interval '2 hours') r;
INSERT INTO public._t
SELECT 'qrs newer wins: ' || CASE WHEN r->'bookmarks' = '[]'::jsonb AND r->'history' = '{"entries":[]}'::jsonb
  THEN 'ok' ELSE 'FAILED ' || r::text END
  FROM public.sync_quran_state('[]'::jsonb, now(), NULL, NULL, '{"entries":[]}'::jsonb, now()) r;
-- قراءة فقط (بلا أوقات) تعيد الحالة دون تغيير.
INSERT INTO public._t
SELECT 'qrs read only: ' || CASE WHEN r->'history' = '{"entries":[]}'::jsonb THEN 'ok' ELSE 'FAILED' END
  FROM public.sync_quran_state() r;
DO $$ BEGIN
  PERFORM public.sync_quran_state('{"x":1}'::jsonb, now());
  INSERT INTO public._t VALUES ('qrs bad shape: ALLOWED!');
EXCEPTION WHEN raise_exception THEN INSERT INTO public._t VALUES ('qrs bad shape: rejected');
END $$;
DO $$ BEGIN
  UPDATE public.quran_reading_state SET bookmarks = '[]'::jsonb;
  INSERT INTO public._t VALUES ('qrs direct write: ALLOWED!');
EXCEPTION WHEN insufficient_privilege THEN INSERT INTO public._t VALUES ('qrs direct write: rejected');
END $$;
SET "request.jwt.claim.sub" = '33333333-3333-3333-3333-333333333333';
INSERT INTO public._t SELECT 'qrs other user sees: ' || CASE WHEN count(*) = 0 THEN 'none' ELSE 'FAILED' END
  FROM public.quran_reading_state WHERE user_id = '22222222-2222-2222-2222-222222222222';
RESET "request.jwt.claim.sub";
RESET ROLE;
INSERT INTO public._t SELECT 'qrs anon rpc: ' || CASE WHEN has_function_privilege('anon',
  'public.sync_quran_state(jsonb, timestamptz, jsonb, timestamptz, jsonb, timestamptz)', 'execute')
  THEN 'FAILED' ELSE 'ok' END;
SELECT code FROM public._t WHERE code LIKE 'qrs %' ORDER BY code;

-- @@ 121. H3: zen_today بتوقيت المستخدم إن ضُبط، وعدن افتراضياً، والمنطقة تُتحقق منها
DELETE FROM public._t;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
INSERT INTO public._t SELECT 'tz default aden: ' || CASE
  WHEN public.zen_today() = (now() AT TIME ZONE 'Asia/Aden')::date THEN 'ok' ELSE 'FAILED' END
  WHERE NOT EXISTS (SELECT 1 FROM public.notification_prefs WHERE user_id = '22222222-2222-2222-2222-222222222222');
INSERT INTO public._t SELECT 'tz set: ' || public.set_my_timezone('Pacific/Kiritimati');
INSERT INTO public._t SELECT 'tz today follows user: ' || CASE
  WHEN public.zen_today() = (now() AT TIME ZONE 'Pacific/Kiritimati')::date THEN 'ok' ELSE 'FAILED' END;
DO $$ BEGIN
  PERFORM public.set_my_timezone('Mars/Olympus');
  INSERT INTO public._t VALUES ('tz invalid: ALLOWED!');
EXCEPTION WHEN raise_exception THEN INSERT INTO public._t VALUES ('tz invalid: rejected');
END $$;
SET "request.jwt.claim.sub" = '33333333-3333-3333-3333-333333333333';
INSERT INTO public._t SELECT 'tz other user unaffected: ' || CASE
  WHEN public.zen_today() = (now() AT TIME ZONE COALESCE((SELECT timezone FROM public.notification_prefs
       WHERE user_id = '33333333-3333-3333-3333-333333333333'), 'Asia/Aden'))::date THEN 'ok' ELSE 'FAILED' END;
RESET "request.jwt.claim.sub";
RESET ROLE;
-- المهام المجدولة (بلا مستخدم) بتوقيت عدن.
INSERT INTO public._t SELECT 'tz no caller aden: ' || CASE
  WHEN public.zen_today() = (now() AT TIME ZONE 'Asia/Aden')::date THEN 'ok' ELSE 'FAILED' END;
UPDATE public.notification_prefs SET timezone = 'Asia/Aden' WHERE user_id = '22222222-2222-2222-2222-222222222222';
SELECT code FROM public._t WHERE code LIKE 'tz %' ORDER BY code;

-- @@ 122. تدقيق 1.2: progress_stats تحسب كل السجلات (لا آخر 200)، وتحترم RLS، ولا تُنفَّذ من anon
DELETE FROM public._t;
INSERT INTO public.progress (user_id, surah_name, from_ayah, to_ayah, memorization_type, created_at)
SELECT '22222222-2222-2222-2222-222222222222', 'البقرة', 1, 5,
       CASE WHEN g % 2 = 0 THEN 'new' ELSE 'revision' END, now() - (g || ' hours')::interval
  FROM generate_series(1, 250) g;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
INSERT INTO public._t SELECT 'ps own total >= 250: ' || CASE
  WHEN (public.progress_stats('22222222-2222-2222-2222-222222222222')->>'total')::int >= 250 THEN 'ok' ELSE 'FAILED' END;
INSERT INTO public._t SELECT 'ps own matches table: ' || CASE
  WHEN (public.progress_stats('22222222-2222-2222-2222-222222222222')->>'ayat')::bigint
     = (SELECT sum(GREATEST(0, to_ayah - from_ayah + 1)) FROM public.progress
         WHERE user_id = '22222222-2222-2222-2222-222222222222') THEN 'ok' ELSE 'FAILED' END;
-- طالب آخر لا يرى سجل غيره: الإجماليات صفر (RLS لا الدالة).
SET "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
INSERT INTO public._t SELECT 'ps stranger: ' || CASE
  WHEN (public.progress_stats('22222222-2222-2222-2222-222222222222')->>'total')::int = 0 THEN 'zero' ELSE 'LEAKED!' END;
RESET "request.jwt.claim.sub";
RESET ROLE;
INSERT INTO public._t SELECT 'ps anon: ' || CASE
  WHEN has_function_privilege('anon', 'public.progress_stats(uuid)', 'execute') THEN 'ALLOWED!' ELSE 'denied' END;
DELETE FROM public.progress WHERE user_id = '22222222-2222-2222-2222-222222222222' AND surah_name = 'البقرة'
   AND from_ayah = 1 AND to_ayah = 5 AND notes IS NULL AND created_at > now() - interval '251 hours';
SELECT code FROM public._t WHERE code LIKE 'ps %' ORDER BY code;

-- @@ 123. تدقيق 1.4/1.5: حدّ «kick» للخادم وحده ويقطع بعد 6 في الدقيقة، وzen_today ليست لـ anon
DELETE FROM public._t;
INSERT INTO public._t SELECT 'pk client: ' || CASE
  WHEN has_function_privilege('authenticated', 'public.push_kick_allowed(uuid)', 'execute')
    OR has_function_privilege('anon', 'public.push_kick_allowed(uuid)', 'execute') THEN 'ALLOWED!' ELSE 'denied' END;
DELETE FROM public.auth_rate_events WHERE kind = 'push_kick';
INSERT INTO public._t SELECT 'pk allowed first 6: ' || CASE
  WHEN bool_and(public.push_kick_allowed('22222222-2222-2222-2222-222222222222')) THEN 'ok' ELSE 'FAILED' END
  FROM generate_series(1, 6);
INSERT INTO public._t SELECT 'pk 7th: ' || CASE
  WHEN public.push_kick_allowed('22222222-2222-2222-2222-222222222222') THEN 'ALLOWED!' ELSE 'limited' END;
INSERT INTO public._t SELECT 'pk other user: ' || CASE
  WHEN public.push_kick_allowed('33333333-3333-3333-3333-333333333333') THEN 'ok' ELSE 'FAILED' END;
INSERT INTO public._t SELECT 'pk null: ' || CASE
  WHEN public.push_kick_allowed(NULL) THEN 'ALLOWED!' ELSE 'denied' END;
DELETE FROM public.auth_rate_events WHERE kind = 'push_kick';
INSERT INTO public._t SELECT 'zt anon: ' || CASE
  WHEN has_function_privilege('anon', 'public.zen_today()', 'execute') THEN 'ALLOWED!' ELSE 'denied' END;
INSERT INTO public._t SELECT 'zt authenticated: ' || CASE
  WHEN has_function_privilege('authenticated', 'public.zen_today()', 'execute') THEN 'ok' ELSE 'FAILED' END;
SELECT code FROM public._t WHERE code LIKE 'pk %' OR code LIKE 'zt %' ORDER BY code;

-- @@ 124. تدقيق 2.2: الاحتفاظ بالتسجيلات — القديم المقيَّم فقط مرشّح، والتعليم يبقي النتيجة، وللخادم وحده
DELETE FROM public._t;
INSERT INTO storage.buckets (id, name) VALUES ('recitations', 'recitations') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.recitation_sessions (id, student_id, surah_name, status, audio_path, created_at, ai_score) VALUES
 ('a1000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'الملك', 'approved',
  'ret/old-approved.m4a', now() - interval '120 days', 88),
 ('a1000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'الملك', 'awaiting_teacher',
  'ret/old-waiting.m4a', now() - interval '120 days', NULL),
 ('a1000000-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222', 'الملك', 'approved',
  'ret/new-approved.m4a', now() - interval '10 days', NULL);
INSERT INTO storage.objects (bucket_id, name, metadata) VALUES ('recitations', 'ret/old-approved.m4a', '{"size": 1000}');
INSERT INTO public._t SELECT 'rt candidates: ' || COALESCE(string_agg(audio_path, ',' ORDER BY audio_path), '')
  FROM public.retention_audio_candidates(90, 100) WHERE audio_path LIKE 'ret/%';
INSERT INTO public._t SELECT 'rt min 30 days: ' || CASE WHEN EXISTS (
  SELECT 1 FROM public.retention_audio_candidates(1, 100) WHERE audio_path = 'ret/new-approved.m4a')
  THEN 'FAILED' ELSE 'ok' END;
INSERT INTO public._t SELECT 'rt present: ' || string_agg(p, ',')
  FROM public.retention_paths_present(ARRAY['ret/old-approved.m4a', 'ret/missing.m4a']) p;
INSERT INTO public._t SELECT 'rt marked: ' || public.retention_mark_purged(ARRAY['a1000000-0000-0000-0000-000000000001'::uuid]);
INSERT INTO public._t SELECT 'rt result kept: ' || CASE WHEN audio_path IS NULL AND audio_purged_at IS NOT NULL
  AND ai_score = 88 AND status = 'approved' THEN 'ok' ELSE 'FAILED' END
  FROM public.recitation_sessions WHERE id = 'a1000000-0000-0000-0000-000000000001';
INSERT INTO public._t SELECT 'rt client: ' || CASE
  WHEN has_function_privilege('authenticated', 'public.retention_audio_candidates(integer, integer)', 'execute')
    OR has_function_privilege('authenticated', 'public.retention_mark_purged(uuid[])', 'execute')
    OR has_function_privilege('authenticated', 'public.retention_paths_present(text[])', 'execute')
    OR has_function_privilege('authenticated', 'public.maintenance_tick()', 'execute') THEN 'ALLOWED!' ELSE 'denied' END;
INSERT INTO public._t SELECT 'rt tick without pg_net: ' || CASE
  WHEN public.maintenance_tick() IN ('idle', 'no_pg_net', 'not_configured') THEN 'quiet' ELSE 'FAILED' END;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
INSERT INTO public._t SELECT 'rt usage non-owner: ' || (public.storage_usage()->>'status');
RESET "request.jwt.claim.sub";
RESET ROLE;
DELETE FROM storage.objects WHERE name LIKE 'ret/%';
DELETE FROM public.recitation_sessions WHERE id::text LIKE 'a1000000-%';
SELECT code FROM public._t WHERE code LIKE 'rt %' ORDER BY code;

-- @@ 125. تدقيق 3.1: كلمة المرور الشائعة مرفوضة في كل المسارات، وحارس مخطط auth نظيف
DELETE FROM public._t;
DELETE FROM public.auth_rate_events WHERE kind IN ('signup', 'recovery');
DO $$ BEGIN
  PERFORM public.register_username_account('common_pw_user', 'Password123', 'تجربة');
  INSERT INTO public._t VALUES ('cp signup common: ALLOWED!');
EXCEPTION WHEN others THEN
  INSERT INTO public._t VALUES ('cp signup common: ' || CASE WHEN SQLERRM LIKE 'weak_password:%' THEN 'rejected' ELSE 'FAILED ' || SQLERRM END);
END $$;
DO $$ BEGIN
  PERFORM public.register_username_account('common_pw_user2', 'محمد1234', 'تجربة');
  INSERT INTO public._t VALUES ('cp signup arabic common: ALLOWED!');
EXCEPTION WHEN others THEN
  INSERT INTO public._t VALUES ('cp signup arabic common: ' || CASE WHEN SQLERRM LIKE 'weak_password:%' THEN 'rejected' ELSE 'FAILED ' || SQLERRM END);
END $$;
INSERT INTO public._t SELECT 'cp signup strong: ' || CASE
  WHEN (public.register_username_account('strong_pw_user', 'Tarteel-Rawda-7319', 'تجربة')->>'username') = 'strong_pw_user'
  THEN 'ok' ELSE 'FAILED' END;
INSERT INTO public._t SELECT 'cp guard: ' || COALESCE(string_agg(table_name || '.' || column_name, ','), 'clean')
  FROM public.auth_schema_guard();
INSERT INTO public._t SELECT 'cp guard client: ' || CASE
  WHEN has_function_privilege('authenticated', 'public.auth_schema_guard()', 'execute')
    OR has_function_privilege('anon', 'public.auth_schema_guard()', 'execute') THEN 'ALLOWED!' ELSE 'denied' END;
INSERT INTO public._t SELECT 'cp list hidden: ' || CASE
  WHEN has_table_privilege('authenticated', 'private.common_passwords', 'select') THEN 'LEAKED!' ELSE 'hidden' END;
DELETE FROM auth.users WHERE id IN (SELECT user_id FROM public.account_usernames WHERE username = 'strong_pw_user');
DELETE FROM public.auth_rate_events WHERE kind IN ('signup', 'recovery');
SELECT code FROM public._t WHERE code LIKE 'cp %' ORDER BY code;

-- @@ 126. تدقيق 4.2: مفاتيح الميزات — يقرؤها المسجَّل، ويكتبها صاحب التطبيق وحده عبر الدالة
DELETE FROM public._t;
INSERT INTO auth.users (id, raw_user_meta_data) VALUES ('ff000000-0000-0000-0000-000000000001', '{"name":"صاحب المفاتيح"}');
DELETE FROM public.app_owner;
INSERT INTO public.app_owner (id, user_id) VALUES (true, 'ff000000-0000-0000-0000-000000000001');
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
DO $$ BEGIN
  PERFORM public.set_feature_flag('stories', false, 0, 'تجربة');
  INSERT INTO public._t VALUES ('ff student set: ALLOWED!');
EXCEPTION WHEN insufficient_privilege THEN INSERT INTO public._t VALUES ('ff student set: rejected');
END $$;
DO $$ BEGIN
  INSERT INTO public.feature_flags (key, enabled) VALUES ('stories', false);
  INSERT INTO public._t VALUES ('ff direct insert: ALLOWED!');
EXCEPTION WHEN insufficient_privilege THEN INSERT INTO public._t VALUES ('ff direct insert: rejected');
END $$;
SET "request.jwt.claim.sub" = 'ff000000-0000-0000-0000-000000000001';
INSERT INTO public._t SELECT 'ff owner set: ' || CASE
  WHEN (public.set_feature_flag('stories', false, 30, ' تقليل ')).rollout = 30 THEN 'ok' ELSE 'FAILED' END;
DO $$ BEGIN
  PERFORM public.set_feature_flag('Bad Key', true, 100, NULL);
  INSERT INTO public._t VALUES ('ff bad key: ALLOWED!');
EXCEPTION WHEN check_violation THEN INSERT INTO public._t VALUES ('ff bad key: rejected');
END $$;
DO $$ BEGIN
  PERFORM public.set_feature_flag('stories', true, 101, NULL);
  INSERT INTO public._t VALUES ('ff bad rollout: ALLOWED!');
EXCEPTION WHEN check_violation THEN INSERT INTO public._t VALUES ('ff bad rollout: rejected');
END $$;
SET "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
INSERT INTO public._t SELECT 'ff student reads: ' || CASE
  WHEN (SELECT enabled = false AND note = 'تقليل' FROM public.feature_flags WHERE key = 'stories') THEN 'ok' ELSE 'FAILED' END;
RESET "request.jwt.claim.sub";
RESET ROLE;
INSERT INTO public._t SELECT 'ff anon: ' || CASE
  WHEN has_table_privilege('anon', 'public.feature_flags', 'select') THEN 'ALLOWED!' ELSE 'denied' END;
DELETE FROM public.feature_flags;
DELETE FROM public.app_owner;
DELETE FROM auth.users WHERE id = 'ff000000-0000-0000-0000-000000000001';
SELECT code FROM public._t WHERE code LIKE 'ff %' ORDER BY code;

-- @@ 127. فحص الأقسام P1: مؤشرات رئيسية المعلّم — من حلقاته وحدها، وللمعلّم فقط، ولا تُطلب دون جلسة
DELETE FROM public._t;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '10010010-0000-0000-0000-000000000002';
CREATE TEMP TABLE _k2 ON COMMIT DROP AS SELECT public.teacher_home_kpis() AS k;
RESET ROLE;
SET session_replication_role = replica;
INSERT INTO public.recitation_sessions (id, student_id, halaqa_id, surah_name, status, session_date)
VALUES ('12712712-0000-0000-0000-000000000001', '10310310-0000-0000-0000-00000000000a',
        '10310310-0000-0000-0000-0000000000aa', 'الملك', 'awaiting_teacher', public.zen_today());
INSERT INTO public.assignments (student_id, teacher_id, halaqa_id, surah_name, due_date, status)
VALUES ('10310310-0000-0000-0000-00000000000a', '10010010-0000-0000-0000-000000000001',
        '10310310-0000-0000-0000-0000000000aa', 'الملك', public.zen_today() - 1, 'pending');
SET session_replication_role = DEFAULT;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '10010010-0000-0000-0000-000000000001';
CREATE TEMP TABLE _k1 ON COMMIT DROP AS SELECT public.teacher_home_kpis() AS k;
INSERT INTO public._t SELECT 'kpi students: ' || CASE WHEN (k ->> 'students')::int >= 5 THEN 'ok' ELSE 'FAILED ' || k::text END FROM _k1;
INSERT INTO public._t SELECT 'kpi pending: ' || CASE WHEN (k ->> 'pending_recitations')::int >= 1 THEN 'ok' ELSE 'FAILED ' || k::text END FROM _k1;
INSERT INTO public._t SELECT 'kpi attendance: ' || CASE WHEN (k ->> 'attendance_present')::int >= 3
  AND (k ->> 'attendance_marked')::int >= (k ->> 'attendance_present')::int THEN 'ok' ELSE 'FAILED ' || k::text END FROM _k1;
INSERT INTO public._t SELECT 'kpi due: ' || CASE WHEN (k ->> 'due_assignments')::int >= 1 THEN 'ok' ELSE 'FAILED ' || k::text END FROM _k1;
INSERT INTO public._t SELECT 'kpi at risk: ' || CASE WHEN (k ->> 'at_risk')::int >= 4 THEN 'ok' ELSE 'FAILED ' || k::text END FROM _k1;
SET "request.jwt.claim.sub" = '10010010-0000-0000-0000-000000000002';
INSERT INTO public._t SELECT 'kpi other teacher: ' || CASE
  WHEN public.teacher_home_kpis() = (SELECT k FROM _k2) THEN 'ok' ELSE 'LEAKED!' END;
SET "request.jwt.claim.sub" = '10310310-0000-0000-0000-00000000000a';
DO $$ BEGIN
  PERFORM public.teacher_home_kpis();
  INSERT INTO public._t VALUES ('kpi student: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('kpi student: rejected');
END $$;
RESET "request.jwt.claim.sub";
RESET ROLE;
INSERT INTO public._t SELECT 'kpi anon: ' || CASE
  WHEN has_function_privilege('anon', 'public.teacher_home_kpis()', 'EXECUTE') THEN 'LEAKED!' ELSE 'denied' END;
DELETE FROM public.assignments WHERE surah_name = 'الملك' AND student_id = '10310310-0000-0000-0000-00000000000a';
DELETE FROM public.recitation_sessions WHERE id = '12712712-0000-0000-0000-000000000001';
SELECT code FROM public._t WHERE code LIKE 'kpi %' ORDER BY code;

-- @@ 128. فحص الأقسام P2: جهات الاتصال بصلتها — نفس قائمة my_chat_contacts، وأقرب صلة لكل شخص، ولا تُطلب دون جلسة
DELETE FROM public._t;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '10010010-0000-0000-0000-000000000001';
INSERT INTO public._t SELECT 'cd same set: ' || CASE WHEN
  (SELECT array_agg(x ORDER BY x) FROM public.my_chat_contacts() x)
  IS NOT DISTINCT FROM
  (SELECT array_agg((e ->> 'id')::uuid ORDER BY (e ->> 'id')::uuid) FROM jsonb_array_elements(public.my_chat_contacts_detailed()) e)
  THEN 'ok' ELSE 'FAILED' END;
INSERT INTO public._t SELECT 'cd my student: ' || COALESCE((
  SELECT e ->> 'relation' FROM jsonb_array_elements(public.my_chat_contacts_detailed()) e
   WHERE e ->> 'id' = '10310310-0000-0000-0000-00000000000b'), 'missing');
SET "request.jwt.claim.sub" = '10310310-0000-0000-0000-00000000000b';
INSERT INTO public._t SELECT 'cd my teacher: ' || COALESCE((
  SELECT e ->> 'relation' FROM jsonb_array_elements(public.my_chat_contacts_detailed()) e
   WHERE e ->> 'id' = '10010010-0000-0000-0000-000000000001'), 'missing');
INSERT INTO public._t SELECT 'cd student same set: ' || CASE WHEN
  (SELECT array_agg(x ORDER BY x) FROM public.my_chat_contacts() x)
  IS NOT DISTINCT FROM
  (SELECT array_agg((e ->> 'id')::uuid ORDER BY (e ->> 'id')::uuid) FROM jsonb_array_elements(public.my_chat_contacts_detailed()) e)
  THEN 'ok' ELSE 'FAILED' END;
RESET "request.jwt.claim.sub";
RESET ROLE;
INSERT INTO public._t SELECT 'cd anon: ' || CASE
  WHEN has_function_privilege('anon', 'public.my_chat_contacts_detailed()', 'EXECUTE') THEN 'LEAKED!' ELSE 'denied' END;
SELECT code FROM public._t WHERE code LIKE 'cd %' ORDER BY code;

-- @@ 129. السجل اليومي للحلقة: سجل واحد لليوم، والكتابة لمدير الحلقة فقط، والمشرف يقرأ، والقفل المتفائل، والمُغلق لا يُكتب
DELETE FROM public._t;
INSERT INTO auth.users (id, phone, raw_user_meta_data) VALUES
 ('12912912-0000-0000-0000-000000000001','+967700129001','{"name":"صاحب مركز اليومي"}'),
 ('12912912-0000-0000-0000-000000000002','+967700129002','{"name":"معلّم اليومي"}'),
 ('12912912-0000-0000-0000-000000000003','+967700129003','{"name":"معلّم غريب"}'),
 ('12912912-0000-0000-0000-000000000004','+967700129004','{"name":"مشرف اليومي"}'),
 ('12912912-0000-0000-0000-00000000000a','+967700129010','{"name":"أحمد"}'),
 ('12912912-0000-0000-0000-00000000000b','+967700129011','{"name":"بلال"}'),
 ('12912912-0000-0000-0000-00000000000c','+967700129012','{"name":"غريب"}');
INSERT INTO public.user_roles (user_id, role) VALUES
 ('12912912-0000-0000-0000-000000000001','teacher'), ('12912912-0000-0000-0000-000000000002','teacher'),
 ('12912912-0000-0000-0000-000000000003','teacher')
ON CONFLICT DO NOTHING;
INSERT INTO public.centers (id, name, created_by)
VALUES ('12912912-0000-0000-0000-0000000000cc', 'مركز اليومي', '12912912-0000-0000-0000-000000000001');
INSERT INTO public.center_staff (center_id, user_id, role)
VALUES ('12912912-0000-0000-0000-0000000000cc', '12912912-0000-0000-0000-000000000004', 'supervisor');
INSERT INTO public.halaqat (id, center_id, name, teacher_id)
VALUES ('12912912-0000-0000-0000-0000000000aa', '12912912-0000-0000-0000-0000000000cc', 'حلقة اليومي', '12912912-0000-0000-0000-000000000002');
INSERT INTO public.halaqa_students (halaqa_id, student_id) VALUES
 ('12912912-0000-0000-0000-0000000000aa', '12912912-0000-0000-0000-00000000000a'),
 ('12912912-0000-0000-0000-0000000000aa', '12912912-0000-0000-0000-00000000000b');
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '12912912-0000-0000-0000-000000000002';
SELECT set_config('zen.d1', (public.open_daily_record('12912912-0000-0000-0000-0000000000aa', public.zen_today()) ->> 'id'), false);
INSERT INTO public._t SELECT 'dr open twice same: ' || CASE WHEN
  (public.open_daily_record('12912912-0000-0000-0000-0000000000aa', public.zen_today()) ->> 'id') = current_setting('zen.d1')
  THEN 'ok' ELSE 'FAILED' END;
DO $$ BEGIN
  PERFORM public.open_daily_record('12912912-0000-0000-0000-0000000000aa', public.zen_today() + 1);
  INSERT INTO public._t VALUES ('dr future date: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('dr future date: rejected');
END $$;
-- الحضور: لمسة واحدة، ثم نسخة قديمة تُرفض.
INSERT INTO public._t SELECT 'dr attendance: ' || CASE WHEN
  (public.set_daily_attendance(current_setting('zen.d1')::uuid, '12912912-0000-0000-0000-00000000000a', 'present', NULL, 0) ->> 'version')::int = 1
  THEN 'ok' ELSE 'FAILED' END;
DO $$ BEGIN
  PERFORM public.set_daily_attendance(current_setting('zen.d1')::uuid, '12912912-0000-0000-0000-00000000000a', 'late', NULL, 0);
  INSERT INTO public._t VALUES ('dr stale version: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('dr stale version: ' || CASE WHEN SQLERRM = 'VERSION_CONFLICT' THEN 'rejected' ELSE 'FAILED ' || SQLERRM END);
END $$;
DO $$ BEGIN
  PERFORM public.set_daily_attendance(current_setting('zen.d1')::uuid, '12912912-0000-0000-0000-00000000000c', 'present', NULL, 0);
  INSERT INTO public._t VALUES ('dr outsider student: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('dr outsider student: rejected');
END $$;
-- حفظ عبر سورتين = مقطعان، وجدولة مرة واحدة لكل مقطع؛ إعادة الحفظ نفسه تحدّث ولا تكرّر.
SELECT set_config('zen.d2', public.save_daily_entry(current_setting('zen.d1')::uuid, '12912912-0000-0000-0000-00000000000a',
  '{"memorize":{"segments":[{"surah_name":"الملك","from_ayah":25,"to_ayah":30},{"surah_name":"القلم","from_ayah":1,"to_ayah":5}],"grade":4},
    "evaluation":{"overall":5,"tajweed":4},"note":"متقن"}', 1)::text, false);
INSERT INTO public._t SELECT 'dr entry: ' || CASE WHEN
  jsonb_array_length(current_setting('zen.d2')::jsonb -> 'memorize' -> 'segments') = 2
  AND (current_setting('zen.d2')::jsonb -> 'evaluation' ->> 'overall')::int = 5
  AND (current_setting('zen.d2')::jsonb ->> 'version')::int = 2
  THEN 'ok' ELSE 'FAILED ' || current_setting('zen.d2') END;
SELECT public.save_daily_entry(current_setting('zen.d1')::uuid, '12912912-0000-0000-0000-00000000000a',
  '{"memorize":{"segments":[{"surah_name":"الملك","from_ayah":25,"to_ayah":30},{"surah_name":"القلم","from_ayah":1,"to_ayah":5}],"grade":5}}', 2);
DO $$ BEGIN
  PERFORM public.save_daily_entry(current_setting('zen.d1')::uuid, '12912912-0000-0000-0000-00000000000b',
    '{"review":{"segments":[{"surah_name":"الملك","from_ayah":1,"to_ayah":31}],"grade":3}}', 0);
  INSERT INTO public._t VALUES ('dr ayah beyond surah: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('dr ayah beyond surah: ' || CASE WHEN SQLERRM = 'INVALID_RANGE' THEN 'rejected' ELSE 'FAILED ' || SQLERRM END);
END $$;
SELECT public.set_daily_attendance(current_setting('zen.d1')::uuid, '12912912-0000-0000-0000-00000000000b', 'absent', NULL, 0);
DO $$ BEGIN
  PERFORM public.save_daily_entry(current_setting('zen.d1')::uuid, '12912912-0000-0000-0000-00000000000b',
    '{"review":{"segments":[{"surah_name":"الملك","from_ayah":1,"to_ayah":5}],"grade":3}}', 1);
  INSERT INTO public._t VALUES ('dr absent achievement: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('dr absent achievement: rejected');
END $$;
RESET ROLE;
INSERT INTO public._t SELECT 'dr no dup: ' || CASE WHEN
  (SELECT count(*) FROM public.recitation_sessions WHERE student_id = '12912912-0000-0000-0000-00000000000a') = 2
  AND (SELECT count(*) FROM public.review_cards WHERE student_id = '12912912-0000-0000-0000-00000000000a') = 2
  AND (SELECT bool_and(repetitions = 1) FROM public.review_cards WHERE student_id = '12912912-0000-0000-0000-00000000000a')
  AND (SELECT bool_and(score = 95) FROM public.recitation_assessments WHERE student_id = '12912912-0000-0000-0000-00000000000a')
  AND (SELECT count(*) FROM public.attendance WHERE student_id = '12912912-0000-0000-0000-00000000000a') = 1
  AND (SELECT count(*) FROM public.halaqa_daily_records WHERE halaqa_id = '12912912-0000-0000-0000-0000000000aa') = 1
  THEN 'ok' ELSE 'FAILED' END;
DO $$ BEGIN
  INSERT INTO public.halaqa_daily_records (halaqa_id, record_date) VALUES ('12912912-0000-0000-0000-0000000000aa', public.zen_today());
  INSERT INTO public._t VALUES ('dr unique per day: ALLOWED!');
EXCEPTION WHEN unique_violation THEN INSERT INTO public._t VALUES ('dr unique per day: rejected');
END $$;
SET ROLE authenticated;
-- معلّم آخر: لا قراءة ولا كتابة. المشرف: يقرأ ولا يكتب. الطالب: لا شيء.
SET "request.jwt.claim.sub" = '12912912-0000-0000-0000-000000000003';
DO $$ BEGIN
  PERFORM public.daily_record_sheet('12912912-0000-0000-0000-0000000000aa', public.zen_today());
  INSERT INTO public._t VALUES ('dr outsider sheet: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('dr outsider sheet: rejected');
END $$;
DO $$ BEGIN
  PERFORM public.set_daily_attendance(current_setting('zen.d1')::uuid, '12912912-0000-0000-0000-00000000000a', 'absent', NULL, 1);
  INSERT INTO public._t VALUES ('dr outsider write: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('dr outsider write: rejected');
END $$;
INSERT INTO public._t SELECT 'dr outsider table: ' || CASE WHEN count(*) = 0 THEN 'ok' ELSE 'LEAKED!' END
  FROM public.halaqa_daily_records WHERE halaqa_id = '12912912-0000-0000-0000-0000000000aa';
SET "request.jwt.claim.sub" = '12912912-0000-0000-0000-000000000004';
INSERT INTO public._t SELECT 'dr supervisor reads: ' || CASE WHEN
  (s ->> 'can_edit')::boolean = false AND jsonb_array_length(s -> 'students') = 2 THEN 'ok' ELSE 'FAILED' END
  FROM (SELECT public.daily_record_sheet('12912912-0000-0000-0000-0000000000aa', public.zen_today()) s) x;
DO $$ BEGIN
  PERFORM public.save_daily_entry(current_setting('zen.d1')::uuid, '12912912-0000-0000-0000-00000000000a', '{"note":"x"}', 3);
  INSERT INTO public._t VALUES ('dr supervisor write: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('dr supervisor write: rejected');
END $$;
SET "request.jwt.claim.sub" = '12912912-0000-0000-0000-00000000000a';
DO $$ BEGIN
  PERFORM public.daily_record_sheet('12912912-0000-0000-0000-0000000000aa', public.zen_today());
  INSERT INTO public._t VALUES ('dr student sheet: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('dr student sheet: rejected');
END $$;
INSERT INTO public._t SELECT 'dr student overview: ' || CASE WHEN
  (public.student_daily_overview('12912912-0000-0000-0000-00000000000a') -> 'last_evaluation' ->> 'overall')::int = 5
  THEN 'ok' ELSE 'FAILED' END;
-- المعلّم: الإنهاء بنسخة قديمة يُرفض، ثم يُنهى، ثم لا كتابة؛ القفل لصاحب المركز وحده.
SET "request.jwt.claim.sub" = '12912912-0000-0000-0000-000000000002';
DO $$ BEGIN
  PERFORM public.complete_daily_record(current_setting('zen.d1')::uuid, 0);
  INSERT INTO public._t VALUES ('dr complete stale: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('dr complete stale: rejected');
END $$;
SELECT public.set_daily_record_notes(current_setting('zen.d1')::uuid, 'يوم طيّب', 1);
INSERT INTO public._t SELECT 'dr complete: ' || CASE WHEN
  public.complete_daily_record(current_setting('zen.d1')::uuid, 2) ->> 'status' = 'completed' THEN 'ok' ELSE 'FAILED' END;
DO $$ BEGIN
  PERFORM public.set_daily_attendance(current_setting('zen.d1')::uuid, '12912912-0000-0000-0000-00000000000b', 'present', NULL, 1);
  INSERT INTO public._t VALUES ('dr write completed: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('dr write completed: rejected');
END $$;
DO $$ BEGIN
  PERFORM public.record_halaqa_session('12912912-0000-0000-0000-0000000000aa', public.zen_today(),
    '[{"student_id":"12912912-0000-0000-0000-00000000000b","status":"present"}]');
  INSERT INTO public._t VALUES ('dr legacy outbox completed: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('dr legacy outbox completed: rejected');
END $$;
DO $$ BEGIN
  PERFORM public.lock_daily_record(current_setting('zen.d1')::uuid, 3);
  INSERT INTO public._t VALUES ('dr teacher lock: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('dr teacher lock: rejected');
END $$;
SET "request.jwt.claim.sub" = '12912912-0000-0000-0000-000000000001';
INSERT INTO public._t SELECT 'dr owner lock: ' || CASE WHEN
  public.lock_daily_record(current_setting('zen.d1')::uuid, 3) ->> 'status' = 'locked' THEN 'ok' ELSE 'FAILED' END;
DO $$ BEGIN
  PERFORM public.reopen_daily_record(current_setting('zen.d1')::uuid, 4);
  INSERT INTO public._t VALUES ('dr reopen locked: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('dr reopen locked: ' || CASE WHEN SQLERRM = 'RECORD_LOCKED' THEN 'rejected' ELSE 'FAILED ' || SQLERRM END);
END $$;
INSERT INTO public._t SELECT 'dr owner notified: ' || CASE WHEN count(*) = 1 THEN 'ok' ELSE 'FAILED' END
  FROM public.notifications WHERE user_id = '12912912-0000-0000-0000-000000000001' AND kind = 'daily_record';
RESET "request.jwt.claim.sub";
RESET ROLE;
INSERT INTO public._t SELECT 'dr anon: ' || CASE
  WHEN has_function_privilege('anon', 'public.save_daily_entry(uuid, uuid, jsonb, integer)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.daily_record_sheet(uuid, date)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'private.daily_record_for_write(uuid, boolean)', 'EXECUTE')
  THEN 'LEAKED!' ELSE 'denied' END;
SELECT code FROM public._t WHERE code LIKE 'dr %' ORDER BY code;

-- @@ 130. تحليل «المزيد» SEC-04: فحص حذف الحساب يرفض ما ترفضه delete_my_account دون أن يحذف شيئاً
DELETE FROM public._t;
INSERT INTO auth.users (id, phone, raw_user_meta_data) VALUES
 ('13013013-0000-0000-0000-000000000001', '+967713013001', '{"name":"مدير وحيد"}'),
 ('13013013-0000-0000-0000-000000000002', '+967713013002', '{"name":"عضو"}'),
 ('13013013-0000-0000-0000-000000000003', '+967713013003', '{"name":"عادي"}');
INSERT INTO public.centers (id, name, created_by)
VALUES ('13013013-0000-0000-0000-0000000000cc', 'مركز الفحص', '13013013-0000-0000-0000-000000000001');
INSERT INTO public.center_staff (center_id, user_id, role) VALUES
 ('13013013-0000-0000-0000-0000000000cc', '13013013-0000-0000-0000-000000000001', 'manager'),
 ('13013013-0000-0000-0000-0000000000cc', '13013013-0000-0000-0000-000000000002', 'supervisor')
ON CONFLICT DO NOTHING;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '13013013-0000-0000-0000-000000000001';
DO $$ BEGIN
  PERFORM public.delete_my_account_check('احذف حسابي');
  INSERT INTO public._t VALUES ('delchk sole manager: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('delchk sole manager: rejected');
END $$;
SET "request.jwt.claim.sub" = '13013013-0000-0000-0000-000000000003';
DO $$ BEGIN
  PERFORM public.delete_my_account_check('نعم');
  INSERT INTO public._t VALUES ('delchk wrong phrase: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('delchk wrong phrase: rejected');
END $$;
DO $$ BEGIN
  PERFORM public.delete_my_account_check('احذف حسابي');
  INSERT INTO public._t VALUES ('delchk ok: ok');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('delchk ok: FAILED ' || SQLERRM);
END $$;
RESET ROLE;
RESET "request.jwt.claim.sub";
INSERT INTO public._t SELECT 'delchk nothing deleted: '
  || CASE WHEN EXISTS (SELECT 1 FROM auth.users WHERE id = '13013013-0000-0000-0000-000000000003')
           AND EXISTS (SELECT 1 FROM public.profiles WHERE id = '13013013-0000-0000-0000-000000000003')
      THEN 'ok' ELSE 'FAILED' END;
INSERT INTO public._t SELECT 'delchk anon: '
  || CASE WHEN has_function_privilege('anon', 'public.delete_my_account_check(text)', 'EXECUTE')
      THEN 'LEAKED!' ELSE 'denied' END;
SELECT code FROM public._t WHERE code LIKE 'delchk %' ORDER BY code;
-- @@ 131. تحليل «المزيد» GAP-01: شارات «المزيد» لمستخدم الجلسة وحده — غير المقروء، والدعوات لي ولأبنائي، والمتعثّرون للمعلّم
DELETE FROM public._t;
INSERT INTO auth.users (id, phone, raw_user_meta_data) VALUES
 ('13113113-0000-0000-0000-000000000001', '+967713113001', '{"name":"طالب الشارات"}'),
 ('13113113-0000-0000-0000-000000000002', '+967713113002', '{"name":"وليّ الشارات"}'),
 ('13113113-0000-0000-0000-000000000003', '+967713113003', '{"name":"معلّم الشارات"}'),
 ('13113113-0000-0000-0000-000000000004', '+967713113004', '{"name":"غريب الشارات"}'),
 ('13113113-0000-0000-0000-000000000005', '+967713113005', '{"name":"ابن الشارات"}');
INSERT INTO public.user_roles (user_id, role)
VALUES ('13113113-0000-0000-0000-000000000003', 'teacher') ON CONFLICT DO NOTHING;
INSERT INTO public.centers (id, name, created_by)
VALUES ('13113113-0000-0000-0000-0000000000cc', 'مركز الشارات', '13113113-0000-0000-0000-000000000003');
INSERT INTO public.halaqat (id, center_id, name, teacher_id)
VALUES ('13113113-0000-0000-0000-0000000000aa', '13113113-0000-0000-0000-0000000000cc', 'حلقة الشارات', '13113113-0000-0000-0000-000000000003');
INSERT INTO public.guardian_links (guardian_id, student_id)
VALUES ('13113113-0000-0000-0000-000000000002', '13113113-0000-0000-0000-000000000005');
INSERT INTO public.halaqa_invites (halaqa_id, student_id, invited_by, status) VALUES
 ('13113113-0000-0000-0000-0000000000aa', '13113113-0000-0000-0000-000000000001', '13113113-0000-0000-0000-000000000003', 'pending'),
 ('13113113-0000-0000-0000-0000000000aa', '13113113-0000-0000-0000-000000000005', '13113113-0000-0000-0000-000000000003', 'awaiting_guardian');
INSERT INTO public.notifications (user_id, title, read) VALUES
 ('13113113-0000-0000-0000-000000000001', 'أ', false),
 ('13113113-0000-0000-0000-000000000001', 'ب', false),
 ('13113113-0000-0000-0000-000000000001', 'ج', true),
 ('13113113-0000-0000-0000-000000000004', 'د', false);
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '13113113-0000-0000-0000-000000000001';
INSERT INTO public._t SELECT 'mbadge student: '
  || CASE WHEN public.more_badges() = '{"notifications":2,"invites":1,"at_risk":0}'::jsonb
      THEN 'ok' ELSE 'FAILED ' || public.more_badges()::text END;
SET "request.jwt.claim.sub" = '13113113-0000-0000-0000-000000000002';
INSERT INTO public._t SELECT 'mbadge guardian: '
  || CASE WHEN public.more_badges() = '{"notifications":0,"invites":1,"at_risk":0}'::jsonb
      THEN 'ok' ELSE 'FAILED ' || public.more_badges()::text END;
SET "request.jwt.claim.sub" = '13113113-0000-0000-0000-000000000003';
INSERT INTO public._t SELECT 'mbadge teacher: '
  || CASE WHEN (public.more_badges() ->> 'at_risk')::int = jsonb_array_length(public.at_risk_students(NULL))
           AND (public.more_badges() ->> 'invites')::int = 0
      THEN 'ok' ELSE 'FAILED ' || public.more_badges()::text END;
SET "request.jwt.claim.sub" = '13113113-0000-0000-0000-000000000004';
INSERT INTO public._t SELECT 'mbadge stranger: '
  || CASE WHEN public.more_badges() = '{"notifications":1,"invites":0,"at_risk":0}'::jsonb
      THEN 'ok' ELSE 'FAILED ' || public.more_badges()::text END;
RESET "request.jwt.claim.sub";
DO $$ BEGIN
  PERFORM public.more_badges();
  INSERT INTO public._t VALUES ('mbadge no session: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('mbadge no session: rejected');
END $$;
RESET ROLE;
INSERT INTO public._t SELECT 'mbadge anon: '
  || CASE WHEN has_function_privilege('anon', 'public.more_badges()', 'EXECUTE')
      THEN 'LEAKED!' ELSE 'denied' END;
SELECT code FROM public._t WHERE code LIKE 'mbadge %' ORDER BY code;
-- @@ 132. تحليل «المزيد» GAP-02: البلاغات — يكتبها صاحبها لنفسه فقط، ويراها هو وصاحب التطبيق، وحدّ 5 في الساعة، ولا يعدّلها المرسِل
DELETE FROM public._t;
DELETE FROM public.app_owner;
INSERT INTO auth.users (id, phone, raw_user_meta_data) VALUES
 ('13213213-0000-0000-0000-000000000001', '+967713213001', '{"name":"مُبلِّغ"}'),
 ('13213213-0000-0000-0000-000000000002', '+967713213002', '{"name":"غريب البلاغ"}'),
 ('13213213-0000-0000-0000-000000000003', '+967713213003', '{"name":"صاحب التطبيق"}');
INSERT INTO public.app_owner (id, user_id) VALUES (true, '13213213-0000-0000-0000-000000000003');
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '13213213-0000-0000-0000-000000000001';
INSERT INTO public.feedback (kind, message, app_version, platform, locale, route)
VALUES ('bug', '  زر الحفظ لا يعمل  ', '1.8.0', 'android', 'ar', '/settings');
INSERT INTO public._t SELECT 'fb own insert trimmed: '
  || CASE WHEN (SELECT message FROM public.feedback WHERE user_id = '13213213-0000-0000-0000-000000000001') = 'زر الحفظ لا يعمل'
      THEN 'ok' ELSE 'FAILED' END;
DO $$ BEGIN
  INSERT INTO public.feedback (user_id, kind, message)
  VALUES ('13213213-0000-0000-0000-000000000002', 'idea', 'باسم غيري');
  INSERT INTO public._t VALUES ('fb spoof user: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('fb spoof user: rejected');
END $$;
DO $$ BEGIN
  INSERT INTO public.feedback (kind, message, status) VALUES ('idea', 'حالة مزوّرة', 'done');
  INSERT INTO public._t VALUES ('fb spoof status: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('fb spoof status: rejected');
END $$;
DO $$ BEGIN
  INSERT INTO public.feedback (kind, message) VALUES ('bug', 'قص');
  INSERT INTO public._t VALUES ('fb too short: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('fb too short: rejected');
END $$;
DO $$ BEGIN
  UPDATE public.feedback SET message = 'معدّلة' WHERE user_id = '13213213-0000-0000-0000-000000000001';
EXCEPTION WHEN others THEN NULL;
END $$;
DO $$ BEGIN
  UPDATE public.feedback SET status = 'done' WHERE user_id = '13213213-0000-0000-0000-000000000001';
EXCEPTION WHEN others THEN NULL;
END $$;
INSERT INTO public._t SELECT 'fb sender edit: '
  || CASE WHEN EXISTS (SELECT 1 FROM public.feedback WHERE message = 'معدّلة' OR status = 'done')
      THEN 'ALLOWED!' ELSE 'rejected' END;
DO $$ BEGIN
  DELETE FROM public.feedback WHERE user_id = '13213213-0000-0000-0000-000000000001';
EXCEPTION WHEN others THEN NULL;
END $$;
INSERT INTO public._t SELECT 'fb sender delete: '
  || CASE WHEN EXISTS (SELECT 1 FROM public.feedback) THEN 'rejected' ELSE 'ALLOWED!' END;
INSERT INTO public.feedback (kind, message) VALUES
 ('idea', 'اقتراح رقم اثنين'), ('idea', 'اقتراح رقم ثلاثة'), ('idea', 'اقتراح رقم أربعة'), ('idea', 'اقتراح رقم خمسة');
DO $$ BEGIN
  INSERT INTO public.feedback (kind, message) VALUES ('idea', 'السادس في الساعة');
  INSERT INTO public._t VALUES ('fb rate limit: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('fb rate limit: rejected');
END $$;
SET "request.jwt.claim.sub" = '13213213-0000-0000-0000-000000000002';
INSERT INTO public._t SELECT 'fb stranger rows: '
  || CASE WHEN (SELECT count(*) FROM public.feedback) = 0 THEN 'none' ELSE 'LEAKED!' END;
SET "request.jwt.claim.sub" = '13213213-0000-0000-0000-000000000003';
INSERT INTO public._t SELECT 'fb owner sees all: '
  || CASE WHEN (SELECT count(*) FROM public.feedback) = 5 THEN 'ok' ELSE 'FAILED' END;
UPDATE public.feedback SET status = 'seen' WHERE kind = 'bug';
INSERT INTO public._t SELECT 'fb owner status: '
  || CASE WHEN (SELECT status FROM public.feedback WHERE kind = 'bug') = 'seen' THEN 'ok' ELSE 'FAILED' END;
RESET ROLE;
RESET "request.jwt.claim.sub";
INSERT INTO public._t SELECT 'fb anon: '
  || CASE WHEN has_table_privilege('anon', 'public.feedback', 'SELECT') OR has_table_privilege('anon', 'public.feedback', 'INSERT')
      THEN 'LEAKED!' ELSE 'denied' END;
DELETE FROM auth.users WHERE id = '13213213-0000-0000-0000-000000000001';
INSERT INTO public._t SELECT 'fb cascade on account delete: '
  || CASE WHEN (SELECT count(*) FROM public.feedback) = 0 THEN 'ok' ELSE 'FAILED' END;
DELETE FROM public.app_owner;
SELECT code FROM public._t WHERE code LIKE 'fb %' ORDER BY code;

-- @@ 133. تحليل «المزيد» GAP-08: الصورة الشخصية — يرفعها ويحذفها صاحب المجلد وحده، وتُحذف مع الحساب
DELETE FROM public._t;
INSERT INTO auth.users (id, phone, raw_user_meta_data) VALUES
 ('13313313-0000-0000-0000-000000000001', '+967713313001', '{"name":"صاحب الصورة"}'),
 ('13313313-0000-0000-0000-000000000002', '+967713313002', '{"name":"متطفّل الصورة"}');
INSERT INTO public._t SELECT 'av bucket: '
  || CASE WHEN (SELECT public AND file_size_limit = 524288 FROM storage.buckets WHERE id = 'avatars')
      THEN 'ok' ELSE 'FAILED' END;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '13313313-0000-0000-0000-000000000001';
INSERT INTO storage.objects (bucket_id, name, owner)
VALUES ('avatars', '13313313-0000-0000-0000-000000000001/a1.webp', '13313313-0000-0000-0000-000000000001');
INSERT INTO public._t SELECT 'av own upload: '
  || CASE WHEN EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'avatars') THEN 'ok' ELSE 'FAILED' END;
INSERT INTO public._t SELECT 'av in my objects: '
  || CASE WHEN EXISTS (SELECT 1 FROM public.my_storage_objects() WHERE bucket_id = 'avatars') THEN 'ok' ELSE 'FAILED' END;
SET "request.jwt.claim.sub" = '13313313-0000-0000-0000-000000000002';
DO $$ BEGIN
  INSERT INTO storage.objects (bucket_id, name, owner)
  VALUES ('avatars', '13313313-0000-0000-0000-000000000001/evil.webp', '13313313-0000-0000-0000-000000000002');
  INSERT INTO public._t VALUES ('av foreign upload: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('av foreign upload: rejected');
END $$;
DELETE FROM storage.objects WHERE bucket_id = 'avatars';
INSERT INTO public._t SELECT 'av foreign list: '
  || CASE WHEN EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'avatars') THEN 'LEAKED!' ELSE 'none' END;
INSERT INTO public._t SELECT 'av foreign in my objects: '
  || CASE WHEN EXISTS (SELECT 1 FROM public.my_storage_objects() WHERE bucket_id = 'avatars') THEN 'LEAKED!' ELSE 'none' END;
RESET ROLE;
INSERT INTO public._t SELECT 'av foreign delete: '
  || CASE WHEN EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'avatars') THEN 'rejected' ELSE 'ALLOWED!' END;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '13313313-0000-0000-0000-000000000001';
DELETE FROM storage.objects WHERE bucket_id = 'avatars';
RESET ROLE;
RESET "request.jwt.claim.sub";
INSERT INTO public._t SELECT 'av own delete: '
  || CASE WHEN EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'avatars') THEN 'FAILED' ELSE 'ok' END;
DELETE FROM auth.users WHERE id IN ('13313313-0000-0000-0000-000000000001', '13313313-0000-0000-0000-000000000002');
SELECT code FROM public._t WHERE code LIKE 'av %' ORDER BY code;

-- @@ 134. تحليل «المزيد» — المرحلة 5: حذف عضو طاقم أو موعد يعيد الصف المحذوف لمن يملكه، ولا شيء لغيره
-- (العميل يطلب الصف المحذوف ليكشف رفض RLS الصامت بدل عرض «تمّت الإزالة»).
DELETE FROM public._t;
INSERT INTO auth.users (id, phone, raw_user_meta_data) VALUES
 ('13413413-0000-0000-0000-000000000001', '+967713413001', '{"name":"منشئ مركز الطاقم"}'),
 ('13413413-0000-0000-0000-000000000002', '+967713413002', '{"name":"مشرف الطاقم"}'),
 ('13413413-0000-0000-0000-000000000003', '+967713413003', '{"name":"غريب الطاقم"}');
INSERT INTO public.user_roles (user_id, role) VALUES ('13413413-0000-0000-0000-000000000001', 'teacher');
INSERT INTO public.centers (id, name, created_by)
VALUES ('13413413-cccc-0000-0000-000000000001', 'مركز الطاقم', '13413413-0000-0000-0000-000000000001');
INSERT INTO public.halaqat (id, center_id, name, teacher_id)
VALUES ('13413413-dddd-0000-0000-000000000001', '13413413-cccc-0000-0000-000000000001', 'حلقة الطاقم',
        '13413413-0000-0000-0000-000000000001');
INSERT INTO public.center_staff (center_id, user_id, role)
VALUES ('13413413-cccc-0000-0000-000000000001', '13413413-0000-0000-0000-000000000002', 'supervisor');
INSERT INTO public.halaqa_schedule (id, halaqa_id, weekday, start_time, end_time, created_by)
VALUES ('13413413-eeee-0000-0000-000000000001', '13413413-dddd-0000-0000-000000000001', 1, '16:00', '17:00',
        '13413413-0000-0000-0000-000000000001');
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '13413413-0000-0000-0000-000000000003';
WITH d AS (DELETE FROM public.center_staff WHERE center_id = '13413413-cccc-0000-0000-000000000001' RETURNING user_id)
INSERT INTO public._t SELECT 'cs stranger delete rows: ' || CASE WHEN count(*) = 0 THEN 'none' ELSE 'ALLOWED!' END FROM d;
WITH d AS (DELETE FROM public.halaqa_schedule WHERE id = '13413413-eeee-0000-0000-000000000001' RETURNING id)
INSERT INTO public._t SELECT 'hs stranger delete rows: ' || CASE WHEN count(*) = 0 THEN 'none' ELSE 'ALLOWED!' END FROM d;
SET "request.jwt.claim.sub" = '13413413-0000-0000-0000-000000000001';
WITH d AS (DELETE FROM public.center_staff WHERE center_id = '13413413-cccc-0000-0000-000000000001'
             AND user_id = '13413413-0000-0000-0000-000000000002' RETURNING user_id)
INSERT INTO public._t SELECT 'cs owner delete rows: ' || CASE WHEN count(*) = 1 THEN 'ok' ELSE 'FAILED' END FROM d;
WITH d AS (DELETE FROM public.halaqa_schedule WHERE id = '13413413-eeee-0000-0000-000000000001' RETURNING id)
INSERT INTO public._t SELECT 'hs owner delete rows: ' || CASE WHEN count(*) = 1 THEN 'ok' ELSE 'FAILED' END FROM d;
RESET ROLE;
RESET "request.jwt.claim.sub";
DELETE FROM public.centers WHERE id = '13413413-cccc-0000-0000-000000000001';
DELETE FROM auth.users WHERE id::text LIKE '13413413-%';
SELECT code FROM public._t WHERE code LIKE 'cs %' OR code LIKE 'hs %' ORDER BY code;

-- @@ 135. السجل اليومي — سلامة البيانات: تصحيح المدى أو حذفه لا يترك بطاقة مراجعة يتيمة، وبطاقة قائمة تُعاد كما
-- كانت، ولمسة الحالة نفسها لا تمسح سبب الغياب، و«حاضر» يمسحه (DR-01، DR-02).
DELETE FROM public._t;
INSERT INTO auth.users (id, phone, raw_user_meta_data) VALUES
 ('13513513-0000-0000-0000-000000000001', '+967713513001', '{"name":"معلّم السلامة"}'),
 ('13513513-0000-0000-0000-00000000000a', '+967713513010', '{"name":"طالب السلامة"}');
INSERT INTO public.user_roles (user_id, role) VALUES ('13513513-0000-0000-0000-000000000001', 'teacher')
ON CONFLICT DO NOTHING;
INSERT INTO public.centers (id, name, created_by)
VALUES ('13513513-cccc-0000-0000-000000000001', 'مركز السلامة', '13513513-0000-0000-0000-000000000001');
INSERT INTO public.halaqat (id, center_id, name, teacher_id)
VALUES ('13513513-dddd-0000-0000-000000000001', '13513513-cccc-0000-0000-000000000001', 'حلقة السلامة',
        '13513513-0000-0000-0000-000000000001');
INSERT INTO public.halaqa_students (halaqa_id, student_id)
VALUES ('13513513-dddd-0000-0000-000000000001', '13513513-0000-0000-0000-00000000000a');
-- بطاقة قائمة من يوم سابق للمقطع «الملك 1–5».
INSERT INTO public.review_cards (student_id, surah_name, from_ayah, to_ayah, ease, interval_days, repetitions, due_date)
VALUES ('13513513-0000-0000-0000-00000000000a', 'الملك', 1, 5, 2.20, 6, 2, DATE '2030-01-01');
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '13513513-0000-0000-0000-000000000001';
SELECT set_config('zen.r135', public.open_daily_record('13513513-dddd-0000-0000-000000000001', public.zen_today()) ->> 'id', false);
-- حفظ «الملك 1–10» خطأً ثم تصحيحه إلى «الملك 1–11»: بطاقة واحدة فقط للمدى الصحيح (عدا القائمة).
SELECT public.save_daily_entry(current_setting('zen.r135')::uuid, '13513513-0000-0000-0000-00000000000a',
  '{"memorize":{"segments":[{"surah_name":"الملك","from_ayah":1,"to_ayah":10}],"grade":4}}', 0);
SELECT public.save_daily_entry(current_setting('zen.r135')::uuid, '13513513-0000-0000-0000-00000000000a',
  '{"memorize":{"segments":[{"surah_name":"الملك","from_ayah":1,"to_ayah":11}],"grade":4}}', 1);
RESET ROLE;
INSERT INTO public._t SELECT 'ds corrected range card: ' || CASE WHEN
  NOT EXISTS (SELECT 1 FROM public.review_cards WHERE student_id = '13513513-0000-0000-0000-00000000000a' AND to_ayah = 10)
  AND EXISTS (SELECT 1 FROM public.review_cards WHERE student_id = '13513513-0000-0000-0000-00000000000a' AND to_ayah = 11)
  THEN 'ok' ELSE 'FAILED' END;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '13513513-0000-0000-0000-000000000001';
-- مراجعة مقطع له بطاقة قائمة ثم حذفها: البطاقة تعود كما كانت (لا تُحذف ولا تبقى معدّلة).
SELECT public.save_daily_entry(current_setting('zen.r135')::uuid, '13513513-0000-0000-0000-00000000000a',
  '{"review":{"segments":[{"surah_name":"الملك","from_ayah":1,"to_ayah":5}],"grade":2}}', 2);
RESET ROLE;
INSERT INTO public._t SELECT 'ds review changed card: ' || CASE WHEN
  (SELECT repetitions FROM public.review_cards WHERE student_id = '13513513-0000-0000-0000-00000000000a' AND to_ayah = 5) = 0
  THEN 'ok' ELSE 'FAILED' END;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '13513513-0000-0000-0000-000000000001';
SELECT public.save_daily_entry(current_setting('zen.r135')::uuid, '13513513-0000-0000-0000-00000000000a',
  '{"review":null,"memorize":null}', 3);
RESET ROLE;
INSERT INTO public._t SELECT 'ds removed review restores card: ' || CASE WHEN
  (SELECT repetitions = 2 AND interval_days = 6 AND ease = 2.20 AND due_date = DATE '2030-01-01'
     FROM public.review_cards WHERE student_id = '13513513-0000-0000-0000-00000000000a' AND to_ayah = 5)
  THEN 'ok' ELSE 'FAILED' END;
INSERT INTO public._t SELECT 'ds removed memorize drops new card: ' || CASE WHEN
  NOT EXISTS (SELECT 1 FROM public.review_cards WHERE student_id = '13513513-0000-0000-0000-00000000000a' AND to_ayah = 11)
  THEN 'ok' ELSE 'FAILED' END;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '13513513-0000-0000-0000-000000000001';
-- السبب: يُسجَّل مع الغياب، ولمسة «غائب» ثانية بلا سبب تُبقيه، و«حاضر» يمسحه.
SELECT public.set_daily_attendance(current_setting('zen.r135')::uuid, '13513513-0000-0000-0000-00000000000a', 'absent', 'مرض', 4);
SELECT public.set_daily_attendance(current_setting('zen.r135')::uuid, '13513513-0000-0000-0000-00000000000a', 'absent', NULL, 5);
INSERT INTO public._t SELECT 'ds reason kept: ' || CASE WHEN
  (public.daily_record_sheet('13513513-dddd-0000-0000-000000000001', public.zen_today()) -> 'students' -> 0 ->> 'reason') = 'مرض'
  THEN 'ok' ELSE 'FAILED' END;
SELECT public.set_daily_attendance(current_setting('zen.r135')::uuid, '13513513-0000-0000-0000-00000000000a', 'present', NULL, 6);
INSERT INTO public._t SELECT 'ds reason cleared on present: ' || CASE WHEN
  (public.daily_record_sheet('13513513-dddd-0000-0000-000000000001', public.zen_today()) -> 'students' -> 0 ->> 'reason') IS NULL
  THEN 'ok' ELSE 'FAILED' END;
RESET ROLE;
RESET "request.jwt.claim.sub";
DELETE FROM public.centers WHERE id = '13513513-cccc-0000-0000-000000000001';
DELETE FROM auth.users WHERE id::text LIKE '13513513-%';
SELECT code FROM public._t WHERE code LIKE 'ds %' ORDER BY code;

-- @@ 136. السجل اليومي — لمسات أقل: «الجميع حاضر» بنداء واحد يتخطّى المتعارض ولا يُفسد الباقي، ومسح الحضور،
-- وشريط الأيام السبعة، والمعلّم الغريب مرفوض (DR-05، DR-07، DR-16).
DELETE FROM public._t;
INSERT INTO auth.users (id, phone, raw_user_meta_data) VALUES
 ('13613613-0000-0000-0000-000000000001', '+967713613001', '{"name":"معلّم الجماعي"}'),
 ('13613613-0000-0000-0000-000000000002', '+967713613002', '{"name":"معلّم غريب الجماعي"}'),
 ('13613613-0000-0000-0000-00000000000a', '+967713613010', '{"name":"أ"}'),
 ('13613613-0000-0000-0000-00000000000b', '+967713613011', '{"name":"ب"}'),
 ('13613613-0000-0000-0000-00000000000c', '+967713613012', '{"name":"ج"}');
INSERT INTO public.user_roles (user_id, role) VALUES
 ('13613613-0000-0000-0000-000000000001', 'teacher'), ('13613613-0000-0000-0000-000000000002', 'teacher')
ON CONFLICT DO NOTHING;
INSERT INTO public.centers (id, name, created_by)
VALUES ('13613613-cccc-0000-0000-000000000001', 'مركز الجماعي', '13613613-0000-0000-0000-000000000001');
INSERT INTO public.halaqat (id, center_id, name, teacher_id)
VALUES ('13613613-dddd-0000-0000-000000000001', '13613613-cccc-0000-0000-000000000001', 'حلقة الجماعي',
        '13613613-0000-0000-0000-000000000001');
INSERT INTO public.halaqa_students (halaqa_id, student_id) VALUES
 ('13613613-dddd-0000-0000-000000000001', '13613613-0000-0000-0000-00000000000a'),
 ('13613613-dddd-0000-0000-000000000001', '13613613-0000-0000-0000-00000000000b'),
 ('13613613-dddd-0000-0000-000000000001', '13613613-0000-0000-0000-00000000000c');
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '13613613-0000-0000-0000-000000000001';
SELECT set_config('zen.r136', public.open_daily_record('13613613-dddd-0000-0000-000000000001', public.zen_today()) ->> 'id', false);
-- «ج» عدّله غيره (نسخته 1 لا 0): يُتخطّى ويبقى كما هو، والآخران حاضران.
SELECT public.set_daily_attendance(current_setting('zen.r136')::uuid, '13613613-0000-0000-0000-00000000000c', 'late', NULL, 0);
SELECT set_config('zen.b136', public.set_daily_attendance_bulk(current_setting('zen.r136')::uuid, jsonb_build_array(
  jsonb_build_object('student', '13613613-0000-0000-0000-00000000000a', 'status', 'present', 'version', 0),
  jsonb_build_object('student', '13613613-0000-0000-0000-00000000000b', 'status', 'present', 'version', 0),
  jsonb_build_object('student', '13613613-0000-0000-0000-00000000000c', 'status', 'present', 'version', 0)))::text, false);
INSERT INTO public._t SELECT 'bk bulk result: ' || CASE WHEN
  jsonb_array_length(current_setting('zen.b136')::jsonb -> 'students') = 2
  AND (current_setting('zen.b136')::jsonb -> 'skipped' -> 0 ->> 'code') = 'VERSION_CONFLICT'
  THEN 'ok' ELSE 'FAILED ' || current_setting('zen.b136') END;
INSERT INTO public._t SELECT 'bk conflict untouched: ' || CASE WHEN
  (SELECT status FROM public.attendance WHERE student_id = '13613613-0000-0000-0000-00000000000c') = 'late'
  THEN 'ok' ELSE 'FAILED' END;
-- التراجع الجماعي (status = null) يمسح الحضور.
SELECT public.set_daily_attendance_bulk(current_setting('zen.r136')::uuid, jsonb_build_array(
  jsonb_build_object('student', '13613613-0000-0000-0000-00000000000a', 'status', NULL, 'version', 1)));
INSERT INTO public._t SELECT 'bk bulk undo clears: ' || CASE WHEN
  NOT EXISTS (SELECT 1 FROM public.attendance WHERE student_id = '13613613-0000-0000-0000-00000000000a')
  THEN 'ok' ELSE 'FAILED' END;
-- مسح حضور طالب له إنجاز: مرفوض.
SELECT public.save_daily_entry(current_setting('zen.r136')::uuid, '13613613-0000-0000-0000-00000000000b',
  '{"memorize":{"segments":[{"surah_name":"الملك","from_ayah":1,"to_ayah":3}],"grade":4}}', 1);
DO $$ BEGIN
  PERFORM public.clear_daily_attendance(current_setting('zen.r136')::uuid, '13613613-0000-0000-0000-00000000000b', 2);
  INSERT INTO public._t VALUES ('bk clear with work: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('bk clear with work: ' || CASE WHEN SQLERRM = 'HAS_ACHIEVEMENT' THEN 'rejected' ELSE 'FAILED ' || SQLERRM END);
END $$;
DO $$ BEGIN
  PERFORM public.set_daily_attendance_bulk(current_setting('zen.r136')::uuid, '[]'::jsonb);
  INSERT INTO public._t VALUES ('bk empty rows: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('bk empty rows: rejected');
END $$;
INSERT INTO public._t SELECT 'bk week: ' || CASE WHEN
  jsonb_array_length(public.daily_record_week('13613613-dddd-0000-0000-000000000001', public.zen_today())) = 7
  AND (public.daily_record_week('13613613-dddd-0000-0000-000000000001', public.zen_today()) -> 6 ->> 'status') = 'open'
  AND (public.daily_record_week('13613613-dddd-0000-0000-000000000001', public.zen_today()) -> 0 ->> 'status') IS NULL
  THEN 'ok' ELSE 'FAILED' END;
SET "request.jwt.claim.sub" = '13613613-0000-0000-0000-000000000002';
DO $$ BEGIN
  PERFORM public.set_daily_attendance_bulk(current_setting('zen.r136')::uuid, jsonb_build_array(
    jsonb_build_object('student', '13613613-0000-0000-0000-00000000000a', 'status', 'absent', 'version', 2)));
  INSERT INTO public._t VALUES ('bk stranger bulk: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('bk stranger bulk: rejected');
END $$;
DO $$ BEGIN
  PERFORM public.daily_record_week('13613613-dddd-0000-0000-000000000001', public.zen_today());
  INSERT INTO public._t VALUES ('bk stranger week: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('bk stranger week: rejected');
END $$;
RESET ROLE;
RESET "request.jwt.claim.sub";
-- DR-32: حذف المركز (ومعه الحلقة وسجلاتها) وفيه تسميعات من السجل اليومي لا يفشل بالمفتاح الأجنبي.
DELETE FROM public.centers WHERE id = '13613613-cccc-0000-0000-000000000001';
INSERT INTO public._t SELECT 'bk delete center with daily sessions: ' || CASE WHEN
  NOT EXISTS (SELECT 1 FROM public.halaqa_daily_records WHERE halaqa_id = '13613613-dddd-0000-0000-000000000001')
  THEN 'ok' ELSE 'FAILED' END;
DELETE FROM auth.users WHERE id::text LIKE '13613613-%';
SELECT code FROM public._t WHERE code LIKE 'bk %' ORDER BY code;

-- @@ 137. السجل اليومي — الموثوقية: ورقة يوم سابق تُبقي من انتقل بعده (member = false)، والغياب 30 يوماً بالضبط
-- (DR-13، DR-26).
DELETE FROM public._t;
INSERT INTO auth.users (id, phone, raw_user_meta_data) VALUES
 ('13713713-0000-0000-0000-000000000001', '+967713713001', '{"name":"معلّم الموثوقية"}'),
 ('13713713-0000-0000-0000-00000000000a', '+967713713010', '{"name":"طالب منقول"}'),
 ('13713713-0000-0000-0000-00000000000b', '+967713713011', '{"name":"طالب باقٍ"}');
INSERT INTO public.user_roles (user_id, role) VALUES ('13713713-0000-0000-0000-000000000001', 'teacher')
ON CONFLICT DO NOTHING;
INSERT INTO public.centers (id, name, created_by)
VALUES ('13713713-cccc-0000-0000-000000000001', 'مركز الموثوقية', '13713713-0000-0000-0000-000000000001');
INSERT INTO public.halaqat (id, center_id, name, teacher_id)
VALUES ('13713713-dddd-0000-0000-000000000001', '13713713-cccc-0000-0000-000000000001', 'حلقة الموثوقية',
        '13713713-0000-0000-0000-000000000001');
INSERT INTO public.halaqa_students (halaqa_id, student_id) VALUES
 ('13713713-dddd-0000-0000-000000000001', '13713713-0000-0000-0000-00000000000a'),
 ('13713713-dddd-0000-0000-000000000001', '13713713-0000-0000-0000-00000000000b');
-- غيابان: قبل 29 يوماً (داخل النافذة) وقبل 30 يوماً (خارجها).
INSERT INTO public.attendance (student_id, halaqa_id, teacher_id, session_date, status) VALUES
 ('13713713-0000-0000-0000-00000000000b', '13713713-dddd-0000-0000-000000000001', '13713713-0000-0000-0000-000000000001', public.zen_today() - 29, 'absent'),
 ('13713713-0000-0000-0000-00000000000b', '13713713-dddd-0000-0000-000000000001', '13713713-0000-0000-0000-000000000001', public.zen_today() - 30, 'absent');
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '13713713-0000-0000-0000-000000000001';
SELECT set_config('zen.r137', public.open_daily_record('13713713-dddd-0000-0000-000000000001', public.zen_today() - 1) ->> 'id', false);
SELECT public.set_daily_attendance(current_setting('zen.r137')::uuid, '13713713-0000-0000-0000-00000000000a', 'present', NULL, 0);
RESET ROLE;
-- نُقل الطالب «أ» من الحلقة بعد ذلك اليوم.
DELETE FROM public.halaqa_students WHERE student_id = '13713713-0000-0000-0000-00000000000a';
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '13713713-0000-0000-0000-000000000001';
INSERT INTO public._t SELECT 'rl moved student kept: ' || CASE WHEN EXISTS (
  SELECT 1 FROM jsonb_array_elements(public.daily_record_sheet('13713713-dddd-0000-0000-000000000001', public.zen_today() - 1) -> 'students') x
   WHERE x ->> 'student_id' = '13713713-0000-0000-0000-00000000000a' AND x ->> 'status' = 'present'
     AND (x ->> 'member')::boolean = false)
  THEN 'ok' ELSE 'FAILED' END;
INSERT INTO public._t SELECT 'rl moved student not today: ' || CASE WHEN NOT EXISTS (
  SELECT 1 FROM jsonb_array_elements(public.daily_record_sheet('13713713-dddd-0000-0000-000000000001', public.zen_today()) -> 'students') x
   WHERE x ->> 'student_id' = '13713713-0000-0000-0000-00000000000a')
  THEN 'ok' ELSE 'FAILED' END;
INSERT INTO public._t SELECT 'rl member flag: ' || CASE WHEN (
  SELECT (x ->> 'member')::boolean FROM jsonb_array_elements(public.daily_record_sheet('13713713-dddd-0000-0000-000000000001', public.zen_today()) -> 'students') x
   WHERE x ->> 'student_id' = '13713713-0000-0000-0000-00000000000b')
  THEN 'ok' ELSE 'FAILED' END;
INSERT INTO public._t SELECT 'rl absences 30 days: ' || CASE WHEN (
  SELECT (x ->> 'absences_30d')::int FROM jsonb_array_elements(public.daily_record_sheet('13713713-dddd-0000-0000-000000000001', public.zen_today()) -> 'students') x
   WHERE x ->> 'student_id' = '13713713-0000-0000-0000-00000000000b') = 1
  THEN 'ok' ELSE 'FAILED' END;
DO $$ BEGIN
  PERFORM public.set_daily_attendance(current_setting('zen.r137')::uuid, '13713713-0000-0000-0000-00000000000a', 'absent', NULL, 1);
  INSERT INTO public._t VALUES ('rl write moved student: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('rl write moved student: rejected');
END $$;
RESET ROLE;
RESET "request.jwt.claim.sub";
DELETE FROM public.centers WHERE id = '13713713-cccc-0000-0000-000000000001';
DELETE FROM auth.users WHERE id::text LIKE '13713713-%';
SELECT code FROM public._t WHERE code LIKE 'rl %' ORDER BY code;

-- @@ 138. السجل اليومي — الأداء: فهرس جزئي لآخر حفظ ومراجعة للطالب، ويختاره المخطّط (DR-25).
DELETE FROM public._t;
INSERT INTO public._t SELECT 'pf index: ' || CASE WHEN EXISTS (
  SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'recitation_sessions_student_kind_recent_idx'
     AND indexdef LIKE '%WHERE (status = ''approved''%')
  THEN 'ok' ELSE 'FAILED' END;
SET enable_seqscan = off;
DO $$
DECLARE plan text := '';
  r record;
BEGIN
  FOR r IN EXPLAIN SELECT s.surah_name FROM public.recitation_sessions s
     WHERE s.student_id = '13813813-0000-0000-0000-00000000000a' AND s.kind = 'memorize' AND s.status = 'approved'
       AND s.session_date < DATE '2030-01-01'
     ORDER BY s.session_date DESC, s.created_at DESC LIMIT 1 LOOP
    plan := plan || r."QUERY PLAN";
  END LOOP;
  INSERT INTO public._t VALUES ('pf planner uses index: ' || CASE WHEN plan LIKE '%recitation_sessions_student_kind_recent_idx%' THEN 'ok' ELSE 'FAILED ' || plan END);
END $$;
RESET enable_seqscan;
SELECT code FROM public._t WHERE code LIKE 'pf %' ORDER BY code;

-- @@ 139. السجل اليومي — قائمة الأيام (الأحدث أولاً بملخصها) وحذف سجل يوم بقفل متفائل، ويُرفض الغريب (DR-30، DR-31).
DELETE FROM public._t;
INSERT INTO auth.users (id, phone, raw_user_meta_data) VALUES
 ('13913913-0000-0000-0000-000000000001', '+967713913001', '{"name":"معلّم القائمة"}'),
 ('13913913-0000-0000-0000-000000000002', '+967713913002', '{"name":"غريب"}'),
 ('13913913-0000-0000-0000-00000000000a', '+967713913010', '{"name":"طالب القائمة"}');
INSERT INTO public.user_roles (user_id, role) VALUES
 ('13913913-0000-0000-0000-000000000001', 'teacher'), ('13913913-0000-0000-0000-000000000002', 'teacher')
ON CONFLICT DO NOTHING;
INSERT INTO public.centers (id, name, created_by)
VALUES ('13913913-cccc-0000-0000-000000000001', 'مركز القائمة', '13913913-0000-0000-0000-000000000001');
INSERT INTO public.halaqat (id, center_id, name, teacher_id)
VALUES ('13913913-dddd-0000-0000-000000000001', '13913913-cccc-0000-0000-000000000001', 'حلقة القائمة',
        '13913913-0000-0000-0000-000000000001');
INSERT INTO public.halaqa_students (halaqa_id, student_id) VALUES
 ('13913913-dddd-0000-0000-000000000001', '13913913-0000-0000-0000-00000000000a');
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '13913913-0000-0000-0000-000000000001';
SELECT set_config('zen.h1', public.open_daily_record('13913913-dddd-0000-0000-000000000001', public.zen_today() - 2) ->> 'id', false);
SELECT set_config('zen.h2', public.open_daily_record('13913913-dddd-0000-0000-000000000001', public.zen_today()) ->> 'id', false);
SELECT public.save_daily_entry(current_setting('zen.h2')::uuid, '13913913-0000-0000-0000-00000000000a',
  '{"memorize":{"segments":[{"surah_name":"الملك","from_ayah":1,"to_ayah":5}],"grade":4}}', 0);
INSERT INTO public._t SELECT 'hs newest first: ' || CASE WHEN
  (public.daily_record_history('13913913-dddd-0000-0000-000000000001') -> 0 ->> 'id') = current_setting('zen.h2')
  AND jsonb_array_length(public.daily_record_history('13913913-dddd-0000-0000-000000000001')) = 2
  THEN 'ok' ELSE 'FAILED' END;
INSERT INTO public._t SELECT 'hs summary: ' || CASE WHEN
  (public.daily_record_history('13913913-dddd-0000-0000-000000000001') -> 0 ->> 'present')::int = 1
  AND (public.daily_record_history('13913913-dddd-0000-0000-000000000001') -> 0 ->> 'memorized')::int = 1
  AND (public.daily_record_history('13913913-dddd-0000-0000-000000000001') -> 0 ->> 'editable')::boolean
  THEN 'ok' ELSE 'FAILED' END;
INSERT INTO public._t SELECT 'hs before: ' || CASE WHEN
  jsonb_array_length(public.daily_record_history('13913913-dddd-0000-0000-000000000001', public.zen_today())) = 1
  THEN 'ok' ELSE 'FAILED' END;
DO $$ BEGIN
  PERFORM public.delete_daily_record(current_setting('zen.h2')::uuid, 99);
  INSERT INTO public._t VALUES ('hs stale version: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('hs stale version: rejected');
END $$;
SET "request.jwt.claim.sub" = '13913913-0000-0000-0000-000000000002';
DO $$ BEGIN
  PERFORM public.daily_record_history('13913913-dddd-0000-0000-000000000001');
  INSERT INTO public._t VALUES ('hs stranger list: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('hs stranger list: rejected');
END $$;
DO $$ BEGIN
  PERFORM public.delete_daily_record(current_setting('zen.h2')::uuid,
    (SELECT version FROM public.halaqa_daily_records WHERE id = current_setting('zen.h2')::uuid));
  INSERT INTO public._t VALUES ('hs stranger delete: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('hs stranger delete: rejected');
END $$;
RESET ROLE;
SELECT set_config('zen.hv', (SELECT version::text FROM public.halaqa_daily_records WHERE id = current_setting('zen.h2')::uuid), false);
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '13913913-0000-0000-0000-000000000001';
SELECT public.delete_daily_record(current_setting('zen.h2')::uuid, current_setting('zen.hv')::int);
RESET ROLE;
INSERT INTO public._t SELECT 'hs deleted all: ' || CASE WHEN
  NOT EXISTS (SELECT 1 FROM public.halaqa_daily_records WHERE id = current_setting('zen.h2')::uuid)
  AND NOT EXISTS (SELECT 1 FROM public.recitation_sessions WHERE student_id = '13913913-0000-0000-0000-00000000000a')
  AND NOT EXISTS (SELECT 1 FROM public.attendance WHERE student_id = '13913913-0000-0000-0000-00000000000a')
  AND NOT EXISTS (SELECT 1 FROM public.review_cards WHERE student_id = '13913913-0000-0000-0000-00000000000a')
  AND EXISTS (SELECT 1 FROM public.halaqa_daily_records WHERE id = current_setting('zen.h1')::uuid)
  THEN 'ok' ELSE 'FAILED' END;
UPDATE public.halaqa_daily_records SET status = 'locked', completed_at = now(), locked_at = now()
 WHERE id = current_setting('zen.h1')::uuid;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '13913913-0000-0000-0000-000000000001';
INSERT INTO public._t SELECT 'hs locked not editable: ' || CASE WHEN NOT
  (public.daily_record_history('13913913-dddd-0000-0000-000000000001') -> 0 ->> 'editable')::boolean
  THEN 'ok' ELSE 'FAILED' END;
DO $$ BEGIN
  PERFORM public.delete_daily_record(current_setting('zen.h1')::uuid, 2);
  INSERT INTO public._t VALUES ('hs locked delete: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('hs locked delete: rejected');
END $$;
RESET ROLE;
RESET "request.jwt.claim.sub";
DELETE FROM public.centers WHERE id = '13913913-cccc-0000-0000-000000000001';
DELETE FROM auth.users WHERE id::text LIKE '13913913-%';
SELECT code FROM public._t WHERE code LIKE 'hs %' ORDER BY code;

-- @@ 140. إدارة المعلّم لطلابه: تعديل اسم حساب أنشأه معلّم فقط، وإزالة من حلقته فقط، ويُرفض الغريب.
DELETE FROM public._t;
INSERT INTO auth.users (id, phone, raw_user_meta_data, raw_app_meta_data) VALUES
 ('14014014-0000-0000-0000-000000000001', '+967714014001', '{"name":"معلّم الإدارة"}', '{}'),
 ('14014014-0000-0000-0000-000000000002', '+967714014002', '{"name":"معلّم غريب"}', '{}'),
 ('14014014-0000-0000-0000-00000000000a', '+967714014010', '{"name":"طالب مُدار"}',
  '{"created_by_teacher":"14014014-0000-0000-0000-000000000001"}'),
 ('14014014-0000-0000-0000-00000000000b', '+967714014011', '{"name":"طالب مستقل"}', '{}');
INSERT INTO public.user_roles (user_id, role) VALUES
 ('14014014-0000-0000-0000-000000000001', 'teacher'), ('14014014-0000-0000-0000-000000000002', 'teacher')
ON CONFLICT DO NOTHING;
INSERT INTO public.centers (id, name, created_by)
VALUES ('14014014-cccc-0000-0000-000000000001', 'مركز الإدارة', '14014014-0000-0000-0000-000000000001');
INSERT INTO public.halaqat (id, center_id, name, teacher_id)
VALUES ('14014014-dddd-0000-0000-000000000001', '14014014-cccc-0000-0000-000000000001', 'حلقة الإدارة',
        '14014014-0000-0000-0000-000000000001');
INSERT INTO public.halaqa_students (halaqa_id, student_id) VALUES
 ('14014014-dddd-0000-0000-000000000001', '14014014-0000-0000-0000-00000000000a'),
 ('14014014-dddd-0000-0000-000000000001', '14014014-0000-0000-0000-00000000000b');
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '14014014-0000-0000-0000-000000000001';
SELECT public.teacher_update_student('14014014-0000-0000-0000-00000000000a', '  اسم   جديد ');
INSERT INTO public._t SELECT 'ms info managed: ' || CASE WHEN
  (public.student_login_info('14014014-0000-0000-0000-00000000000a') ->> 'managed')::boolean
  AND NOT (public.student_login_info('14014014-0000-0000-0000-00000000000b') ->> 'managed')::boolean
  THEN 'ok' ELSE 'FAILED' END;
DO $$ BEGIN
  PERFORM public.teacher_update_student('14014014-0000-0000-0000-00000000000b', 'اسم آخر');
  INSERT INTO public._t VALUES ('ms rename self-registered: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('ms rename self-registered: rejected');
END $$;
DO $$ BEGIN
  PERFORM public.teacher_update_student('14014014-0000-0000-0000-00000000000a', ' ');
  INSERT INTO public._t VALUES ('ms empty name: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('ms empty name: rejected');
END $$;
SET "request.jwt.claim.sub" = '14014014-0000-0000-0000-000000000002';
DO $$ BEGIN
  PERFORM public.teacher_update_student('14014014-0000-0000-0000-00000000000a', 'منتحل');
  INSERT INTO public._t VALUES ('ms stranger rename: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('ms stranger rename: rejected');
END $$;
DO $$ BEGIN
  PERFORM public.teacher_remove_student('14014014-0000-0000-0000-00000000000a', '14014014-dddd-0000-0000-000000000001');
  INSERT INTO public._t VALUES ('ms stranger remove: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('ms stranger remove: rejected');
END $$;
DO $$ BEGIN
  PERFORM public.teacher_remove_student('14014014-0000-0000-0000-00000000000a');
  INSERT INTO public._t VALUES ('ms stranger remove all: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('ms stranger remove all: rejected');
END $$;
SET "request.jwt.claim.sub" = '14014014-0000-0000-0000-000000000001';
INSERT INTO public._t SELECT 'ms remove: ' || CASE WHEN
  public.teacher_remove_student('14014014-0000-0000-0000-00000000000b') = 1 THEN 'ok' ELSE 'FAILED' END;
RESET ROLE;
RESET "request.jwt.claim.sub";
INSERT INTO public._t SELECT 'ms renamed: ' || CASE WHEN
  (SELECT name FROM public.profiles WHERE id = '14014014-0000-0000-0000-00000000000a') = 'اسم جديد'
  AND EXISTS (SELECT 1 FROM public.halaqa_students WHERE student_id = '14014014-0000-0000-0000-00000000000a')
  AND NOT EXISTS (SELECT 1 FROM public.halaqa_students WHERE student_id = '14014014-0000-0000-0000-00000000000b')
  THEN 'ok' ELSE 'FAILED' END;
DELETE FROM public.centers WHERE id = '14014014-cccc-0000-0000-000000000001';
DELETE FROM auth.users WHERE id::text LIKE '14014014-%';
SELECT code FROM public._t WHERE code LIKE 'ms %' ORDER BY code;

-- @@ 141. قسم الحفظ: الطالب لا يقيّم نفسه ولا يعدّل المقيَّم، والمعلّم لا يغيّر ما سجّله الطالب، والمدى ضمن السورة.
DELETE FROM public._t;
INSERT INTO auth.users (id, phone, raw_user_meta_data) VALUES
 ('14114114-0000-0000-0000-000000000001', '+967714114001', '{"name":"معلّم الحفظ"}'),
 ('14114114-0000-0000-0000-00000000000a', '+967714114010', '{"name":"طالب الحفظ"}');
INSERT INTO public.user_roles (user_id, role) VALUES ('14114114-0000-0000-0000-000000000001', 'teacher')
ON CONFLICT DO NOTHING;
INSERT INTO public.centers (id, name, created_by)
VALUES ('14114114-cccc-0000-0000-000000000001', 'مركز الحفظ', '14114114-0000-0000-0000-000000000001');
INSERT INTO public.halaqat (id, center_id, name, teacher_id)
VALUES ('14114114-dddd-0000-0000-000000000001', '14114114-cccc-0000-0000-000000000001', 'حلقة الحفظ',
        '14114114-0000-0000-0000-000000000001');
INSERT INTO public.halaqa_students (halaqa_id, student_id) VALUES
 ('14114114-dddd-0000-0000-000000000001', '14114114-0000-0000-0000-00000000000a');
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '14114114-0000-0000-0000-00000000000a';
INSERT INTO public.progress (id, user_id, surah_name, from_ayah, to_ayah, memorization_type, rating, feedback)
VALUES ('14114114-eeee-0000-0000-000000000001', '14114114-0000-0000-0000-00000000000a', 'الملك', 1, 10, 'new', 5, 'ممتاز');
INSERT INTO public._t SELECT 'pg self rating dropped: ' || CASE WHEN
  (SELECT rating FROM public.progress WHERE id = '14114114-eeee-0000-0000-000000000001') IS NULL THEN 'ok' ELSE 'FAILED' END;
DO $$ BEGIN
  INSERT INTO public.progress (user_id, surah_name, from_ayah, to_ayah) VALUES ('14114114-0000-0000-0000-00000000000a', 'الفاتحة', 1, 8);
  INSERT INTO public._t VALUES ('pg beyond surah: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('pg beyond surah: rejected');
END $$;
UPDATE public.progress SET to_ayah = 12, rating = 5 WHERE id = '14114114-eeee-0000-0000-000000000001';
INSERT INTO public._t SELECT 'pg student edit unreviewed: ' || CASE WHEN
  (SELECT to_ayah = 12 AND rating IS NULL FROM public.progress WHERE id = '14114114-eeee-0000-0000-000000000001') THEN 'ok' ELSE 'FAILED' END;
SET "request.jwt.claim.sub" = '14114114-0000-0000-0000-000000000001';
UPDATE public.progress SET rating = 3, feedback = 'راجع', to_ayah = 30 WHERE id = '14114114-eeee-0000-0000-000000000001';
INSERT INTO public._t SELECT 'pg teacher rates only: ' || CASE WHEN
  (SELECT rating = 3 AND to_ayah = 12 AND reviewed_by = '14114114-0000-0000-0000-000000000001'
     FROM public.progress WHERE id = '14114114-eeee-0000-0000-000000000001') THEN 'ok' ELSE 'FAILED' END;
SET "request.jwt.claim.sub" = '14114114-0000-0000-0000-00000000000a';
UPDATE public.progress SET rating = 5 WHERE id = '14114114-eeee-0000-0000-000000000001';
INSERT INTO public._t SELECT 'pg student cannot rerate: ' || CASE WHEN
  (SELECT rating FROM public.progress WHERE id = '14114114-eeee-0000-0000-000000000001') = 3 THEN 'ok' ELSE 'FAILED' END;
DO $$ BEGIN
  UPDATE public.progress SET to_ayah = 15 WHERE id = '14114114-eeee-0000-0000-000000000001';
  INSERT INTO public._t VALUES ('pg edit reviewed: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('pg edit reviewed: rejected');
END $$;
INSERT INTO public.progress (id, user_id, surah_name, from_ayah, to_ayah)
VALUES ('14114114-eeee-0000-0000-000000000002', '14114114-0000-0000-0000-00000000000a', 'الناس', 1, 6);
DELETE FROM public.progress WHERE id = '14114114-eeee-0000-0000-000000000002';
INSERT INTO public._t SELECT 'pg delete unreviewed: ' || CASE WHEN
  NOT EXISTS (SELECT 1 FROM public.progress WHERE id = '14114114-eeee-0000-0000-000000000002') THEN 'ok' ELSE 'FAILED' END;
RESET ROLE;
RESET "request.jwt.claim.sub";
DELETE FROM public.progress WHERE user_id = '14114114-0000-0000-0000-00000000000a';
DELETE FROM public.centers WHERE id = '14114114-cccc-0000-0000-000000000001';
DELETE FROM auth.users WHERE id::text LIKE '14114114-%';
SELECT code FROM public._t WHERE code LIKE 'pg %' ORDER BY code;

-- @@ 142. السجل اليومي بلا نافذة زمنية: يوم قبل 40 يوماً يُفتح ويُعدَّل ويُعاد فتحه ويُحذف، والمستقبل مرفوض.
DELETE FROM public._t;
INSERT INTO auth.users (id, phone, raw_user_meta_data) VALUES
 ('14214214-0000-0000-0000-000000000001', '+967714214001', '{"name":"معلّم بلا نافذة"}'),
 ('14214214-0000-0000-0000-00000000000a', '+967714214010', '{"name":"طالب بلا نافذة"}');
INSERT INTO public.user_roles (user_id, role) VALUES ('14214214-0000-0000-0000-000000000001', 'teacher')
ON CONFLICT DO NOTHING;
INSERT INTO public.centers (id, name, created_by)
VALUES ('14214214-cccc-0000-0000-000000000001', 'مركز بلا نافذة', '14214214-0000-0000-0000-000000000001');
INSERT INTO public.halaqat (id, center_id, name, teacher_id)
VALUES ('14214214-dddd-0000-0000-000000000001', '14214214-cccc-0000-0000-000000000001', 'حلقة بلا نافذة',
        '14214214-0000-0000-0000-000000000001');
INSERT INTO public.halaqa_students (halaqa_id, student_id, created_at) VALUES
 ('14214214-dddd-0000-0000-000000000001', '14214214-0000-0000-0000-00000000000a', now() - interval '90 days');
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '14214214-0000-0000-0000-000000000001';
INSERT INTO public._t SELECT 'nw sheet editable: ' || CASE WHEN
  (public.daily_record_sheet('14214214-dddd-0000-0000-000000000001', public.zen_today() - 40) ->> 'can_edit')::boolean
  THEN 'ok' ELSE 'FAILED' END;
SELECT set_config('zen.nw', public.open_daily_record('14214214-dddd-0000-0000-000000000001', public.zen_today() - 40) ->> 'id', false);
SELECT public.save_daily_entry(current_setting('zen.nw')::uuid, '14214214-0000-0000-0000-00000000000a',
  '{"memorize":{"segments":[{"surah_name":"الملك","from_ayah":1,"to_ayah":5}],"grade":4}}', 0);
INSERT INTO public._t SELECT 'nw history editable: ' || CASE WHEN
  (public.daily_record_history('14214214-dddd-0000-0000-000000000001') -> 0 ->> 'editable')::boolean
  AND (public.daily_record_history('14214214-dddd-0000-0000-000000000001') -> 0 ->> 'memorized')::int = 1
  THEN 'ok' ELSE 'FAILED' END;
DO $$ BEGIN
  PERFORM public.open_daily_record('14214214-dddd-0000-0000-000000000001', public.zen_today() + 1);
  INSERT INTO public._t VALUES ('nw future: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('nw future: rejected');
END $$;
RESET ROLE;
UPDATE public.halaqa_daily_records SET status = 'completed', completed_at = now(), version = version + 1
 WHERE id = current_setting('zen.nw')::uuid;
SELECT set_config('zen.nwv', (SELECT version::text FROM public.halaqa_daily_records WHERE id = current_setting('zen.nw')::uuid), false);
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '14214214-0000-0000-0000-000000000001';
SELECT public.reopen_daily_record(current_setting('zen.nw')::uuid, current_setting('zen.nwv')::int);
RESET ROLE;
INSERT INTO public._t SELECT 'nw reopened: ' || CASE WHEN
  (SELECT status FROM public.halaqa_daily_records WHERE id = current_setting('zen.nw')::uuid) = 'open'
  THEN 'ok' ELSE 'FAILED' END;
SELECT set_config('zen.nwv', (SELECT version::text FROM public.halaqa_daily_records WHERE id = current_setting('zen.nw')::uuid), false);
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '14214214-0000-0000-0000-000000000001';
SELECT public.delete_daily_record(current_setting('zen.nw')::uuid, current_setting('zen.nwv')::int);
RESET ROLE;
INSERT INTO public._t SELECT 'nw deleted: ' || CASE WHEN
  NOT EXISTS (SELECT 1 FROM public.halaqa_daily_records WHERE id = current_setting('zen.nw')::uuid)
  THEN 'ok' ELSE 'FAILED' END;
RESET "request.jwt.claim.sub";
DELETE FROM public.centers WHERE id = '14214214-cccc-0000-0000-000000000001';
DELETE FROM auth.users WHERE id::text LIKE '14214214-%';
SELECT code FROM public._t WHERE code LIKE 'nw %' ORDER BY code;

-- @@ 143. بيانات التقارير: نطاق الأيام والطلاب وأيام الأسبوع من السجل اليومي نفسه، والتاريخ للخريطة، والغريب والنطاق الخاطئ مرفوضان.
DELETE FROM public._t;
INSERT INTO auth.users (id, phone, raw_user_meta_data) VALUES
 ('14314314-0000-0000-0000-000000000001', '+967714314001', '{"name":"معلّم التقارير"}'),
 ('14314314-0000-0000-0000-000000000002', '+967714314002', '{"name":"غريب التقارير"}'),
 ('14314314-0000-0000-0000-00000000000a', '+967714314010', '{"name":"بلال"}'),
 ('14314314-0000-0000-0000-00000000000b', '+967714314011', '{"name":"أسامة"}');
INSERT INTO public.user_roles (user_id, role) VALUES
 ('14314314-0000-0000-0000-000000000001', 'teacher'), ('14314314-0000-0000-0000-000000000002', 'teacher')
ON CONFLICT DO NOTHING;
INSERT INTO public.centers (id, name, created_by)
VALUES ('14314314-cccc-0000-0000-000000000001', 'مركز التقارير', '14314314-0000-0000-0000-000000000001');
INSERT INTO public.halaqat (id, center_id, name, teacher_id)
VALUES ('14314314-dddd-0000-0000-000000000001', '14314314-cccc-0000-0000-000000000001', 'حلقة التقارير',
        '14314314-0000-0000-0000-000000000001');
INSERT INTO public.halaqa_students (halaqa_id, student_id) VALUES
 ('14314314-dddd-0000-0000-000000000001', '14314314-0000-0000-0000-00000000000a'),
 ('14314314-dddd-0000-0000-000000000001', '14314314-0000-0000-0000-00000000000b');
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '14314314-0000-0000-0000-000000000001';
SELECT set_config('zen.r1', public.open_daily_record('14314314-dddd-0000-0000-000000000001', public.zen_today() - 3) ->> 'id', false);
SELECT set_config('zen.r2', public.open_daily_record('14314314-dddd-0000-0000-000000000001', public.zen_today() - 1) ->> 'id', false);
SELECT public.set_daily_attendance(current_setting('zen.r1')::uuid, '14314314-0000-0000-0000-00000000000a', 'present', NULL, 0);
SELECT public.set_daily_attendance(current_setting('zen.r1')::uuid, '14314314-0000-0000-0000-00000000000b', 'absent', NULL, 0);
SELECT public.save_daily_entry(current_setting('zen.r1')::uuid, '14314314-0000-0000-0000-00000000000a',
  '{"memorize":{"segments":[{"surah_name":"النبإ","from_ayah":1,"to_ayah":40}],"grade":5},
    "review":{"segments":[{"surah_name":"الفاتحة","from_ayah":1,"to_ayah":7}],"grade":4}}', 1);
SELECT public.set_daily_attendance(current_setting('zen.r2')::uuid, '14314314-0000-0000-0000-00000000000a', 'excused', 'سفر', 0);
SELECT set_config('zen.rep', public.halaqa_report_data('14314314-dddd-0000-0000-000000000001',
  public.zen_today() - 7, public.zen_today(), NULL, NULL, true)::text, false);
INSERT INTO public._t SELECT 'rp rows: ' || CASE WHEN
  jsonb_array_length(current_setting('zen.rep')::jsonb -> 'rows') = 3
  AND jsonb_array_length(current_setting('zen.rep')::jsonb -> 'days') = 2
  AND (current_setting('zen.rep')::jsonb -> 'students' -> 0 ->> 'name') = 'أسامة'
  AND (current_setting('zen.rep')::jsonb ->> 'halaqa') LIKE '%مركز التقارير%'
  THEN 'ok' ELSE 'FAILED' END;
INSERT INTO public._t SELECT 'rp same as sheet: ' || CASE WHEN
  (SELECT r -> 'memorize' FROM jsonb_array_elements(current_setting('zen.rep')::jsonb -> 'rows') r
    WHERE r ->> 'student_id' = '14314314-0000-0000-0000-00000000000a' AND r ->> 'status' = 'present')
  = (SELECT s -> 'memorize' FROM jsonb_array_elements(public.daily_record_sheet('14314314-dddd-0000-0000-000000000001',
       public.zen_today() - 3) -> 'students') s WHERE s ->> 'student_id' = '14314314-0000-0000-0000-00000000000a')
  THEN 'ok' ELSE 'FAILED' END;
INSERT INTO public._t SELECT 'rp history: ' || CASE WHEN
  jsonb_array_length(current_setting('zen.rep')::jsonb -> 'history') = 1
  AND (current_setting('zen.rep')::jsonb -> 'history' -> 0 ->> 'to_ayah')::int = 40
  THEN 'ok' ELSE 'FAILED' END;
INSERT INTO public._t SELECT 'rp students filter: ' || CASE WHEN
  jsonb_array_length(public.halaqa_report_data('14314314-dddd-0000-0000-000000000001', public.zen_today() - 7,
    public.zen_today(), ARRAY['14314314-0000-0000-0000-00000000000b']::uuid[]) -> 'rows') = 1
  AND jsonb_array_length(public.halaqa_report_data('14314314-dddd-0000-0000-000000000001', public.zen_today() - 7,
    public.zen_today(), ARRAY['14314314-0000-0000-0000-00000000000b']::uuid[]) -> 'students') = 1
  THEN 'ok' ELSE 'FAILED' END;
INSERT INTO public._t SELECT 'rp weekday filter: ' || CASE WHEN
  jsonb_array_length(public.halaqa_report_data('14314314-dddd-0000-0000-000000000001', public.zen_today() - 7,
    public.zen_today(), NULL, ARRAY[extract(dow FROM public.zen_today() - 1)::smallint]) -> 'rows') = 1
  AND jsonb_array_length(public.halaqa_report_data('14314314-dddd-0000-0000-000000000001', public.zen_today() - 7,
    public.zen_today(), NULL, NULL, false) -> 'history') = 0
  THEN 'ok' ELSE 'FAILED' END;
DO $$ BEGIN
  PERFORM public.halaqa_report_data('14314314-dddd-0000-0000-000000000001', public.zen_today(), public.zen_today() - 1);
  INSERT INTO public._t VALUES ('rp reversed range: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('rp reversed range: rejected');
END $$;
DO $$ BEGIN
  PERFORM public.halaqa_report_data('14314314-dddd-0000-0000-000000000001', public.zen_today() - 800, public.zen_today());
  INSERT INTO public._t VALUES ('rp long range: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('rp long range: rejected');
END $$;
SET "request.jwt.claim.sub" = '14314314-0000-0000-0000-000000000002';
DO $$ BEGIN
  PERFORM public.halaqa_report_data('14314314-dddd-0000-0000-000000000001', public.zen_today() - 7, public.zen_today());
  INSERT INTO public._t VALUES ('rp stranger: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('rp stranger: rejected');
END $$;
RESET ROLE;
SET ROLE anon;
DO $$ BEGIN
  PERFORM public.halaqa_report_data('14314314-dddd-0000-0000-000000000001', public.zen_today() - 7, public.zen_today());
  INSERT INTO public._t VALUES ('rp anon: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('rp anon: rejected');
END $$;
RESET ROLE;
RESET "request.jwt.claim.sub";
DELETE FROM public.centers WHERE id = '14314314-cccc-0000-0000-000000000001';
DELETE FROM auth.users WHERE id::text LIKE '14314314-%';
SELECT code FROM public._t WHERE code LIKE 'rp %' ORDER BY code;

-- @@ 144. قصص الأنبياء: 25 قصة بـ slug فريد، والقصص الخمس الأصلية رُبطت ولم تتكرر، والمعدَّلة لا يُكتب فوقها.
DELETE FROM public._t;
INSERT INTO public._t SELECT 'ps 25 prophet stories: '
  || CASE WHEN (SELECT count(*) FROM public.stories WHERE slug IS NOT NULL) = 25 THEN 'ok' ELSE 'FAILED' END;
INSERT INTO public._t SELECT 'ps legacy not duplicated: '
  || CASE WHEN (SELECT count(*) FROM public.stories WHERE title = 'قصة نوح عليه السلام') = 1 THEN 'ok' ELSE 'FAILED' END;
INSERT INTO public._t SELECT 'ps content filled: '
  || CASE WHEN NOT EXISTS (SELECT 1 FROM public.stories WHERE slug IS NOT NULL AND (
       jsonb_array_length(timeline) < 4 OR jsonb_array_length(ayat) < 1 OR jsonb_array_length(quiz) < 3
       OR jsonb_array_length(lessons) < 3 OR jsonb_array_length(sources) < 1 OR intro = ''))
    THEN 'ok' ELSE 'FAILED' END;
INSERT INTO public._t SELECT 'ps ulul azm five: '
  || CASE WHEN (SELECT string_agg(slug, ',' ORDER BY sort_order) FROM public.stories WHERE ulul_azm)
       = 'nuh,ibrahim,musa,isa,muhammad' THEN 'ok' ELSE 'FAILED' END;
INSERT INTO public._t SELECT 'ps untouched rows: '
  || CASE WHEN NOT EXISTS (SELECT 1 FROM public.stories WHERE slug IS NOT NULL AND updated_at <> created_at)
    THEN 'ok' ELSE 'FAILED' END;
INSERT INTO public._t SELECT 'ps trigger enabled: '
  || CASE WHEN (SELECT tgenabled FROM pg_trigger WHERE tgname = 'update_stories_updated_at') = 'O'
    THEN 'ok' ELSE 'FAILED' END;
DO $$ BEGIN
  INSERT INTO public.stories (prophet, title, slug) VALUES ('نوح', 'نسخة', 'nuh');
  INSERT INTO public._t VALUES ('ps duplicate slug: ALLOWED!');
EXCEPTION WHEN unique_violation THEN INSERT INTO public._t VALUES ('ps duplicate slug: rejected');
END $$;
DO $$ BEGIN
  UPDATE public.stories SET mentions = -1 WHERE slug = 'nuh';
  INSERT INTO public._t VALUES ('ps negative mentions: ALLOWED!');
EXCEPTION WHEN check_violation THEN INSERT INTO public._t VALUES ('ps negative mentions: rejected');
END $$;
SELECT code FROM public._t WHERE code LIKE 'ps %' ORDER BY code;

-- @@ 145. السجل اليومي — سلّة المحذوفات: الحذف يحفظ لقطة، والاستعادة تعيد الحضور والحفظ والتقييم، ويُرفض الغريب والتكرار.
DELETE FROM public._t;
INSERT INTO auth.users (id, phone, raw_user_meta_data) VALUES
 ('14514514-0000-0000-0000-000000000001', '+967714514001', '{"name":"معلّم السلّة"}'),
 ('14514514-0000-0000-0000-000000000002', '+967714514002', '{"name":"غريب السلّة"}'),
 ('14514514-0000-0000-0000-00000000000a', '+967714514010', '{"name":"طالب السلّة"}');
INSERT INTO public.user_roles (user_id, role) VALUES
 ('14514514-0000-0000-0000-000000000001', 'teacher'), ('14514514-0000-0000-0000-000000000002', 'teacher')
ON CONFLICT DO NOTHING;
INSERT INTO public.centers (id, name, created_by)
VALUES ('14514514-cccc-0000-0000-000000000001', 'مركز السلّة', '14514514-0000-0000-0000-000000000001');
INSERT INTO public.halaqat (id, center_id, name, teacher_id)
VALUES ('14514514-dddd-0000-0000-000000000001', '14514514-cccc-0000-0000-000000000001', 'حلقة السلّة',
        '14514514-0000-0000-0000-000000000001');
INSERT INTO public.halaqa_students (halaqa_id, student_id) VALUES
 ('14514514-dddd-0000-0000-000000000001', '14514514-0000-0000-0000-00000000000a');
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '14514514-0000-0000-0000-000000000001';
SELECT set_config('zen.tr', public.open_daily_record('14514514-dddd-0000-0000-000000000001', public.zen_today() - 2) ->> 'id', false);
SELECT public.set_daily_attendance(current_setting('zen.tr')::uuid, '14514514-0000-0000-0000-00000000000a', 'present', NULL, 0);
SELECT public.save_daily_entry(current_setting('zen.tr')::uuid, '14514514-0000-0000-0000-00000000000a',
  '{"memorize":{"segments":[{"surah_name":"الملك","from_ayah":1,"to_ayah":5}],"grade":4},"note":"ممتاز"}', 1);
SELECT set_config('zen.trv', (SELECT version::text FROM public.halaqa_daily_records WHERE id = current_setting('zen.tr')::uuid), false);
SELECT set_config('zen.trash', public.delete_daily_record(current_setting('zen.tr')::uuid, current_setting('zen.trv')::int) ->> 'trash_id', false);
INSERT INTO public._t SELECT 'tr deleted: ' || CASE WHEN
  NOT EXISTS (SELECT 1 FROM public.halaqa_daily_records WHERE id = current_setting('zen.tr')::uuid)
  THEN 'ok' ELSE 'FAILED' END;
INSERT INTO public._t SELECT 'tr listed: ' || CASE WHEN
  jsonb_array_length(public.daily_record_trash_list('14514514-dddd-0000-0000-000000000001')) = 1
  AND (public.daily_record_trash_list('14514514-dddd-0000-0000-000000000001') -> 0 ->> 'restorable')::boolean
  THEN 'ok' ELSE 'FAILED' END;
SET "request.jwt.claim.sub" = '14514514-0000-0000-0000-000000000002';
DO $$ BEGIN
  PERFORM public.restore_daily_record(current_setting('zen.trash')::uuid);
  INSERT INTO public._t VALUES ('tr stranger restore: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('tr stranger restore: rejected');
END $$;
DO $$ BEGIN
  PERFORM public.daily_record_trash_list('14514514-dddd-0000-0000-000000000001');
  INSERT INTO public._t VALUES ('tr stranger list: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('tr stranger list: rejected');
END $$;
SET "request.jwt.claim.sub" = '14514514-0000-0000-0000-000000000001';
SELECT public.restore_daily_record(current_setting('zen.trash')::uuid);
INSERT INTO public._t SELECT 'tr restored: ' || CASE WHEN
  (SELECT s -> 'students' -> 0 ->> 'status' FROM public.daily_record_sheet('14514514-dddd-0000-0000-000000000001', public.zen_today() - 2) s) = 'present'
  AND (SELECT s -> 'students' -> 0 -> 'memorize' -> 'segments' -> 0 ->> 'to_ayah' FROM public.daily_record_sheet('14514514-dddd-0000-0000-000000000001', public.zen_today() - 2) s) = '5'
  AND (SELECT s -> 'students' -> 0 ->> 'note' FROM public.daily_record_sheet('14514514-dddd-0000-0000-000000000001', public.zen_today() - 2) s) = 'ممتاز'
  THEN 'ok' ELSE 'FAILED' END;
DO $$ BEGIN
  PERFORM public.restore_daily_record(current_setting('zen.trash')::uuid);
  INSERT INTO public._t VALUES ('tr restore twice: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('tr restore twice: rejected');
END $$;
RESET ROLE;
INSERT INTO public._t SELECT 'tr card reapplied: ' || CASE WHEN EXISTS (
  SELECT 1 FROM public.review_cards c WHERE c.student_id = '14514514-0000-0000-0000-00000000000a' AND c.surah_name = 'الملك')
  THEN 'ok' ELSE 'FAILED' END;
RESET "request.jwt.claim.sub";
DELETE FROM public.centers WHERE id = '14514514-cccc-0000-0000-000000000001';
DELETE FROM auth.users WHERE id::text LIKE '14514514-%';
SELECT code FROM public._t WHERE code LIKE 'tr %' ORDER BY code;

-- @@ 146. المدى في الاتجاهين: الحفظ من الناس صعوداً يُقبل ويُقرأ بترتيبه، والاتجاه يُحفظ للطالب، و«آخر حفظ» آخر مقطع، ومراجعة جزء عمّ كاملاً.
DELETE FROM public._t;
INSERT INTO auth.users (id, phone, raw_user_meta_data) VALUES
 ('14614614-0000-0000-0000-000000000001', '+967714614001', '{"name":"معلّم الاتجاه"}'),
 ('14614614-0000-0000-0000-00000000000a', '+967714614010', '{"name":"طالب الاتجاه"}');
INSERT INTO public.user_roles (user_id, role) VALUES ('14614614-0000-0000-0000-000000000001', 'teacher')
ON CONFLICT DO NOTHING;
INSERT INTO public.centers (id, name, created_by)
VALUES ('14614614-cccc-0000-0000-000000000001', 'مركز الاتجاه', '14614614-0000-0000-0000-000000000001');
INSERT INTO public.halaqat (id, center_id, name, teacher_id)
VALUES ('14614614-dddd-0000-0000-000000000001', '14614614-cccc-0000-0000-000000000001', 'حلقة الاتجاه',
        '14614614-0000-0000-0000-000000000001');
INSERT INTO public.halaqa_students (halaqa_id, student_id, created_at) VALUES
 ('14614614-dddd-0000-0000-000000000001', '14614614-0000-0000-0000-00000000000a', now() - interval '30 days');
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '14614614-0000-0000-0000-000000000001';
SELECT set_config('zen.dr1', public.open_daily_record('14614614-dddd-0000-0000-000000000001', public.zen_today() - 1) ->> 'id', false);
SELECT public.save_daily_entry(current_setting('zen.dr1')::uuid, '14614614-0000-0000-0000-00000000000a',
  '{"memorize":{"segments":[{"surah_name":"الناس","from_ayah":1,"to_ayah":6},{"surah_name":"الفلق","from_ayah":1,"to_ayah":5},{"surah_name":"الإخلاص","from_ayah":1,"to_ayah":4}],"grade":5,"direction":"backward"}}', 0);
INSERT INTO public._t SELECT 'dir order kept: ' || CASE WHEN
  (SELECT string_agg(seg ->> 'surah_name', ',' ORDER BY o)
     FROM jsonb_array_elements(public.daily_record_sheet('14614614-dddd-0000-0000-000000000001', public.zen_today() - 1)
                               -> 'students' -> 0 -> 'memorize' -> 'segments') WITH ORDINALITY x(seg, o))
  = 'الناس,الفلق,الإخلاص' THEN 'ok' ELSE 'FAILED' END;
INSERT INTO public._t SELECT 'dir saved: ' || CASE WHEN
  public.daily_record_sheet('14614614-dddd-0000-0000-000000000001', public.zen_today() - 1) -> 'students' -> 0 ->> 'memorize_dir' = 'backward'
  AND public.daily_record_sheet('14614614-dddd-0000-0000-000000000001', public.zen_today() - 1) -> 'students' -> 0 ->> 'review_dir' = 'forward'
  THEN 'ok' ELSE 'FAILED' END;
INSERT INTO public._t SELECT 'dir last segment: ' || CASE WHEN
  public.daily_record_sheet('14614614-dddd-0000-0000-000000000001', public.zen_today()) -> 'students' -> 0 -> 'last_memorize' ->> 'surah_name' = 'الإخلاص'
  THEN 'ok' ELSE 'FAILED' END;
DO $$ BEGIN
  PERFORM public.save_daily_entry(current_setting('zen.dr1')::uuid, '14614614-0000-0000-0000-00000000000a',
    '{"memorize":{"segments":[{"surah_name":"الناس","from_ayah":1,"to_ayah":6}],"grade":5,"direction":"sideways"}}', 1);
  INSERT INTO public._t VALUES ('dir invalid: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('dir invalid: ' || CASE WHEN SQLERRM LIKE '%INVALID_DIRECTION%' THEN 'rejected' ELSE 'FAILED ' || SQLERRM END);
END $$;
DO $$ BEGIN
  PERFORM public.save_daily_entry(current_setting('zen.dr1')::uuid, '14614614-0000-0000-0000-00000000000a',
    '{"memorize":{"segments":[{"surah_name":"الناس","from_ayah":4,"to_ayah":2}],"grade":5}}', 1);
  INSERT INTO public._t VALUES ('dir reversed ayahs: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('dir reversed ayahs: rejected');
END $$;
-- مراجعة جزء عمّ كاملاً من الناس إلى النبإ (37 سورة).
RESET ROLE;
SELECT set_config('zen.juz', (SELECT jsonb_agg(jsonb_build_object('surah_name', x.name, 'from_ayah', 1,
                                  'to_ayah', private.surah_ayahs(x.name)) ORDER BY x.o DESC)::text
  FROM unnest(ARRAY['النبإ','النازعات','عبس','التكوير','الانفطار','المطففين','الانشقاق','البروج','الطارق',
    'الأعلى','الغاشية','الفجر','البلد','الشمس','الليل','الضحى','الشرح','التين','العلق','القدر','البينة',
    'الزلزلة','العاديات','القارعة','التكاثر','العصر','الهمزة','الفيل','قريش','الماعون','الكوثر','الكافرون',
    'النصر','المسد','الإخلاص','الفلق','الناس']) WITH ORDINALITY x(name, o)), false);
SET ROLE authenticated;
SELECT public.save_daily_entry(current_setting('zen.dr1')::uuid, '14614614-0000-0000-0000-00000000000a',
  jsonb_build_object('review', jsonb_build_object('grade', 4, 'direction', 'backward',
    'segments', current_setting('zen.juz')::jsonb)), 1);
INSERT INTO public._t SELECT 'dir juz amma review: ' || CASE WHEN
  jsonb_array_length(public.daily_record_sheet('14614614-dddd-0000-0000-000000000001', public.zen_today() - 1) -> 'students' -> 0 -> 'review' -> 'segments') = 37
  AND public.daily_record_sheet('14614614-dddd-0000-0000-000000000001', public.zen_today() - 1) -> 'students' -> 0 -> 'review' -> 'segments' -> 0 ->> 'surah_name' = 'الناس'
  THEN 'ok' ELSE 'FAILED' END;
RESET ROLE;
RESET "request.jwt.claim.sub";
DELETE FROM public.centers WHERE id = '14614614-cccc-0000-0000-000000000001';
DELETE FROM auth.users WHERE id::text LIKE '14614614-%';
SELECT code FROM public._t WHERE code LIKE 'dir %' ORDER BY code;

-- @@ 147. هوية التقرير للمركز: يكتبها منشئ المركز ويقرؤها مدير الحلقة، ويُرفض غيرهما والحمولة غير الصالحة.
DELETE FROM public._t;
INSERT INTO auth.users (id, phone, raw_user_meta_data) VALUES
 ('14714714-0000-0000-0000-000000000001', '+967714714001', '{"name":"صاحب مركز الهوية"}'),
 ('14714714-0000-0000-0000-000000000002', '+967714714002', '{"name":"معلّم حلقة الهوية"}'),
 ('14714714-0000-0000-0000-000000000003', '+967714714003', '{"name":"معلّم غريب"}');
INSERT INTO public.user_roles (user_id, role) VALUES
 ('14714714-0000-0000-0000-000000000001', 'teacher'),
 ('14714714-0000-0000-0000-000000000002', 'teacher'),
 ('14714714-0000-0000-0000-000000000003', 'teacher')
ON CONFLICT DO NOTHING;
INSERT INTO public.centers (id, name, created_by)
VALUES ('14714714-cccc-0000-0000-000000000001', 'مركز الهوية', '14714714-0000-0000-0000-000000000001');
INSERT INTO public.halaqat (id, center_id, name, teacher_id)
VALUES ('14714714-dddd-0000-0000-000000000001', '14714714-cccc-0000-0000-000000000001', 'حلقة الهوية',
        '14714714-0000-0000-0000-000000000002');
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '14714714-0000-0000-0000-000000000001';
SELECT public.set_report_identity('14714714-dddd-0000-0000-000000000001',
  '{"colors":{"primary":"#123456"},"header":{"text":"مركز الهوية"}}');
INSERT INTO public._t SELECT 'identity owner edits: ' || CASE WHEN
  (public.report_identity('14714714-dddd-0000-0000-000000000001') ->> 'can_edit')::boolean THEN 'ok' ELSE 'FAILED' END;
DO $$ BEGIN
  PERFORM public.set_report_identity('14714714-dddd-0000-0000-000000000001', '[1,2]');
  INSERT INTO public._t VALUES ('identity array: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('identity array: ' || CASE WHEN SQLERRM LIKE '%INVALID_PAYLOAD%' THEN 'rejected' ELSE 'FAILED ' || SQLERRM END);
END $$;
SET "request.jwt.claim.sub" = '14714714-0000-0000-0000-000000000002';
INSERT INTO public._t SELECT 'identity teacher reads: ' || CASE WHEN
  public.report_identity('14714714-dddd-0000-0000-000000000001') -> 'identity' -> 'colors' ->> 'primary' = '#123456'
  AND NOT (public.report_identity('14714714-dddd-0000-0000-000000000001') ->> 'can_edit')::boolean
  THEN 'ok' ELSE 'FAILED' END;
DO $$ BEGIN
  PERFORM public.set_report_identity('14714714-dddd-0000-0000-000000000001', '{"colors":{}}');
  INSERT INTO public._t VALUES ('identity teacher write: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('identity teacher write: ' || CASE WHEN SQLERRM LIKE '%NOT_ALLOWED%' THEN 'rejected' ELSE 'FAILED ' || SQLERRM END);
END $$;
SET "request.jwt.claim.sub" = '14714714-0000-0000-0000-000000000003';
DO $$ BEGIN
  PERFORM public.report_identity('14714714-dddd-0000-0000-000000000001');
  INSERT INTO public._t VALUES ('identity outsider read: LEAKED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('identity outsider read: rejected');
END $$;
RESET ROLE;
RESET "request.jwt.claim.sub";
DELETE FROM public.centers WHERE id = '14714714-cccc-0000-0000-000000000001';
DELETE FROM auth.users WHERE id::text LIKE '14714714-%';
SELECT code FROM public._t WHERE code LIKE 'identity %' ORDER BY code;

-- @@ 148. إشعار تجريبي: لمن له جهاز فقط، ويُرسل الآن متجاوزاً ساعات الهدوء، ومرة كل 30 ثانية.
DELETE FROM public._t;
INSERT INTO auth.users (id, phone, raw_user_meta_data) VALUES
 ('14814814-0000-0000-0000-000000000001', '+967714814001', '{"name":"صاحب الجهاز"}'),
 ('14814814-0000-0000-0000-000000000002', '+967714814002', '{"name":"بلا جهاز"}');
INSERT INTO public.native_push_tokens (user_id, token, platform)
VALUES ('14814814-0000-0000-0000-000000000001', 'fcm-test-token-14814814-aaaaaaaaaaaa', 'android');
-- ساعات هدوء طوال اليوم تقريباً: التجربة لا تتأجل.
INSERT INTO public.notification_prefs (user_id, quiet_start, quiet_end, timezone)
VALUES ('14814814-0000-0000-0000-000000000001', '00:00', '23:59', 'Asia/Aden')
ON CONFLICT (user_id) DO UPDATE SET quiet_start = EXCLUDED.quiet_start, quiet_end = EXCLUDED.quiet_end;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '14814814-0000-0000-0000-000000000001';
SELECT public.send_test_push('تجربة', 'يصل بصوت الجوال');
DO $$ BEGIN
  PERFORM public.send_test_push('تجربة', 'مرة ثانية');
  INSERT INTO public._t VALUES ('test push twice: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('test push twice: ' || CASE WHEN SQLERRM LIKE '%RATE_LIMITED%' THEN 'rejected' ELSE 'FAILED ' || SQLERRM END);
END $$;
SET "request.jwt.claim.sub" = '14814814-0000-0000-0000-000000000002';
DO $$ BEGIN
  PERFORM public.send_test_push('تجربة', NULL);
  INSERT INTO public._t VALUES ('test push no device: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('test push no device: ' || CASE WHEN SQLERRM LIKE '%NO_DEVICE%' THEN 'rejected' ELSE 'FAILED ' || SQLERRM END);
END $$;
RESET ROLE;
RESET "request.jwt.claim.sub";
INSERT INTO public._t SELECT 'test push queued now: ' || CASE WHEN (
  SELECT count(*) FROM public.push_outbox o
   WHERE o.user_id = '14814814-0000-0000-0000-000000000001' AND o.send_after <= now() + interval '1 second'
     AND o.title = 'تجربة') = 1 THEN 'ok' ELSE 'FAILED' END;
DELETE FROM auth.users WHERE id::text LIKE '14814814-%';
SELECT code FROM public._t WHERE code LIKE 'test push %' ORDER BY code;

-- @@ 149. استوديو الشهائد 1: الأصول والهوية والقوالب — الشعار والهوية لإدارة المركز، والتوقيع لمن يصدر، والغريب مرفوض
DELETE FROM public._t;
INSERT INTO auth.users (id, phone, raw_user_meta_data) VALUES
 ('14914914-0000-0000-0000-000000000001', '+967714914001', '{"name":"صاحب مركز الشهائد"}'),
 ('14914914-0000-0000-0000-000000000002', '+967714914002', '{"name":"معلّم حلقة الشهائد"}'),
 ('14914914-0000-0000-0000-000000000003', '+967714914003', '{"name":"معلّم غريب"}'),
 ('14914914-0000-0000-0000-000000000004', '+967714914004', '{"name":"مشرف المركز"}'),
 ('14914914-0000-0000-0000-000000000005', '+967714914005', '{"name":"مدير المركز"}'),
 ('14914914-0000-0000-0000-000000000006', '+967714914006', '{"name":"معلّم الحلقة الأخرى"}');
INSERT INTO auth.users (id, phone, raw_user_meta_data)
SELECT ('14914914-5555-0000-0000-' || lpad(i::text, 12, '0'))::uuid, '+96771491' || lpad((5000 + i)::text, 4, '0'),
       jsonb_build_object('name', CASE i WHEN 1 THEN 'عبدالرحمن بن عبدالله آل إبراهيم المؤمَّن' ELSE 'طالب الشهائد ' || i END)
  FROM generate_series(1, 30) i;
INSERT INTO auth.users (id, phone, raw_user_meta_data) VALUES
 ('14914914-6666-0000-0000-000000000001', '+967714916001', '{"name":"طالب حلقة أخرى"}');
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'teacher' FROM auth.users WHERE id::text LIKE '14914914-0000-%' ON CONFLICT DO NOTHING;
INSERT INTO public.centers (id, name, created_by)
VALUES ('14914914-cccc-0000-0000-000000000001', 'مركز الشهائد', '14914914-0000-0000-0000-000000000001'),
       ('14914914-cccc-0000-0000-000000000002', 'مركز غريب', '14914914-0000-0000-0000-000000000003');
INSERT INTO public.center_staff (center_id, user_id, role) VALUES
 ('14914914-cccc-0000-0000-000000000001', '14914914-0000-0000-0000-000000000004', 'supervisor'),
 ('14914914-cccc-0000-0000-000000000001', '14914914-0000-0000-0000-000000000005', 'manager');
INSERT INTO public.halaqat (id, center_id, name, teacher_id) VALUES
 ('14914914-dddd-0000-0000-000000000001', '14914914-cccc-0000-0000-000000000001', 'حلقة الشهائد', '14914914-0000-0000-0000-000000000002'),
 ('14914914-dddd-0000-0000-000000000002', '14914914-cccc-0000-0000-000000000001', 'الحلقة الأخرى', '14914914-0000-0000-0000-000000000006'),
 ('14914914-dddd-0000-0000-000000000003', '14914914-cccc-0000-0000-000000000002', 'حلقة غريبة', '14914914-0000-0000-0000-000000000003');
INSERT INTO public.halaqa_students (halaqa_id, student_id)
SELECT '14914914-dddd-0000-0000-000000000001', id FROM auth.users WHERE id::text LIKE '14914914-5555-%';
INSERT INTO public.halaqa_students (halaqa_id, student_id)
VALUES ('14914914-dddd-0000-0000-000000000002', '14914914-6666-0000-0000-000000000001');
SET ROLE authenticated;
-- المالك يرفع الشعار، والرفع الثاني للصورة نفسها يعيد الأصل نفسه (لا تكرار).
SET "request.jwt.claim.sub" = '14914914-0000-0000-0000-000000000001';
SELECT set_config('zen.ca_logo', public.cert_save_asset('14914914-cccc-0000-0000-000000000001',
  '{"kind":"logo","label":"الشعار","data_url":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==","width":1,"height":1}')::text, false);
INSERT INTO public._t SELECT 'ca asset dedupe: ' || CASE WHEN public.cert_save_asset('14914914-cccc-0000-0000-000000000001',
  '{"kind":"logo","data_url":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="}')::text
  = current_setting('zen.ca_logo') THEN 'ok' ELSE 'FAILED' END;
DO $$ BEGIN
  PERFORM public.cert_save_asset('14914914-cccc-0000-0000-000000000001', jsonb_build_object('kind', 'decoration',
    'data_url', 'data:image/svg+xml;base64,' || encode(convert_to('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', 'UTF8'), 'base64')));
  INSERT INTO public._t VALUES ('ca unsafe svg: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('ca unsafe svg: ' || CASE WHEN SQLERRM LIKE '%UNSAFE_SVG%' THEN 'rejected' ELSE 'FAILED ' || SQLERRM END);
END $$;
DO $$ BEGIN
  PERFORM public.cert_save_asset('14914914-cccc-0000-0000-000000000001', '{"kind":"image","data_url":"data:text/html;base64,PGgxPg=="}');
  INSERT INTO public._t VALUES ('ca bad mime: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('ca bad mime: ' || CASE WHEN SQLERRM LIKE '%INVALID_IMAGE%' THEN 'rejected' ELSE 'FAILED ' || SQLERRM END);
END $$;
INSERT INTO public._t SELECT 'ca safe svg: ' || CASE WHEN public.cert_save_asset('14914914-cccc-0000-0000-000000000001', jsonb_build_object('kind', 'decoration',
    'data_url', 'data:image/svg+xml;base64,' || encode(convert_to('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0L10 10"/></svg>', 'UTF8'), 'base64'))) IS NOT NULL
  THEN 'ok' ELSE 'FAILED' END;
SELECT public.cert_save_brand('14914914-cccc-0000-0000-000000000001',
  jsonb_build_object('logo', current_setting('zen.ca_logo'), 'colors', jsonb_build_object('primary', '#1f5d46')));
SELECT set_config('zen.ca_tpl', (public.cert_save_template(jsonb_build_object('center_id', '14914914-cccc-0000-0000-000000000001',
  'name', 'قالب المركز', 'categories', '["official"]'::jsonb,
  'design', jsonb_build_object('page', '{"size":"A4","orientation":"landscape"}'::jsonb,
    'elements', jsonb_build_array(jsonb_build_object('id', 't', 'type', 'text', 'text', 'الإصدار الأول'),
                                  jsonb_build_object('id', 'l', 'type', 'image', 'src', 'asset:' || current_setting('zen.ca_logo'))))), true)->>'id'), false);
INSERT INTO public._t SELECT 'ca template v1: ' || CASE WHEN t->>'version' = '1' AND (t->>'can_edit')::boolean THEN 'ok' ELSE 'FAILED ' || t::text END
  FROM jsonb_array_elements(public.cert_templates('14914914-cccc-0000-0000-000000000001')) t WHERE t->>'id' = current_setting('zen.ca_tpl');
INSERT INTO public._t SELECT 'ca autosave keeps version: ' || CASE WHEN
  (public.cert_save_template(jsonb_build_object('id', current_setting('zen.ca_tpl'),
     'design', '{"page":{"size":"A4"},"elements":[{"id":"t","type":"text","text":"مسودة"}]}'::jsonb), false)->>'version') = '1'
  THEN 'ok' ELSE 'FAILED' END;
-- معلّم الحلقة: يقرأ القوالب، ويرفع توقيعه، ولا يغيّر الشعار ولا الهوية ولا قالب المركز، ويصنع قالب حلقته.
SET "request.jwt.claim.sub" = '14914914-0000-0000-0000-000000000002';
INSERT INTO public._t SELECT 'ca teacher reads templates: ' || CASE WHEN jsonb_array_length(public.cert_templates('14914914-cccc-0000-0000-000000000001')) >= 1 THEN 'ok' ELSE 'FAILED' END;
INSERT INTO public._t SELECT 'ca teacher signature: ' || CASE WHEN public.cert_save_asset('14914914-cccc-0000-0000-000000000001',
  '{"kind":"signature","signer_name":"معلّم الحلقة","signer_title":"معلّم","data_url":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=="}') IS NOT NULL THEN 'ok' ELSE 'FAILED' END;
DO $$ BEGIN
  PERFORM public.cert_save_asset('14914914-cccc-0000-0000-000000000001', '{"kind":"logo","data_url":"data:image/png;base64,AAAA"}');
  INSERT INTO public._t VALUES ('ca teacher logo: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('ca teacher logo: ' || CASE WHEN SQLERRM LIKE '%NOT_ALLOWED%' THEN 'rejected' ELSE 'FAILED ' || SQLERRM END);
END $$;
DO $$ BEGIN
  PERFORM public.cert_save_brand('14914914-cccc-0000-0000-000000000001', '{}');
  INSERT INTO public._t VALUES ('ca teacher brand: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('ca teacher brand: ' || CASE WHEN SQLERRM LIKE '%NOT_ALLOWED%' THEN 'rejected' ELSE 'FAILED ' || SQLERRM END);
END $$;
DO $$ BEGIN
  PERFORM public.cert_save_template(jsonb_build_object('id', current_setting('zen.ca_tpl'), 'design', '{"elements":[]}'::jsonb), true);
  INSERT INTO public._t VALUES ('ca teacher center template: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('ca teacher center template: ' || CASE WHEN SQLERRM LIKE '%NOT_ALLOWED%' THEN 'rejected' ELSE 'FAILED ' || SQLERRM END);
END $$;
INSERT INTO public._t SELECT 'ca teacher halaqa template: ' || CASE WHEN public.cert_save_template(jsonb_build_object(
  'center_id', '14914914-cccc-0000-0000-000000000001', 'halaqa_id', '14914914-dddd-0000-0000-000000000001',
  'name', 'قالب الحلقة', 'design', '{"elements":[]}'::jsonb), false)->>'id' IS NOT NULL THEN 'ok' ELSE 'FAILED' END;
DO $$ BEGIN
  PERFORM public.cert_template_action(current_setting('zen.ca_tpl')::uuid, 'duplicate');
  INSERT INTO public._t VALUES ('ca teacher duplicate to center: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('ca teacher duplicate to center: ' || CASE WHEN SQLERRM LIKE '%NOT_ALLOWED%' THEN 'rejected' ELSE 'FAILED ' || SQLERRM END);
END $$;
SELECT set_config('zen.ca_dup', public.cert_template_action(current_setting('zen.ca_tpl')::uuid, 'duplicate', '14914914-dddd-0000-0000-000000000001')::text, false);
INSERT INTO public._t SELECT 'ca teacher duplicate to halaqa: ' || CASE WHEN (SELECT t->>'halaqa_id' FROM jsonb_array_elements(
    public.cert_templates('14914914-cccc-0000-0000-000000000001')) t WHERE t->>'id' = current_setting('zen.ca_dup'))
  = '14914914-dddd-0000-0000-000000000001' THEN 'ok' ELSE 'FAILED' END;
-- المشرف يقرأ ولا يكتب (فحص 110)، والغريب لا يقرأ شيئاً.
SET "request.jwt.claim.sub" = '14914914-0000-0000-0000-000000000004';
INSERT INTO public._t SELECT 'ca supervisor reads: ' || CASE WHEN jsonb_array_length(public.cert_templates('14914914-cccc-0000-0000-000000000001')) >= 1
  AND public.cert_brand('14914914-cccc-0000-0000-000000000001') -> 'brand' ->> 'logo' = current_setting('zen.ca_logo') THEN 'ok' ELSE 'FAILED' END;
DO $$ BEGIN
  PERFORM public.cert_save_template(jsonb_build_object('center_id', '14914914-cccc-0000-0000-000000000001', 'name', 'مشرف', 'design', '{}'::jsonb), false);
  INSERT INTO public._t VALUES ('ca supervisor template: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('ca supervisor template: ' || CASE WHEN SQLERRM LIKE '%NOT_ALLOWED%' THEN 'rejected' ELSE 'FAILED ' || SQLERRM END);
END $$;
SET "request.jwt.claim.sub" = '14914914-0000-0000-0000-000000000005';
INSERT INTO public._t SELECT 'ca manager brand: ' || CASE WHEN (public.cert_brand('14914914-cccc-0000-0000-000000000001')->>'can_edit')::boolean THEN 'ok' ELSE 'FAILED' END;
SET "request.jwt.claim.sub" = '14914914-0000-0000-0000-000000000003';
DO $$ BEGIN
  PERFORM public.cert_templates('14914914-cccc-0000-0000-000000000001');
  INSERT INTO public._t VALUES ('ca outsider templates: LEAKED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('ca outsider templates: rejected');
END $$;
DO $$ BEGIN
  PERFORM public.cert_assets('14914914-cccc-0000-0000-000000000001', NULL);
  INSERT INTO public._t VALUES ('ca outsider assets: LEAKED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('ca outsider assets: rejected');
END $$;
-- أصل مركز آخر لا يدخل قالب هذا المركز ولا هويته.
DO $$ BEGIN
  PERFORM public.cert_save_brand('14914914-cccc-0000-0000-000000000002', jsonb_build_object('logo', current_setting('zen.ca_logo')));
  INSERT INTO public._t VALUES ('ca foreign asset brand: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('ca foreign asset brand: ' || CASE WHEN SQLERRM LIKE '%FOREIGN_ASSET%' THEN 'rejected' ELSE 'FAILED ' || SQLERRM END);
END $$;
DO $$ BEGIN
  PERFORM count(*) FROM public.certificate_templates;
  INSERT INTO public._t VALUES ('ca table direct: ALLOWED!');
EXCEPTION WHEN insufficient_privilege THEN INSERT INTO public._t VALUES ('ca table direct: rejected');
END $$;
DO $$ BEGIN
  PERFORM count(*) FROM public.certificate_assets;
  INSERT INTO public._t VALUES ('ca assets direct: ALLOWED!');
EXCEPTION WHEN insufficient_privilege THEN INSERT INTO public._t VALUES ('ca assets direct: rejected');
END $$;
RESET ROLE;
RESET "request.jwt.claim.sub";
-- الأصل لا يتغيّر بعد رفعه (حتى من الخادم).
DO $$ BEGIN
  UPDATE public.certificate_assets SET label = 'تغيير' WHERE id = current_setting('zen.ca_logo')::uuid;
  INSERT INTO public._t VALUES ('ca asset immutable: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('ca asset immutable: ' || CASE WHEN SQLERRM LIKE '%ASSET_IMMUTABLE%' THEN 'rejected' ELSE 'FAILED ' || SQLERRM END);
END $$;
INSERT INTO public._t SELECT 'ca audit: ' || CASE WHEN (SELECT count(DISTINCT action) FROM public.certificate_audit_log
  WHERE center_id = '14914914-cccc-0000-0000-000000000001' AND action IN ('asset.logo', 'asset.signature', 'brand.update', 'template.create', 'template.update', 'template.copy')) = 6
  THEN 'ok' ELSE 'FAILED' END;
-- 1.26.0: +ijazah.
INSERT INTO public._t SELECT 'ca system types: ' || CASE WHEN count(*) = 15 THEN 'ok' ELSE 'FAILED ' || count(*) END
  FROM public.certificate_types WHERE center_id IS NULL;
SELECT code FROM public._t WHERE code LIKE 'ca %' ORDER BY code;

-- @@ 150. استوديو الشهائد 2: إصدار فردي من مصدر البيانات، بالصلاحية وحدها، ولقطة ثابتة لا يغيّرها تعديل القالب (v1 بعد v2)
DELETE FROM public._t;
SELECT set_config('zen.cs_tpl', (SELECT id::text FROM public.certificate_templates
  WHERE center_id = '14914914-cccc-0000-0000-000000000001' AND name = 'قالب المركز'), false);
SELECT set_config('zen.cs_design', jsonb_build_object('page', '{"size":"A4","orientation":"landscape"}'::jsonb,
  'elements', jsonb_build_array(jsonb_build_object('id', 't', 'type', 'text', 'text', 'الإصدار الأول {{student.name}}')))::text, false);
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '14914914-0000-0000-0000-000000000002';
-- الاسم من الملف الشخصي لا مما يرسله العميل، والمجموعات غير المعروفة تُسقط.
SELECT set_config('zen.cs_one', public.cert_issue(jsonb_build_object(
  'halaqa_id', '14914914-dddd-0000-0000-000000000001', 'type_key', 'achievement',
  'template_id', current_setting('zen.cs_tpl'), 'design', current_setting('zen.cs_design')::jsonb,
  'items', jsonb_build_array(jsonb_build_object('student_id', '14914914-5555-0000-0000-000000000001',
    'vars', jsonb_build_object('student', jsonb_build_object('name', 'اسم مزوّر'),
                               'achievement', jsonb_build_object('title', 'إتمام سورة البقرة', 'evil', jsonb_build_object('x', 1)),
                               'secret', jsonb_build_object('phone', '777'))))))::text, false);
INSERT INTO public._t SELECT 'cs issue: ' || CASE WHEN r->>'status' = 'issued'
    AND r->'certificates'->0->>'certificate_number' ~ ('^ZEN-[A-Z0-9]{2,6}-' || to_char(public.zen_today(), 'YYYY') || '-[0-9]{4}$')
    AND r->'certificates'->0->>'verify_code' ~ '^[A-HJ-NP-Z2-9]{16}$' THEN 'ok' ELSE 'FAILED ' || r::text END
  FROM (SELECT current_setting('zen.cs_one')::jsonb AS r) x;
SELECT set_config('zen.cs_id', current_setting('zen.cs_one')::jsonb->'certificates'->0->>'id', false);
INSERT INTO public._t SELECT 'cs snapshot from source: ' || CASE WHEN
    g->'snapshot'->'vars'->'student'->>'name' = 'عبدالرحمن بن عبدالله آل إبراهيم المؤمَّن'
    AND g->'snapshot'->'vars'->'circle'->>'name' = 'حلقة الشهائد'
    AND g->'snapshot'->'vars'->'center'->>'name' = 'مركز الشهائد'
    AND g->'snapshot'->'vars'->'teacher'->>'name' = 'معلّم حلقة الشهائد'
    AND g->'snapshot'->'vars'->'achievement'->>'title' = 'إتمام سورة البقرة'
    AND NOT (g->'snapshot'->'vars'->'achievement') ? 'evil'
    AND NOT (g->'snapshot'->'vars') ? 'secret'
    AND g->'snapshot'->'vars'->'certificate'->>'number' = g->>'certificate_number'
    AND g->>'type_name' = 'شهادة إنجاز' AND g->>'halaqa_name' = 'حلقة الشهائد'
  THEN 'ok' ELSE 'FAILED ' || (g->'snapshot')::text END
  FROM (SELECT public.cert_get(current_setting('zen.cs_id')::uuid) AS g) x;
-- غير المخوَّلين: غريب، ومعلّم حلقة أخرى في المركز نفسه، وطالب ليس في الحلقة، وتجاوز الشرط من المعلّم أو المشرف.
SET "request.jwt.claim.sub" = '14914914-0000-0000-0000-000000000003';
DO $$ BEGIN
  PERFORM public.cert_issue(jsonb_build_object('halaqa_id', '14914914-dddd-0000-0000-000000000001', 'type_key', 'achievement',
    'design', current_setting('zen.cs_design')::jsonb, 'items', '[{"student_id":"14914914-5555-0000-0000-000000000002"}]'::jsonb));
  INSERT INTO public._t VALUES ('cs outsider issue: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('cs outsider issue: ' || CASE WHEN SQLERRM LIKE '%NOT_YOUR_HALAQA%' THEN 'rejected' ELSE 'FAILED ' || SQLERRM END);
END $$;
DO $$ BEGIN
  PERFORM public.cert_get(current_setting('zen.cs_id')::uuid);
  INSERT INTO public._t VALUES ('cs outsider get: LEAKED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('cs outsider get: rejected');
END $$;
INSERT INTO public._t SELECT 'cs outsider list: ' || CASE WHEN (public.cert_list('{"status":"all"}')->>'total')::int = 0 THEN 'ok' ELSE 'LEAKED!' END;
SET "request.jwt.claim.sub" = '14914914-0000-0000-0000-000000000006';
DO $$ BEGIN
  PERFORM public.cert_issue(jsonb_build_object('halaqa_id', '14914914-dddd-0000-0000-000000000001', 'type_key', 'achievement',
    'design', current_setting('zen.cs_design')::jsonb, 'items', '[{"student_id":"14914914-5555-0000-0000-000000000002"}]'::jsonb));
  INSERT INTO public._t VALUES ('cs other teacher issue: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('cs other teacher issue: ' || CASE WHEN SQLERRM LIKE '%NOT_YOUR_HALAQA%' THEN 'rejected' ELSE 'FAILED ' || SQLERRM END);
END $$;
INSERT INTO public._t SELECT 'cs other teacher list: ' || CASE WHEN (public.cert_list('{"status":"all","halaqa_id":"14914914-dddd-0000-0000-000000000001"}')->>'total')::int = 0 THEN 'ok' ELSE 'LEAKED!' END;
SET "request.jwt.claim.sub" = '14914914-0000-0000-0000-000000000004';
-- المشرف يصدر لحلقات مركزه (صلاحية أوسع من المعلّم)؛ يُتراجع عن الإصدار داخل الكتلة فلا يمسّ عدّادات ما بعده.
DO $$ DECLARE r jsonb; BEGIN
  r := public.cert_issue(jsonb_build_object('halaqa_id', '14914914-dddd-0000-0000-000000000001', 'type_key', 'achievement',
    'design', current_setting('zen.cs_design')::jsonb, 'items', '[{"student_id":"14914914-5555-0000-0000-000000000002"}]'::jsonb));
  RAISE EXCEPTION 'SUP_ISSUED %', r::text;
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('cs supervisor issue: ' || CASE WHEN SQLERRM LIKE 'SUP_ISSUED %ZEN-%' THEN 'ok' ELSE 'FAILED ' || SQLERRM END);
END $$;
DO $$ DECLARE r jsonb; BEGIN
  r := public.cert_issue(jsonb_build_object('halaqa_id', '14914914-dddd-0000-0000-000000000001', 'type_key', 'distinction',
    'design', current_setting('zen.cs_design')::jsonb, 'items', '[{"student_id":"14914914-5555-0000-0000-000000000002","override":true}]'::jsonb));
  -- 1.24.0: التجاوز من غير المدير لا يُرفض ولا يصدر: ينتظر الاعتماد بلا رقم (يُتراجع عنه هنا).
  RAISE EXCEPTION 'OVR %', r->'certificates'->0->>'status' || '/' || COALESCE(r->'certificates'->0->>'certificate_number', '-');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('cs supervisor override: ' || CASE WHEN SQLERRM = 'OVR pending/-' THEN 'pending' ELSE 'FAILED ' || SQLERRM END);
END $$;
INSERT INTO public._t SELECT 'cs supervisor context: ' || CASE WHEN EXISTS (
  SELECT 1 FROM jsonb_array_elements(public.cert_studio_context()->'halaqat') h
   WHERE h->>'id' = '14914914-dddd-0000-0000-000000000001' AND (h->>'can_issue')::boolean)
  THEN 'ok' ELSE 'FAILED' END;
INSERT INTO public._t SELECT 'cs supervisor reads: ' || CASE WHEN (public.cert_list('{"center_id":"14914914-cccc-0000-0000-000000000001"}')->>'total')::int >= 1 THEN 'ok' ELSE 'FAILED' END;
SET "request.jwt.claim.sub" = '14914914-0000-0000-0000-000000000002';
DO $$ BEGIN
  PERFORM public.cert_issue(jsonb_build_object('halaqa_id', '14914914-dddd-0000-0000-000000000001', 'type_key', 'achievement',
    'design', current_setting('zen.cs_design')::jsonb, 'items', '[{"student_id":"14914914-6666-0000-0000-000000000001"}]'::jsonb));
  INSERT INTO public._t VALUES ('cs foreign student: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('cs foreign student: ' || CASE WHEN SQLERRM LIKE '%NOT_IN_HALAQA%' THEN 'rejected' ELSE 'FAILED ' || SQLERRM END);
END $$;
DO $$ DECLARE r jsonb; BEGIN
  r := public.cert_issue(jsonb_build_object('halaqa_id', '14914914-dddd-0000-0000-000000000001', 'type_key', 'distinction',
    'design', current_setting('zen.cs_design')::jsonb, 'items', '[{"student_id":"14914914-5555-0000-0000-000000000002","override":true}]'::jsonb));
  -- 1.24.0: التجاوز من غير المدير لا يُرفض ولا يصدر: ينتظر الاعتماد بلا رقم (يُتراجع عنه هنا).
  RAISE EXCEPTION 'OVR %', r->'certificates'->0->>'status' || '/' || COALESCE(r->'certificates'->0->>'certificate_number', '-');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('cs teacher override: ' || CASE WHEN SQLERRM = 'OVR pending/-' THEN 'pending' ELSE 'FAILED ' || SQLERRM END);
END $$;
DO $$ BEGIN
  PERFORM public.cert_issue(jsonb_build_object('halaqa_id', '14914914-dddd-0000-0000-000000000001', 'type_key', 'no_such_type',
    'design', current_setting('zen.cs_design')::jsonb, 'items', '[{"student_id":"14914914-5555-0000-0000-000000000002"}]'::jsonb));
  INSERT INTO public._t VALUES ('cs unknown type: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('cs unknown type: ' || CASE WHEN SQLERRM LIKE '%UNKNOWN_TYPE%' THEN 'rejected' ELSE 'FAILED ' || SQLERRM END);
END $$;
DO $$ BEGIN
  PERFORM public.cert_issue(jsonb_build_object('halaqa_id', '14914914-dddd-0000-0000-000000000001', 'type_key', 'achievement',
    'design', '{"elements":[{"type":"image","src":"brand:logo"}]}'::jsonb, 'items', '[{"student_id":"14914914-5555-0000-0000-000000000002"}]'::jsonb));
  INSERT INTO public._t VALUES ('cs unresolved brand: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('cs unresolved brand: ' || CASE WHEN SQLERRM LIKE '%UNRESOLVED_BRAND%' THEN 'rejected' ELSE 'FAILED ' || SQLERRM END);
END $$;
DO $$ BEGIN
  PERFORM public.cert_issue(jsonb_build_object('halaqa_id', '14914914-dddd-0000-0000-000000000001', 'type_key', 'achievement',
    'design', jsonb_build_object('elements', jsonb_build_array(jsonb_build_object('type', 'image', 'src',
      'asset:00000000-0000-0000-0000-000000000000'))),
    'items', '[{"student_id":"14914914-5555-0000-0000-000000000002"}]'::jsonb));
  INSERT INTO public._t VALUES ('cs foreign asset: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('cs foreign asset: ' || CASE WHEN SQLERRM LIKE '%FOREIGN_ASSET%' THEN 'rejected' ELSE 'FAILED ' || SQLERRM END);
END $$;
-- المدير يتجاوز الشرط ويُسجَّل التجاوز في اللقطة.
SET "request.jwt.claim.sub" = '14914914-0000-0000-0000-000000000005';
SELECT set_config('zen.cs_ovr', public.cert_issue(jsonb_build_object('halaqa_id', '14914914-dddd-0000-0000-000000000001', 'type_key', 'distinction',
    'design', current_setting('zen.cs_design')::jsonb, 'items', '[{"student_id":"14914914-5555-0000-0000-000000000003","override":true}]'::jsonb))->'certificates'->0->>'id', false);
INSERT INTO public._t SELECT 'cs manager override: ' || CASE WHEN (public.cert_get(current_setting('zen.cs_ovr')::uuid)->'snapshot'->>'override')::boolean
  THEN 'ok' ELSE 'FAILED' END;
-- v2 للقالب لا يغيّر الشهادة الصادرة بـ v1.
SET "request.jwt.claim.sub" = '14914914-0000-0000-0000-000000000001';
INSERT INTO public._t SELECT 'cs template v2: ' || CASE WHEN (public.cert_save_template(jsonb_build_object('id', current_setting('zen.cs_tpl'),
    'design', '{"page":{"size":"A4"},"elements":[{"id":"t","type":"text","text":"الإصدار الثاني"}]}'::jsonb), true)->>'version')::int = 2
  THEN 'ok' ELSE 'FAILED' END;
INSERT INTO public._t SELECT 'cs v1 unchanged: ' || CASE WHEN g->'design'->'elements'->0->>'text' = 'الإصدار الأول {{student.name}}' THEN 'ok' ELSE 'FAILED ' || (g->'design')::text END
  FROM (SELECT public.cert_get(current_setting('zen.cs_id')::uuid) AS g) x;
-- الطالب يرى شهادته الصادرة، ولا يرى غيره.
SET "request.jwt.claim.sub" = '14914914-5555-0000-0000-000000000001';
INSERT INTO public._t SELECT 'cs student own: ' || CASE WHEN (public.cert_list('{}')->>'total')::int = 1
  AND public.cert_get(current_setting('zen.cs_id')::uuid)->>'student_name' IS NOT NULL THEN 'ok' ELSE 'FAILED' END;
INSERT INTO public._t SELECT 'cs student notified: ' || CASE WHEN EXISTS (SELECT 1 FROM public.notifications
  WHERE user_id = '14914914-5555-0000-0000-000000000001' AND kind = 'certificate') THEN 'ok' ELSE 'FAILED' END;
SET "request.jwt.claim.sub" = '14914914-5555-0000-0000-000000000002';
DO $$ BEGIN
  PERFORM public.cert_get(current_setting('zen.cs_id')::uuid);
  INSERT INTO public._t VALUES ('cs other student get: LEAKED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('cs other student get: rejected');
END $$;
DO $$ BEGIN
  INSERT INTO public.certificates (student_id, source, status, student_name) VALUES ('14914914-5555-0000-0000-000000000002', 'studio', 'issued', 'x');
  INSERT INTO public._t VALUES ('cs client insert: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('cs client insert: rejected');
END $$;
RESET ROLE;
RESET "request.jwt.claim.sub";
-- الصادرة لا تُعدَّل حتى من الخادم، ولا تُعاد إلى مسودة.
DO $$ BEGIN
  UPDATE public.certificates SET student_name = 'تعديل صامت' WHERE id = current_setting('zen.cs_id')::uuid;
  INSERT INTO public._t VALUES ('cs immutable name: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('cs immutable name: ' || CASE WHEN SQLERRM LIKE '%CERTIFICATE_IMMUTABLE%' THEN 'rejected' ELSE 'FAILED ' || SQLERRM END);
END $$;
DO $$ BEGIN
  UPDATE public.certificates SET status = 'draft' WHERE id = current_setting('zen.cs_id')::uuid;
  INSERT INTO public._t VALUES ('cs immutable status: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('cs immutable status: ' || CASE WHEN SQLERRM LIKE '%CERTIFICATE_IMMUTABLE%' THEN 'rejected' ELSE 'FAILED ' || SQLERRM END);
END $$;
DO $$ BEGIN
  UPDATE public.certificate_designs SET design = '{}'::jsonb WHERE id = (SELECT design_id FROM public.certificates WHERE id = current_setting('zen.cs_id')::uuid);
  INSERT INTO public._t VALUES ('cs design immutable: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('cs design immutable: ' || CASE WHEN SQLERRM LIKE '%DESIGN_IMMUTABLE%' THEN 'rejected' ELSE 'FAILED ' || SQLERRM END);
END $$;
SET ROLE anon;
DO $$ BEGIN
  PERFORM public.cert_list('{}');
  INSERT INTO public._t VALUES ('cs anon: ALLOWED!');
EXCEPTION WHEN insufficient_privilege THEN INSERT INTO public._t VALUES ('cs anon: rejected');
END $$;
RESET ROLE;
SELECT code FROM public._t WHERE code LIKE 'cs %' ORDER BY code;

-- @@ 151. استوديو الشهائد 3: دفعة 30 طالباً — مسودة ثم جاهزة ثم إصدار، لكل طالب رقمه ورمزه وبياناته دون اختلاط
DELETE FROM public._t;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '14914914-0000-0000-0000-000000000002';
DO $$ BEGIN
  PERFORM public.cert_issue(jsonb_build_object('halaqa_id', '14914914-dddd-0000-0000-000000000001', 'type_key', 'attendance',
    'design', '{"elements":[]}'::jsonb,
    'items', '[{"student_id":"14914914-5555-0000-0000-000000000002"},{"student_id":"14914914-5555-0000-0000-000000000002"}]'::jsonb));
  INSERT INTO public._t VALUES ('cb duplicate student: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('cb duplicate student: ' || CASE WHEN SQLERRM LIKE '%DUPLICATE_STUDENT%' THEN 'rejected' ELSE 'FAILED ' || SQLERRM END);
END $$;
SELECT set_config('zen.cb_batch', public.cert_issue(jsonb_build_object('halaqa_id', '14914914-dddd-0000-0000-000000000001',
  'type_key', 'attendance', 'status', 'draft', 'period_from', '2026-01-01', 'period_to', '2026-06-30',
  'design', '{"page":{"size":"A4"},"elements":[{"id":"n","type":"text","text":"{{student.name}}"}]}'::jsonb,
  'items', (SELECT jsonb_agg(jsonb_build_object('student_id', id, 'vars', jsonb_build_object('attendance', jsonb_build_object('rate', '9' || right(id::text, 1) || '٪'))) ORDER BY id)
              FROM auth.users WHERE id::text LIKE '14914914-5555-%')))->>'batch_id', false);
-- إعادة حفظ المسودة تستبدل صفوفها (حفظ تلقائي) دون تكرار.
SELECT public.cert_issue(jsonb_build_object('halaqa_id', '14914914-dddd-0000-0000-000000000001', 'batch_id', current_setting('zen.cb_batch'),
  'type_key', 'attendance', 'status', 'draft', 'period_from', '2026-01-01', 'period_to', '2026-06-30',
  'design', '{"page":{"size":"A4"},"elements":[{"id":"n","type":"text","text":"{{student.name}} — حضور"}]}'::jsonb,
  'items', (SELECT jsonb_agg(jsonb_build_object('student_id', id, 'vars', jsonb_build_object('attendance', jsonb_build_object('rate', '9' || right(id::text, 1) || '٪'))) ORDER BY id)
              FROM auth.users WHERE id::text LIKE '14914914-5555-%')));
INSERT INTO public._t SELECT 'cb drafts: ' || CASE WHEN count(*) = 30 AND bool_and(certificate_number IS NULL) AND bool_and(status = 'draft') THEN 'ok' ELSE 'FAILED ' || count(*) END
  FROM public.certificates WHERE batch_id = current_setting('zen.cb_batch')::uuid;
INSERT INTO public._t SELECT 'cb resume: ' || CASE WHEN jsonb_array_length(b->'items') = 30 AND b->'design'->'elements'->0->>'text' = '{{student.name}} — حضور' THEN 'ok' ELSE 'FAILED' END
  FROM (SELECT public.cert_batch(current_setting('zen.cb_batch')::uuid) AS b) x;
INSERT INTO public._t SELECT 'cb ready: ' || CASE WHEN public.cert_mark_ready(current_setting('zen.cb_batch')::uuid) = 30 THEN 'ok' ELSE 'FAILED' END;
-- الطالب لا يرى مسودته (لا عبر الدالة ولا الجدول).
SET "request.jwt.claim.sub" = '14914914-5555-0000-0000-000000000005';
INSERT INTO public._t SELECT 'cb student no draft: ' || CASE WHEN (public.cert_list('{"status":"all"}')->>'total')::int = 0
  AND (SELECT count(*) FROM public.certificates WHERE batch_id = current_setting('zen.cb_batch')::uuid) = 0 THEN 'ok' ELSE 'LEAKED!' END;
SET "request.jwt.claim.sub" = '14914914-0000-0000-0000-000000000006';
DO $$ BEGIN
  PERFORM public.cert_finalize(current_setting('zen.cb_batch')::uuid, NULL);
  INSERT INTO public._t VALUES ('cb other teacher finalize: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('cb other teacher finalize: ' || CASE WHEN SQLERRM LIKE '%NOT_ALLOWED%' THEN 'rejected' ELSE 'FAILED ' || SQLERRM END);
END $$;
-- 1.24.0: شرط «شهادة حضور» يُفحص في الخادم؛ الطلاب حاضرون يوماً فتصدر مباشرة (بلا حضور: بانتظار الاعتماد، فحص 171).
RESET ROLE;
INSERT INTO public.attendance (student_id, halaqa_id, teacher_id, session_date, status)
SELECT hs.student_id, hs.halaqa_id, '14914914-0000-0000-0000-000000000002', public.zen_today() - 1, 'present'
  FROM public.halaqa_students hs WHERE hs.halaqa_id = '14914914-dddd-0000-0000-000000000001'
ON CONFLICT DO NOTHING;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '14914914-0000-0000-0000-000000000002';
INSERT INTO public._t SELECT 'cb finalize: ' || CASE WHEN jsonb_array_length(r->'certificates') = 30
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(r->'certificates') x WHERE x->>'status' <> 'issued')
  THEN 'ok' ELSE 'FAILED ' || r::text END
  FROM (SELECT public.cert_finalize(current_setting('zen.cb_batch')::uuid, NULL) AS r) x;
RESET ROLE;
RESET "request.jwt.claim.sub";
INSERT INTO public._t SELECT 'cb unique numbers: ' || CASE WHEN count(DISTINCT certificate_number) = 30 AND count(DISTINCT verify_code) = 30
    AND bool_and(status = 'issued') AND bool_and(snapshot->'vars'->'certificate'->>'number' = certificate_number) THEN 'ok' ELSE 'FAILED' END
  FROM public.certificates WHERE batch_id = current_setting('zen.cb_batch')::uuid;
-- لا اختلاط: اسم كل لقطة ونسبة حضوره لطالبها هو.
INSERT INTO public._t SELECT 'cb no mixing: ' || CASE WHEN count(*) = 30 AND bool_and(
      c.snapshot->'vars'->'student'->>'name' = p.name AND c.student_name = p.name
      AND c.snapshot->'vars'->'attendance'->>'rate' = '9' || right(c.student_id::text, 1) || '٪')
    AND count(DISTINCT c.snapshot->'vars'->'student'->>'name') = 30 THEN 'ok' ELSE 'MIXED FAILED' END
  FROM public.certificates c JOIN public.profiles p ON p.id = c.student_id
 WHERE c.batch_id = current_setting('zen.cb_batch')::uuid;
INSERT INTO public._t SELECT 'cb one design: ' || CASE WHEN count(DISTINCT design_id) = 1 THEN 'ok' ELSE 'FAILED' END
  FROM public.certificates WHERE batch_id = current_setting('zen.cb_batch')::uuid;
SELECT set_config('zen.cb_num', (SELECT certificate_number FROM public.certificates
  WHERE batch_id = current_setting('zen.cb_batch')::uuid ORDER BY certificate_number LIMIT 1), false);
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '14914914-0000-0000-0000-000000000001';
INSERT INTO public._t SELECT 'cb stats: ' || CASE WHEN (s->>'issued')::int >= 31 AND (s->>'month')::int >= 31 AND (s->>'year')::int >= 31
    AND s->'by_type' @> '[{"key":"attendance","count":30}]' THEN 'ok' ELSE 'FAILED ' || s::text END
  FROM (SELECT public.cert_stats('14914914-cccc-0000-0000-000000000001', NULL) AS s) x;
INSERT INTO public._t SELECT 'cb search number: ' || CASE WHEN (public.cert_list(jsonb_build_object('q', current_setting('zen.cb_num')))->>'total')::int = 1
  THEN 'ok' ELSE 'FAILED' END;
DO $$ BEGIN
  PERFORM public.cert_issue(jsonb_build_object('halaqa_id', '14914914-dddd-0000-0000-000000000001', 'batch_id', current_setting('zen.cb_batch'),
    'type_key', 'attendance', 'status', 'draft', 'design', '{"elements":[]}'::jsonb, 'items', '[{"student_id":"14914914-5555-0000-0000-000000000002"}]'::jsonb));
  INSERT INTO public._t VALUES ('cb issued batch locked: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('cb issued batch locked: ' || CASE WHEN SQLERRM LIKE '%BATCH_LOCKED%' THEN 'rejected' ELSE 'FAILED ' || SQLERRM END);
END $$;
RESET ROLE;
RESET "request.jwt.claim.sub";
SELECT code FROM public._t WHERE code LIKE 'cb %' ORDER BY code;

-- @@ 152. استوديو الشهائد 4: التحقق صحيحة/ملغاة/غير موجودة، والإلغاء بسبب دون حذف، وإعادة الإصدار برقم جديد، وسجل التدقيق
DELETE FROM public._t;
DELETE FROM public.certificate_verify_attempts;
SELECT set_config('zen.cv_id', (SELECT id::text FROM public.certificates WHERE source = 'studio'
  AND student_id = '14914914-5555-0000-0000-000000000001' AND type_key = 'achievement'), false);
SELECT set_config('zen.cv_code', (SELECT verify_code FROM public.certificates WHERE id = current_setting('zen.cv_id')::uuid), false);
SELECT set_config('zen.cv_num', (SELECT certificate_number FROM public.certificates WHERE id = current_setting('zen.cv_id')::uuid), false);
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '14914914-0000-0000-0000-000000000003';
INSERT INTO public._t SELECT 'cv valid: ' || CASE WHEN r->>'status' = 'valid' AND r->>'certificate_number' = current_setting('zen.cv_num')
    AND r->>'student_name' = 'عبدالرحمن بن عبدالله آل إبراهيم المؤمَّن' AND r->>'type_name' = 'شهادة إنجاز'
    AND r->>'center_name' = 'مركز الشهائد' AND r->>'halaqa_name' = 'حلقة الشهائد'
    AND NOT r ? 'student_id' AND NOT r ? 'id' AND NOT r ? 'snapshot' AND NOT r ? 'teacher_id' THEN 'ok' ELSE 'FAILED ' || r::text END
  FROM (SELECT public.verify_certificate(current_setting('zen.cv_code')) AS r) x;
INSERT INTO public._t SELECT 'cv not found: ' || CASE WHEN public.verify_certificate('ABCDEFGHJKLMNPQR')->>'status' = 'invalid' THEN 'ok' ELSE 'FAILED' END;
-- معلّم حلقة أخرى لا يلغي، ولا إلغاء بلا سبب.
SET "request.jwt.claim.sub" = '14914914-0000-0000-0000-000000000006';
DO $$ BEGIN
  PERFORM public.cert_revoke(current_setting('zen.cv_id')::uuid, 'سبب كافٍ');
  INSERT INTO public._t VALUES ('cv other teacher revoke: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('cv other teacher revoke: ' || CASE WHEN SQLERRM LIKE '%NOT_ALLOWED%' THEN 'rejected' ELSE 'FAILED ' || SQLERRM END);
END $$;
SET "request.jwt.claim.sub" = '14914914-0000-0000-0000-000000000004';
DO $$ BEGIN
  PERFORM public.cert_revoke(current_setting('zen.cv_id')::uuid, 'سبب كافٍ');
  INSERT INTO public._t VALUES ('cv supervisor revoke: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('cv supervisor revoke: ' || CASE WHEN SQLERRM LIKE '%NOT_ALLOWED%' THEN 'rejected' ELSE 'FAILED ' || SQLERRM END);
END $$;
SET "request.jwt.claim.sub" = '14914914-0000-0000-0000-000000000002';
DO $$ BEGIN
  PERFORM public.cert_revoke(current_setting('zen.cv_id')::uuid, '  ');
  INSERT INTO public._t VALUES ('cv no reason: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('cv no reason: ' || CASE WHEN SQLERRM LIKE '%REASON_REQUIRED%' THEN 'rejected' ELSE 'FAILED ' || SQLERRM END);
END $$;
SELECT public.cert_revoke(current_setting('zen.cv_id')::uuid, 'خطأ في نوع الإنجاز');
INSERT INTO public._t SELECT 'cv revoked: ' || CASE WHEN r->>'status' = 'revoked' AND r->>'revoked_at' IS NOT NULL
    AND r->>'certificate_number' = current_setting('zen.cv_num') THEN 'ok' ELSE 'FAILED ' || r::text END
  FROM (SELECT public.verify_certificate(current_setting('zen.cv_code')) AS r) x;
DO $$ BEGIN
  PERFORM public.cert_revoke(current_setting('zen.cv_id')::uuid, 'مرة ثانية');
  INSERT INTO public._t VALUES ('cv revoke twice: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('cv revoke twice: ' || CASE WHEN SQLERRM LIKE '%NOT_ISSUED%' THEN 'rejected' ELSE 'FAILED ' || SQLERRM END);
END $$;
-- إعادة الإصدار: شهادة جديدة برقم جديد تشير للقديمة، والقديمة تبقى ملغاة كما هي.
-- (1.24.0) «إتمام سورة» يُفحص في الخادم: الطالب سمّع البقرة كاملة تسميعاً معتمداً.
RESET ROLE;
INSERT INTO public.recitation_sessions (student_id, surah_name, from_ayah, to_ayah, kind, status)
VALUES ('14914914-5555-0000-0000-000000000001', 'البقرة', 1, 286, 'memorize', 'approved');
SET ROLE authenticated;
SELECT set_config('zen.cv_new', public.cert_issue(jsonb_build_object('halaqa_id', '14914914-dddd-0000-0000-000000000001',
  'type_key', 'surah_complete', 'replaces_id', current_setting('zen.cv_id'),
  'design', '{"page":{"size":"A4"},"elements":[{"id":"t","type":"text","text":"مصحَّحة"}]}'::jsonb,
  'items', '[{"student_id":"14914914-5555-0000-0000-000000000001","achievement_ref":{"kind":"surah","surah":2}}]'::jsonb))->'certificates'->0->>'id', false);
INSERT INTO public._t SELECT 'cv reissue: ' || CASE WHEN n->>'certificate_number' <> current_setting('zen.cv_num')
    AND n->>'replaces_id' = current_setting('zen.cv_id') AND n->>'status' = 'issued'
    AND o->>'status' = 'revoked' AND o->>'replaced_by' = current_setting('zen.cv_new')
    AND o->'design'->'elements'->0->>'text' = 'الإصدار الأول {{student.name}}' AND o->>'revoke_reason' = 'خطأ في نوع الإنجاز'
  THEN 'ok' ELSE 'FAILED' END
  FROM (SELECT public.cert_get(current_setting('zen.cv_new')::uuid) AS n, public.cert_get(current_setting('zen.cv_id')::uuid) AS o) x;
-- الأرشفة لا تمحو الإلغاء: التحقق يبقى «ملغاة».
SELECT public.cert_archive(current_setting('zen.cv_id')::uuid);
-- (1.22.0) ولأنها استُبدلت: «replaced» برقم البديلة، وعلامة الأرشفة ظاهرة.
INSERT INTO public._t SELECT 'cv archived still revoked: ' || CASE WHEN v->>'status' = 'replaced' AND (v->>'archived')::boolean
    AND v->>'replaced_by' IS NOT NULL THEN 'ok' ELSE 'FAILED ' || v::text END
  FROM (SELECT public.verify_certificate(current_setting('zen.cv_code')) AS v) x;
-- رمز المسودة لا يُتحقق منه.
SELECT set_config('zen.cv_draft', public.cert_issue(jsonb_build_object('halaqa_id', '14914914-dddd-0000-0000-000000000001',
  'type_key', 'participation', 'status', 'draft', 'design', '{"elements":[]}'::jsonb,
  'items', '[{"student_id":"14914914-5555-0000-0000-000000000004"}]'::jsonb))->>'batch_id', false);
INSERT INTO public._t SELECT 'cv draft hidden: ' || CASE WHEN public.verify_certificate(
    (SELECT verify_code FROM public.certificates WHERE batch_id = current_setting('zen.cv_draft')::uuid))->>'status' = 'invalid' THEN 'ok' ELSE 'LEAKED!' END;
INSERT INTO public._t SELECT 'cv discard draft: ' || CASE WHEN public.cert_discard_drafts(current_setting('zen.cv_draft')::uuid) = 1 THEN 'ok' ELSE 'FAILED' END;
SET "request.jwt.claim.sub" = '14914914-0000-0000-0000-000000000001';
INSERT INTO public._t SELECT 'cv audit: ' || CASE WHEN (SELECT count(DISTINCT e->>'action') FROM jsonb_array_elements(public.cert_audit_log('14914914-cccc-0000-0000-000000000001', 200)) e
   WHERE e->>'action' IN ('certificate.issue', 'certificate.batch_issue', 'certificate.revoke', 'certificate.reissue', 'certificate.draft', 'certificate.archive', 'certificate.discard')) = 7
  THEN 'ok' ELSE 'FAILED' END;
SET "request.jwt.claim.sub" = '14914914-0000-0000-0000-000000000003';
DO $$ BEGIN
  PERFORM public.cert_audit_log('14914914-cccc-0000-0000-000000000001', 10);
  INSERT INTO public._t VALUES ('cv outsider audit: LEAKED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('cv outsider audit: rejected');
END $$;
RESET ROLE;
RESET "request.jwt.claim.sub";
INSERT INTO public._t SELECT 'cv never deleted: ' || CASE WHEN EXISTS (SELECT 1 FROM public.certificates WHERE id = current_setting('zen.cv_id')::uuid
  AND revoked_by = '14914914-0000-0000-0000-000000000002') THEN 'ok' ELSE 'FAILED' END;
-- (1.23.0) والرابعة verify_certificate_public: التحقق العام بحدّ لكل IP واسم مختصر (فحص 170).
INSERT INTO public._t SELECT 'cv anon definers: ' || CASE WHEN count(*) = 4 THEN 'ok' ELSE 'FAILED ' || count(*) END
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.prosecdef AND has_function_privilege('anon', p.oid, 'EXECUTE');
DELETE FROM public.certificate_verify_attempts;
DELETE FROM public.certificates WHERE student_id::text LIKE '14914914-%';
DELETE FROM public.centers WHERE id::text LIKE '14914914-cccc-%';
DELETE FROM auth.users WHERE id::text LIKE '14914914-%';
SELECT code FROM public._t WHERE code LIKE 'cv %' ORDER BY code;

-- @@ 153. دقة الإدخال 1: تعديل يوم بعد إغلاقه يُسجَّل بمن وقبل وبعد (لقطة واحدة للطالب في العملية)، وإعادة الفتح والإغلاق حدثان، والإدخال العادي لا يُسجَّل، والقراءة للحلقة ومركزها فقط
DELETE FROM public._t;
INSERT INTO auth.users (id, phone, raw_user_meta_data) VALUES
 ('15315315-0000-0000-0000-000000000001','+967700153001','{"name":"صاحب مركز التدقيق"}'),
 ('15315315-0000-0000-0000-000000000002','+967700153002','{"name":"معلّم التدقيق"}'),
 ('15315315-0000-0000-0000-000000000003','+967700153003','{"name":"معلّم غريب"}'),
 ('15315315-0000-0000-0000-000000000004','+967700153004','{"name":"مشرف التدقيق"}'),
 ('15315315-0000-0000-0000-00000000000a','+967700153010','{"name":"أحمد"}'),
 ('15315315-0000-0000-0000-00000000000b','+967700153011','{"name":"بلال"}');
INSERT INTO public.user_roles (user_id, role) VALUES
 ('15315315-0000-0000-0000-000000000001','teacher'), ('15315315-0000-0000-0000-000000000002','teacher'),
 ('15315315-0000-0000-0000-000000000003','teacher')
ON CONFLICT DO NOTHING;
INSERT INTO public.centers (id, name, created_by)
VALUES ('15315315-0000-0000-0000-0000000000cc', 'مركز التدقيق', '15315315-0000-0000-0000-000000000001');
INSERT INTO public.center_staff (center_id, user_id, role)
VALUES ('15315315-0000-0000-0000-0000000000cc', '15315315-0000-0000-0000-000000000004', 'supervisor');
INSERT INTO public.halaqat (id, center_id, name, teacher_id)
VALUES ('15315315-0000-0000-0000-0000000000aa', '15315315-0000-0000-0000-0000000000cc', 'حلقة التدقيق', '15315315-0000-0000-0000-000000000002');
INSERT INTO public.halaqa_students (halaqa_id, student_id) VALUES
 ('15315315-0000-0000-0000-0000000000aa', '15315315-0000-0000-0000-00000000000a'),
 ('15315315-0000-0000-0000-0000000000aa', '15315315-0000-0000-0000-00000000000b');
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '15315315-0000-0000-0000-000000000002';
SELECT set_config('zen.a1', (public.open_daily_record('15315315-0000-0000-0000-0000000000aa', public.zen_today()) ->> 'id'), false);
SELECT public.set_daily_attendance(current_setting('zen.a1')::uuid, '15315315-0000-0000-0000-00000000000a', 'present', NULL, 0);
SELECT public.save_daily_entry(current_setting('zen.a1')::uuid, '15315315-0000-0000-0000-00000000000a',
  '{"memorize":{"segments":[{"surah_name":"الملك","from_ayah":1,"to_ayah":10}],"grade":4}}', 1);
SELECT public.set_daily_attendance(current_setting('zen.a1')::uuid, '15315315-0000-0000-0000-00000000000b', 'present', NULL, 0);
-- البقرة 1–100: أكثر من 5 صفحات في يوم.
SELECT public.save_daily_entry(current_setting('zen.a1')::uuid, '15315315-0000-0000-0000-00000000000b',
  '{"memorize":{"segments":[{"surah_name":"البقرة","from_ayah":1,"to_ayah":100}],"grade":3}}', 1);
RESET ROLE;
INSERT INTO public._t SELECT 'au open day not audited: ' || CASE WHEN NOT EXISTS (SELECT 1 FROM public.daily_record_audit
  WHERE halaqa_id = '15315315-0000-0000-0000-0000000000aa') THEN 'ok' ELSE 'FAILED' END;
SET ROLE authenticated;
SELECT public.complete_daily_record(current_setting('zen.a1')::uuid,
  (SELECT version FROM public.halaqa_daily_records WHERE id = current_setting('zen.a1')::uuid));
SELECT public.reopen_daily_record(current_setting('zen.a1')::uuid,
  (SELECT version FROM public.halaqa_daily_records WHERE id = current_setting('zen.a1')::uuid));
SELECT public.set_daily_attendance(current_setting('zen.a1')::uuid, '15315315-0000-0000-0000-00000000000a', 'late', NULL,
  (SELECT version FROM public.halaqa_register_entries WHERE student_id = '15315315-0000-0000-0000-00000000000a'));
SELECT public.save_daily_entry(current_setting('zen.a1')::uuid, '15315315-0000-0000-0000-00000000000a',
  '{"memorize":{"segments":[{"surah_name":"الملك","from_ayah":1,"to_ayah":10}],"grade":5,"error_type":"tajweed"}}',
  (SELECT version FROM public.halaqa_register_entries WHERE student_id = '15315315-0000-0000-0000-00000000000a'));
SELECT public.complete_daily_record(current_setting('zen.a1')::uuid,
  (SELECT version FROM public.halaqa_daily_records WHERE id = current_setting('zen.a1')::uuid));
RESET ROLE;
INSERT INTO public._t SELECT 'au first close kept: ' || CASE WHEN first_completed_at IS NOT NULL AND first_completed_at <= completed_at
  THEN 'ok' ELSE 'FAILED' END FROM public.halaqa_daily_records WHERE id = current_setting('zen.a1')::uuid;
INSERT INTO public._t SELECT 'au edit snapshot: ' || CASE WHEN count(*) = 1
    AND bool_and(before ->> 'status' = 'present' AND after ->> 'status' = 'late'
                 AND (before -> 'memorize' ->> 'score')::int = public.grade_to_score(4)
                 AND (after -> 'memorize' ->> 'score')::int = public.grade_to_score(5)
                 AND after -> 'memorize' ->> 'error_type' = 'tajweed'
                 AND actor_id = '15315315-0000-0000-0000-000000000002')
  THEN 'ok' ELSE 'FAILED ' || count(*) END
  FROM public.daily_record_audit WHERE action = 'edit' AND student_id = '15315315-0000-0000-0000-00000000000a';
INSERT INTO public._t SELECT 'au untouched student: ' || CASE WHEN NOT EXISTS (SELECT 1 FROM public.daily_record_audit
  WHERE student_id = '15315315-0000-0000-0000-00000000000b') THEN 'ok' ELSE 'FAILED' END;
INSERT INTO public._t SELECT 'au reopen events: ' || CASE WHEN
  (SELECT count(*) FROM public.daily_record_audit WHERE record_id = current_setting('zen.a1')::uuid AND action = 'reopen') = 1
  AND (SELECT count(*) FROM public.daily_record_audit WHERE record_id = current_setting('zen.a1')::uuid AND action = 'recomplete') = 1
  THEN 'ok' ELSE 'FAILED' END;
INSERT INTO public._t SELECT 'au no direct read: ' || CASE WHEN has_table_privilege('authenticated', 'public.daily_record_audit', 'SELECT')
  OR has_table_privilege('authenticated', 'public.daily_record_reviews', 'SELECT') THEN 'LEAKED!' ELSE 'ok' END;
SET ROLE authenticated;
INSERT INTO public._t SELECT 'au teacher list: ' || CASE WHEN jsonb_array_length(l) = 3
    AND l -> 0 ->> 'action' = 'recomplete'
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(l) e WHERE e ->> 'action' = 'edit' AND e ->> 'actor_name' = 'معلّم التدقيق'
                AND e ->> 'student_name' = 'أحمد')
  THEN 'ok' ELSE 'FAILED ' || l::text END
  FROM (SELECT public.daily_record_audit_list('15315315-0000-0000-0000-0000000000aa') AS l) x;
INSERT INTO public._t SELECT 'au student filter: ' || CASE WHEN jsonb_array_length(public.daily_record_audit_list(
  '15315315-0000-0000-0000-0000000000aa', '15315315-0000-0000-0000-00000000000a')) = 1 THEN 'ok' ELSE 'FAILED' END;
INSERT INTO public._t SELECT 'au student page: ' || CASE WHEN jsonb_array_length(public.daily_record_audit_list(
  NULL, '15315315-0000-0000-0000-00000000000a')) = 1 THEN 'ok' ELSE 'FAILED' END;
SET "request.jwt.claim.sub" = '15315315-0000-0000-0000-000000000004';
INSERT INTO public._t SELECT 'au supervisor list: ' || CASE WHEN jsonb_array_length(public.daily_record_audit_list(
  '15315315-0000-0000-0000-0000000000aa')) = 3 THEN 'ok' ELSE 'FAILED' END;
SET "request.jwt.claim.sub" = '15315315-0000-0000-0000-000000000003';
INSERT INTO public._t SELECT 'au outsider student page: ' || CASE WHEN jsonb_array_length(public.daily_record_audit_list(
  NULL, '15315315-0000-0000-0000-00000000000a')) = 0 THEN 'ok' ELSE 'LEAKED!' END;
DO $$ BEGIN
  PERFORM public.daily_record_audit_list('15315315-0000-0000-0000-0000000000aa');
  INSERT INTO public._t VALUES ('au outsider list: LEAKED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('au outsider list: rejected');
END $$;
SET "request.jwt.claim.sub" = '15315315-0000-0000-0000-00000000000a';
DO $$ BEGIN
  PERFORM public.daily_record_anomalies('15315315-0000-0000-0000-0000000000aa');
  INSERT INTO public._t VALUES ('au student anomalies: LEAKED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('au student anomalies: rejected');
END $$;
RESET ROLE;
RESET "request.jwt.claim.sub";
SELECT code FROM public._t WHERE code LIKE 'au %' ORDER BY code;

-- @@ 154. دقة الإدخال 2: المراقب — أكثر من 5 صفحات، و«ممتاز» مع خطأ، وتعديلات بعد الإغلاق؛ وجودة الإدخال في لوحة المركز؛ وعيّنة أسبوعية ثابتة للمشرف، و«يحتاج تصحيحاً» بسبب يُشعر المعلّم
DELETE FROM public._t;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '15315315-0000-0000-0000-000000000002';
SELECT set_config('zen.an', public.daily_record_anomalies('15315315-0000-0000-0000-0000000000aa', 30)::text, false);
INSERT INTO public._t SELECT 'an pages spike: ' || CASE WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(current_setting('zen.an')::jsonb -> 'items') i
  WHERE i ->> 'code' = 'pages_spike' AND i ->> 'student_id' = '15315315-0000-0000-0000-00000000000b'
    AND (i -> 'detail' ->> 'pages')::int > 5) THEN 'ok' ELSE 'FAILED ' || current_setting('zen.an') END;
INSERT INTO public._t SELECT 'an normal not spike: ' || CASE WHEN NOT EXISTS (SELECT 1 FROM jsonb_array_elements(current_setting('zen.an')::jsonb -> 'items') i
  WHERE i ->> 'code' = 'pages_spike' AND i ->> 'student_id' = '15315315-0000-0000-0000-00000000000a') THEN 'ok' ELSE 'FAILED' END;
INSERT INTO public._t SELECT 'an perfect with mistakes: ' || CASE WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(current_setting('zen.an')::jsonb -> 'items') i
  WHERE i ->> 'code' = 'perfect_with_mistakes' AND i ->> 'student_id' = '15315315-0000-0000-0000-00000000000a'
    AND i -> 'detail' ->> 'error_type' = 'tajweed') THEN 'ok' ELSE 'FAILED' END;
INSERT INTO public._t SELECT 'an edits after close: ' || CASE WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(current_setting('zen.an')::jsonb -> 'items') i
  WHERE i ->> 'code' = 'edits_after_close' AND (i -> 'detail' ->> 'count')::int = 1) THEN 'ok' ELSE 'FAILED' END;
-- يوم مغلق قبل يومين لعيّنة الأسبوع.
SELECT set_config('zen.a2', (public.open_daily_record('15315315-0000-0000-0000-0000000000aa', public.zen_today() - 2) ->> 'id'), false);
SELECT public.set_daily_attendance(current_setting('zen.a2')::uuid, '15315315-0000-0000-0000-00000000000a', 'present', NULL, 0);
SELECT public.set_daily_attendance(current_setting('zen.a2')::uuid, '15315315-0000-0000-0000-00000000000b', 'absent', 'مرض', 0);
SELECT public.complete_daily_record(current_setting('zen.a2')::uuid,
  (SELECT version FROM public.halaqa_daily_records WHERE id = current_setting('zen.a2')::uuid));
DO $$ BEGIN
  PERFORM public.audit_sample('15315315-0000-0000-0000-0000000000aa');
  INSERT INTO public._t VALUES ('an teacher sample: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('an teacher sample: rejected');
END $$;
SET "request.jwt.claim.sub" = '15315315-0000-0000-0000-000000000004';
SELECT set_config('zen.s1', public.audit_sample('15315315-0000-0000-0000-0000000000aa')::text, false);
INSERT INTO public._t SELECT 'an sample: ' || CASE WHEN jsonb_array_length(s -> 'items') = 2
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(s -> 'items') i WHERE (i ->> 'date')::date >= public.zen_today())
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(s -> 'items') i WHERE i -> 'entry' ->> 'reason' = 'مرض')
  THEN 'ok' ELSE 'FAILED ' || s::text END FROM (SELECT current_setting('zen.s1')::jsonb AS s) x;
INSERT INTO public._t SELECT 'an sample stable: ' || CASE WHEN public.audit_sample('15315315-0000-0000-0000-0000000000aa')::text = current_setting('zen.s1')
  THEN 'ok' ELSE 'FAILED' END;
DO $$ BEGIN
  PERFORM public.review_audit_sample(current_setting('zen.a2')::uuid, '15315315-0000-0000-0000-00000000000a', false, '  ');
  INSERT INTO public._t VALUES ('an flag no reason: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('an flag no reason: ' || CASE WHEN SQLERRM = 'REASON_REQUIRED' THEN 'rejected' ELSE 'FAILED ' || SQLERRM END);
END $$;
SELECT public.review_audit_sample(current_setting('zen.a2')::uuid, '15315315-0000-0000-0000-00000000000a', false, 'كان متأخراً');
SELECT public.review_audit_sample(current_setting('zen.a2')::uuid, '15315315-0000-0000-0000-00000000000b', true, NULL);
INSERT INTO public._t SELECT 'an reviewed: ' || CASE WHEN (SELECT count(*) FROM jsonb_array_elements(public.audit_sample('15315315-0000-0000-0000-0000000000aa') -> 'items') i
  WHERE i -> 'review' IS NOT NULL AND i -> 'review' <> 'null'::jsonb) = 2 THEN 'ok' ELSE 'FAILED' END;
INSERT INTO public._t SELECT 'an quality: ' || CASE WHEN (h ->> 'edits_after_close')::int = 1 AND (h ->> 'warnings')::int >= 2
    AND h ->> 'teacher_name' = 'معلّم التدقيق' THEN 'ok' ELSE 'FAILED ' || h::text END
  FROM jsonb_array_elements(public.center_record_quality('15315315-0000-0000-0000-0000000000cc') -> 'halaqat') h;
SET "request.jwt.claim.sub" = '15315315-0000-0000-0000-000000000003';
DO $$ BEGIN
  PERFORM public.center_record_quality('15315315-0000-0000-0000-0000000000cc');
  INSERT INTO public._t VALUES ('an outsider quality: LEAKED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('an outsider quality: rejected');
END $$;
DO $$ BEGIN
  PERFORM public.review_audit_sample(current_setting('zen.a2')::uuid, '15315315-0000-0000-0000-00000000000a', true, NULL);
  INSERT INTO public._t VALUES ('an outsider review: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('an outsider review: rejected');
END $$;
RESET ROLE;
RESET "request.jwt.claim.sub";
INSERT INTO public._t SELECT 'an teacher notified: ' || CASE WHEN EXISTS (SELECT 1 FROM public.notifications
  WHERE user_id = '15315315-0000-0000-0000-000000000002' AND kind = 'record_review' AND body LIKE '%كان متأخراً%') THEN 'ok' ELSE 'FAILED' END;
INSERT INTO public._t SELECT 'an audit rows: ' || CASE WHEN (SELECT count(*) FROM public.daily_record_audit
  WHERE halaqa_id = '15315315-0000-0000-0000-0000000000aa') >= 3 THEN 'ok' ELSE 'FAILED' END;
DELETE FROM public.notifications WHERE user_id::text LIKE '15315315-%';
DELETE FROM public.halaqat WHERE id::text LIKE '15315315-%';
DELETE FROM public.centers WHERE id::text LIKE '15315315-%';
DELETE FROM auth.users WHERE id::text LIKE '15315315-%';
SELECT code FROM public._t WHERE code LIKE 'an %' ORDER BY code;

-- @@ 155. دقة الإدخال 3: رقم الصفحة في الخادم يطابق مصحف المدينة (أول آية وآخرها وحدود السور)
DELETE FROM public._t;
INSERT INTO public._t SELECT 'pg pages: ' || CASE WHEN private.ayah_page(1, 1) = 1 AND private.ayah_page(1, 7) = 1
  AND private.ayah_page(2, 1) = 2 AND private.ayah_page(2, 5) = 2 AND private.ayah_page(2, 6) = 3
  AND private.ayah_page(2, 286) = 49 AND private.ayah_page(18, 1) = 293 AND private.ayah_page(114, 6) = 604
  THEN 'ok' ELSE 'FAILED' END;
SELECT code FROM public._t WHERE code LIKE 'pg %' ORDER BY code;

-- @@ 156. أول يوم للمعلّم والوضع المبسّط والتحدي الجاري: سياق الرئيسية يعكس الخطوات، والمركز يفعّل الوضع المبسّط لمعلّميه، وغير المدير مرفوض
DELETE FROM public._t;
INSERT INTO auth.users (id, phone, raw_user_meta_data) VALUES
 ('15615615-0000-0000-0000-000000000001','+967700156001','{"name":"صاحب مركز"}'),
 ('15615615-0000-0000-0000-000000000002','+967700156002','{"name":"معلّم جديد"}'),
 ('15615615-0000-0000-0000-00000000000a','+967700156010','{"name":"طالب"}');
INSERT INTO public.user_roles (user_id, role) VALUES
 ('15615615-0000-0000-0000-000000000001','teacher'), ('15615615-0000-0000-0000-000000000002','teacher')
ON CONFLICT DO NOTHING;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '15615615-0000-0000-0000-000000000002';
INSERT INTO public._t SELECT 'ob empty: ' || CASE WHEN (c -> 'setup' ->> 'students')::int = 0
    AND NOT (c -> 'setup' ->> 'records')::boolean AND NOT (c -> 'setup' ->> 'guardians')::boolean
    AND NOT (c ->> 'center_simple_mode')::boolean AND c -> 'active_challenge' = 'null'::jsonb
  THEN 'ok' ELSE 'FAILED ' || c::text END FROM (SELECT public.my_home_context() AS c) x;
RESET ROLE;
INSERT INTO public.centers (id, name, created_by)
VALUES ('15615615-0000-0000-0000-0000000000cc', 'مركز البداية', '15615615-0000-0000-0000-000000000001');
INSERT INTO public.halaqat (id, center_id, name, teacher_id)
VALUES ('15615615-0000-0000-0000-0000000000aa', '15615615-0000-0000-0000-0000000000cc', 'حلقة البداية', '15615615-0000-0000-0000-000000000002');
INSERT INTO public.halaqa_students (halaqa_id, student_id)
VALUES ('15615615-0000-0000-0000-0000000000aa', '15615615-0000-0000-0000-00000000000a');
INSERT INTO public.halaqa_challenges (id, halaqa_id, title, kind, target, starts_on, ends_on, created_by)
VALUES ('15615615-0000-0000-0000-0000000000c1', '15615615-0000-0000-0000-0000000000aa', 'مئة صفحة', 'pages', 100,
        public.zen_today() - 1, public.zen_today() + 6, '15615615-0000-0000-0000-000000000002');
INSERT INTO public.challenge_logs (challenge_id, student_id, pages)
VALUES ('15615615-0000-0000-0000-0000000000c1', '15615615-0000-0000-0000-00000000000a', 12);
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '15615615-0000-0000-0000-000000000002';
INSERT INTO public._t SELECT 'ob students: ' || CASE WHEN (c -> 'setup' ->> 'students')::int = 1
    AND NOT (c -> 'setup' ->> 'records')::boolean THEN 'ok' ELSE 'FAILED ' || c::text END
  FROM (SELECT public.my_home_context() AS c) x;
SELECT public.open_daily_record('15615615-0000-0000-0000-0000000000aa', public.zen_today());
INSERT INTO public._t SELECT 'ob record: ' || CASE WHEN (public.my_home_context() -> 'setup' ->> 'records')::boolean
  THEN 'ok' ELSE 'FAILED' END;
DO $$ BEGIN
  PERFORM public.set_center_teacher_simple_mode('15615615-0000-0000-0000-0000000000cc', true);
  INSERT INTO public._t VALUES ('ob teacher sets center: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('ob teacher sets center: rejected');
END $$;
SET "request.jwt.claim.sub" = '15615615-0000-0000-0000-000000000001';
SELECT public.set_center_teacher_simple_mode('15615615-0000-0000-0000-0000000000cc', true);
SET "request.jwt.claim.sub" = '15615615-0000-0000-0000-000000000002';
INSERT INTO public._t SELECT 'ob center simple: ' || CASE WHEN (public.my_home_context() ->> 'center_simple_mode')::boolean
  THEN 'ok' ELSE 'FAILED' END;
SET "request.jwt.claim.sub" = '15615615-0000-0000-0000-00000000000a';
INSERT INTO public._t SELECT 'ob student: ' || CASE WHEN c -> 'setup' = 'null'::jsonb
    AND c -> 'active_challenge' ->> 'title' = 'مئة صفحة' AND (c -> 'active_challenge' ->> 'progress')::int = 12
    AND (c -> 'active_challenge' ->> 'target')::int = 100
  THEN 'ok' ELSE 'FAILED ' || c::text END FROM (SELECT public.my_home_context() AS c) x;
RESET ROLE;
INSERT INTO public.guardian_link_codes (code, student_id, created_by)
VALUES ('ZEN15600', '15615615-0000-0000-0000-00000000000a', '15615615-0000-0000-0000-000000000002');
UPDATE public.halaqa_challenges SET completed_at = now() WHERE id = '15615615-0000-0000-0000-0000000000c1';
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '15615615-0000-0000-0000-000000000002';
INSERT INTO public._t SELECT 'ob guardians: ' || CASE WHEN (public.my_home_context() -> 'setup' ->> 'guardians')::boolean
  THEN 'ok' ELSE 'FAILED' END;
SET "request.jwt.claim.sub" = '15615615-0000-0000-0000-00000000000a';
INSERT INTO public._t SELECT 'ob completed hidden: ' || CASE WHEN public.my_home_context() -> 'active_challenge' = 'null'::jsonb
  THEN 'ok' ELSE 'FAILED' END;
RESET ROLE;
RESET "request.jwt.claim.sub";
DELETE FROM public.halaqat WHERE id::text LIKE '15615615-%';
DELETE FROM public.centers WHERE id::text LIKE '15615615-%';
DELETE FROM auth.users WHERE id::text LIKE '15615615-%';
SELECT code FROM public._t WHERE code LIKE 'ob %' ORDER BY code;

-- @@ 157. لوحة المدير 1: المقارنة بالفترة السابقة، والتعمّق لكل طالب، وجودة الإدخال لكل معلّم — للطاقم فقط
DELETE FROM public._t;
INSERT INTO auth.users (id, phone, raw_user_meta_data) VALUES
 ('15715715-0000-0000-0000-000000000001','+967700157001','{"name":"صاحب مركز"}'),
 ('15715715-0000-0000-0000-000000000002','+967700157002','{"name":"معلّم"}'),
 ('15715715-0000-0000-0000-000000000003','+967700157003','{"name":"مشرف"}'),
 ('15715715-0000-0000-0000-000000000009','+967700157009','{"name":"غريب"}'),
 ('15715715-0000-0000-0000-00000000000a','+967700157010','{"name":"طالب أ"}'),
 ('15715715-0000-0000-0000-00000000000b','+967700157011','{"name":"طالب ب"}');
INSERT INTO public.user_roles (user_id, role) VALUES
 ('15715715-0000-0000-0000-000000000001','teacher'), ('15715715-0000-0000-0000-000000000002','teacher')
ON CONFLICT DO NOTHING;
INSERT INTO public.centers (id, name, created_by)
VALUES ('15715715-0000-0000-0000-0000000000cc', 'مركز اللوحة', '15715715-0000-0000-0000-000000000001');
INSERT INTO public.center_staff (center_id, user_id, role)
VALUES ('15715715-0000-0000-0000-0000000000cc', '15715715-0000-0000-0000-000000000003', 'supervisor');
INSERT INTO public.halaqat (id, center_id, name, teacher_id) VALUES
 ('15715715-0000-0000-0000-0000000000a1', '15715715-0000-0000-0000-0000000000cc', 'حلقة أ', '15715715-0000-0000-0000-000000000002'),
 ('15715715-0000-0000-0000-0000000000a2', '15715715-0000-0000-0000-0000000000cc', 'حلقة ب', '15715715-0000-0000-0000-000000000002');
INSERT INTO public.halaqa_students (halaqa_id, student_id) VALUES
 ('15715715-0000-0000-0000-0000000000a1', '15715715-0000-0000-0000-00000000000a'),
 ('15715715-0000-0000-0000-0000000000a2', '15715715-0000-0000-0000-00000000000b');
-- الفترة الحالية (آخر 7 أيام): أ حاضر يومين، ب غائب يوماً. السابقة: أ غائب يومين.
INSERT INTO public.attendance (student_id, halaqa_id, teacher_id, session_date, status) VALUES
 ('15715715-0000-0000-0000-00000000000a', '15715715-0000-0000-0000-0000000000a1', '15715715-0000-0000-0000-000000000002', public.zen_today() - 1, 'present'),
 ('15715715-0000-0000-0000-00000000000a', '15715715-0000-0000-0000-0000000000a1', '15715715-0000-0000-0000-000000000002', public.zen_today() - 2, 'present'),
 ('15715715-0000-0000-0000-00000000000b', '15715715-0000-0000-0000-0000000000a2', '15715715-0000-0000-0000-000000000002', public.zen_today() - 1, 'absent'),
 ('15715715-0000-0000-0000-00000000000a', '15715715-0000-0000-0000-0000000000a1', '15715715-0000-0000-0000-000000000002', public.zen_today() - 8, 'absent'),
 ('15715715-0000-0000-0000-00000000000a', '15715715-0000-0000-0000-0000000000a1', '15715715-0000-0000-0000-000000000002', public.zen_today() - 9, 'absent');
INSERT INTO public.mushaf_records (student_id, teacher_id, halaqa_id, page, kind, session_date)
SELECT '15715715-0000-0000-0000-00000000000a', '15715715-0000-0000-0000-000000000002',
       '15715715-0000-0000-0000-0000000000a1', p, 'memorize', public.zen_today() - 1
  FROM generate_series(10, 12) p;
INSERT INTO public.halaqa_daily_records (halaqa_id, record_date, status, first_completed_at, completed_at) VALUES
 ('15715715-0000-0000-0000-0000000000a1', public.zen_today() - 1, 'completed',
  ((public.zen_today() - 1)::timestamp + interval '18 hours') AT TIME ZONE 'Asia/Aden',
  ((public.zen_today() - 1)::timestamp + interval '18 hours') AT TIME ZONE 'Asia/Aden'),
 ('15715715-0000-0000-0000-0000000000a1', public.zen_today() - 2, 'completed',
  ((public.zen_today() - 1)::timestamp + interval '1 hour') AT TIME ZONE 'Asia/Aden',
  ((public.zen_today() - 1)::timestamp + interval '1 hour') AT TIME ZONE 'Asia/Aden');
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '15715715-0000-0000-0000-000000000003';
INSERT INTO public._t SELECT 'mgr compare: ' || CASE WHEN (c -> 'current' ->> 'attendance_rate')::int = 67
    AND (c -> 'previous' ->> 'attendance_rate')::int = 0 AND (c -> 'current' ->> 'pages_memorized')::int = 3
    AND (c -> 'previous' ->> 'pages_memorized')::int = 0 AND (c -> 'current' ->> 'active_students')::int = 1
    AND (c -> 'current' ->> 'records')::int = 2 AND (c -> 'current' ->> 'same_day_rate')::int = 50
  THEN 'ok' ELSE 'FAILED ' || c::text END FROM (SELECT public.center_period_compare('15715715-0000-0000-0000-0000000000cc', 7) AS c) x;
INSERT INTO public._t SELECT 'mgr drill: ' || CASE WHEN jsonb_array_length(d -> 'students') = 2
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(d -> 'students') s
                 WHERE s ->> 'name' = 'طالب أ' AND (s ->> 'pages')::int = 3 AND (s ->> 'attendance_rate')::int = 100)
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(d -> 'students') s
                 WHERE s ->> 'name' = 'طالب ب' AND (s ->> 'attendance_rate')::int = 0 AND (s ->> 'absent')::int = 1)
  THEN 'ok' ELSE 'FAILED ' || d::text END FROM (SELECT public.center_drilldown('15715715-0000-0000-0000-0000000000cc', 7) AS d) x;
INSERT INTO public._t SELECT 'mgr teacher quality: ' || CASE WHEN jsonb_array_length(q -> 'teachers') = 1
    AND (q -> 'teachers' -> 0 ->> 'records')::int = 2 AND (q -> 'teachers' -> 0 ->> 'same_day')::int = 1
    AND (q -> 'teachers' -> 0 ->> 'late_closes')::int = 1 AND (q -> 'teachers' -> 0 ->> 'halaqat')::int = 2
  THEN 'ok' ELSE 'FAILED ' || q::text END FROM (SELECT public.center_teacher_quality('15715715-0000-0000-0000-0000000000cc', 7) AS q) x;
SET "request.jwt.claim.sub" = '15715715-0000-0000-0000-000000000009';
DO $$ BEGIN
  PERFORM public.center_period_compare('15715715-0000-0000-0000-0000000000cc', 7);
  INSERT INTO public._t VALUES ('mgr outsider compare: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('mgr outsider compare: rejected');
END $$;
DO $$ BEGIN
  PERFORM public.center_drilldown('15715715-0000-0000-0000-0000000000cc', 7);
  INSERT INTO public._t VALUES ('mgr outsider drill: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('mgr outsider drill: rejected');
END $$;
SET "request.jwt.claim.sub" = '15715715-0000-0000-0000-00000000000a';
DO $$ BEGIN
  PERFORM public.center_teacher_quality('15715715-0000-0000-0000-0000000000cc', 7);
  INSERT INTO public._t VALUES ('mgr student quality: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('mgr student quality: rejected');
END $$;
RESET ROLE;
RESET "request.jwt.claim.sub";
SELECT code FROM public._t WHERE code LIKE 'mgr %' ORDER BY code;

-- @@ 158. لوحة المدير 2: ملخص الخميس مرة واحدة لمنشئ المركز وطاقمه، ويوقفه المدير لا المشرف
DELETE FROM public._t;
DELETE FROM public.notifications WHERE kind = 'center_weekly';
SELECT public.send_center_weekly_summaries();
INSERT INTO public._t SELECT 'wk sent to owner and staff: ' || CASE WHEN
    (SELECT count(*) FROM public.notifications WHERE kind = 'center_weekly'
      AND user_id IN ('15715715-0000-0000-0000-000000000001', '15715715-0000-0000-0000-000000000003')
      AND link = '/center/15715715-0000-0000-0000-0000000000cc' AND body LIKE '%الحضور 67%') = 2
    AND NOT EXISTS (SELECT 1 FROM public.notifications WHERE kind = 'center_weekly'
      AND user_id IN ('15715715-0000-0000-0000-000000000002', '15715715-0000-0000-0000-00000000000a'))
  THEN 'ok' ELSE 'FAILED' END;
SELECT public.send_center_weekly_summaries();
INSERT INTO public._t SELECT 'wk once per week: ' || CASE WHEN (SELECT count(*) FROM public.notifications
  WHERE kind = 'center_weekly' AND user_id = '15715715-0000-0000-0000-000000000001') = 1 THEN 'ok' ELSE 'FAILED' END;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '15715715-0000-0000-0000-000000000003';
DO $$ BEGIN
  PERFORM public.set_center_weekly_summary('15715715-0000-0000-0000-0000000000cc', false);
  INSERT INTO public._t VALUES ('wk supervisor toggles: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('wk supervisor toggles: rejected');
END $$;
DO $$ BEGIN
  PERFORM public.send_center_weekly_summaries();
  INSERT INTO public._t VALUES ('wk client sends: ALLOWED!');
EXCEPTION WHEN insufficient_privilege THEN INSERT INTO public._t VALUES ('wk client sends: rejected');
END $$;
SET "request.jwt.claim.sub" = '15715715-0000-0000-0000-000000000001';
SELECT public.set_center_weekly_summary('15715715-0000-0000-0000-0000000000cc', false);
RESET ROLE;
RESET "request.jwt.claim.sub";
DELETE FROM public.center_weekly_sent WHERE center_id = '15715715-0000-0000-0000-0000000000cc';
DELETE FROM public.notifications WHERE kind = 'center_weekly';
SELECT public.send_center_weekly_summaries();
INSERT INTO public._t SELECT 'wk disabled: ' || CASE WHEN NOT EXISTS (SELECT 1 FROM public.notifications
  WHERE kind = 'center_weekly' AND user_id = '15715715-0000-0000-0000-000000000001') THEN 'ok' ELSE 'FAILED' END;
SELECT code FROM public._t WHERE code LIKE 'wk %' ORDER BY code;

-- @@ 159. دوري الحلقات: معطّل حتى يفعّله المدير، ثم يراه أعضاء الحلقات، ويرتّب بالتحسّن لا بالقيمة، بلا أسماء طلاب
DELETE FROM public._t;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '15715715-0000-0000-0000-00000000000a';
DO $$ BEGIN
  PERFORM public.center_halaqa_league('15715715-0000-0000-0000-0000000000cc', 7);
  INSERT INTO public._t VALUES ('lg student before enable: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('lg student before enable: rejected');
END $$;
SET "request.jwt.claim.sub" = '15715715-0000-0000-0000-000000000002';
DO $$ BEGIN
  PERFORM public.set_center_halaqa_league('15715715-0000-0000-0000-0000000000cc', true);
  INSERT INTO public._t VALUES ('lg teacher enables: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('lg teacher enables: rejected');
END $$;
SET "request.jwt.claim.sub" = '15715715-0000-0000-0000-000000000001';
SELECT public.set_center_halaqa_league('15715715-0000-0000-0000-0000000000cc', true);
SET "request.jwt.claim.sub" = '15715715-0000-0000-0000-00000000000a';
INSERT INTO public._t SELECT 'lg ranked by improvement: ' || CASE WHEN (l ->> 'enabled')::boolean
    AND jsonb_array_length(l -> 'items') = 2
    AND l -> 'items' -> 0 ->> 'name' = 'حلقة أ' AND (l -> 'items' -> 0 ->> 'change')::int = 100
    AND (l -> 'items' -> 0 ->> 'mine')::boolean AND NOT (l -> 'items' -> 1 ->> 'mine')::boolean
    AND l::text NOT LIKE '%طالب%'
  THEN 'ok' ELSE 'FAILED ' || l::text END FROM (SELECT public.center_halaqa_league('15715715-0000-0000-0000-0000000000cc', 7) AS l) x;
INSERT INTO public._t SELECT 'lg my leagues: ' || CASE WHEN jsonb_array_length(m) = 1
    AND m -> 0 ->> 'center_name' = 'مركز اللوحة' AND jsonb_array_length(m -> 0 -> 'items') = 2
  THEN 'ok' ELSE 'FAILED ' || m::text END FROM (SELECT public.my_halaqa_leagues(7) AS m) x;
SET "request.jwt.claim.sub" = '15715715-0000-0000-0000-000000000009';
INSERT INTO public._t SELECT 'lg outsider my leagues: ' || CASE WHEN public.my_halaqa_leagues(7) = '[]'::jsonb
  THEN 'ok' ELSE 'FAILED' END;
DO $$ BEGIN
  PERFORM public.center_halaqa_league('15715715-0000-0000-0000-0000000000cc', 7);
  INSERT INTO public._t VALUES ('lg outsider: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('lg outsider: rejected');
END $$;
RESET ROLE;
RESET "request.jwt.claim.sub";
DELETE FROM public.halaqa_daily_records WHERE halaqa_id::text LIKE '15715715-%';
DELETE FROM public.mushaf_records WHERE student_id::text LIKE '15715715-%';
DELETE FROM public.attendance WHERE student_id::text LIKE '15715715-%';
DELETE FROM public.halaqat WHERE id::text LIKE '15715715-%';
DELETE FROM public.centers WHERE id::text LIKE '15715715-%';
DELETE FROM auth.users WHERE id::text LIKE '15715715-%';
DELETE FROM public.notifications WHERE kind = 'center_weekly';
SELECT code FROM public._t WHERE code LIKE 'lg %' ORDER BY code;

-- @@ 160. دفتر الرسوم: معطّل حتى يفعّله المدير، والمدير يسجّل المستحق والدفعة، والرصيد صحيح، والمشرف والغريب لا يرون المال
DELETE FROM public._t;
INSERT INTO auth.users (id, phone, raw_user_meta_data) VALUES
 ('16016016-0000-0000-0000-000000000001','+967700160001','{"name":"صاحب مركز"}'),
 ('16016016-0000-0000-0000-000000000002','+967700160002','{"name":"معلّم"}'),
 ('16016016-0000-0000-0000-000000000003','+967700160003','{"name":"مشرف"}'),
 ('16016016-0000-0000-0000-000000000004','+967700160004','{"name":"وليّ"}'),
 ('16016016-0000-0000-0000-000000000009','+967700160009','{"name":"غريب"}'),
 ('16016016-0000-0000-0000-00000000000a','+967700160010','{"name":"طالب أ"}'),
 ('16016016-0000-0000-0000-00000000000b','+967700160011','{"name":"طالب ب"}');
INSERT INTO public.user_roles (user_id, role) VALUES
 ('16016016-0000-0000-0000-000000000001','teacher'), ('16016016-0000-0000-0000-000000000002','teacher')
ON CONFLICT DO NOTHING;
INSERT INTO public.centers (id, name, created_by)
VALUES ('16016016-0000-0000-0000-0000000000cc', 'مركز الرسوم', '16016016-0000-0000-0000-000000000001');
INSERT INTO public.center_staff (center_id, user_id, role)
VALUES ('16016016-0000-0000-0000-0000000000cc', '16016016-0000-0000-0000-000000000003', 'supervisor');
INSERT INTO public.halaqat (id, center_id, name, teacher_id) VALUES
 ('16016016-0000-0000-0000-0000000000a1', '16016016-0000-0000-0000-0000000000cc', 'حلقة الرسوم', '16016016-0000-0000-0000-000000000002');
INSERT INTO public.halaqa_students (halaqa_id, student_id) VALUES
 ('16016016-0000-0000-0000-0000000000a1', '16016016-0000-0000-0000-00000000000a'),
 ('16016016-0000-0000-0000-0000000000a1', '16016016-0000-0000-0000-00000000000b');
INSERT INTO public.guardian_links (guardian_id, student_id) VALUES
 ('16016016-0000-0000-0000-000000000004', '16016016-0000-0000-0000-00000000000a');
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '16016016-0000-0000-0000-000000000001';
DO $$ BEGIN
  PERFORM public.fee_add_charges('16016016-0000-0000-0000-0000000000cc', ARRAY['16016016-0000-0000-0000-00000000000a']::uuid[], 'رسوم', 1000, public.zen_today(), 'YER');
  INSERT INTO public._t VALUES ('fee charge while disabled: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('fee charge while disabled: rejected');
END $$;
SELECT public.set_center_fees_enabled('16016016-0000-0000-0000-0000000000cc', true);
INSERT INTO public._t SELECT 'fee bulk charge: ' || CASE WHEN public.fee_add_charges('16016016-0000-0000-0000-0000000000cc',
  ARRAY['16016016-0000-0000-0000-00000000000a', '16016016-0000-0000-0000-00000000000b']::uuid[], 'رسوم الشهر', 5000, public.zen_today() - 1, 'YER') = 2
  THEN 'ok' ELSE 'FAILED' END;
SELECT public.fee_record_payment('16016016-0000-0000-0000-0000000000cc', '16016016-0000-0000-0000-00000000000a', 2000, 'cash', NULL, NULL, NULL);
DO $$ BEGIN
  PERFORM public.fee_add_charges('16016016-0000-0000-0000-0000000000cc', ARRAY['16016016-0000-0000-0000-000000000009']::uuid[], 'رسوم', 10, public.zen_today(), 'YER');
  INSERT INTO public._t VALUES ('fee charge outsider student: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('fee charge outsider student: rejected');
END $$;
INSERT INTO public._t SELECT 'fee overview: ' || CASE WHEN (o -> 'totals' ->> 'charged')::numeric = 10000
    AND (o -> 'totals' ->> 'paid')::numeric = 2000 AND (o -> 'totals' ->> 'balance')::numeric = 8000
    AND (o -> 'totals' ->> 'students_due')::int = 2
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(o -> 'students') s
                 WHERE s ->> 'name' = 'طالب أ' AND (s ->> 'balance')::numeric = 3000 AND (s ->> 'overdue')::numeric = 3000)
  THEN 'ok' ELSE 'FAILED ' || o::text END FROM (SELECT public.center_fee_overview('16016016-0000-0000-0000-0000000000cc') AS o) x;
SET "request.jwt.claim.sub" = '16016016-0000-0000-0000-000000000003';
DO $$ BEGIN
  PERFORM public.center_fee_overview('16016016-0000-0000-0000-0000000000cc');
  INSERT INTO public._t VALUES ('fee supervisor reads: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('fee supervisor reads: rejected');
END $$;
DO $$ BEGIN
  PERFORM public.fee_record_payment('16016016-0000-0000-0000-0000000000cc', '16016016-0000-0000-0000-00000000000a', 1, 'cash', NULL, NULL, NULL);
  INSERT INTO public._t VALUES ('fee supervisor pays: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('fee supervisor pays: rejected');
END $$;
SET "request.jwt.claim.sub" = '16016016-0000-0000-0000-000000000004';
INSERT INTO public._t SELECT 'fee guardian statement: ' || CASE WHEN jsonb_array_length(s) = 1
    AND (s -> 0 ->> 'charged')::numeric = 5000 AND (s -> 0 ->> 'paid')::numeric = 2000
    AND jsonb_array_length(s -> 0 -> 'charges') = 1 AND jsonb_array_length(s -> 0 -> 'payments') = 1
  THEN 'ok' ELSE 'FAILED ' || s::text END FROM (SELECT public.student_fee_statement('16016016-0000-0000-0000-00000000000a') AS s) x;
INSERT INTO public._t SELECT 'fee guardian centers: ' || CASE WHEN public.my_fee_centers() @> '[{"student_id": "16016016-0000-0000-0000-00000000000a"}]'::jsonb
  THEN 'ok' ELSE 'FAILED' END;
DO $$ BEGIN
  PERFORM public.student_fee_statement('16016016-0000-0000-0000-00000000000b');
  INSERT INTO public._t VALUES ('fee guardian other child: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('fee guardian other child: rejected');
END $$;
DO $$ BEGIN
  PERFORM 1 FROM public.fee_charges;
  INSERT INTO public._t VALUES ('fee table direct: ALLOWED!');
EXCEPTION WHEN insufficient_privilege THEN INSERT INTO public._t VALUES ('fee table direct: rejected');
END $$;
SET "request.jwt.claim.sub" = '16016016-0000-0000-0000-000000000009';
DO $$ BEGIN
  PERFORM public.student_fee_statement('16016016-0000-0000-0000-00000000000a');
  INSERT INTO public._t VALUES ('fee outsider statement: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('fee outsider statement: rejected');
END $$;
RESET ROLE;
RESET "request.jwt.claim.sub";
-- التذكير: مستحق اليوم بلا سداد ⇒ إشعار لوليّ الأمر مرة واحدة؛ والطالب بلا وليّ يصله بنفسه.
DELETE FROM public.notifications WHERE kind = 'fee_reminder';
UPDATE public.fee_charges SET due_date = public.zen_today() WHERE center_id = '16016016-0000-0000-0000-0000000000cc';
SELECT public.send_fee_reminders();
SELECT public.send_fee_reminders();
INSERT INTO public._t SELECT 'fee reminders once: ' || CASE WHEN
    (SELECT count(*) FROM public.notifications WHERE kind = 'fee_reminder' AND user_id = '16016016-0000-0000-0000-000000000004') = 1
    AND (SELECT count(*) FROM public.notifications WHERE kind = 'fee_reminder' AND user_id = '16016016-0000-0000-0000-00000000000b') = 1
    AND NOT EXISTS (SELECT 1 FROM public.notifications WHERE kind = 'fee_reminder' AND user_id = '16016016-0000-0000-0000-00000000000a')
  THEN 'ok' ELSE 'FAILED' END;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '16016016-0000-0000-0000-000000000004';
DO $$ BEGIN
  PERFORM public.send_fee_reminders();
  INSERT INTO public._t VALUES ('fee client reminders: ALLOWED!');
EXCEPTION WHEN insufficient_privilege THEN INSERT INTO public._t VALUES ('fee client reminders: rejected');
END $$;
RESET ROLE;
RESET "request.jwt.claim.sub";
SELECT code FROM public._t WHERE code LIKE 'fee %' ORDER BY code;

-- @@ 161. الإيصالات: وليّ الأمر يرسل مرجع التحويل، والمدير يؤكد فتنشأ دفعة، أو يرفض بسبب؛ ولا يرسل عن غير ابنه
DELETE FROM public._t;
DELETE FROM public.notifications WHERE kind IN ('fee_receipt', 'fee_receipt_decided');
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '16016016-0000-0000-0000-000000000004';
SELECT public.fee_submit_receipt('16016016-0000-0000-0000-0000000000cc', '16016016-0000-0000-0000-00000000000a', 3000, 'TRX-123', NULL, NULL);
SELECT public.fee_submit_receipt('16016016-0000-0000-0000-0000000000cc', '16016016-0000-0000-0000-00000000000a', 50, 'TRX-BAD', NULL, NULL);
DO $$ BEGIN
  PERFORM public.fee_submit_receipt('16016016-0000-0000-0000-0000000000cc', '16016016-0000-0000-0000-00000000000b', 10, 'X', NULL, NULL);
  INSERT INTO public._t VALUES ('rcpt other child: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('rcpt other child: rejected');
END $$;
DO $$ BEGIN
  PERFORM public.fee_submit_receipt('16016016-0000-0000-0000-0000000000cc', '16016016-0000-0000-0000-00000000000a', 10, NULL, '16016016-0000-0000-0000-0000000000cc/16016016-0000-0000-0000-000000000004/missing.jpg', NULL);
  INSERT INTO public._t VALUES ('rcpt missing image: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('rcpt missing image: rejected');
END $$;
RESET ROLE;
RESET "request.jwt.claim.sub";
INSERT INTO public._t SELECT 'zid ' || reference || ' ' || id FROM public.fee_receipts WHERE center_id = '16016016-0000-0000-0000-0000000000cc';
INSERT INTO public._t SELECT 'rcpt manager notified: ' || CASE WHEN EXISTS (SELECT 1 FROM public.notifications
  WHERE kind = 'fee_receipt' AND user_id = '16016016-0000-0000-0000-000000000001'
    AND link = '/center/16016016-0000-0000-0000-0000000000cc/fees') THEN 'ok' ELSE 'FAILED' END;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '16016016-0000-0000-0000-000000000003';
DO $$ BEGIN
  PERFORM public.fee_decide_receipt((SELECT split_part(code, ' ', 3)::uuid FROM public._t WHERE code LIKE 'zid TRX-123 %'), true, NULL);
  INSERT INTO public._t VALUES ('rcpt supervisor decides: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('rcpt supervisor decides: rejected');
END $$;
SET "request.jwt.claim.sub" = '16016016-0000-0000-0000-000000000001';
INSERT INTO public._t SELECT 'rcpt pending list: ' || CASE WHEN jsonb_array_length(public.center_fee_receipts('16016016-0000-0000-0000-0000000000cc', 'pending')) = 2
  THEN 'ok' ELSE 'FAILED' END;
SELECT public.fee_decide_receipt(split_part(code, ' ', 3)::uuid, true, NULL) FROM public._t WHERE code LIKE 'zid TRX-123 %';
DO $$ BEGIN
  PERFORM public.fee_decide_receipt((SELECT split_part(code, ' ', 3)::uuid FROM public._t WHERE code LIKE 'zid TRX-BAD %'), false, NULL);
  INSERT INTO public._t VALUES ('rcpt reject without reason: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('rcpt reject without reason: rejected');
END $$;
SELECT public.fee_decide_receipt(split_part(code, ' ', 3)::uuid, false, 'المبلغ لا يطابق') FROM public._t WHERE code LIKE 'zid TRX-BAD %';
DO $$ BEGIN
  PERFORM public.fee_decide_receipt((SELECT split_part(code, ' ', 3)::uuid FROM public._t WHERE code LIKE 'zid TRX-123 %'), true, NULL);
  INSERT INTO public._t VALUES ('rcpt decide twice: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('rcpt decide twice: rejected');
END $$;
INSERT INTO public._t SELECT 'rcpt confirmed balance: ' || CASE WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(o -> 'students') s
    WHERE s ->> 'name' = 'طالب أ' AND (s ->> 'paid')::numeric = 5000 AND (s ->> 'balance')::numeric = 0)
    AND (o -> 'totals' ->> 'pending_receipts')::int = 0
  THEN 'ok' ELSE 'FAILED ' || o::text END FROM (SELECT public.center_fee_overview('16016016-0000-0000-0000-0000000000cc') AS o) x;
RESET ROLE;
RESET "request.jwt.claim.sub";
INSERT INTO public._t SELECT 'rcpt guardian notified: ' || CASE WHEN (SELECT count(*) FROM public.notifications
  WHERE kind = 'fee_receipt_decided' AND user_id = '16016016-0000-0000-0000-000000000004') = 2
  AND EXISTS (SELECT 1 FROM public.fee_payments WHERE source = 'receipt' AND reference = 'TRX-123')
  THEN 'ok' ELSE 'FAILED' END;
SELECT code FROM public._t WHERE code LIKE 'rcpt %' ORDER BY code;

-- @@ 162. التسميع عن بُعد: المعلّم يكلّف، والطالب يرسل تسجيله، والمراجعة بالأخطاء تدخل سجل اليوم وجدولة المراجعة
DELETE FROM public._t;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '16016016-0000-0000-0000-000000000009';
DO $$ BEGIN
  PERFORM public.remote_assign('16016016-0000-0000-0000-0000000000a1', ARRAY['16016016-0000-0000-0000-00000000000a']::uuid[], 'review', 'الملك', 1, 10, NULL, NULL);
  INSERT INTO public._t VALUES ('remote outsider assigns: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('remote outsider assigns: rejected');
END $$;
SET "request.jwt.claim.sub" = '16016016-0000-0000-0000-000000000002';
DO $$ BEGIN
  PERFORM public.remote_assign('16016016-0000-0000-0000-0000000000a1', ARRAY['16016016-0000-0000-0000-00000000000a']::uuid[], 'review', 'الملك', 1, 31, NULL, NULL);
  INSERT INTO public._t VALUES ('remote bad range: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('remote bad range: rejected');
END $$;
INSERT INTO public._t SELECT 'remote assign: ' || CASE WHEN public.remote_assign('16016016-0000-0000-0000-0000000000a1',
  ARRAY['16016016-0000-0000-0000-00000000000a']::uuid[], 'review', 'الملك', 1, 10, 'رتّل', NULL) = 1 THEN 'ok' ELSE 'FAILED' END;
RESET ROLE;
RESET "request.jwt.claim.sub";
INSERT INTO public._t SELECT 'zid remote ' || id FROM public.remote_recitations WHERE student_id = '16016016-0000-0000-0000-00000000000a';
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '16016016-0000-0000-0000-00000000000a';
INSERT INTO public._t SELECT 'remote student list: ' || CASE WHEN jsonb_array_length(l) = 1 AND l -> 0 ->> 'status' = 'assigned'
  AND l -> 0 ->> 'surah_name' = 'الملك' THEN 'ok' ELSE 'FAILED ' || l::text END FROM (SELECT public.my_remote_recitations() AS l) x;
DO $$ BEGIN
  PERFORM public.remote_submit((SELECT split_part(code, ' ', 3)::uuid FROM public._t WHERE code LIKE 'zid remote %'),
    '16016016-0000-0000-0000-00000000000a/remote/none.webm', 60);
  INSERT INTO public._t VALUES ('remote submit missing file: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('remote submit missing file: rejected');
END $$;
RESET ROLE;
RESET "request.jwt.claim.sub";
INSERT INTO storage.objects (bucket_id, name) VALUES ('recitations', '16016016-0000-0000-0000-00000000000a/remote/r1.webm');
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '16016016-0000-0000-0000-00000000000a';
SELECT public.remote_submit((SELECT split_part(code, ' ', 3)::uuid FROM public._t WHERE code LIKE 'zid remote %'),
  '16016016-0000-0000-0000-00000000000a/remote/r1.webm', 95);
SET "request.jwt.claim.sub" = '16016016-0000-0000-0000-00000000000b';
DO $$ BEGIN
  PERFORM public.remote_review((SELECT split_part(code, ' ', 3)::uuid FROM public._t WHERE code LIKE 'zid remote %'), 5, '[]', NULL);
  INSERT INTO public._t VALUES ('remote student reviews: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('remote student reviews: rejected');
END $$;
SET "request.jwt.claim.sub" = '16016016-0000-0000-0000-000000000002';
INSERT INTO public._t SELECT 'remote queue: ' || CASE WHEN q -> 0 ->> 'status' = 'submitted' AND q -> 0 ->> 'student_name' = 'طالب أ'
  AND (q -> 0 ->> 'duration_seconds')::int = 95 THEN 'ok' ELSE 'FAILED ' || q::text END FROM (SELECT public.teacher_remote_queue() AS q) x;
DO $$ BEGIN
  PERFORM public.remote_review((SELECT split_part(code, ' ', 3)::uuid FROM public._t WHERE code LIKE 'zid remote %'), 4,
    '[{"ayah": 11, "type": "hifz"}]', NULL);
  INSERT INTO public._t VALUES ('remote mistake outside range: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('remote mistake outside range: rejected');
END $$;
SELECT public.remote_review((SELECT split_part(code, ' ', 3)::uuid FROM public._t WHERE code LIKE 'zid remote %'), 4,
  '[{"ayah": 3, "type": "tajweed"}, {"ayah": 7, "type": "hifz"}, {"ayah": 8, "type": "hifz"}]', 'أحسنت');
RESET ROLE;
RESET "request.jwt.claim.sub";
INSERT INTO public._t SELECT 'remote into daily record: ' || CASE WHEN EXISTS (
    SELECT 1 FROM public.recitation_sessions s
      JOIN public.halaqa_daily_records d ON d.id = s.daily_record_id AND d.record_date = public.zen_today()
      JOIN public.recitation_assessments ra ON ra.session_id = s.id
     WHERE s.student_id = '16016016-0000-0000-0000-00000000000a' AND s.kind = 'review' AND s.surah_name = 'الملك'
       AND s.from_ayah = 1 AND s.to_ayah = 10 AND s.audio_path = '16016016-0000-0000-0000-00000000000a/remote/r1.webm'
       AND ra.errors -> 0 ->> 'type' = 'hifz' AND jsonb_array_length(ra.errors) = 3 AND ra.teacher_notes = 'أحسنت')
    AND EXISTS (SELECT 1 FROM public.attendance WHERE student_id = '16016016-0000-0000-0000-00000000000a'
                 AND session_date = public.zen_today() AND status = 'present')
    AND EXISTS (SELECT 1 FROM public.halaqa_register_entries WHERE student_id = '16016016-0000-0000-0000-00000000000a'
                 AND session_date = public.zen_today() AND recitation_session_id IS NOT NULL)
    AND EXISTS (SELECT 1 FROM public.review_cards WHERE student_id = '16016016-0000-0000-0000-00000000000a' AND surah_name = 'الملك')
    AND EXISTS (SELECT 1 FROM public.notifications WHERE kind = 'remote_reviewed' AND user_id = '16016016-0000-0000-0000-00000000000a')
    AND EXISTS (SELECT 1 FROM public.notifications WHERE kind = 'remote_submitted' AND user_id = '16016016-0000-0000-0000-000000000002')
  THEN 'ok' ELSE 'FAILED' END;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '16016016-0000-0000-0000-000000000002';
DO $$ BEGIN
  PERFORM public.remote_review((SELECT split_part(code, ' ', 3)::uuid FROM public._t WHERE code LIKE 'zid remote %'), 5, '[]', NULL);
  INSERT INTO public._t VALUES ('remote review twice: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('remote review twice: rejected');
END $$;
RESET ROLE;
RESET "request.jwt.claim.sub";
DELETE FROM storage.objects WHERE name LIKE '16016016-%';
DELETE FROM public.halaqa_register_entries WHERE student_id::text LIKE '16016016-%';
DELETE FROM public.review_cards WHERE student_id::text LIKE '16016016-%';
DELETE FROM public.recitation_sessions WHERE student_id::text LIKE '16016016-%';
DELETE FROM public.halaqa_daily_records WHERE halaqa_id::text LIKE '16016016-%';
DELETE FROM public.attendance WHERE student_id::text LIKE '16016016-%';
DELETE FROM public.halaqat WHERE id::text LIKE '16016016-%';
DELETE FROM public.centers WHERE id::text LIKE '16016016-%';
DELETE FROM auth.users WHERE id::text LIKE '16016016-%';
DELETE FROM public.notifications WHERE kind IN ('fee_reminder', 'fee_receipt', 'fee_receipt_decided', 'remote_assigned', 'remote_submitted', 'remote_reviewed');
SELECT code FROM public._t WHERE code LIKE 'remote %' ORDER BY code;

-- @@ 163. الاحتفاظ سنة: حذف أثر التدقيق وملاحظات العيّنة الأقدم من سنة وحدها، وللخادم وحده
DELETE FROM public._t;
INSERT INTO auth.users (id, phone, raw_user_meta_data) VALUES
 ('16316316-0000-0000-0000-000000000001','+967700163001','{"name":"معلّم الاحتفاظ"}'),
 ('16316316-0000-0000-0000-00000000000a','+967700163010','{"name":"طالب الاحتفاظ"}');
INSERT INTO public.user_roles (user_id, role) VALUES ('16316316-0000-0000-0000-000000000001', 'teacher')
ON CONFLICT DO NOTHING;
INSERT INTO public.centers (id, name, created_by)
VALUES ('16316316-0000-0000-0000-0000000000cc', 'مركز الاحتفاظ', '16316316-0000-0000-0000-000000000001');
INSERT INTO public.halaqat (id, center_id, name, teacher_id) VALUES
 ('16316316-0000-0000-0000-0000000000a1', '16316316-0000-0000-0000-0000000000cc', 'حلقة الاحتفاظ', '16316316-0000-0000-0000-000000000001');
INSERT INTO public.halaqa_students (halaqa_id, student_id) VALUES
 ('16316316-0000-0000-0000-0000000000a1', '16316316-0000-0000-0000-00000000000a');
INSERT INTO public.halaqa_daily_records (id, halaqa_id, record_date) VALUES
 ('16316316-0000-0000-0000-0000000000d1', '16316316-0000-0000-0000-0000000000a1', public.zen_today() - 400),
 ('16316316-0000-0000-0000-0000000000d2', '16316316-0000-0000-0000-0000000000a1', public.zen_today() - 3);
INSERT INTO public.daily_record_audit (record_id, halaqa_id, record_date, student_id, actor_id, action, txid, at) VALUES
 ('16316316-0000-0000-0000-0000000000d1', '16316316-0000-0000-0000-0000000000a1', public.zen_today() - 400,
  '16316316-0000-0000-0000-00000000000a', '16316316-0000-0000-0000-000000000001', 'edit', 9163001, now() - interval '400 days'),
 ('16316316-0000-0000-0000-0000000000d2', '16316316-0000-0000-0000-0000000000a1', public.zen_today() - 3,
  '16316316-0000-0000-0000-00000000000a', '16316316-0000-0000-0000-000000000001', 'edit', 9163002, now() - interval '3 days'),
 ('16316316-0000-0000-0000-0000000000d2', '16316316-0000-0000-0000-0000000000a1', public.zen_today() - 3,
  '16316316-0000-0000-0000-00000000000a', '16316316-0000-0000-0000-000000000001', 'reopen', 9163003, now() - interval '3 days');
INSERT INTO public.daily_record_reviews (record_id, student_id, reviewer_id, ok, at) VALUES
 ('16316316-0000-0000-0000-0000000000d1', '16316316-0000-0000-0000-00000000000a', '16316316-0000-0000-0000-000000000001', true, now() - interval '400 days'),
 ('16316316-0000-0000-0000-0000000000d2', '16316316-0000-0000-0000-00000000000a', '16316316-0000-0000-0000-000000000001', true, now() - interval '3 days');
INSERT INTO public._t SELECT 'zret ' || public.purge_old_record_audit(30)::text;
INSERT INTO public._t SELECT 'retention purge: ' || CASE WHEN
    NOT EXISTS (SELECT 1 FROM public.daily_record_audit WHERE record_id = '16316316-0000-0000-0000-0000000000d1')
    AND (SELECT count(*) FROM public.daily_record_audit WHERE record_id = '16316316-0000-0000-0000-0000000000d2') = 2
    AND NOT EXISTS (SELECT 1 FROM public.daily_record_reviews WHERE record_id = '16316316-0000-0000-0000-0000000000d1')
    AND EXISTS (SELECT 1 FROM public.daily_record_reviews WHERE record_id = '16316316-0000-0000-0000-0000000000d2')
  THEN 'ok' ELSE 'FAILED' END;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '16316316-0000-0000-0000-000000000001';
DO $$ BEGIN
  PERFORM public.purge_old_record_audit();
  INSERT INTO public._t VALUES ('retention by client: ALLOWED!');
EXCEPTION WHEN insufficient_privilege THEN INSERT INTO public._t VALUES ('retention by client: rejected');
END $$;
RESET ROLE;
RESET "request.jwt.claim.sub";
INSERT INTO public._t SELECT 'retention service role: ' || CASE WHEN
    has_function_privilege('service_role', 'public.purge_old_record_audit(integer)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.purge_old_record_audit(integer)', 'EXECUTE') THEN 'ok' ELSE 'FAILED' END;
SELECT code FROM public._t WHERE code LIKE 'retention %' ORDER BY code;

-- @@ 164. تقرير الحلقة: عدد التعديلات بعد الإغلاق لكل يوم (edit وحده، لا إعادة الفتح)
DELETE FROM public._t;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '16316316-0000-0000-0000-000000000001';
INSERT INTO public._t SELECT 'report edits: ' || CASE WHEN EXISTS (
    SELECT 1 FROM jsonb_array_elements(d -> 'days') x
     WHERE x ->> 'date' = (public.zen_today() - 3)::text AND (x ->> 'edits_after_close')::int = 1)
  THEN 'ok' ELSE 'FAILED ' || (d -> 'days')::text END
  FROM (SELECT public.halaqa_report_data('16316316-0000-0000-0000-0000000000a1', public.zen_today() - 10, public.zen_today()) AS d) y;
RESET ROLE;
RESET "request.jwt.claim.sub";
DELETE FROM public.daily_record_reviews WHERE student_id::text LIKE '16316316-%';
DELETE FROM public.daily_record_audit WHERE halaqa_id::text LIKE '16316316-%';
DELETE FROM public.halaqa_daily_records WHERE halaqa_id::text LIKE '16316316-%';
DELETE FROM public.halaqat WHERE id::text LIKE '16316316-%';
DELETE FROM public.centers WHERE id::text LIKE '16316316-%';
DELETE FROM auth.users WHERE id::text LIKE '16316316-%';
SELECT code FROM public._t WHERE code LIKE 'report %' ORDER BY code;

-- @@ 165. استوديو الشهائد 1.22.0: تصميم بقيم غير آمنة مرفوض في القالب والإصدار، والسليم مقبول، والحفظ على نسخة قديمة STALE
DELETE FROM public._t;
INSERT INTO auth.users (id, phone, raw_user_meta_data) VALUES
 ('16516516-0000-0000-0000-000000000001', '+967716516001', '{"name":"صاحب مركز الأمن"}'),
 ('16516516-0000-0000-0000-000000000002', '+967716516002', '{"name":"معلّم الأمن"}'),
 ('16516516-0000-0000-0000-000000000003', '+967716516003', '{"name":"وليّ أمر"}'),
 ('16516516-0000-0000-0000-00000000000a', '+967716516010', '{"name":"سارة أحمد"}'),
 ('16516516-0000-0000-0000-00000000000b', '+967716516011', '{"name":"بلال عمر"}');
INSERT INTO public.user_roles (user_id, role) VALUES
 ('16516516-0000-0000-0000-000000000001', 'teacher'), ('16516516-0000-0000-0000-000000000002', 'teacher')
ON CONFLICT DO NOTHING;
INSERT INTO public.centers (id, name, created_by)
VALUES ('16516516-0000-0000-0000-0000000000cc', 'مركز الأمن', '16516516-0000-0000-0000-000000000001');
INSERT INTO public.halaqat (id, center_id, name, teacher_id)
VALUES ('16516516-0000-0000-0000-0000000000a1', '16516516-0000-0000-0000-0000000000cc', 'حلقة الأمن', '16516516-0000-0000-0000-000000000002');
INSERT INTO public.halaqa_students (halaqa_id, student_id) VALUES
 ('16516516-0000-0000-0000-0000000000a1', '16516516-0000-0000-0000-00000000000a'),
 ('16516516-0000-0000-0000-0000000000a1', '16516516-0000-0000-0000-00000000000b');
INSERT INTO public.guardian_links (guardian_id, student_id)
VALUES ('16516516-0000-0000-0000-000000000003', '16516516-0000-0000-0000-00000000000a');
INSERT INTO public._t SELECT 'cs design ok fn: ' || CASE WHEN
    private.cert_design_ok('{"page":{"size":"A4","background":"$paper"},"palette":{"primary":"#1f5d46","accent":"rgba(1, 2, 3, .5)"},"elements":[{"id":"t_1","type":"text","text":"<b>\"x\"</b> {{student.name}}","font":{"dir":"rtl","align":"center"}},{"id":"i","type":"image","src":"asset:11111111-2222-3333-4444-555555555555"}]}'::jsonb)
    AND NOT private.cert_design_ok('{"elements":[{"id":"t","type":"text","font":{"dir":"rtl\"><img src=x onerror=alert(1)>"}}]}'::jsonb)
    AND NOT private.cert_design_ok('{"palette":{"primary":"red;}</style>"},"elements":[]}'::jsonb)
    AND NOT private.cert_design_ok('{"elements":[{"id":"x\" onload=\"y","type":"qr"}]}'::jsonb)
    AND NOT private.cert_design_ok('{"elements":[{"id":"t","type":"text","text":{"a":"<b>"}}]}'::jsonb)
  THEN 'ok' ELSE 'FAILED' END;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '16516516-0000-0000-0000-000000000002';
DO $$ BEGIN
  PERFORM public.cert_save_template(jsonb_build_object('center_id', '16516516-0000-0000-0000-0000000000cc',
    'halaqa_id', '16516516-0000-0000-0000-0000000000a1', 'name', 'خبيث',
    'design', '{"elements":[{"id":"t","type":"text","font":{"align":"center\"><img src=x onerror=alert(1)>"}}]}'::jsonb), false);
  INSERT INTO public._t VALUES ('cs unsafe template: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('cs unsafe template: ' || CASE WHEN SQLERRM LIKE '%UNSAFE_DESIGN%' THEN 'rejected' ELSE 'FAILED ' || SQLERRM END);
END $$;
DO $$ BEGIN
  PERFORM public.cert_issue(jsonb_build_object('halaqa_id', '16516516-0000-0000-0000-0000000000a1', 'type_key', 'participation',
    'design', '{"palette":{"ink":"x\"><script>"},"elements":[]}'::jsonb,
    'items', '[{"student_id":"16516516-0000-0000-0000-00000000000a"}]'::jsonb));
  INSERT INTO public._t VALUES ('cs unsafe issue: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('cs unsafe issue: ' || CASE WHEN SQLERRM LIKE '%UNSAFE_DESIGN%' THEN 'rejected' ELSE 'FAILED ' || SQLERRM END);
END $$;
SELECT set_config('zen.cs_tpl', public.cert_save_template(jsonb_build_object('center_id', '16516516-0000-0000-0000-0000000000cc',
  'halaqa_id', '16516516-0000-0000-0000-0000000000a1', 'name', 'قالب سليم',
  'design', '{"elements":[{"id":"t","type":"text","text":"نص <سليم>"}]}'::jsonb), false)::text, false);
SELECT set_config('zen.cs_old', (current_setting('zen.cs_tpl')::jsonb->>'updated_at'), false);
SELECT public.cert_save_template(jsonb_build_object('id', current_setting('zen.cs_tpl')::jsonb->>'id',
  'expected_updated_at', current_setting('zen.cs_old'), 'design', '{"elements":[]}'::jsonb), false);
INSERT INTO public._t SELECT 'cs fresh save: ok';
-- محرّر ثانٍ ما زال على النسخة الأولى: يُرفض بدل أن يمحو ما حُفظ بعدها.
DO $$ BEGIN
  PERFORM public.cert_save_template(jsonb_build_object('id', current_setting('zen.cs_tpl')::jsonb->>'id',
    'expected_updated_at', (current_setting('zen.cs_old')::timestamptz - interval '1 second')::text, 'design', '{"elements":[]}'::jsonb), false);
  INSERT INTO public._t VALUES ('cs stale save: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('cs stale save: ' || CASE WHEN SQLERRM LIKE '%STALE%' THEN 'rejected' ELSE 'FAILED ' || SQLERRM END);
END $$;
RESET ROLE;
RESET "request.jwt.claim.sub";
SELECT code FROM public._t WHERE code LIKE 'cs %' ORDER BY code;

-- @@ 166. استوديو الشهائد 1.22.0: إعادة إصدار الصادرة تلغيها بسبب يذكر البديلة، والتحقق «replaced»، ولا استبدال ثانٍ
DELETE FROM public._t;
DELETE FROM public.certificate_verify_attempts WHERE user_id::text LIKE '16516516-%';
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '16516516-0000-0000-0000-000000000002';
SELECT set_config('zen.cr_old', public.cert_issue(jsonb_build_object('halaqa_id', '16516516-0000-0000-0000-0000000000a1',
  'type_key', 'participation', 'design', '{"elements":[{"id":"t","type":"text","text":"الأولى"}]}'::jsonb,
  'items', '[{"student_id":"16516516-0000-0000-0000-00000000000a"}]'::jsonb))->'certificates'->0->>'id', false);
SELECT set_config('zen.cr_new', public.cert_issue(jsonb_build_object('halaqa_id', '16516516-0000-0000-0000-0000000000a1',
  'type_key', 'participation', 'replaces_id', current_setting('zen.cr_old'),
  'design', '{"elements":[{"id":"t","type":"text","text":"المصحَّحة"}]}'::jsonb,
  'items', '[{"student_id":"16516516-0000-0000-0000-00000000000a"}]'::jsonb))->'certificates'->0->>'id', false);
INSERT INTO public._t SELECT 'cr old revoked: ' || CASE WHEN o->>'status' = 'revoked'
    AND o->>'revoke_reason' = 'استُبدلت بالشهادة ' || (n->>'certificate_number') AND o->>'replaced_by' = current_setting('zen.cr_new')
  THEN 'ok' ELSE 'FAILED ' || o::text END
  FROM (SELECT public.cert_get(current_setting('zen.cr_old')::uuid) AS o, public.cert_get(current_setting('zen.cr_new')::uuid) AS n) x;
INSERT INTO public._t SELECT 'cr verify replaced: ' || CASE WHEN v->>'status' = 'replaced'
    AND v->>'replaced_by' = (SELECT certificate_number FROM public.certificates WHERE id = current_setting('zen.cr_new')::uuid)
  THEN 'ok' ELSE 'FAILED ' || v::text END
  FROM (SELECT public.verify_certificate((SELECT verify_code FROM public.certificates WHERE id = current_setting('zen.cr_old')::uuid)) AS v) x;
INSERT INTO public._t SELECT 'cr verify new valid: ' || CASE WHEN public.verify_certificate(
    (SELECT verify_code FROM public.certificates WHERE id = current_setting('zen.cr_new')::uuid))->>'status' = 'valid' THEN 'ok' ELSE 'FAILED' END;
DO $$ BEGIN
  PERFORM public.cert_issue(jsonb_build_object('halaqa_id', '16516516-0000-0000-0000-0000000000a1',
    'type_key', 'participation', 'replaces_id', current_setting('zen.cr_old'), 'design', '{"elements":[]}'::jsonb,
    'items', '[{"student_id":"16516516-0000-0000-0000-00000000000a"}]'::jsonb));
  INSERT INTO public._t VALUES ('cr replace twice: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('cr replace twice: ' || CASE WHEN SQLERRM LIKE '%ALREADY_REPLACED%' THEN 'rejected' ELSE 'FAILED ' || SQLERRM END);
END $$;
RESET ROLE;
RESET "request.jwt.claim.sub";
SELECT code FROM public._t WHERE code LIKE 'cr %' ORDER BY code;

-- @@ 167. استوديو الشهائد 1.22.0: تاريخ الإصدار — لا مستقبل، والأقدم من 60 يوماً للإدارة وحدها، والفترة مرتبة
DELETE FROM public._t;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '16516516-0000-0000-0000-000000000002';
DO $$ BEGIN
  PERFORM public.cert_issue(jsonb_build_object('halaqa_id', '16516516-0000-0000-0000-0000000000a1', 'type_key', 'participation',
    'issue_date', (public.zen_today() + 1)::text, 'design', '{"elements":[]}'::jsonb,
    'items', '[{"student_id":"16516516-0000-0000-0000-00000000000b"}]'::jsonb));
  INSERT INTO public._t VALUES ('cd future: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('cd future: ' || CASE WHEN SQLERRM LIKE '%FUTURE_DATE%' THEN 'rejected' ELSE 'FAILED ' || SQLERRM END);
END $$;
DO $$ BEGIN
  PERFORM public.cert_issue(jsonb_build_object('halaqa_id', '16516516-0000-0000-0000-0000000000a1', 'type_key', 'participation',
    'issue_date', (public.zen_today() - 61)::text, 'design', '{"elements":[]}'::jsonb,
    'items', '[{"student_id":"16516516-0000-0000-0000-00000000000b"}]'::jsonb));
  INSERT INTO public._t VALUES ('cd teacher backdate: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('cd teacher backdate: ' || CASE WHEN SQLERRM LIKE '%DATE_TOO_OLD%' THEN 'rejected' ELSE 'FAILED ' || SQLERRM END);
END $$;
DO $$ BEGIN
  PERFORM public.cert_issue(jsonb_build_object('halaqa_id', '16516516-0000-0000-0000-0000000000a1', 'type_key', 'participation',
    'period_from', public.zen_today()::text, 'period_to', (public.zen_today() - 5)::text, 'design', '{"elements":[]}'::jsonb,
    'items', '[{"student_id":"16516516-0000-0000-0000-00000000000b"}]'::jsonb));
  INSERT INTO public._t VALUES ('cd period: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('cd period: ' || CASE WHEN SQLERRM LIKE '%INVALID_PERIOD%' THEN 'rejected' ELSE 'FAILED ' || SQLERRM END);
END $$;
INSERT INTO public._t SELECT 'cd teacher recent: ' || CASE WHEN public.cert_issue(jsonb_build_object('halaqa_id', '16516516-0000-0000-0000-0000000000a1',
    'type_key', 'participation', 'issue_date', (public.zen_today() - 30)::text, 'design', '{"elements":[]}'::jsonb,
    'items', '[{"student_id":"16516516-0000-0000-0000-00000000000b"}]'::jsonb))->>'status' = 'issued' THEN 'ok' ELSE 'FAILED' END;
SET "request.jwt.claim.sub" = '16516516-0000-0000-0000-000000000001';
INSERT INTO public._t SELECT 'cd manager backdate: ' || CASE WHEN public.cert_issue(jsonb_build_object('halaqa_id', '16516516-0000-0000-0000-0000000000a1',
    'type_key', 'appreciation', 'issue_date', (public.zen_today() - 200)::text, 'design', '{"elements":[]}'::jsonb,
    'items', '[{"student_id":"16516516-0000-0000-0000-00000000000b"}]'::jsonb))->>'status' = 'issued' THEN 'ok' ELSE 'FAILED' END;
RESET ROLE;
RESET "request.jwt.claim.sub";
SELECT code FROM public._t WHERE code LIKE 'cd %' ORDER BY code;

-- @@ 168. استوديو الشهائد 1.22.0: إشعار الإلغاء بلا السبب ووليّ الأمر يُبلَّغ، ومسودة من خرج من الحلقة لا تصدر
DELETE FROM public._t;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '16516516-0000-0000-0000-000000000002';
SELECT public.cert_revoke(current_setting('zen.cr_new')::uuid, 'سبب داخلي حساس');
RESET ROLE;
RESET "request.jwt.claim.sub";
INSERT INTO public._t SELECT 'cn student notice: ' || CASE WHEN EXISTS (SELECT 1 FROM public.notifications
    WHERE user_id = '16516516-0000-0000-0000-00000000000a' AND title = 'أُلغيت شهادة' AND body NOT LIKE '%حساس%')
  AND NOT EXISTS (SELECT 1 FROM public.notifications WHERE user_id = '16516516-0000-0000-0000-00000000000a' AND body LIKE '%حساس%')
  THEN 'ok' ELSE 'FAILED' END;
INSERT INTO public._t SELECT 'cn guardian notice: ' || CASE WHEN EXISTS (SELECT 1 FROM public.notifications
    WHERE user_id = '16516516-0000-0000-0000-000000000003' AND title = 'أُلغيت شهادة' AND body LIKE 'سارة أحمد:%')
  THEN 'ok' ELSE 'FAILED' END;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '16516516-0000-0000-0000-000000000002';
SELECT set_config('zen.cn_batch', public.cert_issue(jsonb_build_object('halaqa_id', '16516516-0000-0000-0000-0000000000a1',
  'type_key', 'participation', 'status', 'draft', 'design', '{"elements":[]}'::jsonb,
  'items', '[{"student_id":"16516516-0000-0000-0000-00000000000b"}]'::jsonb))->>'batch_id', false);
RESET ROLE;
RESET "request.jwt.claim.sub";
DELETE FROM public.halaqa_students WHERE student_id = '16516516-0000-0000-0000-00000000000b';
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '16516516-0000-0000-0000-000000000002';
DO $$ BEGIN
  PERFORM public.cert_finalize(current_setting('zen.cn_batch')::uuid);
  INSERT INTO public._t VALUES ('cn finalize left: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('cn finalize left: ' || CASE WHEN SQLERRM LIKE '%NOT_IN_HALAQA%' THEN 'rejected' ELSE 'FAILED ' || SQLERRM END);
END $$;
RESET ROLE;
RESET "request.jwt.claim.sub";
DELETE FROM public.certificate_verify_attempts WHERE user_id::text LIKE '16516516-%';
DELETE FROM public.certificates WHERE student_id::text LIKE '16516516-%';
DELETE FROM public.centers WHERE id::text LIKE '16516516-%';
DELETE FROM auth.users WHERE id::text LIKE '16516516-%';
SELECT code FROM public._t WHERE code LIKE 'cn %' ORDER BY code;

-- @@ 169. استوديو الشهائد 1.23.0: المعلّم المستقل صاحب مركزه — اسم الجهة من الهوية على الشهادة، ووليّ الأمر يُشعَر برابطها
DELETE FROM public._t;
INSERT INTO auth.users (id, phone, raw_user_meta_data) VALUES
 ('16916916-0000-0000-0000-000000000001', '+967716916001', '{"name":"الأستاذ المستقل"}'),
 ('16916916-0000-0000-0000-000000000003', '+967716916003', '{"name":"وليّ أمر مستقل"}'),
 ('16916916-0000-0000-0000-00000000000a', '+967716916010', '{"name":"عبد الله بن محمد الحسني"}');
INSERT INTO public.user_roles (user_id, role) VALUES ('16916916-0000-0000-0000-000000000001', 'teacher') ON CONFLICT DO NOTHING;
INSERT INTO public.centers (id, name, created_by)
VALUES ('16916916-0000-0000-0000-0000000000cc', 'حلقة المسجد', '16916916-0000-0000-0000-000000000001');
INSERT INTO public.halaqat (id, center_id, name, teacher_id)
VALUES ('16916916-0000-0000-0000-0000000000a1', '16916916-0000-0000-0000-0000000000cc', 'حلقة الفجر', '16916916-0000-0000-0000-000000000001');
INSERT INTO public.halaqa_students (halaqa_id, student_id)
VALUES ('16916916-0000-0000-0000-0000000000a1', '16916916-0000-0000-0000-00000000000a');
INSERT INTO public.guardian_links (guardian_id, student_id)
VALUES ('16916916-0000-0000-0000-000000000003', '16916916-0000-0000-0000-00000000000a');
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '16916916-0000-0000-0000-000000000001';
INSERT INTO public._t SELECT 'pi owner manages: ' || CASE WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(public.cert_studio_context()->'centers') c
    WHERE c->>'id' = '16916916-0000-0000-0000-0000000000cc' AND (c->>'can_manage')::boolean) THEN 'ok' ELSE 'FAILED' END;
SELECT public.cert_save_brand('16916916-0000-0000-0000-0000000000cc', '{"officialName":"حلقات الأستاذ المستقل"}'::jsonb);
SELECT set_config('zen.pi_cert', public.cert_issue(jsonb_build_object('halaqa_id', '16916916-0000-0000-0000-0000000000a1',
  'type_key', 'participation', 'design', '{"elements":[{"id":"t","type":"text","text":"شهادة"}]}'::jsonb,
  'items', '[{"student_id":"16916916-0000-0000-0000-00000000000a"}]'::jsonb))->'certificates'->0->>'id', false);
INSERT INTO public._t SELECT 'pi display name: ' || CASE WHEN c->>'center_name' = 'حلقات الأستاذ المستقل'
    AND c #>> '{snapshot,vars,center,name}' = 'حلقات الأستاذ المستقل' THEN 'ok' ELSE 'FAILED ' || (c->>'center_name') END
  FROM (SELECT public.cert_get(current_setting('zen.pi_cert')::uuid) AS c) x;
RESET ROLE;
RESET "request.jwt.claim.sub";
INSERT INTO public._t SELECT 'pi guardian link: ' || CASE WHEN EXISTS (SELECT 1 FROM public.notifications
    WHERE user_id = '16916916-0000-0000-0000-000000000003' AND link = '/certificates/' || current_setting('zen.pi_cert'))
  THEN 'ok' ELSE 'FAILED' END;
SELECT code FROM public._t WHERE code LIKE 'pi %' ORDER BY code;

-- @@ 170. استوديو الشهائد 1.23.0: التحقق العام بلا حساب — الاسم الأول وحرف العائلة فقط، بلا معرّفات، وحدّ لكل IP
DELETE FROM public._t;
DELETE FROM public.certificate_public_attempts;
INSERT INTO public._t SELECT 'pv mask: ' || CASE WHEN private.cert_mask_name('عبدالرحمن بن عبدالله آل إبراهيم') = 'عبدالرحمن إ.'
    AND private.cert_mask_name('عبد الله بن محمد الحسني') = 'عبد الله ح.' AND private.cert_mask_name('  سارة  ') = 'سارة'
    AND private.cert_mask_name('عبد الله') = 'عبد الله' AND private.cert_mask_name('Omar Khalid') = 'Omar K.'
  THEN 'ok' ELSE 'FAILED ' || private.cert_mask_name('عبد الله') END;
SELECT set_config('zen.pv_code', (SELECT verify_code FROM public.certificates WHERE id = current_setting('zen.pi_cert')::uuid), false);
SET ROLE anon;
SET "request.headers" = '{"x-forwarded-for":"203.0.113.7, 10.0.0.1"}';
INSERT INTO public._t SELECT 'pv anon valid: ' || CASE WHEN r->>'status' = 'valid' AND r->>'student_name' = 'عبد الله ح.'
    AND r->>'center_name' = 'حلقات الأستاذ المستقل' AND r->>'certificate_number' IS NOT NULL
    AND NOT r ? 'id' AND NOT r ? 'student_id' AND NOT r ? 'halaqa_name' AND NOT r ? 'teacher_name' AND NOT r ? 'snapshot'
  THEN 'ok' ELSE 'FAILED ' || r::text END
  FROM (SELECT public.verify_certificate_public(current_setting('zen.pv_code')) AS r) x;
INSERT INTO public._t SELECT 'pv anon invalid: ' || CASE WHEN public.verify_certificate_public('ABCDEFGHJKLMNPQR')->>'status' = 'invalid' THEN 'ok' ELSE 'FAILED' END;
DO $$ BEGIN
  PERFORM public.verify_certificate(current_setting('zen.pv_code'));
  INSERT INTO public._t VALUES ('pv anon full verify: LEAKED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('pv anon full verify: rejected');
END $$;
SELECT public.verify_certificate_public('ABCDEFGHJKLMNPQR') FROM generate_series(1, 18);
INSERT INTO public._t SELECT 'pv rate limited: ' || CASE WHEN public.verify_certificate_public(current_setting('zen.pv_code'))->>'status' = 'rate_limited' THEN 'ok' ELSE 'FAILED' END;
SET "request.headers" = '{"x-forwarded-for":"198.51.100.9"}';
INSERT INTO public._t SELECT 'pv other ip: ' || CASE WHEN public.verify_certificate_public(current_setting('zen.pv_code'))->>'status' = 'valid' THEN 'ok' ELSE 'FAILED' END;
DO $$ BEGIN
  PERFORM count(*) FROM public.certificate_public_attempts;
  INSERT INTO public._t VALUES ('pv attempts direct: LEAKED!');
EXCEPTION WHEN insufficient_privilege THEN INSERT INTO public._t VALUES ('pv attempts direct: rejected');
END $$;
RESET "request.headers";
RESET ROLE;
DELETE FROM public.certificate_public_attempts;
DELETE FROM public.certificates WHERE student_id::text LIKE '16916916-%';
DELETE FROM public.centers WHERE id::text LIKE '16916916-%';
DELETE FROM auth.users WHERE id::text LIKE '16916916-%';
SELECT code FROM public._t WHERE code LIKE 'pv %' ORDER BY code;

-- @@ 171. استوديو الشهائد 1.24.0: الخادم يعيد فحص الشروط — غير المستوفي من المعلّم «بانتظار الاعتماد» بلا رقم ولا يراه الطالب، والمدير يُشعَر
DELETE FROM public._t;
INSERT INTO auth.users (id, phone, raw_user_meta_data) VALUES
 ('17117117-0000-0000-0000-000000000001', '+967717117001', '{"name":"مدير مركز الاعتماد"}'),
 ('17117117-0000-0000-0000-000000000002', '+967717117002', '{"name":"معلّم الاعتماد"}'),
 ('17117117-0000-0000-0000-000000000003', '+967717117003', '{"name":"مدير مركز آخر"}'),
 ('17117117-5555-0000-0000-000000000001', '+967717117101', '{"name":"سالم بن علي"}'),
 ('17117117-5555-0000-0000-000000000002', '+967717117102', '{"name":"مريم بنت أحمد"}');
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'teacher' FROM auth.users WHERE id::text LIKE '17117117-0000-%' ON CONFLICT DO NOTHING;
INSERT INTO public.centers (id, name, created_by) VALUES
 ('17117117-cccc-0000-0000-000000000001', 'مركز الاعتماد', '17117117-0000-0000-0000-000000000001'),
 ('17117117-cccc-0000-0000-000000000002', 'مركز آخر', '17117117-0000-0000-0000-000000000003');
INSERT INTO public.halaqat (id, center_id, name, teacher_id) VALUES
 ('17117117-dddd-0000-0000-000000000001', '17117117-cccc-0000-0000-000000000001', 'حلقة الاعتماد', '17117117-0000-0000-0000-000000000002'),
 ('17117117-dddd-0000-0000-000000000002', '17117117-cccc-0000-0000-000000000002', 'حلقة المركز الآخر', '17117117-0000-0000-0000-000000000003');
INSERT INTO public.halaqa_students (halaqa_id, student_id) VALUES
 ('17117117-dddd-0000-0000-000000000001', '17117117-5555-0000-0000-000000000001'),
 ('17117117-dddd-0000-0000-000000000001', '17117117-5555-0000-0000-000000000002'),
 ('17117117-dddd-0000-0000-000000000002', '17117117-5555-0000-0000-000000000001');
-- مريم سمّعت البقرة كاملة (معتمد)؛ سالم لا سجل له.
INSERT INTO public.recitation_sessions (student_id, surah_name, from_ayah, to_ayah, kind, status)
VALUES ('17117117-5555-0000-0000-000000000002', 'البقرة', 286, 1, 'memorize', 'approved');
INSERT INTO public._t SELECT 'ap server check: ' || CASE WHEN
    (private.cert_server_check('17117117-5555-0000-0000-000000000002', '[{"kind":"surahComplete"}]', '{"kind":"surah","surah":2}')->>'ok')::boolean
    AND NOT (private.cert_server_check('17117117-5555-0000-0000-000000000002', '[{"kind":"juzComplete"}]', '{"kind":"juz","juz":1}')->>'ok')::boolean
    AND (private.cert_server_check('17117117-5555-0000-0000-000000000002', '[{"kind":"memorizedPages","gte":40}]', NULL)->>'ok')::boolean
    AND NOT (private.cert_server_check('17117117-5555-0000-0000-000000000001', '[{"kind":"memorizedPages","gte":1}]', NULL)->>'ok')::boolean
    AND NOT (private.cert_server_check('17117117-5555-0000-0000-000000000002', '[{"kind":"khatm"}]', NULL)->>'ok')::boolean
    -- النِّسب والمعدّلات لا تُعاد في الخادم: «لم يُفحص» ولا تحجب.
    AND (private.cert_server_check('17117117-5555-0000-0000-000000000001', '[{"kind":"evaluationAverage","gte":4.5}]', NULL)->>'ok')::boolean
    AND private.cert_server_check('17117117-5555-0000-0000-000000000001', '[{"kind":"evaluationAverage","gte":4.5}]', NULL)->'checks'->0->>'ok' IS NULL
  THEN 'ok' ELSE 'FAILED' END;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '17117117-0000-0000-0000-000000000002';
SELECT set_config('zen.ap_issue', public.cert_issue(jsonb_build_object('halaqa_id', '17117117-dddd-0000-0000-000000000001',
  'type_key', 'memorization', 'design', '{"elements":[]}'::jsonb,
  'items', '[{"student_id":"17117117-5555-0000-0000-000000000001"},{"student_id":"17117117-5555-0000-0000-000000000002"}]'::jsonb))::text, false);
INSERT INTO public._t SELECT 'ap mixed batch: ' || CASE WHEN (r->>'pending')::int = 1
    AND r->'certificates'->0->>'status' = 'pending' AND r->'certificates'->0->>'certificate_number' IS NULL
    AND r->'certificates'->0->>'verify_code' IS NULL AND r->'certificates'->0->'reasons' = '["ineligible"]'::jsonb
    AND r->'certificates'->1->>'status' = 'issued' AND r->'certificates'->1->>'certificate_number' IS NOT NULL
  THEN 'ok' ELSE 'FAILED ' || r::text END
  FROM (SELECT current_setting('zen.ap_issue')::jsonb AS r) x;
SELECT set_config('zen.ap_pend', current_setting('zen.ap_issue')::jsonb->'certificates'->0->>'id', false);
INSERT INTO public._t SELECT 'ap teacher sees pending: ' || CASE WHEN (public.cert_list('{"status":"pending"}')->>'total')::int = 1
    AND NOT (public.cert_list('{"status":"pending"}')->'items'->0->>'can_approve')::boolean THEN 'ok' ELSE 'FAILED' END;
INSERT INTO public._t SELECT 'ap snapshot check: ' || CASE WHEN g->'snapshot'->'server_check'->>'ok' = 'false'
    AND g->'snapshot'->'approval'->'reasons' = '["ineligible"]'::jsonb AND NOT (g->>'can_approve')::boolean
  THEN 'ok' ELSE 'FAILED ' || g::text END FROM (SELECT public.cert_get(current_setting('zen.ap_pend')::uuid) AS g) x;
DO $$ BEGIN
  PERFORM public.cert_approve(ARRAY[current_setting('zen.ap_pend')::uuid]);
  INSERT INTO public._t VALUES ('ap teacher approves: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('ap teacher approves: ' || CASE WHEN SQLERRM LIKE '%NOT_ALLOWED%' THEN 'rejected' ELSE 'FAILED ' || SQLERRM END);
END $$;
-- التجاوز من المعلّم: لا يُرفض، ينتظر الاعتماد.
INSERT INTO public._t SELECT 'ap teacher override: ' || CASE WHEN r->'certificates'->0->>'status' = 'pending'
    AND r->'certificates'->0->'reasons' = '["override"]'::jsonb THEN 'ok' ELSE 'FAILED ' || r::text END
  FROM (SELECT public.cert_issue(jsonb_build_object('halaqa_id', '17117117-dddd-0000-0000-000000000001',
    'type_key', 'surah_complete', 'design', '{"elements":[]}'::jsonb,
    'items', '[{"student_id":"17117117-5555-0000-0000-000000000002","override":true,"achievement_ref":{"kind":"surah","surah":2}}]'::jsonb)) AS r) x;
SET "request.jwt.claim.sub" = '17117117-5555-0000-0000-000000000001';
DO $$ BEGIN
  PERFORM public.cert_get(current_setting('zen.ap_pend')::uuid);
  INSERT INTO public._t VALUES ('ap student no pending: LEAKED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('ap student no pending: ' ||
  CASE WHEN (public.cert_list('{"status":"all"}')->>'total')::int = 0 THEN 'rejected' ELSE 'LEAKED! list' END);
END $$;
RESET ROLE;
INSERT INTO public._t SELECT 'ap manager notified: ' || CASE WHEN EXISTS (SELECT 1 FROM public.notifications
    WHERE user_id = '17117117-0000-0000-0000-000000000001' AND title = 'شهادات بانتظار الاعتماد' AND link = '/certificates?status=pending')
    AND NOT EXISTS (SELECT 1 FROM public.notifications WHERE user_id = '17117117-5555-0000-0000-000000000001')
  THEN 'ok' ELSE 'FAILED' END;
SELECT set_config('zen.ap_code', (SELECT verify_code FROM public.certificates WHERE id = current_setting('zen.ap_pend')::uuid), false);
SET ROLE anon;
INSERT INTO public._t SELECT 'ap pending not verifiable: ' || CASE WHEN public.verify_certificate_public(current_setting('zen.ap_code'))->>'status' = 'invalid'
  THEN 'ok' ELSE 'LEAKED!' END;
RESET ROLE;
DELETE FROM public.certificate_public_attempts;
SELECT code FROM public._t WHERE code LIKE 'ap %' ORDER BY code;

-- @@ 172. استوديو الشهائد 1.24.0: المدير يعتمد فيصدر برقم ويُشعَر الطالب ويذكر التحقق الاعتماد، أو يردّ بسبب؛ وشرط المركز «اعتماد الكل»
DELETE FROM public._t;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '17117117-0000-0000-0000-000000000003';
DO $$ BEGIN
  PERFORM public.cert_approve(ARRAY[current_setting('zen.ap_pend')::uuid]);
  INSERT INTO public._t VALUES ('aa other manager: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('aa other manager: ' || CASE WHEN SQLERRM LIKE '%NOT_ALLOWED%' THEN 'rejected' ELSE 'FAILED ' || SQLERRM END);
END $$;
SET "request.jwt.claim.sub" = '17117117-0000-0000-0000-000000000001';
INSERT INTO public._t SELECT 'aa manager stats: ' || CASE WHEN (s->>'to_approve')::int = 2 AND (s->>'pending')::int = 2 THEN 'ok' ELSE 'FAILED ' || s::text END
  FROM (SELECT public.cert_stats('17117117-cccc-0000-0000-000000000001', NULL) AS s) x;
INSERT INTO public._t SELECT 'aa approve: ' || CASE WHEN r->'certificates'->0->>'status' = 'issued'
    AND r->'certificates'->0->>'certificate_number' ~ '^ZEN-[A-Z0-9]{2,6}-[0-9]{4}-[0-9]{4}$' THEN 'ok' ELSE 'FAILED ' || r::text END
  FROM (SELECT public.cert_approve(ARRAY[current_setting('zen.ap_pend')::uuid]) AS r) x;
DO $$ BEGIN
  PERFORM public.cert_approve(ARRAY[current_setting('zen.ap_pend')::uuid]);
  INSERT INTO public._t VALUES ('aa approve twice: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('aa approve twice: ' || CASE WHEN SQLERRM LIKE '%NOT_PENDING%' THEN 'rejected' ELSE 'FAILED ' || SQLERRM END);
END $$;
INSERT INTO public._t SELECT 'aa verify approved: ' || CASE WHEN (v->>'approved')::boolean AND v->>'status' = 'valid' THEN 'ok' ELSE 'FAILED ' || v::text END
  FROM (SELECT public.verify_certificate(current_setting('zen.ap_code')) AS v) x;
INSERT INTO public._t SELECT 'aa get approver: ' || CASE WHEN g->>'approved_by_name' = 'مدير مركز الاعتماد'
    AND g->'snapshot'->'vars'->'certificate'->>'number' = g->>'certificate_number' THEN 'ok' ELSE 'FAILED' END
  FROM (SELECT public.cert_get(current_setting('zen.ap_pend')::uuid) AS g) x;
SELECT set_config('zen.aa_ovr', (SELECT x->>'id' FROM jsonb_array_elements(public.cert_list('{"status":"pending"}')->'items') x LIMIT 1), false);
DO $$ BEGIN
  PERFORM public.cert_reject(ARRAY[current_setting('zen.aa_ovr')::uuid], 'لا');
  INSERT INTO public._t VALUES ('aa reject no reason: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('aa reject no reason: ' || CASE WHEN SQLERRM LIKE '%INVALID_REASON%' THEN 'rejected' ELSE 'FAILED ' || SQLERRM END);
END $$;
SELECT set_config('zen.aa_rej', public.cert_reject(ARRAY[current_setting('zen.aa_ovr')::uuid], 'لم يُتمّ المراجعة بعد')->>'rejected', false);
INSERT INTO public._t SELECT 'aa reject: ' || CASE WHEN current_setting('zen.aa_rej') = '1'
    AND (SELECT g->>'status' = 'rejected' AND g->>'certificate_number' IS NULL AND g->>'review_note' = 'لم يُتمّ المراجعة بعد'
           FROM (SELECT public.cert_get(current_setting('zen.aa_ovr')::uuid) AS g) y) THEN 'ok' ELSE 'FAILED' END;
-- المدير نفسه يصدر غير المستوفي مباشرة (قراره)، ويُسجَّل فحص الخادم في اللقطة.
SELECT set_config('zen.aa_direct', public.cert_issue(jsonb_build_object('halaqa_id', '17117117-dddd-0000-0000-000000000001', 'type_key', 'quran_complete',
    'design', '{"elements":[]}'::jsonb, 'items', '[{"student_id":"17117117-5555-0000-0000-000000000001"}]'::jsonb))::text, false);
INSERT INTO public._t SELECT 'aa manager direct: ' || CASE WHEN r->'certificates'->0->>'status' = 'issued'
    AND public.cert_get((r->'certificates'->0->>'id')::uuid)->'snapshot'->'server_check'->>'ok' = 'false'
  THEN 'ok' ELSE 'FAILED ' || r::text END
  FROM (SELECT current_setting('zen.aa_direct')::jsonb AS r) x;
RESET ROLE;
INSERT INTO public._t SELECT 'aa notices: ' || CASE WHEN EXISTS (SELECT 1 FROM public.notifications
    WHERE user_id = '17117117-5555-0000-0000-000000000001' AND link = '/certificates/' || current_setting('zen.ap_pend'))
    AND EXISTS (SELECT 1 FROM public.notifications WHERE user_id = '17117117-0000-0000-0000-000000000002' AND title = 'اعتُمدت الشهادة')
    AND EXISTS (SELECT 1 FROM public.notifications WHERE user_id = '17117117-0000-0000-0000-000000000002' AND title = 'لم تُعتمد الشهادة')
    AND EXISTS (SELECT 1 FROM public.certificate_audit_log WHERE action = 'certificate.approve' AND entity_id = current_setting('zen.ap_pend')::uuid)
  THEN 'ok' ELSE 'FAILED' END;
-- شرط المركز: كل شهادة من غير المدير تنتظر الاعتماد، ولو بلا شروط.
UPDATE public.centers SET certificate_brand = '{"requireApproval":true}' WHERE id = '17117117-cccc-0000-0000-000000000001';
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '17117117-0000-0000-0000-000000000002';
INSERT INTO public._t SELECT 'aa center policy: ' || CASE WHEN r->'certificates'->0->>'status' = 'pending'
    AND r->'certificates'->0->'reasons' = '["center_policy"]'::jsonb THEN 'ok' ELSE 'FAILED ' || r::text END
  FROM (SELECT public.cert_issue(jsonb_build_object('halaqa_id', '17117117-dddd-0000-0000-000000000001', 'type_key', 'appreciation',
    'design', '{"elements":[]}'::jsonb, 'items', '[{"student_id":"17117117-5555-0000-0000-000000000002"}]'::jsonb)) AS r) x;
-- والمسودة كذلك عند إصدارها.
SELECT set_config('zen.aa_draft', public.cert_issue(jsonb_build_object('halaqa_id', '17117117-dddd-0000-0000-000000000001',
  'type_key', 'appreciation', 'status', 'draft', 'design', '{"elements":[]}'::jsonb,
  'items', '[{"student_id":"17117117-5555-0000-0000-000000000001"}]'::jsonb))->>'batch_id', false);
INSERT INTO public._t SELECT 'aa finalize pending: ' || CASE WHEN (r->>'pending')::int = 1 AND r->'certificates'->0->>'status' = 'pending'
  THEN 'ok' ELSE 'FAILED ' || r::text END
  FROM (SELECT public.cert_finalize(current_setting('zen.aa_draft')::uuid, NULL) AS r) x;
RESET ROLE;
SELECT code FROM public._t WHERE code LIKE 'aa %' ORDER BY code;

-- @@ 173. استوديو الشهائد 1.24.0: ترقيم لكل مركز وسنة ZEN-<رمز>-YYYY-NNNN — رمز مختار فريد، وعدّاد متتابع، والصيغة القديمة صالحة
DELETE FROM public._t;
UPDATE public.centers SET certificate_brand = '{"numberPrefix":"shd"}' WHERE id = '17117117-cccc-0000-0000-000000000001';
INSERT INTO public._t SELECT 'an chosen prefix: ' || CASE WHEN a ~ ('^ZEN-SHD-' || to_char(public.zen_today(), 'YYYY') || '-[0-9]{4}$')
    AND split_part(b, '-', 4)::int = split_part(a, '-', 4)::int + 1 THEN 'ok' ELSE 'FAILED ' || a || ' ' || b END
  FROM (SELECT private.cert_next_center_number('17117117-cccc-0000-0000-000000000001', public.zen_today()) AS a) x,
       LATERAL (SELECT private.cert_next_center_number('17117117-cccc-0000-0000-000000000001', public.zen_today()) AS b) y;
UPDATE public.centers SET certificate_brand = '{"numberPrefix":"SHD"}' WHERE id = '17117117-cccc-0000-0000-000000000002';
INSERT INTO public._t SELECT 'an prefix unique: ' || CASE WHEN private.cert_next_center_number('17117117-cccc-0000-0000-000000000002', '2025-05-01')
    !~ '^ZEN-SHD-' AND private.cert_next_center_number('17117117-cccc-0000-0000-000000000002', '2025-05-01') ~ '-2025-0002$'
  THEN 'ok' ELSE 'FAILED' END;
INSERT INTO public._t SELECT 'an old format valid: ' || CASE WHEN 'ZEN-2026-000123' ~ '^ZEN-([A-Z0-9]{2,6}-)?[0-9]{4}-[0-9]{4,}$' THEN 'ok' ELSE 'FAILED' END;
DO $$ BEGIN
  UPDATE public.certificates SET certificate_number = 'ZEN-bad-2026-1' WHERE center_id = '17117117-cccc-0000-0000-000000000001' AND status = 'issued';
  INSERT INTO public._t VALUES ('an bad format: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('an bad format: rejected');
END $$;
DO $$ BEGIN
  PERFORM count(*) FROM public.certificate_counters;
  SET LOCAL ROLE authenticated;
  PERFORM count(*) FROM public.certificate_counters;
  INSERT INTO public._t VALUES ('an counters direct: LEAKED!');
EXCEPTION WHEN insufficient_privilege THEN INSERT INTO public._t VALUES ('an counters direct: rejected');
END $$;
RESET ROLE;
DELETE FROM public.certificates WHERE student_id::text LIKE '17117117-%';
DELETE FROM public.centers WHERE id::text LIKE '17117117-%';
DELETE FROM auth.users WHERE id::text LIKE '17117117-%';
SELECT code FROM public._t WHERE code LIKE 'an %' ORDER BY code;

-- @@ 174. استوديو الشهائد 1.25.0: cert_get_many دفعة واحدة بلا تكرار التصميم ولا تسريب، وحذف مركز له شهادات صادرة يبقيها قابلة للتحقق، وSVG أشد
DELETE FROM public._t;
INSERT INTO auth.users (id, phone, raw_user_meta_data) VALUES
 ('17417417-0000-0000-0000-000000000001', '+967717417001', '{"name":"مدير مركز الأداء"}'),
 ('17417417-0000-0000-0000-000000000002', '+967717417002', '{"name":"غريب"}'),
 ('17417417-5555-0000-0000-000000000001', '+967717417101', '{"name":"خالد بن سعيد"}'),
 ('17417417-5555-0000-0000-000000000002', '+967717417102', '{"name":"هند بنت عمر"}');
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'teacher' FROM auth.users WHERE id::text LIKE '17417417-0000-%' ON CONFLICT DO NOTHING;
INSERT INTO public.centers (id, name, created_by) VALUES
 ('17417417-cccc-0000-0000-000000000001', 'مركز الأداء', '17417417-0000-0000-0000-000000000001');
INSERT INTO public.halaqat (id, center_id, name, teacher_id) VALUES
 ('17417417-dddd-0000-0000-000000000001', '17417417-cccc-0000-0000-000000000001', 'حلقة الأداء', '17417417-0000-0000-0000-000000000001');
INSERT INTO public.halaqa_students (halaqa_id, student_id) VALUES
 ('17417417-dddd-0000-0000-000000000001', '17417417-5555-0000-0000-000000000001'),
 ('17417417-dddd-0000-0000-000000000001', '17417417-5555-0000-0000-000000000002');
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '17417417-0000-0000-0000-000000000001';
SELECT set_config('zen.pf_issue', public.cert_issue(jsonb_build_object('halaqa_id', '17417417-dddd-0000-0000-000000000001',
  'type_key', 'participation', 'design', '{"elements":[]}'::jsonb,
  'items', '[{"student_id":"17417417-5555-0000-0000-000000000001"},{"student_id":"17417417-5555-0000-0000-000000000002"}]'::jsonb))::text, false);
SELECT set_config('zen.pf_ids', (SELECT jsonb_agg(e->>'id')::text FROM jsonb_array_elements(current_setting('zen.pf_issue')::jsonb->'certificates') e), false);
INSERT INTO public._t SELECT 'pf get many: ' || CASE WHEN jsonb_array_length(r->'items') = 2
    AND (SELECT count(*) FROM jsonb_object_keys(r->'designs')) = 1
    AND NOT (r->'items'->0 ? 'design') AND NOT (r->'items'->0 ? 'assets')
    AND r->'items'->0->>'design_id' IS NOT NULL
  THEN 'ok' ELSE 'FAILED ' || r::text END
  FROM (SELECT public.cert_get_many(ARRAY(SELECT jsonb_array_elements_text(current_setting('zen.pf_ids')::jsonb)::uuid)
         || '00000000-0000-0000-0000-000000000000'::uuid) AS r) x;
INSERT INTO public._t SELECT 'pf list scoped: ' || CASE WHEN (public.cert_list('{}')->>'total')::int = 2
    AND (public.cert_stats()->>'issued')::int = 2 THEN 'ok' ELSE 'FAILED' END;
DO $$ BEGIN
  PERFORM public.cert_get_many(ARRAY(SELECT gen_random_uuid() FROM generate_series(1, 201)));
  INSERT INTO public._t VALUES ('pf too many: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('pf too many: ' || CASE WHEN SQLERRM LIKE '%TOO_MANY%' THEN 'rejected' ELSE 'FAILED ' || SQLERRM END);
END $$;
-- L1: كيانات مرمّزة، وurl() خارجي، وتحريك يغيّر الرابط، وdata: — كلها مرفوضة؛ وurl(#id) مقبول.
DO $$
DECLARE s text; n int := 0;
BEGIN
  FOREACH s IN ARRAY ARRAY[
    '<svg xmlns="http://www.w3.org/2000/svg"><a href="&#106;avascript:x()"><rect/></a></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><rect style="fill:url(https://e.x/a)"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><a><animate attributeName="href" to="https://e.x"/></a></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><image href="data:image/svg+xml;base64,AA"/></svg>',
    '<!DOCTYPE svg [<!ENTITY a "x">]><svg/>'] LOOP
    BEGIN
      PERFORM public.cert_save_asset('17417417-cccc-0000-0000-000000000001', jsonb_build_object('kind', 'decoration',
        'data_url', 'data:image/svg+xml;base64,' || translate(encode(convert_to(s, 'UTF8'), 'base64'), E'\n', ''), 'width', 10, 'height', 10));
    EXCEPTION WHEN others THEN IF SQLERRM LIKE '%UNSAFE_SVG%' THEN n := n + 1; END IF;
    END;
  END LOOP;
  INSERT INTO public._t VALUES ('pf svg stricter: ' || CASE WHEN n = 5 THEN 'rejected' ELSE 'ALLOWED! ' || n END);
END $$;
INSERT INTO public._t SELECT 'pf svg local ref ok: ' || CASE WHEN public.cert_save_asset('17417417-cccc-0000-0000-000000000001',
    jsonb_build_object('kind', 'decoration', 'width', 10, 'height', 10, 'data_url', 'data:image/svg+xml;base64,' || translate(encode(convert_to(
    '<svg xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g"/></defs><rect fill="url(#g)"/></svg>', 'UTF8'), 'base64'), E'\n', '')))
    IS NOT NULL THEN 'ok' ELSE 'FAILED' END;
SET "request.jwt.claim.sub" = '17417417-0000-0000-0000-000000000002';
INSERT INTO public._t SELECT 'pf stranger many: ' || CASE WHEN jsonb_array_length(r->'items') = 0 AND r->'designs' = '{}'::jsonb
  THEN 'rejected' ELSE 'LEAKED! ' || r::text END
  FROM (SELECT public.cert_get_many(ARRAY(SELECT jsonb_array_elements_text(current_setting('zen.pf_ids')::jsonb)::uuid)) AS r) x;
INSERT INTO public._t SELECT 'pf stranger list: ' || CASE WHEN (public.cert_list('{"status":"all"}')->>'total')::int = 0 THEN 'rejected' ELSE 'LEAKED!' END;
RESET ROLE;
-- L4: حذف المركز لا يتعطّل بالشهادات الصادرة، والتحقق يبقى صالحاً من اللقطة.
SELECT set_config('zen.pf_code', (SELECT verify_code FROM public.certificates
  WHERE id = (current_setting('zen.pf_ids')::jsonb->>0)::uuid), false);
DO $$ BEGIN
  DELETE FROM public.centers WHERE id = '17417417-cccc-0000-0000-000000000001';
  INSERT INTO public._t VALUES ('pf delete center: ok');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('pf delete center: FAILED ' || SQLERRM);
END $$;
INSERT INTO public._t SELECT 'pf verify after delete: ' || CASE WHEN public.verify_certificate(current_setting('zen.pf_code'))->>'status' = 'valid'
  THEN 'ok' ELSE 'FAILED ' || public.verify_certificate(current_setting('zen.pf_code'))::text END;
DELETE FROM public.certificates WHERE student_id::text LIKE '17417417-%';
DELETE FROM public.centers WHERE id::text LIKE '17417417-%';
DELETE FROM auth.users WHERE id::text LIKE '17417417-%';
SELECT code FROM public._t WHERE code LIKE 'pf %' ORDER BY code;

-- @@ 175. استوديو الشهائد 1.26.0: لوحة التكريم لكل طالب في الحلقة (العدد واليدوي والمراجع) لمن يصدر لها فقط، وبصمة ثابتة في التحقق، ونوع «إجازة» شرطه الختم
DELETE FROM public._t;
INSERT INTO auth.users (id, phone, raw_user_meta_data) VALUES
 ('17517517-0000-0000-0000-000000000001', '+967717517001', '{"name":"مدير مركز التكريم"}'),
 ('17517517-0000-0000-0000-000000000002', '+967717517002', '{"name":"غريب"}'),
 ('17517517-5555-0000-0000-000000000001', '+967717517101', '{"name":"عائشة بنت محمد"}'),
 ('17517517-5555-0000-0000-000000000002', '+967717517102', '{"name":"عمار بن ياسر"}');
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'teacher' FROM auth.users WHERE id::text LIKE '17517517-0000-%' ON CONFLICT DO NOTHING;
INSERT INTO public.centers (id, name, created_by) VALUES
 ('17517517-cccc-0000-0000-000000000001', 'مركز التكريم', '17517517-0000-0000-0000-000000000001');
INSERT INTO public.halaqat (id, center_id, name, teacher_id) VALUES
 ('17517517-dddd-0000-0000-000000000001', '17517517-cccc-0000-0000-000000000001', 'حلقة التكريم', '17517517-0000-0000-0000-000000000001');
INSERT INTO public.halaqa_students (halaqa_id, student_id) VALUES
 ('17517517-dddd-0000-0000-000000000001', '17517517-5555-0000-0000-000000000001'),
 ('17517517-dddd-0000-0000-000000000001', '17517517-5555-0000-0000-000000000002');
INSERT INTO public._t SELECT 'hn ijazah type: ' || CASE WHEN EXISTS (SELECT 1 FROM public.certificate_types
    WHERE key = 'ijazah' AND center_id IS NULL AND conditions = '[{"kind":"khatm"}]'::jsonb) THEN 'ok' ELSE 'FAILED' END;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '17517517-0000-0000-0000-000000000001';
SELECT set_config('zen.hn_issue', public.cert_issue(jsonb_build_object('halaqa_id', '17517517-dddd-0000-0000-000000000001',
  'type_key', 'juz_complete', 'design', '{"elements":[]}'::jsonb,
  'items', '[{"student_id":"17517517-5555-0000-0000-000000000001","override":true,"achievement_ref":{"kind":"juz","juz":30}}]'::jsonb))::text, false);
INSERT INTO public._t SELECT 'hn board: ' || CASE WHEN jsonb_array_length(r->'students') = 2
    AND r->'students'->0->>'student_id' = '17517517-5555-0000-0000-000000000002' AND (r->'students'->0->>'count')::int = 0
    AND (r->'students'->1->>'count')::int = 1 AND (r->'students'->1->>'manual')::int = 1
    AND r->'students'->1->'items'->0->>'type_key' = 'juz_complete'
    AND (r->'students'->1->'items'->0->'ref'->>'juz')::int = 30
  THEN 'ok' ELSE 'FAILED ' || r::text END
  FROM (SELECT public.cert_honor('17517517-dddd-0000-0000-000000000001', public.zen_today() - 30) AS r) x;
DO $$ BEGIN
  PERFORM public.cert_honor('17517517-dddd-0000-0000-000000000001', public.zen_today() - 800);
  INSERT INTO public._t VALUES ('hn long period: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('hn long period: ' || CASE WHEN SQLERRM LIKE '%INVALID_PERIOD%' THEN 'rejected' ELSE 'FAILED ' || SQLERRM END);
END $$;
SELECT set_config('zen.hn_id', current_setting('zen.hn_issue')::jsonb->'certificates'->0->>'id', false);
INSERT INTO public._t SELECT 'hn fingerprint get: ' || CASE WHEN g->>'fingerprint' ~ '^[0-9A-F]{4}(-[0-9A-F]{4}){3}$'
  THEN 'ok' ELSE 'FAILED ' || COALESCE(g->>'fingerprint', 'null') END
  FROM (SELECT public.cert_get(current_setting('zen.hn_id')::uuid) AS g) x;
SELECT set_config('zen.hn_fp', public.cert_get(current_setting('zen.hn_id')::uuid)->>'fingerprint', false);
SET "request.jwt.claim.sub" = '17517517-0000-0000-0000-000000000002';
DO $$ BEGIN
  PERFORM public.cert_honor('17517517-dddd-0000-0000-000000000001', public.zen_today() - 30);
  INSERT INTO public._t VALUES ('hn stranger: LEAKED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('hn stranger: ' || CASE WHEN SQLERRM LIKE '%NOT_ALLOWED%' THEN 'rejected' ELSE 'FAILED ' || SQLERRM END);
END $$;
RESET ROLE;
SELECT set_config('zen.hn_code', (SELECT verify_code FROM public.certificates WHERE id = current_setting('zen.hn_id')::uuid), false);
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '17517517-0000-0000-0000-000000000002';
INSERT INTO public._t SELECT 'hn fingerprint verify: ' || CASE
    WHEN public.verify_certificate(current_setting('zen.hn_code'))->>'fingerprint' = current_setting('zen.hn_fp')
  THEN 'ok' ELSE 'FAILED' END;
SET ROLE anon;
INSERT INTO public._t SELECT 'hn fingerprint public: ' || CASE
    WHEN public.verify_certificate_public(current_setting('zen.hn_code'))->>'fingerprint' = current_setting('zen.hn_fp')
  THEN 'ok' ELSE 'FAILED' END;
RESET ROLE;
-- البصمة تتبع اللقطة: أي تغيير في المحتوى يغيّرها (الحارس يمنع التغيير أصلاً بعد الإصدار).
INSERT INTO public._t SELECT 'hn fingerprint content: ' || CASE WHEN private.cert_fingerprint(c)
    <> private.cert_fingerprint(jsonb_populate_record(c, '{"student_name":"آخر"}'::jsonb))
  THEN 'ok' ELSE 'FAILED' END
  FROM public.certificates c WHERE c.id = current_setting('zen.hn_id')::uuid;
DELETE FROM public.certificate_public_attempts;
DELETE FROM public.certificates WHERE student_id::text LIKE '17517517-%';
DELETE FROM public.centers WHERE id::text LIKE '17517517-%';
DELETE FROM auth.users WHERE id::text LIKE '17517517-%';
SELECT code FROM public._t WHERE code LIKE 'hn %' ORDER BY code;

-- @@ 176. قفل التطبيق 1.29.0: إشعارات خاصة لكل رمز (صاحبه وحده يغيّرها، وclaim يحملها)، وأحداث القفل في التحليلات
DELETE FROM public._t;
DELETE FROM public.push_outbox;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
SELECT public.save_native_push_token('lock_private_tok:APA91b' || repeat('p', 40), 'android');
INSERT INTO public._t SELECT 'lp default public: '
  || CASE WHEN NOT private_preview THEN 'ok' ELSE 'FAILED' END
  FROM public.native_push_tokens WHERE token = 'lock_private_tok:APA91b' || repeat('p', 40);
INSERT INTO public._t SELECT 'lp own set: '
  || CASE WHEN public.set_native_push_private('lock_private_tok:APA91b' || repeat('p', 40), true) THEN 'ok' ELSE 'FAILED' END;
SET "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
INSERT INTO public._t SELECT 'lp other set: '
  || CASE WHEN public.set_native_push_private('lock_private_tok:APA91b' || repeat('p', 40), false) THEN 'ALLOWED!' ELSE 'rejected' END;
RESET ROLE;
RESET "request.jwt.claim.sub";
INSERT INTO public._t SELECT 'lp still private: '
  || CASE WHEN private_preview THEN 'ok' ELSE 'FAILED' END
  FROM public.native_push_tokens WHERE token = 'lock_private_tok:APA91b' || repeat('p', 40);
INSERT INTO public._t SELECT 'lp anon: '
  || CASE WHEN has_function_privilege('anon', 'public.set_native_push_private(text, boolean)', 'execute')
          THEN 'ALLOWED!' ELSE 'rejected' END;
DO $$ BEGIN
  PERFORM public.set_native_push_private('x', true);
  INSERT INTO public._t VALUES ('lp no auth: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('lp no auth: ' || CASE WHEN SQLERRM LIKE '%AUTH_REQUIRED%' THEN 'rejected' ELSE 'FAILED ' || SQLERRM END);
END $$;
INSERT INTO public.notifications (user_id, kind, title, link)
VALUES ('22222222-2222-2222-2222-222222222222', 'assignment', 'واجب سري', '/today');
SET ROLE service_role;
CREATE TEMP TABLE _lpclaim AS SELECT * FROM public.claim_push_batch(10);
RESET ROLE;
INSERT INTO public._t SELECT 'lp claim carries private: '
  || CASE WHEN count(*) = 1
           AND EXISTS (SELECT 1 FROM jsonb_array_elements(min(subscriptions::text)::jsonb) e
                        WHERE e ->> 'token' LIKE 'lock_private_tok:%' AND (e ->> 'private')::boolean)
      THEN 'ok' ELSE 'FAILED' END FROM _lpclaim;
DROP TABLE _lpclaim;
DELETE FROM public.push_outbox;
DELETE FROM public.native_push_tokens WHERE token LIKE 'lock_private_tok:%';
INSERT INTO public._t SELECT 'lp usage events: '
  || CASE WHEN public.usage_events_allowed() @> ARRAY['lock_active', 'lock_recovered', 'lock_pin_unavailable', 'app_open']
      THEN 'ok' ELSE 'FAILED' END;
SELECT code FROM public._t WHERE code LIKE 'lp %' ORDER BY code;

-- @@ 177. تدقيق أكتوبر 2026 (P0-05): موافقة التحليل الآلي لصوت التسميع — مطفأة افتراضياً، لصاحبها وحده، ومنفصلة عن سياق المساعد
DELETE FROM public._t;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '10910910-0000-0000-0000-000000000002';
INSERT INTO public._t SELECT 'ra default off: ' || CASE WHEN (public.my_ai_consent()->>'recitation_audio')::boolean = false THEN 'ok' ELSE 'FAILED' END;
INSERT INTO public._t SELECT 'ra grant: ' || CASE WHEN (x->>'recitation_audio')::boolean AND x->>'recitation_granted_at' IS NOT NULL
                                                  AND (x->>'memo_context')::boolean = false THEN 'ok' ELSE 'FAILED' END
  FROM (SELECT public.set_recitation_ai_consent(true, true) AS x) y;
DO $$ BEGIN
  PERFORM public.has_recitation_ai_consent('10910910-0000-0000-0000-000000000002');
  INSERT INTO public._t VALUES ('ra client check: ALLOWED!');
EXCEPTION WHEN insufficient_privilege THEN INSERT INTO public._t VALUES ('ra client check: rejected');
END $$;
RESET ROLE;
RESET "request.jwt.claim.sub";
INSERT INTO public._t SELECT 'ra server sees grant: ' || CASE WHEN public.has_recitation_ai_consent('10910910-0000-0000-0000-000000000002') THEN 'ok' ELSE 'FAILED' END;
INSERT INTO public._t SELECT 'ra other user: ' || CASE WHEN NOT public.has_recitation_ai_consent('10010010-0000-0000-0000-000000000001') THEN 'ok' ELSE 'LEAKED!' END;
-- سحب موافقة المساعد لا يمسّ موافقة الصوت، والعكس.
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '10910910-0000-0000-0000-000000000002';
SELECT public.set_ai_consent(false);
INSERT INTO public._t SELECT 'ra independent of memo: ' || CASE WHEN (public.my_ai_consent()->>'recitation_audio')::boolean THEN 'ok' ELSE 'FAILED' END;
INSERT INTO public._t SELECT 'ra revoke: ' || CASE WHEN (x->>'recitation_audio')::boolean = false AND x->>'recitation_revoked_at' IS NOT NULL THEN 'ok' ELSE 'FAILED' END
  FROM (SELECT public.set_recitation_ai_consent(false) AS x) y;
RESET ROLE;
RESET "request.jwt.claim.sub";
INSERT INTO public._t SELECT 'ra server sees revoke: ' || CASE WHEN NOT public.has_recitation_ai_consent('10910910-0000-0000-0000-000000000002') THEN 'ok' ELSE 'FAILED' END;
INSERT INTO public._t SELECT 'ra anon: '
  || CASE WHEN has_function_privilege('anon', 'public.set_recitation_ai_consent(boolean)', 'execute') THEN 'ALLOWED!' ELSE 'rejected' END;
INSERT INTO public._t SELECT 'ra authenticated server fn: '
  || CASE WHEN has_function_privilege('authenticated', 'public.has_recitation_ai_consent(uuid)', 'execute') THEN 'ALLOWED!' ELSE 'rejected' END;
DO $$ BEGIN
  PERFORM public.set_recitation_ai_consent(true);
  INSERT INTO public._t VALUES ('ra no auth: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('ra no auth: ' || CASE WHEN SQLERRM LIKE '%AUTH_REQUIRED%' THEN 'rejected' ELSE 'FAILED ' || SQLERRM END);
END $$;
SELECT code FROM public._t WHERE code LIKE 'ra %' ORDER BY code;

-- @@ 178. تدقيق أكتوبر 2026 (P2-04): حدّ الدقيقة لكل ميزة — التسميع المباشر لا يحجب المحادثة
DELETE FROM public._t;
DO $$
DECLARE u uuid := '22222222-2222-2222-2222-222222222222';
BEGIN
  DELETE FROM public.ai_usage_events WHERE user_id = u;
  PERFORM public.consume_ai_quota(u, 'live_recite', 450, 3);
  PERFORM public.consume_ai_quota(u, 'live_recite', 450, 3);
  PERFORM public.consume_ai_quota(u, 'live_recite', 450, 3);
  INSERT INTO public._t SELECT 'pq live blocked at its minute limit: '
    || CASE WHEN (public.consume_ai_quota(u, 'live_recite', 450, 3)->>'allowed')::boolean THEN 'FAILED' ELSE 'ok' END;
  INSERT INTO public._t SELECT 'pq chat not blocked by live: '
    || CASE WHEN (public.consume_ai_quota(u, 'chat', 120, 2)->>'allowed')::boolean THEN 'ok' ELSE 'FAILED' END;
  INSERT INTO public._t SELECT 'pq chat minute reason: '
    || CASE WHEN public.consume_ai_quota(u, 'chat', 120, 2)->>'allowed' = 'true'
             AND public.consume_ai_quota(u, 'chat', 120, 2)->>'reason' = 'minute' THEN 'ok' ELSE 'FAILED' END;
  DELETE FROM public.ai_usage_events WHERE user_id = u;
END $$;
SELECT code FROM public._t WHERE code LIKE 'pq %' ORDER BY code;

-- @@ 179. القاصرون (القرار 0011): لا تحليل آلي لصوت القاصر إلا بموافقته وموافقة وليّ أمر مرتبط
DELETE FROM public._t;
INSERT INTO auth.users (id, phone, raw_user_meta_data) VALUES
 ('17917917-0000-0000-0000-000000000001', '+967717917001', '{"name":"وليّ"}'),
 ('17917917-0000-0000-0000-000000000002', '+967717917002', '{"name":"ابن مرتبط"}'),
 ('17917917-0000-0000-0000-000000000003', '+967717917003', '{"name":"بالغ"}'),
 ('17917917-0000-0000-0000-000000000004', '+967717917004', '{"name":"طفل بلا وليّ"}'),
 ('17917917-0000-0000-0000-000000000005', '+967717917005', '{"name":"غريب"}');
INSERT INTO public.guardian_links (guardian_id, student_id, relation)
VALUES ('17917917-0000-0000-0000-000000000001', '17917917-0000-0000-0000-000000000002', 'mother');
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '17917917-0000-0000-0000-000000000003';
INSERT INTO public._t SELECT 'mn adult effective: ' || CASE WHEN (x->>'recitation_effective')::boolean AND NOT (x->>'minor')::boolean THEN 'ok' ELSE 'FAILED' END
  FROM (SELECT public.set_recitation_ai_consent(true, true) AS x) y;
SET "request.jwt.claim.sub" = '17917917-0000-0000-0000-000000000004';
INSERT INTO public._t SELECT 'mn child alone not effective: ' || CASE WHEN (x->>'minor')::boolean AND NOT (x->>'recitation_effective')::boolean AND NOT (x->>'has_guardian')::boolean THEN 'ok' ELSE 'FAILED' END
  FROM (SELECT public.set_recitation_ai_consent(true) AS x) y;
SET "request.jwt.claim.sub" = '17917917-0000-0000-0000-000000000002';
-- المرتبط بوليّ أمر قاصر حتى لو أقرّ بأن عمره 13+.
INSERT INTO public._t SELECT 'mn linked waits guardian: ' || CASE WHEN (x->>'minor')::boolean AND (x->>'has_guardian')::boolean AND NOT (x->>'recitation_effective')::boolean THEN 'ok' ELSE 'FAILED' END
  FROM (SELECT public.set_recitation_ai_consent(true, true) AS x) y;
SET "request.jwt.claim.sub" = '17917917-0000-0000-0000-000000000005';
DO $$ BEGIN
  PERFORM public.set_guardian_recitation_consent('17917917-0000-0000-0000-000000000002', true);
  INSERT INTO public._t VALUES ('mn stranger sets: ALLOWED!');
EXCEPTION WHEN others THEN INSERT INTO public._t VALUES ('mn stranger sets: ' || CASE WHEN SQLERRM LIKE '%NOT_GUARDIAN%' THEN 'rejected' ELSE 'FAILED ' || SQLERRM END);
END $$;
INSERT INTO public._t SELECT 'mn stranger lists nothing: ' || CASE WHEN count(*) = 0 THEN 'ok' ELSE 'LEAKED!' END FROM public.guardian_ai_consents_list();
SET "request.jwt.claim.sub" = '17917917-0000-0000-0000-000000000001';
INSERT INTO public._t SELECT 'mn guardian sees child wish: ' || CASE WHEN bool_and(student_consent) AND NOT bool_or(recitation_audio) AND count(*) = 1 THEN 'ok' ELSE 'FAILED' END FROM public.guardian_ai_consents_list();
SELECT public.set_guardian_recitation_consent('17917917-0000-0000-0000-000000000002', true);
DO $$ BEGIN
  PERFORM 1 FROM public.guardian_ai_consents;
  INSERT INTO public._t VALUES ('mn table direct: ALLOWED!');
EXCEPTION WHEN insufficient_privilege THEN INSERT INTO public._t VALUES ('mn table direct: rejected');
END $$;
RESET ROLE;
RESET "request.jwt.claim.sub";
INSERT INTO public._t SELECT 'mn server adult: ' || CASE WHEN public.has_recitation_ai_consent('17917917-0000-0000-0000-000000000003') THEN 'ok' ELSE 'FAILED' END;
INSERT INTO public._t SELECT 'mn server child alone: ' || CASE WHEN NOT public.has_recitation_ai_consent('17917917-0000-0000-0000-000000000004') THEN 'ok' ELSE 'LEAKED!' END;
INSERT INTO public._t SELECT 'mn server linked after guardian: ' || CASE WHEN public.has_recitation_ai_consent('17917917-0000-0000-0000-000000000002') THEN 'ok' ELSE 'FAILED' END;
-- سحب وليّ الأمر أو فكّ الربط يوقف التحليل فوراً.
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '17917917-0000-0000-0000-000000000001';
SELECT public.set_guardian_recitation_consent('17917917-0000-0000-0000-000000000002', false);
RESET ROLE;
RESET "request.jwt.claim.sub";
INSERT INTO public._t SELECT 'mn guardian revoke: ' || CASE WHEN NOT public.has_recitation_ai_consent('17917917-0000-0000-0000-000000000002') THEN 'ok' ELSE 'LEAKED!' END;
UPDATE public.guardian_ai_consents SET recitation_audio = true WHERE student_id = '17917917-0000-0000-0000-000000000002';
DELETE FROM public.guardian_links WHERE student_id = '17917917-0000-0000-0000-000000000002';
-- بلا ربط: لم يعد «مرتبطاً»، لكنه أقرّ بـ 13+ فيصير بالغاً بموافقته، وموافقة وليّ الأمر القديمة لا تُحسب.
INSERT INTO public._t SELECT 'mn unlinked guardian row ignored: ' || CASE WHEN NOT private.guardian_recitation_ok('17917917-0000-0000-0000-000000000002') THEN 'ok' ELSE 'LEAKED!' END;
INSERT INTO public._t SELECT 'mn legacy signature kept: ' || CASE WHEN has_function_privilege('authenticated', 'public.set_recitation_ai_consent(boolean)', 'execute') THEN 'ok' ELSE 'FAILED' END;
INSERT INTO public._t SELECT 'mn anon guardian fn: ' || CASE WHEN has_function_privilege('anon', 'public.set_guardian_recitation_consent(uuid, boolean)', 'execute') THEN 'ALLOWED!' ELSE 'rejected' END;
SELECT code FROM public._t WHERE code LIKE 'mn %' ORDER BY code;

-- @@ 180. جاهزية المستودع العام: مفاتيح الميزات على الخادم، وموافقة الذكاء النصّي، ومنع القاصر
DELETE FROM public._t;
INSERT INTO public._t SELECT 'sf bucket matches TS: '
  || CASE WHEN private.flag_bucket('assistant', '22222222-2222-2222-2222-222222222222') = 3
           AND private.flag_bucket('recite_ai', '18018018-0000-0000-0000-000000000003') = 10
           AND private.flag_bucket('fees', '00000000-0000-0000-0000-000000000000') = 82 THEN 'ok' ELSE 'FAILED' END;
INSERT INTO auth.users (id, phone, raw_user_meta_data) VALUES
 ('18018018-0000-0000-0000-000000000001', '+967718018001', '{"name":"بالغ"}'),
 ('18018018-0000-0000-0000-000000000002', '+967718018002', '{"name":"ابن مرتبط"}'),
 ('18018018-0000-0000-0000-000000000003', '+967718018003', '{"name":"وليّ"}'),
 ('18018018-0000-0000-0000-000000000004', '+967718018004', '{"name":"لم يُقرّ بالعمر"}');
INSERT INTO public.guardian_links (guardian_id, student_id, relation)
VALUES ('18018018-0000-0000-0000-000000000003', '18018018-0000-0000-0000-000000000002', 'father');
INSERT INTO public._t SELECT 'sf no consent: ' || CASE WHEN public.ai_access_denial('18018018-0000-0000-0000-000000000001', 'text') = 'CONSENT_REQUIRED' THEN 'ok' ELSE 'FAILED' END;
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '18018018-0000-0000-0000-000000000001';
INSERT INTO public._t SELECT 'sf adult effective: ' || CASE WHEN (x->>'text_ai_effective')::boolean THEN 'ok' ELSE 'FAILED' END
  FROM (SELECT public.set_text_ai_consent(true, true) AS x) y;
SET "request.jwt.claim.sub" = '18018018-0000-0000-0000-000000000002';
INSERT INTO public._t SELECT 'sf linked child not effective: ' || CASE WHEN NOT (x->>'text_ai_effective')::boolean THEN 'ok' ELSE 'LEAKED!' END
  FROM (SELECT public.set_text_ai_consent(true, true) AS x) y;
SET "request.jwt.claim.sub" = '18018018-0000-0000-0000-000000000004';
INSERT INTO public._t SELECT 'sf no age not effective: ' || CASE WHEN NOT (x->>'text_ai_effective')::boolean THEN 'ok' ELSE 'LEAKED!' END
  FROM (SELECT public.set_text_ai_consent(true, false) AS x) y;
DO $$ BEGIN
  PERFORM public.ai_access_denial('18018018-0000-0000-0000-000000000004', 'text');
  INSERT INTO public._t VALUES ('sf authenticated server fn: ALLOWED!');
EXCEPTION WHEN insufficient_privilege THEN INSERT INTO public._t VALUES ('sf authenticated server fn: rejected');
END $$;
RESET ROLE;
RESET "request.jwt.claim.sub";
INSERT INTO public._t SELECT 'sf adult text ok: ' || CASE WHEN public.ai_access_denial('18018018-0000-0000-0000-000000000001', 'text') IS NULL THEN 'ok' ELSE 'FAILED' END;
INSERT INTO public._t SELECT 'sf linked child blocked: ' || CASE WHEN public.ai_access_denial('18018018-0000-0000-0000-000000000002', 'text') = 'MINOR_BLOCKED' THEN 'ok' ELSE 'LEAKED!' END;
INSERT INTO public._t SELECT 'sf no age blocked: ' || CASE WHEN public.ai_access_denial('18018018-0000-0000-0000-000000000004', 'text') = 'MINOR_BLOCKED' THEN 'ok' ELSE 'LEAKED!' END;
INSERT INTO public._t SELECT 'sf teacher without age ok: ' || CASE WHEN public.ai_access_denial('18018018-0000-0000-0000-000000000004', 'teacher') IS NULL THEN 'ok' ELSE 'FAILED' END;
INSERT INTO public._t SELECT 'sf teacher linked child blocked: ' || CASE WHEN public.ai_access_denial('18018018-0000-0000-0000-000000000002', 'teacher') = 'MINOR_BLOCKED' THEN 'ok' ELSE 'LEAKED!' END;
INSERT INTO public._t SELECT 'sf unknown feature: ' || CASE WHEN public.ai_access_denial('18018018-0000-0000-0000-000000000001', 'x') = 'UNKNOWN_FEATURE' THEN 'ok' ELSE 'LEAKED!' END;
INSERT INTO public._t SELECT 'sf null user: ' || CASE WHEN public.ai_access_denial(NULL, 'text') = 'AUTH_REQUIRED' THEN 'ok' ELSE 'LEAKED!' END;
-- المفتاح: بلا صف ⇒ assistant مطفأ؛ recite_ai مزروع مطفأ.
DELETE FROM public.feature_flags WHERE key = 'assistant';
INSERT INTO public._t SELECT 'sf assistant missing row off: ' || CASE WHEN public.ai_access_denial('18018018-0000-0000-0000-000000000001', 'assistant') = 'FEATURE_OFF' THEN 'ok' ELSE 'LEAKED!' END;
INSERT INTO public._t SELECT 'sf recite_ai seeded off: ' || CASE WHEN public.ai_access_denial('18018018-0000-0000-0000-000000000001', 'recite_ai') = 'FEATURE_OFF' THEN 'ok' ELSE 'LEAKED!' END;
INSERT INTO public._t SELECT 'sf stories missing row on: ' || CASE WHEN private.feature_on('stories', '18018018-0000-0000-0000-000000000001') THEN 'ok' ELSE 'FAILED' END;
INSERT INTO public.feature_flags (key, enabled, rollout) VALUES ('assistant', true, 100);
INSERT INTO public._t SELECT 'sf assistant on: ' || CASE WHEN public.ai_access_denial('18018018-0000-0000-0000-000000000001', 'assistant') IS NULL THEN 'ok' ELSE 'FAILED' END;
INSERT INTO public._t SELECT 'sf assistant on but minor: ' || CASE WHEN public.ai_access_denial('18018018-0000-0000-0000-000000000002', 'assistant') = 'MINOR_BLOCKED' THEN 'ok' ELSE 'LEAKED!' END;
-- طرح تدريجي: bucket(recite_ai, …0003) = 10 ⇒ داخل عند 11 وخارج عند 10.
INSERT INTO public.feature_flags (key, enabled, rollout) VALUES ('recite_ai', true, 11)
  ON CONFLICT (key) DO UPDATE SET enabled = true, rollout = 11;
INSERT INTO public._t SELECT 'sf rollout in: ' || CASE WHEN private.feature_on('recite_ai', '18018018-0000-0000-0000-000000000003') THEN 'ok' ELSE 'FAILED' END;
UPDATE public.feature_flags SET rollout = 10 WHERE key = 'recite_ai';
INSERT INTO public._t SELECT 'sf rollout out: ' || CASE WHEN NOT private.feature_on('recite_ai', '18018018-0000-0000-0000-000000000003') THEN 'ok' ELSE 'LEAKED!' END;
UPDATE public.feature_flags SET enabled = false, rollout = 0 WHERE key = 'recite_ai';
DELETE FROM public.feature_flags WHERE key = 'assistant';
INSERT INTO public._t SELECT 'sf anon set consent: ' || CASE WHEN has_function_privilege('anon', 'public.set_text_ai_consent(boolean, boolean)', 'execute') THEN 'ALLOWED!' ELSE 'rejected' END;
INSERT INTO public._t SELECT 'sf service_role denial fn: ' || CASE WHEN has_function_privilege('service_role', 'public.ai_access_denial(uuid, text)', 'execute') THEN 'ok' ELSE 'FAILED' END;
SELECT code FROM public._t WHERE code LIKE 'sf %' ORDER BY code;

-- @@ 181. موثوقية الإشعارات (20261225100000): حفظ الرمز متكرّر الأمان، notification_id، إسقاط المتأخر، والإيقاظ لا يُفشل الإدراج
DELETE FROM public._t;
DELETE FROM public.push_outbox;
DELETE FROM public.native_push_tokens WHERE token LIKE 'rel_tok:%';
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
SELECT public.save_native_push_token('rel_tok:APA91b' || repeat('r', 40), 'android');
RESET ROLE;
RESET "request.jwt.claim.sub";
UPDATE public.native_push_tokens SET last_success_at = '2026-01-01', private_preview = true,
       created_at = '2026-01-01'
 WHERE token = 'rel_tok:APA91b' || repeat('r', 40);
-- إعادة الحفظ عند كل تشغيل: لا تمسح «آخر وصول» ولا الخصوصية ولا تاريخ التسجيل لصاحب الرمز نفسه.
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
SELECT public.save_native_push_token('rel_tok:APA91b' || repeat('r', 40), 'android');
RESET ROLE;
RESET "request.jwt.claim.sub";
INSERT INTO public._t SELECT 'rel resave keeps state: '
  || CASE WHEN last_success_at = '2026-01-01' AND private_preview AND created_at = '2026-01-01'
          THEN 'ok' ELSE 'FAILED' END
  FROM public.native_push_tokens WHERE token = 'rel_tok:APA91b' || repeat('r', 40);
-- حساب آخر على الجهاز نفسه: يبدأ نظيفاً (لا يرث خصوصية الحساب السابق ولا «آخر وصول»).
SET ROLE authenticated;
SET "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
SELECT public.save_native_push_token('rel_tok:APA91b' || repeat('r', 40), 'android');
RESET ROLE;
RESET "request.jwt.claim.sub";
INSERT INTO public._t SELECT 'rel new owner fresh: '
  || CASE WHEN user_id = '22222222-2222-2222-2222-222222222222' AND last_success_at IS NULL
           AND NOT private_preview THEN 'ok' ELSE 'FAILED' END
  FROM public.native_push_tokens WHERE token = 'rel_tok:APA91b' || repeat('r', 40);
-- اشتراك ويب قديم وحده لا يُدرج صفوفاً لا تصل.
DELETE FROM public.native_push_tokens WHERE token = 'rel_tok:APA91b' || repeat('r', 40);
INSERT INTO public.notifications (user_id, kind, title)
VALUES ('11111111-1111-1111-1111-111111111111', 'assignment', 'ويب فقط');
INSERT INTO public._t SELECT 'rel web-only not queued: '
  || CASE WHEN count(*) = 0 THEN 'none' ELSE 'FAILED ' || count(*) END FROM public.push_outbox;
-- بجهاز حقيقي: يُدرج (والإيقاظ بلا pg_net/Vault هنا لا يُفشل الإدراج)، والسحب يحمل notification_id.
INSERT INTO public.native_push_tokens (user_id, token, platform)
VALUES ('11111111-1111-1111-1111-111111111111', 'rel_tok:APA91b' || repeat('r', 40), 'android');
UPDATE public.notification_prefs SET quiet_start = NULL, quiet_end = NULL, categories = '{}'
 WHERE user_id = '11111111-1111-1111-1111-111111111111';
INSERT INTO public.notifications (user_id, kind, title, link)
VALUES ('11111111-1111-1111-1111-111111111111', 'assignment', 'واجب', '/today');
INSERT INTO public.push_outbox (user_id, category, title, url, send_after, created_at)
VALUES ('11111111-1111-1111-1111-111111111111', 'wird', 'ورد الأمس', '/', now() - interval '13 hours',
        now() - interval '13 hours');
SET ROLE service_role;
CREATE TEMP TABLE _rel AS SELECT * FROM public.claim_push_batch(10);
RESET ROLE;
INSERT INTO public._t SELECT 'rel claim carries nid: '
  || CASE WHEN count(*) = 1 AND bool_and(c.notification_id = n.id) THEN 'ok' ELSE 'FAILED ' || count(*) END
  FROM _rel c JOIN public.notifications n ON n.user_id = c.user_id AND n.title = 'واجب';
INSERT INTO public._t SELECT 'rel stale dropped: '
  || CASE WHEN failed_at IS NOT NULL AND sent_at IS NULL THEN 'ok' ELSE 'FAILED' END
  FROM public.push_outbox WHERE title = 'ورد الأمس';
-- وصل إلى جهاز ⇒ يُغلق؛ ولا جهاز متبقٍّ ⇒ يُغلق أيضاً بدل خمس محاولات بلا جدوى.
SET ROLE service_role;
SELECT public.finish_push(id, ARRAY['rel_tok:APA91b' || repeat('r', 40)], '{}') FROM _rel;
RESET ROLE;
INSERT INTO public._t SELECT 'rel delivered closes: '
  || CASE WHEN bool_and(o.sent_at IS NOT NULL) THEN 'ok' ELSE 'FAILED' END
  FROM public.push_outbox o JOIN _rel c ON c.id = o.id;
INSERT INTO public._t SELECT 'rel kick grants: '
  || CASE WHEN has_function_privilege('authenticated', 'public.push_outbox_kick()', 'execute')
            OR has_table_privilege('authenticated', 'public.push_dispatch_state', 'select')
          THEN 'ALLOWED!' ELSE 'rejected' END;
DROP TABLE _rel;
DELETE FROM public.native_push_tokens WHERE token LIKE 'rel_tok:%';
DELETE FROM public.push_outbox;
SELECT code FROM public._t WHERE code LIKE 'rel %' ORDER BY code;
