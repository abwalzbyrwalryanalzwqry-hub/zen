-- ════════════════════════════════════════════════════════════════════════════
-- السجل اليومي — المرحلة 1 من خطة التطوير: لمسات أقل (docs/DAILY_RECORD.md، DR-05 وDR-07 وDR-16)
-- ════════════════════════════════════════════════════════════════════════════
-- clear_daily_attendance   : مسح حالة حضور سُجّلت خطأً (ما لم يكن للطالب إنجاز اليوم).
-- set_daily_attendance_bulk: «الجميع حاضر» و«الباقون غائبون» والتراجع عنهما في نداء واحد. كل سطر يحمل نسخته؛
--                            المتعارض أو المرفوض يُتخطّى ويُعاد سببه، ولا يُفسد بقية الأسطر.
-- daily_record_week        : حالة سجل كل يوم من الأيام السبعة المنتهية بـ_to (لشريط الأيام).
-- DR-32 (اكتُشف أثناء التنفيذ): حذف حلقة أو مركز له تسميعات من السجل اليومي كان يفشل بـ«violates foreign key
--   recitation_sessions_daily_record_id_fkey»: حذف الحلقة يتسلسل إلى سجلاتها (CASCADE) وإلى تسميعاتها (SET NULL على
--   halaqa_id) في الأمر نفسه، فيُفحص المفتاح قبل أن يصير daily_record_id فارغاً. الفحص المؤجَّل إلى نهاية المعاملة يحلّه.
-- إضافات فقط. التراجع: DROP FUNCTION للدوال الثلاث، وALTER CONSTRAINT ... NOT DEFERRABLE. الفحص: supabase/tests/checks.sql (136).

ALTER TABLE public.recitation_sessions
  ALTER CONSTRAINT recitation_sessions_daily_record_id_fkey DEFERRABLE INITIALLY DEFERRED;

/** مسح حضور الطالب في سجل اليوم. يعيد سطره كما يعيده daily_record_sheet. */
CREATE OR REPLACE FUNCTION public.clear_daily_attendance(_record uuid, _student uuid, _version integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := (SELECT auth.uid());
  rec public.halaqa_daily_records;
BEGIN
  rec := private.daily_record_for_write(_record, false);
  PERFORM private.daily_entry_check(rec.halaqa_id, rec.record_date, _student, _version);
  IF EXISTS (SELECT 1 FROM public.recitation_sessions s WHERE s.daily_record_id = rec.id AND s.student_id = _student) THEN
    RAISE EXCEPTION 'HAS_ACHIEVEMENT';
  END IF;
  UPDATE public.halaqa_register_entries
     SET attendance_id = NULL, recorded_by = caller, version = version + 1, updated_at = now()
   WHERE halaqa_id = rec.halaqa_id AND session_date = rec.record_date AND student_id = _student;
  DELETE FROM public.attendance
   WHERE student_id = _student AND halaqa_id = rec.halaqa_id AND session_date = rec.record_date;
  RETURN private.daily_student_row(rec.halaqa_id, rec.record_date, rec.id, _student);
END;
$$;
REVOKE ALL ON FUNCTION public.clear_daily_attendance(uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clear_daily_attendance(uuid, uuid, integer) TO authenticated, service_role;

/**
 * حضور جماعي: _rows = [{student, status (present|late|absent|excused|null للمسح), version}]، 200 سطر على الأكثر.
 * يعيد {students: [سطر لكل من نجح], skipped: [{student, code}]}.
 */
CREATE OR REPLACE FUNCTION public.set_daily_attendance_bulk(_record uuid, _rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r jsonb;
  st text;
  sid uuid;
  done jsonb := '[]'::jsonb;
  skipped jsonb := '[]'::jsonb;
  one jsonb;
BEGIN
  -- الهوية والصلاحية وحالة السجل مرة واحدة: رفضها يرفض الطلب كله (لا تخطٍّ صامت لكل الأسطر).
  PERFORM private.daily_record_for_write(_record, false);
  IF _rows IS NULL OR jsonb_typeof(_rows) <> 'array' OR jsonb_array_length(_rows) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'INVALID_ROWS';
  END IF;
  FOR r IN SELECT * FROM jsonb_array_elements(_rows) LOOP
    BEGIN
      sid := (r ->> 'student')::uuid;
      st := r ->> 'status';
      IF st IS NULL THEN
        one := public.clear_daily_attendance(_record, sid, (r ->> 'version')::integer);
      ELSE
        one := public.set_daily_attendance(_record, sid, st, NULL, (r ->> 'version')::integer);
      END IF;
      done := done || jsonb_build_array(one);
    EXCEPTION WHEN others THEN
      skipped := skipped || jsonb_build_array(jsonb_build_object('student', r ->> 'student', 'code', SQLERRM));
    END;
  END LOOP;
  RETURN jsonb_build_object('students', done, 'skipped', skipped);
END;
$$;
REVOKE ALL ON FUNCTION public.set_daily_attendance_bulk(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_daily_attendance_bulk(uuid, jsonb) TO authenticated, service_role;

/** حالة سجل كل يوم من الأيام السبعة المنتهية بـ_to: [{date, status|null}] من الأقدم إلى الأحدث. */
CREATE OR REPLACE FUNCTION public.daily_record_week(_halaqa uuid, _to date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := (SELECT auth.uid());
  h public.halaqat;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF _to IS NULL THEN RAISE EXCEPTION 'INVALID_DATE'; END IF;
  SELECT * INTO h FROM public.halaqat WHERE id = _halaqa;
  IF h.id IS NULL THEN RAISE EXCEPTION 'NOT_YOUR_HALAQA'; END IF;
  IF NOT private.manages_halaqa(caller, _halaqa) AND NOT private.can_view_center(caller, h.center_id) THEN
    RAISE EXCEPTION 'NOT_YOUR_HALAQA';
  END IF;
  RETURN (
    SELECT jsonb_agg(jsonb_build_object('date', d::date, 'status', r.status) ORDER BY d)
      FROM generate_series(_to - 6, _to, interval '1 day') d
      LEFT JOIN public.halaqa_daily_records r ON r.halaqa_id = _halaqa AND r.record_date = d::date
  );
END;
$$;
REVOKE ALL ON FUNCTION public.daily_record_week(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.daily_record_week(uuid, date) TO authenticated, service_role;
