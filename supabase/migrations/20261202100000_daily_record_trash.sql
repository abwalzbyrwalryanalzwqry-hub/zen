-- ════════════════════════════════════════════════════════════════════════════
-- السجل اليومي — سلّة المحذوفات (خطة 1.14.0، المرحلة 0: السلامة)
-- ════════════════════════════════════════════════════════════════════════════
-- كان «حذف سجل يوم» يحذف الحضور والتسميعات والتقييمات وقيد السجل نهائياً بتأكيد واحد، لأي يوم سابق.
-- الآن: قبل الحذف تُحفظ لقطة كاملة لليوم في private.daily_record_trash، وتبقى 30 يوماً، ويستعيدها مدير
-- الحلقة بـrestore_daily_record (تُعاد الصفوف بمعرّفاتها نفسها، وتُطبَّق المراجعة على بطاقاتها من جديد).
-- إضافات وإعادة تعريف delete_daily_record فقط.
-- التراجع: إعادة تعريف delete_daily_record من 20261129100000، ثم
--   DROP FUNCTION public.restore_daily_record(uuid); DROP FUNCTION public.daily_record_trash_list(uuid);
--   DROP TABLE private.daily_record_trash;
-- الفحص: supabase/tests/checks.sql (145).

CREATE TABLE IF NOT EXISTS private.daily_record_trash (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  halaqa_id uuid NOT NULL REFERENCES public.halaqat(id) ON DELETE CASCADE,
  record_date date NOT NULL,
  deleted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  -- {record, attendance[], sessions[], assessments[], entries[]} كما كانت صفوفها.
  payload jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS daily_record_trash_halaqa_idx ON private.daily_record_trash (halaqa_id, deleted_at DESC);
CREATE INDEX IF NOT EXISTS daily_record_trash_deleted_by_idx ON private.daily_record_trash (deleted_by);
REVOKE ALL ON private.daily_record_trash FROM PUBLIC, anon, authenticated;

-- من 20261129100000_daily_record_no_window.sql، مع لقطة قبل الحذف.
CREATE OR REPLACE FUNCTION public.delete_daily_record(_record uuid, _version integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec public.halaqa_daily_records;
  trash uuid;
BEGIN
  -- الجلسة ومدير الحلقة وغير المُغلق، بقفل حصري (المكتمل يُحذف أيضاً).
  rec := private.daily_record_for_write(_record, true);
  IF _version IS NULL OR rec.version <> _version THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF;
  IF rec.record_date > public.zen_today() THEN
    RAISE EXCEPTION 'INVALID_DATE';
  END IF;

  -- ما تجاوز 30 يوماً في السلّة يُحذف نهائياً.
  DELETE FROM private.daily_record_trash t WHERE t.deleted_at < now() - interval '30 days';

  INSERT INTO private.daily_record_trash (halaqa_id, record_date, deleted_by, payload)
  VALUES (rec.halaqa_id, rec.record_date, (SELECT auth.uid()), jsonb_build_object(
    'record', to_jsonb(rec),
    'attendance', coalesce((SELECT jsonb_agg(to_jsonb(a)) FROM public.attendance a
                             WHERE a.halaqa_id = rec.halaqa_id AND a.session_date = rec.record_date), '[]'::jsonb),
    'sessions', coalesce((SELECT jsonb_agg(to_jsonb(s)) FROM public.recitation_sessions s
                           WHERE s.daily_record_id = rec.id), '[]'::jsonb),
    'assessments', coalesce((SELECT jsonb_agg(to_jsonb(ra)) FROM public.recitation_assessments ra
                              JOIN public.recitation_sessions s ON s.id = ra.session_id
                             WHERE s.daily_record_id = rec.id), '[]'::jsonb),
    'entries', coalesce((SELECT jsonb_agg(to_jsonb(e)) FROM public.halaqa_register_entries e
                          WHERE e.halaqa_id = rec.halaqa_id AND e.session_date = rec.record_date), '[]'::jsonb)
  ))
  RETURNING id INTO trash;

  PERFORM private.daily_undo_card(s.id) FROM public.recitation_sessions s WHERE s.daily_record_id = rec.id;
  DELETE FROM public.halaqa_register_entries e
   WHERE e.halaqa_id = rec.halaqa_id AND e.session_date = rec.record_date;
  DELETE FROM public.recitation_sessions s WHERE s.daily_record_id = rec.id;
  DELETE FROM public.attendance a WHERE a.halaqa_id = rec.halaqa_id AND a.session_date = rec.record_date;
  DELETE FROM public.halaqa_daily_records WHERE id = rec.id;
  RETURN jsonb_build_object('id', rec.id, 'date', rec.record_date, 'deleted', true, 'trash_id', trash);
END;
$$;

/** الأيام المحذوفة القابلة للاستعادة (آخر 30 يوماً) لمدير الحلقة، الأحدث حذفاً أولاً. */
CREATE OR REPLACE FUNCTION public.daily_record_trash_list(_halaqa uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := (SELECT auth.uid());
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT private.manages_halaqa(caller, _halaqa) THEN RAISE EXCEPTION 'NOT_YOUR_HALAQA'; END IF;
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'id', t.id,
             'date', t.record_date,
             'deleted_at', t.deleted_at,
             'expires_at', t.deleted_at + interval '30 days',
             'attendance', jsonb_array_length(t.payload -> 'attendance'),
             'sessions', jsonb_array_length(t.payload -> 'sessions'),
             'restorable', NOT EXISTS (SELECT 1 FROM public.halaqa_daily_records r
                                        WHERE r.halaqa_id = t.halaqa_id AND r.record_date = t.record_date))
           ORDER BY t.deleted_at DESC)
      FROM private.daily_record_trash t
     WHERE t.halaqa_id = _halaqa AND t.deleted_at >= now() - interval '30 days'
  ), '[]'::jsonb);
