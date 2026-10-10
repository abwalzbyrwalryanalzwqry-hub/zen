-- ════════════════════════════════════════════════════════════════════════════
-- استوديو الشهائد (1.17.0) — 2/2: الإصدار الفردي والجماعي، المسودات، الإلغاء، إعادة الإصدار، القوائم، التحقق
-- ════════════════════════════════════════════════════════════════════════════
-- قواعد:
--   • لكل طالب صف مستقل برقم فريد ZEN-YYYY-NNNNNN (تسلسل لا يتكرر) ورمز تحقق مستقل، ولقطة بياناته وحده.
--     الاسم والحلقة والمركز والمعلّم تُقرأ هنا من مصدرها لكل طالب، فلا تختلط بيانات طالبين في دفعة واحدة.
--   • التصميم يُجمَّد في certificate_designs مرة للدفعة كلها (نفس البصمة = نفس الصف).
--   • لا حذف لشهادة صادرة: الإلغاء حالة بسبب، وإعادة الإصدار شهادة جديدة برقم جديد تشير إلى السابقة.
-- التراجع (بالترتيب): DROP FUNCTION public.cert_issue(jsonb), public.cert_finalize(uuid, uuid[]),
--   public.cert_mark_ready(uuid), public.cert_discard_drafts(uuid), public.cert_revoke(uuid, text),
--   public.cert_archive(uuid), public.cert_list(jsonb), public.cert_stats(uuid, uuid), public.cert_get(uuid),
--   public.cert_batch(uuid), public.cert_audit_log(uuid, int), دوال private.cert_*، ثم الملف الأول عكسياً،
--   وأعد verify_certificate وstudent_achievements من 20261029100000_verified_certificates.sql.
-- الفحص: supabase/tests/checks.sql (149–152).

CREATE OR REPLACE FUNCTION private.cert_next_number(_on date)
RETURNS text
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT 'ZEN-' || to_char(COALESCE(_on, now()::date), 'YYYY') || '-'
         || lpad(nextval('public.certificate_number_seq')::text, 6, '0')
$$;

