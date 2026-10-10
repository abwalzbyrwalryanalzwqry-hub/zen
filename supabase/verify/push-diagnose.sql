-- تشخيص الإشعارات الفورية على الإنتاج (قراءة فقط، معاملة تُلغى): أين تتوقف السلسلة
-- notifications ← push_outbox ← المجدول ← zen-push-dispatch ← FCM ← الجهاز؟ لا يطبع إلا أعداداً وحالات.
BEGIN;
DO $$
DECLARE
  r record;
  n bigint;
BEGIN
  SELECT count(*) AS n, count(DISTINCT user_id) AS users, max(created_at) AS reg, max(last_success_at) AS ok
    INTO r FROM public.native_push_tokens;
  RAISE NOTICE 'الرموز: % رمزاً لـ % مستخدماً، آخر تسجيل %، آخر تسليم ناجح %', r.n, r.users, r.reg, r.ok;

  SELECT count(*) INTO n FROM public.notifications WHERE created_at > now() - interval '7 days';
  RAISE NOTICE 'إشعارات آخر 7 أيام: %', n;
  SELECT count(*) INTO n FROM public.notifications x
   WHERE x.created_at > now() - interval '7 days'
     AND EXISTS (SELECT 1 FROM public.native_push_tokens t WHERE t.user_id = x.user_id);
  RAISE NOTICE 'منها لمستخدمين لهم جهاز: %', n;

  SELECT count(*) AS total,
         count(*) FILTER (WHERE sent_at IS NOT NULL) AS sent,
         count(*) FILTER (WHERE failed_at IS NOT NULL) AS failed,
         count(*) FILTER (WHERE sent_at IS NULL AND failed_at IS NULL AND attempts = 0) AS waiting,
         count(*) FILTER (WHERE sent_at IS NULL AND failed_at IS NULL AND attempts > 0) AS retrying,
         count(*) FILTER (WHERE sent_at IS NULL AND failed_at IS NULL AND send_after > now()) AS later,
         max(attempts) AS max_attempts, max(sent_at) AS last_sent, min(created_at) FILTER (WHERE sent_at IS NULL) AS oldest_unsent
    INTO r FROM public.push_outbox WHERE created_at > now() - interval '7 days';
  RAISE NOTICE 'الصندوق 7 أيام: الكل % مُرسل % فاشل % ينتظر % يُعاد % مؤجَّل % أقصى محاولات % آخر إرسال % أقدم غير مُرسل %',
    r.total, r.sent, r.failed, r.waiting, r.retrying, r.later, r.max_attempts, r.last_sent, r.oldest_unsent;

  SELECT count(*) INTO n FROM public.notification_prefs WHERE NOT push_enabled;
  RAISE NOTICE 'أوقف الإشعارات من التفضيلات: %', n;

  FOR r IN SELECT extname FROM pg_extension WHERE extname IN ('pg_cron', 'pg_net', 'supabase_vault') LOOP
    RAISE NOTICE 'الامتداد مفعّل: %', r.extname;
  END LOOP;

  IF to_regclass('cron.job') IS NOT NULL THEN
    FOR r IN EXECUTE $q$SELECT jobid, schedule, active, command FROM cron.job WHERE jobname = 'zen-push-dispatch'$q$ LOOP
      RAISE NOTICE 'مهمة المجدول: % % نشطة=% %', r.jobid, r.schedule, r.active, r.command;
    END LOOP;
    IF to_regclass('cron.job_run_details') IS NOT NULL THEN
      FOR r IN EXECUTE $q$SELECT d.status, left(coalesce(d.return_message, ''), 80) AS msg, count(*) AS n, max(d.start_time) AS last
                            FROM cron.job_run_details d JOIN cron.job j ON j.jobid = d.jobid
                           WHERE j.jobname = 'zen-push-dispatch' AND d.start_time > now() - interval '1 day'
                           GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 6$q$ LOOP
        RAISE NOTICE 'تشغيلات اليوم: % «%» × % (آخرها %)', r.status, r.msg, r.n, r.last;
      END LOOP;
    END IF;
  ELSE
    RAISE NOTICE 'لا pg_cron: لا مجدول';
  END IF;

  IF to_regclass('vault.secrets') IS NOT NULL THEN
    EXECUTE $q$SELECT count(*) FROM vault.secrets WHERE name IN ('zen_push_dispatch_url', 'zen_push_dispatch_secret')$q$ INTO n;
    RAISE NOTICE 'أسرار Vault للمجدول: % من 2', n;
  END IF;

  IF to_regclass('net._http_response') IS NOT NULL THEN
    FOR r IN EXECUTE $q$SELECT status_code, left(coalesce(error_msg, ''), 80) AS err,
                               left(regexp_replace(coalesce(content, ''), '[A-Za-z0-9_\-]{60,}', '…', 'g'), 160) AS body,
                               count(*) AS n, max(created) AS last
                          FROM net._http_response WHERE created > now() - interval '1 day'
                         GROUP BY 1, 2, 3 ORDER BY 5 DESC LIMIT 8$q$ LOOP
      RAISE NOTICE 'ردود pg_net اليوم: % «%» «%» × % (آخرها %)', r.status_code, r.err, r.body, r.n, r.last;
    END LOOP;
  END IF;
END
$$;
ROLLBACK;
