-- ════════════════════════════════════════════════════════════════════════════
-- استوديو الشهائد 1.22.0 — إصلاحات الأمن والصدقية (docs/CERTIFICATE_STUDIO_AUDIT.md، المرحلة 1)
-- ════════════════════════════════════════════════════════════════════════════
-- C1  private.cert_design_ok: كل قيمة نصية في التصميم ما عدا النصوص الحرة (text/name/label/signer) محارف آمنة
--     فقط، فلا يُحقن وسم أو معالج حدث في الرسم. يُفحص في cert_save_template وcert_check_design (الإصدار).
-- H2  إعادة الإصدار تلغي السابقة بسبب «استُبدلت بالشهادة …»، ولا تُعاد شهادة مستبدَلة، والتحقق يقول «replaced».
-- M1  cert_save_template يرفض الحفظ على نسخة أقدم (expected_updated_at ← STALE).
-- M2  تاريخ الإصدار: لا مستقبل، والأقدم من 60 يوماً لإدارة المركز، والفترة مرتبة.
-- M3  إشعار الإلغاء بلا السبب (يظهر في صفحة الشهادة)، ووليّ الأمر يُبلَّغ.
-- L3  cert_finalize: من خرج من الحلقة لا تصدر له مسودته.
-- الدوال منسوخة من 20261206100000/20261206110000 مع هذه التغييرات فقط؛ CREATE OR REPLACE يحفظ الصلاحيات.
-- التراجع: إعادة تطبيق تعريفاتها من الملفين، وDROP FUNCTION private.cert_design_ok(jsonb).
-- الفحص: supabase/tests/checks.sql (165–168).

