-- ════════════════════════════════════════════════════════════════════════════
-- المرحلة 11.2 — التقرير الشهري لوليّ الأمر
-- ════════════════════════════════════════════════════════════════════════════
-- أول كل شهر (pg_cron 06:00 UTC = 09:00 صنعاء): لكل وليّ أمر عن كل ابن، ملخّص الشهر الماضي في إشعار
-- يفتح «متابعة أبنائي» على الابن مع تقرير PDF للشهر نفسه (student_report القائم + نافذة الطباعة
-- في التطبيق، لا Edge). جدول تتبّع يجعل الإرسال مرة واحدة لكل (وليّ، ابن، شهر) مهما تكرّر التشغيل
-- (القاعدة 13). بجانب التقرير الأسبوعي القائم.

CREATE TABLE IF NOT EXISTS public.guardian_monthly_sent (
  guardian_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month_start date NOT NULL CHECK (month_start = date_trunc('month', month_start)::date),
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guardian_id, student_id, month_start)
);
CREATE INDEX IF NOT EXISTS guardian_monthly_sent_student_id_idx ON public.guardian_monthly_sent (student_id);
ALTER TABLE public.guardian_monthly_sent ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.guardian_monthly_sent FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.guardian_monthly_sent TO service_role;

-- ملخّص شهر لطالب (نص الإشعار). داخلي فقط.
CREATE OR REPLACE FUNCTION public.monthly_summary_text(_student uuid, _month date)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH b AS (SELECT date_trunc('month', _month)::date AS f,
                    (date_trunc('month', _month) + interval '1 month')::date AS t)
  SELECT concat_ws(' · ',
    CASE WHEN a.total > 0 THEN 'الحضور ' || a.ok || ' من ' || a.total ELSE 'لا حصص مسجّلة' END,
    CASE WHEN m.pages > 0 THEN 'حفظ ' || m.pages || ' صفحة' END,
    CASE WHEN rv.pages > 0 THEN 'مراجعة ' || rv.pages || ' صفحة' END,
    CASE WHEN r.n > 0 THEN r.n || ' تسميع' || COALESCE(' بمتوسط ' || r.avg || '/100', '') END,
    CASE WHEN e.n > 0 THEN e.n || ' اختبار' || COALESCE(' بمتوسط ' || e.avg || '%', '') END,
    CASE WHEN c.n > 0 THEN c.n || ' شهادة جزء' END)
    FROM b,
         LATERAL (SELECT count(*) AS total, count(*) FILTER (WHERE status IN ('present', 'late')) AS ok
                    FROM public.attendance WHERE student_id = _student AND session_date >= b.f AND session_date < b.t) a,
         LATERAL (SELECT count(DISTINCT page) AS pages FROM public.mushaf_records
                   WHERE student_id = _student AND kind = 'memorize' AND session_date >= b.f AND session_date < b.t) m,
         LATERAL (SELECT count(DISTINCT page) AS pages FROM public.mushaf_records
                   WHERE student_id = _student AND kind = 'review' AND session_date >= b.f AND session_date < b.t) rv,
         LATERAL (SELECT count(*) AS n, round(avg(score)) AS avg FROM public.recitation_assessments
                   WHERE student_id = _student AND created_at >= b.f AND created_at < b.t) r,
         LATERAL (SELECT count(*) AS n, round(avg(percentage)) AS avg FROM public.exam_results
                   WHERE student_id = _student AND created_at >= b.f AND created_at < b.t) e,
         LATERAL (SELECT count(*) AS n FROM public.certificates
                   WHERE student_id = _student AND status = 'approved' AND decided_at >= b.f AND decided_at < b.t) c
$$;
REVOKE ALL ON FUNCTION public.monthly_summary_text(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.monthly_summary_text(uuid, date) TO service_role;

-- يرسل تقرير الشهر الماضي (أو _month إن مُرّر) مرة واحدة لكل (وليّ، ابن). للخادم فقط.
CREATE OR REPLACE FUNCTION public.send_guardian_monthly_reports(_month date DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mon date := date_trunc('month', COALESCE(_month, (date_trunc('month', current_date) - interval '1 month')::date))::date;
  label text := to_char(mon, 'YYYY-MM');
  sent integer := 0;
  g record;
BEGIN
  FOR g IN
    SELECT l.guardian_id, l.student_id, COALESCE(p.name, 'ابنك') AS child
      FROM public.guardian_links l
      LEFT JOIN public.profiles p ON p.id = l.student_id
     WHERE NOT EXISTS (SELECT 1 FROM public.guardian_monthly_sent s
                        WHERE s.guardian_id = l.guardian_id AND s.student_id = l.student_id
                          AND s.month_start = mon)
  LOOP
    -- التتبّع أولاً: إن تكرّر التشغيل بالتوازي تمنع المفتاح الأساسي الإشعار المكرّر.
    INSERT INTO public.guardian_monthly_sent (guardian_id, student_id, month_start)
    VALUES (g.guardian_id, g.student_id, mon)
    ON CONFLICT DO NOTHING;
    IF FOUND THEN
      INSERT INTO public.notifications (user_id, kind, title, body, link)
      VALUES (g.guardian_id, 'guardian_monthly',
              'التقرير الشهري: ' || g.child,
              public.monthly_summary_text(g.student_id, mon) || ' — افتح لتنزيل تقرير PDF للشهر.',
              '/family?child=' || g.student_id || '&month=' || label);
      sent := sent + 1;
    END IF;
  END LOOP;
  DELETE FROM public.guardian_monthly_sent WHERE month_start < mon - interval '24 months';
  RETURN sent;
END;
$$;
REVOKE ALL ON FUNCTION public.send_guardian_monthly_reports(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.send_guardian_monthly_reports(date) TO service_role;

-- فئة الإشعار: «أبنائي».
CREATE OR REPLACE FUNCTION public.push_category(_kind text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _kind IN ('assignment', 'plan') THEN 'assignments'
    WHEN _kind = 'assessment' THEN 'grades'
    WHEN _kind IN ('guardian', 'guardian_weekly', 'guardian_monthly') THEN 'family'
    WHEN _kind IN ('announcement', 'room', 'room_report') THEN 'rooms'
    WHEN _kind IN ('achievement', 'certificate', 'challenge') THEN 'achievements'
    ELSE 'general'
  END
$$;

-- الجدولة: أول كل شهر 06:00 UTC إن كان pg_cron مفعّلاً (وإلا فعّله ثم نفّذ هذا الجزء).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'zen-guardian-monthly';
    PERFORM cron.schedule('zen-guardian-monthly', '0 6 1 * *',
                          'SELECT public.send_guardian_monthly_reports()');
  END IF;
END $$;
