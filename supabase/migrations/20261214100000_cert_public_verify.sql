-- ════════════════════════════════════════════════════════════════════════════
-- استوديو الشهائد 1.23.0 — التحقق العام، و«شهاداتي»، وهوية المعلّم المستقل (docs/CERTIFICATE_STUDIO_AUDIT.md، المرحلة 2)
-- ════════════════════════════════════════════════════════════════════════════
-- H1  verify_certificate_public(_code): لمن لا حساب له (anon)، بحدّ لكل عنوان IP (20 في 10 دقائق، _request_ip)،
--     ويعرض الاسم الأول مع الحرف الأول من اسم العائلة فقط (قرار صاحب المشروع)، ولا معرّفات. الصفحة الثابتة verify/
--     في الموقع العام (scripts/build-legal-site.mjs).
-- H6  تصحيح للفحص: halaqat.center_id NOT NULL منذ أول ترحيل، فلا حلقة بلا مركز؛ المعلّم المستقل صاحب مركزه فيدير
--     هويته كاملة. والجديد: «الاسم الرسمي» في الهوية (brand.officialName، كان يُحفظ ولا يُستعمل) هو اسم الجهة على
--     الشهادة إن ضُبط، كـ«حلقات الأستاذ فلان».
-- H5  إشعار وليّ الأمر بالشهادة يفتح الشهادة نفسها لا صفحة الأسرة.
-- الدالتان منسوختان من 20261213100000 و20261206110000 مع هذه التغييرات فقط.
-- التراجع: إعادة تعريفيهما من الملفين، وDROP FUNCTION public.verify_certificate_public(text)، private.cert_mask_name(text)،
-- وDROP TABLE public.certificate_public_attempts.
-- الفحص: supabase/tests/checks.sql (169–170).

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
  -- اسم الجهة على الشهادة: من الهوية إن ضُبط، وإلا اسم المركز.
  cen.name := COALESCE(NULLIF(left(btrim(COALESCE(cen.certificate_brand->>'officialName', '')), 120), ''), cen.name);
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
  -- وليّ الأمر يفتح الشهادة نفسها (1.23.0) لا صفحة الأسرة العامة.
  INSERT INTO public.notifications (user_id, kind, title, body, link)
  SELECT g.guardian_id, 'certificate', 'شهادة جديدة',
         c.student_name || ': ' || COALESCE(c.snapshot #>> '{type,name}', 'شهادة') || '.', '/certificates/' || c.id
    FROM public.certificates c JOIN public.guardian_links g ON g.student_id = c.student_id
   WHERE c.id = _cert;
$$;

-- ─────────── التحقق العام (H1) ───────────
CREATE TABLE IF NOT EXISTS public.certificate_public_attempts (
  ip text NOT NULL,
  at timestamptz NOT NULL DEFAULT now(),
  found boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS certificate_public_attempts_ip_at ON public.certificate_public_attempts (ip, at);
ALTER TABLE public.certificate_public_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.certificate_public_attempts FROM PUBLIC, anon, authenticated;

-- «عبدالرحمن بن عبدالله آل إبراهيم» ← «عبدالرحمن إ.»؛ «عبد الله الحسني» ← «عبد الله ح.»؛ الاسم الواحد كما هو.
CREATE OR REPLACE FUNCTION private.cert_mask_name(_name text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  w text[] := regexp_split_to_array(btrim(regexp_replace(COALESCE(_name, ''), '\s+', ' ', 'g')), ' ');
  n int := COALESCE(array_length(w, 1), 0);
  first text;
  fam text;
  k int := 1;
BEGIN
  IF n = 0 OR w[1] = '' THEN RETURN ''; END IF;
  first := w[1];
  -- الأسماء المركّبة: «عبد الله»، «أبو بكر».
  IF n >= 2 AND w[1] IN ('عبد', 'أبو', 'ابو', 'Abd', 'Abu') THEN first := w[1] || ' ' || w[2]; k := 2; END IF;
  IF n <= k THEN RETURN first; END IF;
  fam := w[n];
  IF fam LIKE 'ال%' AND char_length(fam) > 3 THEN fam := substr(fam, 3); END IF;
  RETURN first || ' ' || left(fam, 1) || '.';
END;
$$;
REVOKE ALL ON FUNCTION private.cert_mask_name(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.verify_certificate_public(_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  code text := upper(regexp_replace(COALESCE(_code, ''), '[^A-Za-z0-9]', '', 'g'));
  -- cf-connecting-ip يغلب x-forwarded-for الذي يرسله العميل (فحص 94).
  caller_ip text := left(public._request_ip(), 64);
  c public.certificates%ROWTYPE;
  rn text;
BEGIN
  -- حالة لا استثناء: الاستثناء يلغي تسجيل المحاولة فيسقط الحدّ.
  IF (SELECT count(*) FROM public.certificate_public_attempts a
       WHERE a.ip = caller_ip AND a.at > now() - interval '10 minutes') >= 20 THEN
    RETURN jsonb_build_object('status', 'rate_limited');
  END IF;
  DELETE FROM public.certificate_public_attempts WHERE at < now() - interval '1 day';
  IF code ~ '^[A-HJ-NP-Z2-9]{16}$' THEN
    SELECT * INTO c FROM public.certificates
     WHERE verify_code = code
       AND ((source = 'auto' AND status = 'approved') OR (source = 'studio' AND status IN ('issued', 'revoked', 'archived')));
  END IF;
  INSERT INTO public.certificate_public_attempts (ip, found) VALUES (caller_ip, c.id IS NOT NULL);
  IF c.id IS NULL THEN RETURN jsonb_build_object('status', 'invalid'); END IF;
  IF c.source = 'auto' THEN
    RETURN jsonb_build_object('status', 'valid', 'kind', 'auto', 'student_name', private.cert_mask_name(c.student_name),
      'juz', c.juz, 'center_name', c.center_name, 'issue_date', COALESCE(c.decided_at, c.created_at)::date);
  END IF;
  rn := (SELECT r.certificate_number FROM public.certificates r
          WHERE r.replaces_id = c.id AND r.status IN ('issued', 'revoked', 'archived') ORDER BY r.created_at DESC LIMIT 1);
  RETURN jsonb_build_object(
    'status', CASE WHEN c.revoked_at IS NOT NULL AND rn IS NOT NULL THEN 'replaced'
                   WHEN c.revoked_at IS NOT NULL THEN 'revoked' ELSE 'valid' END,
    'kind', 'studio', 'certificate_number', c.certificate_number,
    'student_name', private.cert_mask_name(c.student_name), 'center_name', c.center_name,
    'type_name', c.snapshot #>> '{type,name}', 'issue_date', c.issue_date,
    'revoked_at', c.revoked_at::date, 'replaced_by', rn);
END;
$$;
REVOKE ALL ON FUNCTION public.verify_certificate_public(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_certificate_public(text) TO anon, authenticated, service_role;