CREATE OR REPLACE FUNCTION private.cert_design_ok(_d jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  WITH s AS (
    SELECT (_d - 'elements') || jsonb_build_object('elements', COALESCE((
             SELECT jsonb_agg(CASE WHEN jsonb_typeof(e) = 'object' THEN e - ARRAY['text', 'name', 'label', 'signer'] ELSE e END)
               FROM jsonb_array_elements(CASE WHEN jsonb_typeof(_d->'elements') = 'array' THEN _d->'elements' ELSE '[]'::jsonb END) e),
             '[]'::jsonb)) AS j
  )
  SELECT jsonb_typeof(_d) = 'object'
     AND NOT EXISTS (
       SELECT 1 FROM s, jsonb_path_query(s.j, 'strict $.**') v
        WHERE jsonb_typeof(v) = 'string' AND (v #>> '{}') !~ '^[A-Za-z0-9_$#:.,()%[:space:]-]{0,120}$')
     -- النصوص الحرة نصوص فعلاً (تُهرَّب عند الرسم) لا كائنات.
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(_d->'elements') = 'array' THEN _d->'elements' ELSE '[]'::jsonb END) e,
                     unnest(ARRAY['text', 'name', 'label', 'signer']) k
        WHERE jsonb_typeof(e) = 'object' AND e ? k AND jsonb_typeof(e->k) NOT IN ('string', 'null'))
$$;
REVOKE ALL ON FUNCTION private.cert_design_ok(jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.cert_check_design(_design jsonb, _center uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  ref text;
BEGIN
  IF _design IS NULL OR jsonb_typeof(_design) <> 'object' OR pg_column_size(_design) > 300000 THEN
    RAISE EXCEPTION 'INVALID_DESIGN';
  END IF;
  IF NOT private.cert_design_ok(_design) THEN RAISE EXCEPTION 'UNSAFE_DESIGN'; END IF;
  IF _design::text ~ '"brand:[a-z_:]+"' THEN RAISE EXCEPTION 'UNRESOLVED_BRAND'; END IF;
  FOR ref IN SELECT (regexp_matches(_design::text, 'asset:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})', 'g'))[1]
  LOOP
    IF NOT EXISTS (SELECT 1 FROM public.certificate_assets a WHERE a.id = ref::uuid AND a.center_id = _center) THEN
      RAISE EXCEPTION 'FOREIGN_ASSET';
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.cert_save_template(_template jsonb, _publish boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := (SELECT auth.uid());
  tid uuid := NULLIF(_template->>'id', '')::uuid;
  t public.certificate_templates;
  cen uuid := NULLIF(_template->>'center_id', '')::uuid;
  hal uuid := NULLIF(_template->>'halaqa_id', '')::uuid;
  d jsonb := _template->'design';
  did uuid;
  ref text;
  cats text[];
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF d IS NULL OR jsonb_typeof(d) <> 'object' OR pg_column_size(d) > 300000 THEN RAISE EXCEPTION 'INVALID_DESIGN'; END IF;
  IF NOT private.cert_design_ok(d) THEN RAISE EXCEPTION 'UNSAFE_DESIGN'; END IF;
  IF tid IS NOT NULL THEN
    SELECT * INTO t FROM public.certificate_templates WHERE id = tid FOR UPDATE;
    IF t.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
    -- تزامن متفائل: من حفظ على نسخة أقدم مما في الخادم يُرفض بدل أن يمحو تعديل غيره.
    IF NULLIF(_template->>'expected_updated_at', '') IS NOT NULL
       AND date_trunc('milliseconds', t.updated_at) > (_template->>'expected_updated_at')::timestamptz THEN
      RAISE EXCEPTION 'STALE';
    END IF;
    cen := t.center_id;
    hal := t.halaqa_id;
  END IF;
  IF hal IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.halaqat h WHERE h.id = hal AND h.center_id = cen) THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;
  IF cen IS NULL OR NOT (CASE WHEN hal IS NULL THEN public.manages_center(me, cen) ELSE private.cert_can_issue(me, hal) END) THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;
  FOR ref IN SELECT (regexp_matches(d::text, 'asset:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})', 'g'))[1]
  LOOP
    IF NOT EXISTS (SELECT 1 FROM public.certificate_assets a WHERE a.id = ref::uuid AND a.center_id = cen) THEN
      RAISE EXCEPTION 'FOREIGN_ASSET';
    END IF;
  END LOOP;
  SELECT COALESCE(array_agg(x), '{}') INTO cats
    FROM (SELECT jsonb_array_elements_text(CASE WHEN jsonb_typeof(_template->'categories') = 'array'
                                               THEN _template->'categories' ELSE '[]'::jsonb END) x LIMIT 6) s;

  IF tid IS NULL THEN
    INSERT INTO public.certificate_templates (center_id, halaqa_id, type_key, name, description, categories, design,
                                              based_on, created_by, updated_by)
    VALUES (cen, hal, NULLIF(_template->>'type_key', ''), btrim(_template->>'name'),
            NULLIF(btrim(COALESCE(_template->>'description', '')), ''), cats, d,
            NULLIF(_template->>'based_on', ''), me, me)
    RETURNING * INTO t;
    PERFORM private.cert_audit(cen, CASE WHEN _template->>'based_on' IS NOT NULL THEN 'template.copy' ELSE 'template.create' END,
                               t.id, jsonb_build_object('name', t.name, 'based_on', t.based_on));
  ELSE
    UPDATE public.certificate_templates
       SET name = COALESCE(NULLIF(btrim(_template->>'name'), ''), name),
           description = CASE WHEN _template ? 'description' THEN NULLIF(btrim(COALESCE(_template->>'description', '')), '') ELSE description END,
           type_key = CASE WHEN _template ? 'type_key' THEN NULLIF(_template->>'type_key', '') ELSE type_key END,
           categories = CASE WHEN _template ? 'categories' THEN cats ELSE categories END,
           design = d, updated_by = me, updated_at = now()
     WHERE id = tid RETURNING * INTO t;
  END IF;

  IF _publish THEN
    INSERT INTO public.certificate_designs (center_id, template_id, version, design, hash, created_by)
    VALUES (cen, t.id, t.version + 1, d, md5(d::text), me)
    ON CONFLICT (center_id, hash) DO NOTHING RETURNING id INTO did;
    IF did IS NULL THEN
      SELECT id INTO did FROM public.certificate_designs WHERE center_id = cen AND hash = md5(d::text);
    END IF;
    IF t.current_design_id IS DISTINCT FROM did THEN
      UPDATE public.certificate_templates SET version = version + 1, current_design_id = did WHERE id = t.id
      RETURNING * INTO t;
      PERFORM private.cert_audit(cen, 'template.update', t.id, jsonb_build_object('version', t.version));
    END IF;
  END IF;
  RETURN jsonb_build_object('id', t.id, 'version', t.version, 'current_design_id', t.current_design_id, 'updated_at', t.updated_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.cert_issue(_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := (SELECT auth.uid());
  hal uuid := NULLIF(_payload->>'halaqa_id', '')::uuid;
  h public.halaqat;
  cen public.centers;
  ty public.certificate_types;
  st text := COALESCE(NULLIF(_payload->>'status', ''), 'issued');
  d jsonb := _payload->'design';
  did uuid;
  tpl uuid := NULLIF(_payload->>'template_id', '')::uuid;
  sys text := NULLIF(left(_payload->>'system_template', 60), '');
  given_batch uuid := NULLIF(_payload->>'batch_id', '')::uuid;
  bid uuid;
  rep uuid := NULLIF(_payload->>'replaces_id', '')::uuid;
  rep_num text;
  old public.certificates;
  idate date := COALESCE(NULLIF(_payload->>'issue_date', '')::date, public.zen_today());
  pfrom date := NULLIF(_payload->>'period_from', '')::date;
  pto date := NULLIF(_payload->>'period_to', '')::date;
  items jsonb := COALESCE(_payload->'items', '[]'::jsonb);
  item jsonb;
  n int;
  sid uuid;
  pname text;
  tname text;
  num text;
  cid uuid;
  vc text;
  res jsonb := '[]'::jsonb;
  mgr boolean;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF _payload IS NULL OR jsonb_typeof(_payload) <> 'object' OR pg_column_size(_payload) > 1000000 THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD';
  END IF;
  SELECT * INTO h FROM public.halaqat WHERE id = hal;
  IF h.id IS NULL OR NOT private.cert_can_issue(me, hal) THEN RAISE EXCEPTION 'NOT_YOUR_HALAQA'; END IF;
  SELECT * INTO cen FROM public.centers WHERE id = h.center_id;
  mgr := public.manages_center(me, h.center_id);
  IF st NOT IN ('draft', 'ready', 'issued') THEN RAISE EXCEPTION 'INVALID_STATUS'; END IF;
  -- تاريخ الإصدار: لا مستقبل، والأقدم من 60 يوماً قرار إداري (1.22.0).
  IF idate > public.zen_today() THEN RAISE EXCEPTION 'FUTURE_DATE'; END IF;
  IF idate < public.zen_today() - 60 AND NOT mgr THEN RAISE EXCEPTION 'DATE_TOO_OLD'; END IF;
  IF pfrom IS NOT NULL AND pto IS NOT NULL AND pfrom > pto THEN RAISE EXCEPTION 'INVALID_PERIOD'; END IF;
  SELECT * INTO ty FROM public.certificate_types t
   WHERE t.key = _payload->>'type_key' AND t.active AND (t.center_id IS NULL OR t.center_id = h.center_id)
   ORDER BY t.center_id NULLS LAST LIMIT 1;
  IF ty.id IS NULL THEN RAISE EXCEPTION 'UNKNOWN_TYPE'; END IF;
  PERFORM private.cert_check_design(d, h.center_id);
  IF tpl IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.certificate_templates t WHERE t.id = tpl AND t.center_id = h.center_id) THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;
  IF jsonb_typeof(items) <> 'array' THEN RAISE EXCEPTION 'INVALID_ITEMS'; END IF;
  n := jsonb_array_length(items);
  IF n < 1 OR n > 200 THEN RAISE EXCEPTION 'INVALID_ITEMS'; END IF;
  IF (SELECT count(DISTINCT x->>'student_id') FROM jsonb_array_elements(items) x) <> n THEN
    RAISE EXCEPTION 'DUPLICATE_STUDENT';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(items) x
              WHERE NOT EXISTS (SELECT 1 FROM public.halaqa_students hs
                                 WHERE hs.halaqa_id = hal AND hs.student_id::text = x->>'student_id')) THEN
    RAISE EXCEPTION 'NOT_IN_HALAQA';
  END IF;
  -- تجاوز شرط الاستحقاق قرار إداري: لإدارة المركز وحدها، ويُسجَّل في اللقطة.
  IF NOT mgr AND EXISTS (SELECT 1 FROM jsonb_array_elements(items) x WHERE COALESCE((x->>'override')::boolean, false)) THEN
    RAISE EXCEPTION 'OVERRIDE_NOT_ALLOWED';
  END IF;

  IF rep IS NOT NULL THEN
    SELECT * INTO old FROM public.certificates WHERE id = rep FOR UPDATE;
    IF old.id IS NULL OR old.source <> 'studio' OR old.status NOT IN ('issued', 'revoked', 'archived')
       OR old.halaqa_id IS DISTINCT FROM hal OR n <> 1 OR st <> 'issued'
       OR items->0->>'student_id' <> old.student_id::text THEN
      RAISE EXCEPTION 'INVALID_REPLACE';
    END IF;
    IF EXISTS (SELECT 1 FROM public.certificates r WHERE r.replaces_id = rep AND r.status IN ('issued', 'revoked', 'archived')) THEN
      RAISE EXCEPTION 'ALREADY_REPLACED';
    END IF;
  END IF;

  -- حفظ مسودة دفعة قائمة: تُستبدل صفوف المسودة نفسها (لم تصدر بعد) ولا يُمسّ ما صدر.
  IF given_batch IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.certificates c WHERE c.batch_id = given_batch
                AND (c.status NOT IN ('draft', 'ready') OR c.halaqa_id IS DISTINCT FROM hal)) THEN
      RAISE EXCEPTION 'BATCH_LOCKED';
    END IF;
    DELETE FROM public.certificates WHERE batch_id = given_batch AND status IN ('draft', 'ready');
  END IF;
  bid := COALESCE(given_batch, gen_random_uuid());

  INSERT INTO public.certificate_designs (center_id, template_id, system_template, version, design, hash, created_by)
  VALUES (h.center_id, tpl, sys, (SELECT t.version FROM public.certificate_templates t WHERE t.id = tpl), d, md5(d::text), me)
  ON CONFLICT (center_id, hash) DO NOTHING RETURNING id INTO did;
  IF did IS NULL THEN
    SELECT x.id INTO did FROM public.certificate_designs x WHERE x.center_id = h.center_id AND x.hash = md5(d::text);
  END IF;
  tname := (SELECT p.name FROM public.profiles p WHERE p.id = h.teacher_id);


  FOR item IN SELECT x.value FROM jsonb_array_elements(items) WITH ORDINALITY AS x(value, i) ORDER BY x.i LOOP
    sid := (item->>'student_id')::uuid;
    pname := COALESCE((SELECT p.name FROM public.profiles p WHERE p.id = sid), 'طالب');
    num := CASE WHEN st = 'issued' THEN private.cert_next_number(idate) END;
    cid := gen_random_uuid();
    vc := private.new_verify_code();
    INSERT INTO public.certificates (
      id, source, status, student_id, student_name, halaqa_name, center_name, teacher_name, center_id, halaqa_id,
      teacher_id, type_key, template_id, system_template, design_id, issue_date, period_from, period_to, snapshot,
      batch_id, replaces_id, certificate_number, verify_code, created_by, issued_by, issued_at)
    VALUES (
      cid, 'studio', st, sid, pname, h.name, cen.name, tname, cen.id, h.id,
      h.teacher_id, ty.key, tpl, sys, did, idate, pfrom, pto,
      jsonb_build_object(
        'vars', private.cert_clean_vars(item->'vars') || jsonb_build_object(
          'student', jsonb_build_object('id', upper(left(replace(sid::text, '-', ''), 8)), 'name', pname, 'fullName', pname),
          'center', jsonb_build_object('name', cen.name, 'city', COALESCE(cen.city, '')),
          'circle', jsonb_build_object('name', h.name),
          'teacher', jsonb_build_object('name', COALESCE(tname, '')),
          'certificate', jsonb_build_object('number', COALESCE(num, ''), 'date', idate::text, 'type', ty.name, 'verifyCode', vc),
          'period', jsonb_build_object('from', COALESCE(pfrom::text, ''), 'to', COALESCE(pto::text, ''))),
        'type', jsonb_build_object('key', ty.key, 'name', ty.name, 'category', ty.category, 'text_kind', ty.text_kind),
        'achievement_ref', CASE WHEN jsonb_typeof(item->'achievement_ref') = 'object'
                                 AND pg_column_size(item->'achievement_ref') <= 1000 THEN item->'achievement_ref' END,
        'eligibility', CASE WHEN jsonb_typeof(item->'eligibility') = 'object'
                             AND pg_column_size(item->'eligibility') <= 3000 THEN item->'eligibility' END,
        'override', COALESCE((item->>'override')::boolean, false)),
      bid, rep, num, vc, me, CASE WHEN st = 'issued' THEN me END, CASE WHEN st = 'issued' THEN now() END);
    res := res || jsonb_build_object('id', cid, 'student_id', sid, 'student_name', pname, 'status', st,
                                     'certificate_number', num, 'verify_code', CASE WHEN st = 'issued' THEN vc END);
    IF st = 'issued' THEN PERFORM private.cert_notify_issued(cid); END IF;
  END LOOP;

  IF rep IS NOT NULL THEN
    -- الشهادة المستبدَلة لا تبقى «صحيحة» بجانب بديلتها: تُلغى بسبب يذكر رقم البديلة، والتحقق يقول «استُبدلت».
    rep_num := res->0->>'certificate_number';
    IF old.status = 'issued' THEN
      UPDATE public.certificates
         SET status = 'revoked', revoked_by = me, revoked_at = now(),
             revoke_reason = left('استُبدلت بالشهادة ' || rep_num, 300)
       WHERE id = rep;
    END IF;
    PERFORM private.cert_audit(h.center_id, 'certificate.reissue', (res->0->>'id')::uuid,
                               jsonb_build_object('replaces', rep, 'number', res->0->>'certificate_number'));
  ELSE
    PERFORM private.cert_audit(h.center_id,
      CASE WHEN st <> 'issued' THEN 'certificate.draft' WHEN n > 1 THEN 'certificate.batch_issue' ELSE 'certificate.issue' END,
      bid, jsonb_build_object('count', n, 'type', ty.key, 'halaqa', hal, 'design', did, 'template', COALESCE(tpl::text, sys)));
  END IF;
  RETURN jsonb_build_object('batch_id', bid, 'design_id', did, 'status', st, 'certificates', res);
END;
$$;

CREATE OR REPLACE FUNCTION public.cert_finalize(_batch uuid, _ids uuid[] DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := (SELECT auth.uid());
  c record;
  num text;
  res jsonb := '[]'::jsonb;
  hal uuid;
  cen uuid;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  SELECT x.halaqa_id, x.center_id INTO hal, cen FROM public.certificates x
   WHERE x.batch_id = _batch AND x.status IN ('draft', 'ready') LIMIT 1;
  IF hal IS NULL OR NOT private.cert_can_issue(me, hal) THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  FOR c IN SELECT * FROM public.certificates x
            WHERE x.batch_id = _batch AND x.status IN ('draft', 'ready') AND (_ids IS NULL OR x.id = ANY (_ids))
            ORDER BY x.created_at, x.id FOR UPDATE
  LOOP
    -- قد تمضي أيام بين المسودة وإصدارها: من خرج من الحلقة لا تصدر له.
    IF NOT EXISTS (SELECT 1 FROM public.halaqa_students hs WHERE hs.halaqa_id = c.halaqa_id AND hs.student_id = c.student_id) THEN
      RAISE EXCEPTION 'NOT_IN_HALAQA';
    END IF;
    num := private.cert_next_number(COALESCE(c.issue_date, public.zen_today()));
    UPDATE public.certificates
       SET status = 'issued', certificate_number = num, issued_by = me, issued_at = now(),
           issue_date = COALESCE(issue_date, public.zen_today()),
           snapshot = jsonb_set(snapshot, '{vars,certificate,number}', to_jsonb(num))
     WHERE id = c.id;
    PERFORM private.cert_notify_issued(c.id);
    res := res || jsonb_build_object('id', c.id, 'student_id', c.student_id, 'certificate_number', num,
                                     'verify_code', c.verify_code, 'status', 'issued');
  END LOOP;
  PERFORM private.cert_audit(cen, CASE WHEN jsonb_array_length(res) > 1 THEN 'certificate.batch_issue' ELSE 'certificate.issue' END,
                             _batch, jsonb_build_object('count', jsonb_array_length(res), 'from_draft', true));
  RETURN jsonb_build_object('batch_id', _batch, 'certificates', res);
END;
$$;

CREATE OR REPLACE FUNCTION public.cert_revoke(_id uuid, _reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := (SELECT auth.uid());
  c public.certificates;
  why text := btrim(COALESCE(_reason, ''));
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  SELECT * INTO c FROM public.certificates WHERE id = _id FOR UPDATE;
  IF c.id IS NULL OR c.source <> 'studio' THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF NOT (public.manages_center(me, c.center_id)
          OR (c.issued_by = me AND private.cert_can_issue(me, c.halaqa_id))) THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;
  IF c.status <> 'issued' THEN RAISE EXCEPTION 'NOT_ISSUED'; END IF;
  IF char_length(why) < 3 OR char_length(why) > 300 THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
  UPDATE public.certificates SET status = 'revoked', revoked_by = me, revoked_at = now(), revoke_reason = why
   WHERE id = _id;
  PERFORM private.cert_audit(c.center_id, 'certificate.revoke', _id,
                             jsonb_build_object('number', c.certificate_number, 'reason', why));
  -- السبب في صفحة الشهادة لمن يراها، لا في نص الإشعار (يظهر على شاشة القفل). ووليّ الأمر يُبلَّغ كذلك.
  INSERT INTO public.notifications (user_id, kind, title, body, link)
  VALUES (c.student_id, 'certificate', 'أُلغيت شهادة', 'الشهادة رقم ' || c.certificate_number || '.', '/certificates/' || c.id);
  PERFORM public.notify_guardians(c.student_id, 'certificate', 'أُلغيت شهادة',
                                  c.student_name || ': الشهادة رقم ' || c.certificate_number || '.');
  RETURN jsonb_build_object('ok', true, 'status', 'revoked');
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_certificate(_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := (SELECT auth.uid());
  code text := upper(regexp_replace(COALESCE(_code, ''), '[^A-Za-z0-9]', '', 'g'));
  c public.certificates%ROWTYPE;
  rn text;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  -- حالة لا استثناء: الاستثناء يلغي تسجيل المحاولة فيسقط الحدّ.
  IF (SELECT count(*) FROM public.certificate_verify_attempts
       WHERE user_id = caller AND at > now() - interval '1 minute') >= 10 THEN
    RETURN jsonb_build_object('status', 'rate_limited');
  END IF;
  DELETE FROM public.certificate_verify_attempts WHERE at < now() - interval '1 day';

  IF code ~ '^[A-HJ-NP-Z2-9]{16}$' THEN
    SELECT * INTO c FROM public.certificates
     WHERE verify_code = code
       AND ((source = 'auto' AND status = 'approved') OR (source = 'studio' AND status IN ('issued', 'revoked', 'archived')));
  END IF;
  INSERT INTO public.certificate_verify_attempts (user_id, found) VALUES (caller, c.id IS NOT NULL);
  IF c.id IS NULL THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  IF c.source = 'auto' THEN
    RETURN jsonb_build_object(
      'status', 'valid', 'kind', 'auto', 'student_name', c.student_name, 'juz', c.juz,
      'halaqa_name', c.halaqa_name, 'center_name', c.center_name, 'teacher_name', c.teacher_name,
      'decided_at', c.decided_at, 'serial', c.serial);
  END IF;
  rn := (SELECT r.certificate_number FROM public.certificates r
          WHERE r.replaces_id = c.id AND r.status IN ('issued', 'revoked', 'archived') ORDER BY r.created_at DESC LIMIT 1);
  -- لا معرّفات ولا بيانات من سجل الطالب: ما على الشهادة نفسها.
  RETURN jsonb_build_object(
    'status', CASE WHEN c.revoked_at IS NOT NULL AND rn IS NOT NULL THEN 'replaced'
                   WHEN c.revoked_at IS NOT NULL THEN 'revoked' ELSE 'valid' END, 'kind', 'studio',
    'replaced_by', rn, 'archived', c.status = 'archived',
    'certificate_number', c.certificate_number, 'student_name', c.student_name,
    'center_name', c.center_name, 'halaqa_name', c.halaqa_name,
    'type_name', c.snapshot #>> '{type,name}', 'issue_date', c.issue_date,
    'revoked_at', c.revoked_at);
END;
$$;
