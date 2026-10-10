-- تحقق من تقارير 1.15.0 على قاعدة الإنتاج (قراءة فقط عملياً): كل شيء داخل معاملة تُلغى في النهاية.
-- يتقمّص المعلّم صاحب أحدث سجل يومي (دور authenticated ومعرّفه في request.jwt.claims) فيمرّ بـ RLS
-- والصلاحيات نفسها التي يمرّ بها التطبيق، ثم يطبع أعداداً فقط (لا أسماء ولا بيانات طلاب).
-- يشغّله db-verify.yml في مستودع التشغيل الخاص zen-ops، ويجرّبه `npm run test:db` على القاعدة المضمَّنة (SQL خالص بلا أوامر psql).
BEGIN;
SET LOCAL statement_timeout = '30s';

CREATE TEMP TABLE _pick ON COMMIT DROP AS
SELECT r.halaqa_id, h.teacher_id, h.center_id, r.record_date
FROM public.halaqa_daily_records r JOIN public.halaqat h ON h.id = r.halaqa_id
WHERE h.teacher_id IS NOT NULL
ORDER BY r.record_date DESC, r.updated_at DESC LIMIT 1;
GRANT SELECT ON _pick TO authenticated;

DO $$
DECLARE p record;
BEGIN
  SELECT * INTO p FROM _pick;
  IF p.halaqa_id IS NULL THEN RAISE NOTICE 'لا سجلات يومية بعد: فحص البنية فقط.'; END IF;
  -- البنية: الدوال بتواقيعها والعمود الجديد.
  PERFORM 'public.halaqa_report_data(uuid,date,date,uuid[],smallint[],boolean)'::regprocedure;
  PERFORM 'public.report_identity(uuid)'::regprocedure;
  PERFORM 'public.set_report_identity(uuid,jsonb)'::regprocedure;
  PERFORM 'public.daily_record_trash_list(uuid)'::regprocedure;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='centers' AND column_name='report_identity') THEN
    RAISE EXCEPTION 'centers.report_identity مفقود';
  END IF;
  IF has_function_privilege('anon', 'public.report_identity(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'report_identity متاحة لـ anon';
  END IF;
  RAISE NOTICE 'البنية: سليمة';
END $$;

DO $$ BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', teacher_id, 'role', 'authenticated')::text, true),
    set_config('request.jwt.claim.sub', teacher_id::text, true) FROM _pick;
END $$;
SET LOCAL ROLE authenticated;

DO $$
DECLARE p record; d jsonb; ident jsonb; n_rows int; n_students int;
BEGIN
  SELECT * INTO p FROM _pick;
  IF p.halaqa_id IS NULL THEN RETURN; END IF;
  d := public.halaqa_report_data(p.halaqa_id, (p.record_date - 30), p.record_date, NULL, NULL, true);
  n_rows := jsonb_array_length(coalesce(d->'rows', '[]'));
  n_students := jsonb_array_length(coalesce(d->'students', '[]'));
  RAISE NOTICE 'halaqa_report_data: % طالباً، % سطراً، المفاتيح: %', n_students, n_rows,
    (SELECT string_agg(k, ',' ORDER BY k) FROM jsonb_object_keys(d) k);
  ident := public.report_identity(p.halaqa_id);
  RAISE NOTICE 'report_identity: identity=% can_edit=%',
    CASE WHEN ident->'identity' IS NULL OR ident->'identity' = 'null' THEN 'فارغة' ELSE 'مضبوطة' END,
    ident->>'can_edit';
  IF (ident->>'can_edit')::boolean THEN
    -- الهوية الفارغة jsonb null لا كائن: يُبنى فوق كائن فارغ كي لا يصير الدمج مصفوفة.
    PERFORM public.set_report_identity(p.halaqa_id,
      CASE WHEN jsonb_typeof(ident->'identity') = 'object' THEN ident->'identity' ELSE '{}'::jsonb END
      || '{"verify":true}');
    IF NOT (public.report_identity(p.halaqa_id)->'identity' ? 'verify') THEN
      RAISE EXCEPTION 'set_report_identity لم يحفظ';
    END IF;
    RAISE NOTICE 'set_report_identity: يحفظ (أُلغي التغيير)';
  END IF;
  -- المعلّم لا يقرأ تقارير حلقة لا يديرها.
  BEGIN
    PERFORM public.halaqa_report_data(gen_random_uuid(), p.record_date, p.record_date, NULL, NULL, false);
    RAISE EXCEPTION 'حلقة غريبة قُرئت';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'حلقة غريبة قُرئت' THEN RAISE; END IF;
    RAISE NOTICE 'الحماية: حلقة غيره مرفوضة (%)', SQLERRM;
  END;
END $$;

ROLLBACK;