-- ما يرسله العميل من محرّك سجل الإنجاز: مجموعات معروفة وقيم نصية أو رقمية قصيرة فقط.
CREATE OR REPLACE FUNCTION private.cert_clean_vars(_v jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT COALESCE(jsonb_object_agg(g.key, (
      SELECT COALESCE(jsonb_object_agg(f.key, to_jsonb(left(f.value #>> '{}', 300))), '{}'::jsonb)
        FROM jsonb_each(g.value) f
       WHERE f.key ~ '^[a-zA-Z][a-zA-Z0-9]{0,30}$' AND jsonb_typeof(f.value) IN ('string', 'number'))), '{}'::jsonb)
    FROM jsonb_each(CASE WHEN jsonb_typeof(_v) = 'object' THEN _v ELSE '{}'::jsonb END) g
   WHERE g.key IN ('achievement', 'memorization', 'revision', 'evaluation', 'attendance', 'custom')
     AND jsonb_typeof(g.value) = 'object'
$$;

-- يتحقق أن كل أصل يشير إليه التصميم من أصول المركز نفسه، وأن مراجع الهوية حُلّت قبل الإصدار.
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
  IF _design::text ~ '"brand:[a-z_:]+"' THEN RAISE EXCEPTION 'UNRESOLVED_BRAND'; END IF;
  FOR ref IN SELECT (regexp_matches(_design::text, 'asset:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})', 'g'))[1]
  LOOP
    IF NOT EXISTS (SELECT 1 FROM public.certificate_assets a WHERE a.id = ref::uuid AND a.center_id = _center) THEN
      RAISE EXCEPTION 'FOREIGN_ASSET';
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION private.cert_notify_issued(_cert uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.notifications (user_id, kind, title, body, link)
  SELECT c.student_id, 'certificate', 'شهادة جديدة',
         COALESCE(c.snapshot #>> '{type,name}', 'شهادة') || ' — ' || c.certificate_number, '/certificates/' || c.id
    FROM public.certificates c WHERE c.id = _cert;
  SELECT public.notify_guardians(c.student_id, 'certificate', 'شهادة جديدة',
           c.student_name || ': ' || COALESCE(c.snapshot #>> '{type,name}', 'شهادة') || '.')
    FROM public.certificates c WHERE c.id = _cert;
$$;

REVOKE ALL ON FUNCTION private.cert_next_number(date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.cert_clean_vars(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.cert_check_design(jsonb, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.cert_notify_issued(uuid) FROM PUBLIC, anon, authenticated;

-- ─────────── الإصدار (فردي أو جماعي، مسودة أو نهائي) ───────────
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

-- ─────────── إصدار مسودات دفعة محفوظة ───────────
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

CREATE OR REPLACE FUNCTION public.cert_mark_ready(_batch uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := (SELECT auth.uid());
  hal uuid;
  n int;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  SELECT x.halaqa_id INTO hal FROM public.certificates x WHERE x.batch_id = _batch AND x.status = 'draft' LIMIT 1;
  IF hal IS NULL OR NOT private.cert_can_issue(me, hal) THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  UPDATE public.certificates SET status = 'ready' WHERE batch_id = _batch AND status = 'draft';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION public.cert_discard_drafts(_batch uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := (SELECT auth.uid());
  hal uuid;
  cen uuid;
  n int;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  SELECT x.halaqa_id, x.center_id INTO hal, cen FROM public.certificates x
   WHERE x.batch_id = _batch AND x.status IN ('draft', 'ready') LIMIT 1;
  IF hal IS NULL OR NOT private.cert_can_issue(me, hal) THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  DELETE FROM public.certificates WHERE batch_id = _batch AND status IN ('draft', 'ready');
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM private.cert_audit(cen, 'certificate.discard', _batch, jsonb_build_object('count', n));
  RETURN n;
END;
$$;

-- ─────────── الإلغاء والأرشفة ───────────
-- الإلغاء لإدارة المركز أو لمن أصدرها (ما زال يملك الإصدار في حلقتها). لا حذف: حالة وسبب وفاعل ووقت.
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
  INSERT INTO public.notifications (user_id, kind, title, body, link)
  VALUES (c.student_id, 'certificate', 'أُلغيت شهادة', c.certificate_number || ': ' || why, '/certificates/' || c.id);
  RETURN jsonb_build_object('ok', true, 'status', 'revoked');
END;
$$;

CREATE OR REPLACE FUNCTION public.cert_archive(_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := (SELECT auth.uid());
  c public.certificates;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  SELECT * INTO c FROM public.certificates WHERE id = _id FOR UPDATE;
  IF c.id IS NULL OR c.source <> 'studio' OR c.status NOT IN ('issued', 'revoked') THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF NOT (public.manages_center(me, c.center_id) OR (c.issued_by = me AND private.cert_can_issue(me, c.halaqa_id))) THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;
  UPDATE public.certificates SET status = 'archived', archived_at = now() WHERE id = _id;
  PERFORM private.cert_audit(c.center_id, 'certificate.archive', _id, jsonb_build_object('number', c.certificate_number));
END;
$$;

-- ─────────── القوائم والبحث ───────────
CREATE OR REPLACE FUNCTION private.cert_visible(_uid uuid, c public.certificates)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT _uid IS NOT NULL AND (
    (c.center_id IS NOT NULL AND private.can_view_center(_uid, c.center_id))
    OR (c.halaqa_id IS NOT NULL AND private.cert_can_issue(_uid, c.halaqa_id))
    OR private.teaches_student(_uid, c.student_id)
    OR ((c.student_id = _uid OR private.is_guardian_of(_uid, c.student_id))
        AND c.status IN ('issued', 'revoked', 'archived')))
$$;
REVOKE ALL ON FUNCTION private.cert_visible(uuid, public.certificates) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.cert_list(_q jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := (SELECT auth.uid());
  q jsonb := COALESCE(_q, '{}'::jsonb);
  lim int := LEAST(GREATEST(COALESCE((q->>'limit')::int, 50), 1), 200);
  off int := GREATEST(COALESCE((q->>'offset')::int, 0), 0);
  term text := NULLIF(btrim(COALESCE(q->>'q', '')), '');
  statuses text[];
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  statuses := CASE q->>'status'
    WHEN 'drafts' THEN ARRAY['draft', 'ready']
    WHEN 'issued' THEN ARRAY['issued']
    WHEN 'revoked' THEN ARRAY['revoked']
    WHEN 'archived' THEN ARRAY['archived']
    WHEN 'all' THEN ARRAY['draft', 'ready', 'issued', 'revoked', 'archived']
    ELSE ARRAY['issued', 'revoked'] END;
  RETURN (
    WITH v AS (
      SELECT c.* FROM public.certificates c
       WHERE c.source = 'studio' AND c.status = ANY (statuses)
         AND (q->>'center_id' IS NULL OR c.center_id = (q->>'center_id')::uuid)
         AND (q->>'halaqa_id' IS NULL OR c.halaqa_id = (q->>'halaqa_id')::uuid)
         AND (q->>'student_id' IS NULL OR c.student_id = (q->>'student_id')::uuid)
         AND (q->>'type_key' IS NULL OR c.type_key = q->>'type_key')
         AND (q->>'batch_id' IS NULL OR c.batch_id = (q->>'batch_id')::uuid)
         AND (q->>'from' IS NULL OR COALESCE(c.issue_date, c.created_at::date) >= (q->>'from')::date)
         AND (q->>'to' IS NULL OR COALESCE(c.issue_date, c.created_at::date) <= (q->>'to')::date)
         AND (term IS NULL OR c.certificate_number ILIKE '%' || term || '%' OR c.student_name ILIKE '%' || term || '%'
              OR c.halaqa_name ILIKE '%' || term || '%' OR c.center_name ILIKE '%' || term || '%'
              OR c.verify_code = upper(regexp_replace(term, '[^A-Za-z0-9]', '', 'g')))
         AND private.cert_visible(me, c)
    )
    SELECT jsonb_build_object(
      'total', (SELECT count(*) FROM v),
      'items', COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'id', x.id, 'certificate_number', x.certificate_number, 'status', x.status,
          'student_id', x.student_id, 'student_name', x.student_name,
          'center_id', x.center_id, 'center_name', x.center_name, 'halaqa_id', x.halaqa_id, 'halaqa_name', x.halaqa_name,
          'teacher_name', x.teacher_name, 'type_key', x.type_key, 'type_name', x.snapshot #>> '{type,name}',
          'template_id', x.template_id, 'system_template', x.system_template,
          'template_name', (SELECT t.name FROM public.certificate_templates t WHERE t.id = x.template_id),
          'issue_date', x.issue_date, 'created_at', x.created_at, 'issued_at', x.issued_at,
          'revoked_at', x.revoked_at, 'revoke_reason', x.revoke_reason, 'batch_id', x.batch_id,
          'replaces_id', x.replaces_id,
          'replaced_by', (SELECT r.id FROM public.certificates r WHERE r.replaces_id = x.id ORDER BY r.created_at DESC LIMIT 1),
          'verify_code', CASE WHEN x.status IN ('issued', 'revoked', 'archived') THEN x.verify_code END,
          'can_revoke', x.status = 'issued' AND (public.manages_center(me, x.center_id)
                         OR (x.issued_by = me AND private.cert_can_issue(me, x.halaqa_id))),
          'can_issue', x.halaqa_id IS NOT NULL AND private.cert_can_issue(me, x.halaqa_id))
          ORDER BY x.created_at DESC, x.id)
        FROM (SELECT * FROM v ORDER BY v.created_at DESC, v.id LIMIT lim OFFSET off) x), '[]'::jsonb))
  );
END;
$$;

-- ─────────── لوحة الشهائد وتقريرها ───────────
CREATE OR REPLACE FUNCTION public.cert_stats(_center uuid DEFAULT NULL, _halaqa uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := (SELECT auth.uid());
  today date := public.zen_today();
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  RETURN (
    WITH v AS (
      SELECT c.* FROM public.certificates c
       WHERE c.source = 'studio'
         AND (_center IS NULL OR c.center_id = _center)
         AND (_halaqa IS NULL OR c.halaqa_id = _halaqa)
         AND private.cert_visible(me, c)
    ), done AS (SELECT * FROM v WHERE status IN ('issued', 'revoked', 'archived'))
    SELECT jsonb_build_object(
      'total', (SELECT count(*) FROM done),
      'month', (SELECT count(*) FROM done WHERE date_trunc('month', issue_date) = date_trunc('month', today)),
      'year', (SELECT count(*) FROM done WHERE date_part('year', issue_date) = date_part('year', today)),
      'issued', (SELECT count(*) FROM v WHERE status = 'issued'),
      'revoked', (SELECT count(*) FROM v WHERE status = 'revoked'),
      'archived', (SELECT count(*) FROM v WHERE status = 'archived'),
      'drafts', (SELECT count(*) FROM v WHERE status IN ('draft', 'ready')),
      'students', (SELECT count(DISTINCT student_id) FROM done),
      'by_type', COALESCE((SELECT jsonb_agg(jsonb_build_object('key', k, 'name', nm, 'count', n) ORDER BY n DESC)
        FROM (SELECT type_key k, max(snapshot #>> '{type,name}') nm, count(*) n FROM done GROUP BY type_key) s), '[]'::jsonb),
      'by_halaqa', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', k, 'name', nm, 'count', n) ORDER BY n DESC)
        FROM (SELECT halaqa_id k, max(halaqa_name) nm, count(*) n FROM done GROUP BY halaqa_id) s), '[]'::jsonb),
      'by_template', COALESCE((SELECT jsonb_agg(jsonb_build_object('key', k, 'name', nm, 'count', n) ORDER BY n DESC)
        FROM (SELECT COALESCE(d.template_id::text, d.system_template) k,
                     COALESCE(max(t.name), max(d.system_template)) nm, count(*) n
                FROM done d LEFT JOIN public.certificate_templates t ON t.id = d.template_id
               GROUP BY COALESCE(d.template_id::text, d.system_template)) s), '[]'::jsonb),
      'by_month', COALESCE((SELECT jsonb_agg(jsonb_build_object('month', m, 'count', n) ORDER BY m)
        FROM (SELECT to_char(issue_date, 'YYYY-MM') m, count(*) n FROM done
               WHERE issue_date > (today - interval '12 months') GROUP BY 1) s), '[]'::jsonb))
  );
END;
$$;

-- ─────────── شهادة واحدة للرسم والمشاركة ───────────
CREATE OR REPLACE FUNCTION public.cert_get(_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := (SELECT auth.uid());
  c public.certificates;
  d jsonb;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  SELECT * INTO c FROM public.certificates WHERE id = _id;
  IF c.id IS NULL OR c.source <> 'studio' OR NOT private.cert_visible(me, c) THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  SELECT x.design INTO d FROM public.certificate_designs x WHERE x.id = c.design_id;
  RETURN jsonb_build_object(
    'id', c.id, 'certificate_number', c.certificate_number, 'status', c.status, 'student_id', c.student_id,
    'student_name', c.student_name, 'center_id', c.center_id, 'center_name', c.center_name, 'halaqa_id', c.halaqa_id,
    'halaqa_name', c.halaqa_name, 'teacher_name', c.teacher_name, 'type_key', c.type_key,
    'type_name', c.snapshot #>> '{type,name}', 'template_id', c.template_id, 'system_template', c.system_template,
    'issue_date', c.issue_date, 'period_from', c.period_from, 'period_to', c.period_to,
    'issued_at', c.issued_at, 'revoked_at', c.revoked_at, 'revoke_reason', c.revoke_reason,
    'archived_at', c.archived_at, 'batch_id', c.batch_id, 'replaces_id', c.replaces_id, 'design_id', c.design_id,
    'replaced_by', (SELECT r.id FROM public.certificates r WHERE r.replaces_id = c.id ORDER BY r.created_at DESC LIMIT 1),
    'verify_code', CASE WHEN c.status IN ('issued', 'revoked', 'archived') THEN c.verify_code END,
    'snapshot', c.snapshot, 'design', d,
    'assets', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'kind', a.kind, 'mime', a.mime,
                 'data_url', a.data_url, 'width', a.width, 'height', a.height))
      FROM public.certificate_assets a
     WHERE a.center_id = c.center_id
       AND a.id::text IN (SELECT (regexp_matches(COALESCE(d::text, ''),
             'asset:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})', 'g'))[1])), '[]'::jsonb),
    'can_revoke', c.status = 'issued' AND (public.manages_center(me, c.center_id)
                   OR (c.issued_by = me AND private.cert_can_issue(me, c.halaqa_id))),
    'can_issue', c.halaqa_id IS NOT NULL AND private.cert_can_issue(me, c.halaqa_id));
END;
$$;

-- مسودات دفعة لمتابعة تحريرها.
CREATE OR REPLACE FUNCTION public.cert_batch(_batch uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := (SELECT auth.uid());
  f public.certificates;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  SELECT * INTO f FROM public.certificates WHERE batch_id = _batch AND status IN ('draft', 'ready')
   ORDER BY created_at LIMIT 1;
  IF f.id IS NULL OR NOT private.cert_can_issue(me, f.halaqa_id) THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  RETURN jsonb_build_object(
    'batch_id', _batch, 'halaqa_id', f.halaqa_id, 'center_id', f.center_id, 'type_key', f.type_key,
    'template_id', f.template_id, 'system_template', f.system_template, 'issue_date', f.issue_date,
    'period_from', f.period_from, 'period_to', f.period_to, 'status', f.status,
    'design', (SELECT x.design FROM public.certificate_designs x WHERE x.id = f.design_id),
    'items', (SELECT jsonb_agg(jsonb_build_object('id', c.id, 'student_id', c.student_id, 'student_name', c.student_name,
                'override', c.snapshot->'override', 'achievement_ref', c.snapshot->'achievement_ref') ORDER BY c.created_at, c.id)
                FROM public.certificates c WHERE c.batch_id = _batch AND c.status IN ('draft', 'ready')));
END;
$$;

CREATE OR REPLACE FUNCTION public.cert_audit_log(_center uuid, _limit int DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := (SELECT auth.uid());
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT private.can_view_center(me, _center) THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('id', l.id, 'action', l.action, 'entity_id', l.entity_id,
             'details', l.details, 'at', l.at, 'actor', (SELECT p.name FROM public.profiles p WHERE p.id = l.actor_id))
             ORDER BY l.at DESC, l.id DESC)
    FROM (SELECT * FROM public.certificate_audit_log a WHERE a.center_id = _center
           ORDER BY a.at DESC, a.id DESC LIMIT LEAST(GREATEST(COALESCE(_limit, 50), 1), 200)) l), '[]'::jsonb);
END;
$$;

-- ─────────── التحقق (يوسّع 10.2: الصحيحة والملغاة وغير الموجودة) ───────────
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
  -- لا معرّفات ولا بيانات من سجل الطالب: ما على الشهادة نفسها.
  RETURN jsonb_build_object(
    'status', CASE WHEN c.revoked_at IS NOT NULL THEN 'revoked' ELSE 'valid' END, 'kind', 'studio',
    'certificate_number', c.certificate_number, 'student_name', c.student_name,
    'center_name', c.center_name, 'halaqa_name', c.halaqa_name,
    'type_name', c.snapshot #>> '{type,name}', 'issue_date', c.issue_date,
    'revoked_at', c.revoked_at);
END;
$$;
REVOKE ALL ON FUNCTION public.verify_certificate(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_certificate(text) TO authenticated;

-- شاشة «إنجازاتي» تبقى لشهادات الجزء التلقائية كما هي؛ شهائد الاستوديو تُعرض من cert_list.
CREATE OR REPLACE FUNCTION public.student_achievements(_student uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
BEGIN
  IF me IS NULL OR NOT public.can_view_student_report(me, _student) THEN
    RAISE EXCEPTION 'لا تملك عرض إنجازات هذا الطالب.';
  END IF;
  RETURN jsonb_build_object(
    'student', (SELECT jsonb_build_object('id', id, 'name', name) FROM public.profiles WHERE id = _student),
    'streak', public.streak_of(_student),
    'memorized_pages', (SELECT count(DISTINCT page) FROM public.mushaf_records
                         WHERE student_id = _student AND kind = 'memorize'),
    'memorized', COALESCE((SELECT jsonb_agg(DISTINCT page) FROM public.mushaf_records
                            WHERE student_id = _student AND kind = 'memorize'), '[]'::jsonb),
    'badges', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                 'kind', kind, 'no', no, 'label', public.unit_label(kind, no), 'earned_at', earned_at)
                 ORDER BY earned_at DESC, kind, no)
               FROM public.student_badges WHERE student_id = _student), '[]'::jsonb),
    'certificates', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                 'id', id, 'juz', juz, 'status', status, 'serial', serial, 'student_name', student_name,
                 'halaqa_name', halaqa_name, 'center_name', center_name, 'teacher_name', teacher_name,
                 'teacher_note', teacher_note, 'decided_at', decided_at, 'created_at', created_at,
                 'verify_code', CASE WHEN status = 'approved' THEN verify_code END)
                 ORDER BY juz)
               FROM public.certificates WHERE student_id = _student AND source = 'auto'), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cert_issue(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cert_finalize(uuid, uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cert_mark_ready(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cert_discard_drafts(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cert_revoke(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cert_archive(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cert_list(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cert_stats(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cert_get(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cert_batch(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cert_audit_log(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cert_issue(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cert_finalize(uuid, uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cert_mark_ready(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cert_discard_drafts(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cert_revoke(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cert_archive(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cert_list(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cert_stats(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cert_get(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cert_batch(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cert_audit_log(uuid, int) TO authenticated, service_role;

COMMENT ON FUNCTION public.cert_issue IS
  'استوديو الشهائد: إصدار فردي أو جماعي (حتى 200) أو مسودة لحلقة يملك المستدعي الإصدار فيها؛ لقطة لكل طالب ورقم فريد.';
COMMENT ON FUNCTION public.verify_certificate IS
  'التحقق برمز الشهادة: valid / revoked / invalid، بحدّ 10 محاولات في الدقيقة، دون بيانات خاصة.';