END;
$$;

/**
 * استعادة يوم محذوف كما كان: قيد السجل وحالته ونسخته، والحضور، والتسميعات وتقييماتها، وأسطر الطلاب.
 * يُرفض إن أُنشئ لليوم نفسه سجل جديد بعد الحذف (RECORD_EXISTS) أو انتهت مدة السلّة (RECORD_NOT_FOUND).
 */
CREATE OR REPLACE FUNCTION public.restore_daily_record(_trash uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := (SELECT auth.uid());
  t private.daily_record_trash;
  rec public.halaqa_daily_records;
  s public.recitation_sessions;
  ra public.recitation_assessments;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  SELECT * INTO t FROM private.daily_record_trash WHERE id = _trash FOR UPDATE;
  IF t.id IS NULL OR t.deleted_at < now() - interval '30 days' THEN RAISE EXCEPTION 'RECORD_NOT_FOUND'; END IF;
  IF NOT private.manages_halaqa(caller, t.halaqa_id) THEN RAISE EXCEPTION 'NOT_YOUR_HALAQA'; END IF;
  IF EXISTS (SELECT 1 FROM public.halaqa_daily_records r
              WHERE r.halaqa_id = t.halaqa_id AND r.record_date = t.record_date) THEN
    RAISE EXCEPTION 'RECORD_EXISTS';
  END IF;

  rec := jsonb_populate_record(NULL::public.halaqa_daily_records, t.payload -> 'record');
  rec.version := rec.version + 1;
  INSERT INTO public.halaqa_daily_records SELECT rec.*;

  -- حضور سُجّل لليوم بعد الحذف (من مسار آخر) يبقى كما هو.
  INSERT INTO public.attendance
  SELECT * FROM jsonb_populate_recordset(NULL::public.attendance, t.payload -> 'attendance')
  ON CONFLICT DO NOTHING;

  FOR s IN SELECT * FROM jsonb_populate_recordset(NULL::public.recitation_sessions, t.payload -> 'sessions') LOOP
    INSERT INTO public.recitation_sessions SELECT s.* ON CONFLICT DO NOTHING;
  END LOOP;
  FOR ra IN SELECT * FROM jsonb_populate_recordset(NULL::public.recitation_assessments, t.payload -> 'assessments') LOOP
    INSERT INTO public.recitation_assessments SELECT ra.* ON CONFLICT DO NOTHING;
    -- الجدولة كما حدثت أول مرة: المراجعة تُطبَّق على البطاقة من جديد (مع لقطتها للتراجع).
    SELECT * INTO s FROM public.recitation_sessions WHERE id = ra.session_id;
    IF s.id IS NOT NULL AND ra.score IS NOT NULL THEN
      PERFORM private.daily_apply_review(s.id, s.student_id, s.surah_name, s.from_ayah, s.to_ayah, ra.score);
    END IF;
  END LOOP;

  INSERT INTO public.halaqa_register_entries
  SELECT * FROM jsonb_populate_recordset(NULL::public.halaqa_register_entries, t.payload -> 'entries')
  ON CONFLICT DO NOTHING;

  DELETE FROM private.daily_record_trash WHERE id = t.id;
  RETURN jsonb_build_object('id', rec.id, 'date', rec.record_date, 'status', rec.status, 'version', rec.version);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_daily_record(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_daily_record(uuid, integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.daily_record_trash_list(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.daily_record_trash_list(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.restore_daily_record(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_daily_record(uuid) TO authenticated, service_role;
