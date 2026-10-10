-- ════════════════════════════════════════════════════════════════════════════
-- استوديو الشهائد 1.24.0 — المرحلة 3 من الفحص (docs/CERTIFICATE_STUDIO_AUDIT.md): الاعتماد والترقيم
-- ════════════════════════════════════════════════════════════════════════════
--   • H3: الخادم يعيد فحص شروط النوع من السجل نفسه (private.cert_server_check)، فحصاً «لازماً» متسامحاً: يحسب على
--     كامل السجل المعتمد (لا الفترة) فلا يردّ طالباً يستحق، ويكشف الادعاء الصارخ (خاتم بثلاث صفحات). شروط النِّسب
--     والمعدّلات (الحضور والتقييم والدرجات) لا تُعاد هنا: تبقى على العميل وتظهر «لم يُفحص» في اللقطة.
--   • قرار صاحب المشروع (2): الإصدار خارج الشروط مسموح بعد اعتماد المدير. الشهادة تصير «بانتظار الاعتماد»
--     (pending) بلا رقم حين يصدرها غير مدير وكانت: غير مستوفية على الخادم، أو بتجاوز، أو بتوقيع أصل رفعه غيره،
--     أو اشترط المركز الاعتماد لكل الشهادات (certificate_brand.requireApproval). المدير يصدر مباشرة.
--     cert_approve يمنح الرقم ويُصدر، وcert_reject يردّ بسبب. التحقق يذكر الاعتماد.
--   • M8: ترقيم لكل مركز ولكل سنة ZEN-<رمز>-YYYY-NNNN؛ الرمز من certificate_brand.numberPrefix (2–6 حروف/أرقام
--     لاتينية كبيرة، فريد) وإلا من بصمة المركز. الأرقام القديمة ZEN-YYYY-NNNNNN تبقى صحيحة.
-- التراجع: DROP FUNCTION public.cert_approve(uuid[]), public.cert_reject(uuid[], text), private.cert_server_check,
--   private.cert_approval_reasons, private.cert_center_prefix, private.cert_next_center_number,
--   private.cert_notify_pending؛ DROP TABLE public.certificate_counters, public.certificate_number_prefixes؛
--   وأعد الدوال المعرّفة هنا من 20261214100000 و20261213100000 و20261206110000، والقيود من 20261206100000.
-- الفحص: supabase/tests/checks.sql (171–173).

ALTER TABLE public.certificates
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_note text CHECK (review_note IS NULL OR char_length(review_note) <= 300);
CREATE INDEX IF NOT EXISTS certificates_approved_by_idx ON public.certificates (approved_by);
CREATE INDEX IF NOT EXISTS certificates_pending_idx ON public.certificates (center_id, created_at DESC) WHERE status = 'pending';

ALTER TABLE public.certificates DROP CONSTRAINT IF EXISTS certificates_status_check;
ALTER TABLE public.certificates ADD CONSTRAINT certificates_status_check CHECK (
  (source = 'auto' AND status IN ('pending', 'approved', 'rejected'))
  OR (source = 'studio' AND status IN ('draft', 'ready', 'pending', 'rejected', 'issued', 'revoked', 'archived')));
ALTER TABLE public.certificates DROP CONSTRAINT IF EXISTS certificates_studio_issued;
ALTER TABLE public.certificates ADD CONSTRAINT certificates_studio_issued CHECK (
  source = 'auto' OR status IN ('draft', 'ready', 'pending', 'rejected')
  OR (certificate_number IS NOT NULL AND issued_at IS NOT NULL AND design_id IS NOT NULL AND snapshot IS NOT NULL));
ALTER TABLE public.certificates DROP CONSTRAINT IF EXISTS certificates_number_format;
ALTER TABLE public.certificates ADD CONSTRAINT certificates_number_format
  CHECK (certificate_number IS NULL OR certificate_number ~ '^ZEN-([A-Z0-9]{2,6}-)?[0-9]{4}-[0-9]{4,}$');

-- ─────────── M8: رمز المركز وعدّاده السنوي ───────────
CREATE TABLE IF NOT EXISTS public.certificate_number_prefixes (
  center_id uuid PRIMARY KEY REFERENCES public.centers(id) ON DELETE CASCADE,
  prefix text NOT NULL UNIQUE CHECK (prefix ~ '^[A-Z0-9]{2,6}$')
);
CREATE TABLE IF NOT EXISTS public.certificate_counters (
  center_id uuid NOT NULL REFERENCES public.centers(id) ON DELETE CASCADE,
  year int NOT NULL CHECK (year BETWEEN 2000 AND 2999),
  last int NOT NULL DEFAULT 0 CHECK (last >= 0),
  PRIMARY KEY (center_id, year)
);
ALTER TABLE public.certificate_number_prefixes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certificate_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.certificate_number_prefixes, public.certificate_counters FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.certificate_number_prefixes, public.certificate_counters TO service_role;

CREATE OR REPLACE FUNCTION private.cert_center_prefix(_center uuid)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  want text := upper(btrim(COALESCE((SELECT c.certificate_brand->>'numberPrefix' FROM public.centers c WHERE c.id = _center), '')));
  cur text := (SELECT p.prefix FROM public.certificate_number_prefixes p WHERE p.center_id = _center);
  h text := upper(md5(_center::text));
  k int;
BEGIN
  -- الرمز الذي اختاره المركز إن كان صالحاً وغير مأخوذ؛ وإلا الحالي؛ وإلا من بصمة المركز بأقصر طول متاح.
  IF want ~ '^[A-Z0-9]{2,6}$' AND want IS DISTINCT FROM cur
     AND NOT EXISTS (SELECT 1 FROM public.certificate_number_prefixes p WHERE p.prefix = want) THEN
    INSERT INTO public.certificate_number_prefixes (center_id, prefix) VALUES (_center, want)
    ON CONFLICT (center_id) DO UPDATE SET prefix = EXCLUDED.prefix;
    RETURN want;
  END IF;
  IF cur IS NOT NULL THEN RETURN cur; END IF;
  FOR k IN 4..6 LOOP
    BEGIN
      INSERT INTO public.certificate_number_prefixes (center_id, prefix) VALUES (_center, left(h, k));
      RETURN left(h, k);
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
  END LOOP;
  INSERT INTO public.certificate_number_prefixes (center_id, prefix)
  VALUES (_center, upper(left(md5(random()::text), 6))) RETURNING prefix INTO cur;
  RETURN cur;
END;
$$;

CREATE OR REPLACE FUNCTION private.cert_next_center_number(_center uuid, _on date)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  y int := date_part('year', COALESCE(_on, public.zen_today()))::int;
  pfx text := private.cert_center_prefix(_center);
  n int;
  num text;
BEGIN
  LOOP
    INSERT INTO public.certificate_counters AS k (center_id, year, last) VALUES (_center, y, 1)
    ON CONFLICT (center_id, year) DO UPDATE SET last = k.last + 1 RETURNING k.last INTO n;
    num := 'ZEN-' || pfx || '-' || y || '-' || lpad(n::text, 4, '0');
    -- رمز أُعيد استعماله بعد تغيير: لا يتكرر رقم أبداً.
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.certificates c WHERE c.certificate_number = num);
  END LOOP;
  RETURN num;
END;
$$;

-- ─────────── H3: فحص الاستحقاق في الخادم ───────────
-- كامل السجل المعتمد للطالب (كل الحلقات): التسميع المعتمد ومصحفه الشخصي والحضور. متسامح عمداً (حدّ أدنى لازم).
CREATE OR REPLACE FUNCTION private.cert_server_check(_student uuid, _conditions jsonb, _ref jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  cond jsonb;
  k text;
  need numeric;
  actual numeric;
  ok boolean;
  checks jsonb := '[]'::jsonb;
  pages int[];
  su int;
  jz int;
  mem_spans numeric;
  rev_spans numeric;
BEGIN
  IF jsonb_typeof(_conditions) <> 'array' OR jsonb_array_length(_conditions) = 0 THEN
    RETURN jsonb_build_object('ok', true, 'manual', true, 'checks', '[]'::jsonb);
  END IF;
  WITH s AS (
    SELECT private.surah_no(r.surah_name) AS su, LEAST(r.from_ayah, r.to_ayah) AS a1, GREATEST(r.from_ayah, r.to_ayah) AS a2
      FROM public.recitation_sessions r
     WHERE r.student_id = _student AND r.kind = 'memorize' AND r.status = 'approved'
  ), sp AS (
    SELECT private.ayah_page(s.su, s.a1) AS p1, private.ayah_page(s.su, s.a2) AS p2 FROM s WHERE s.su IS NOT NULL
  )
  SELECT COALESCE(array_agg(DISTINCT p), '{}'), (SELECT COALESCE(sum(GREATEST(sp.p2 - sp.p1 + 1, 1)), 0) FROM sp)
    INTO pages, mem_spans
    FROM (SELECT generate_series(sp.p1, sp.p2) AS p FROM sp
          UNION SELECT m.page FROM public.mushaf_records m WHERE m.student_id = _student AND m.kind = 'memorize') x
   WHERE p BETWEEN 1 AND 604;
  SELECT COALESCE(sum(GREATEST(private.ayah_page(private.surah_no(r.surah_name), GREATEST(r.from_ayah, r.to_ayah))
                              - private.ayah_page(private.surah_no(r.surah_name), LEAST(r.from_ayah, r.to_ayah)) + 1, 1)), 0)
    INTO rev_spans
    FROM public.recitation_sessions r
   WHERE r.student_id = _student AND r.kind = 'review' AND r.status = 'approved' AND private.surah_no(r.surah_name) IS NOT NULL;

  FOR cond IN SELECT x FROM jsonb_array_elements(_conditions) x LOOP
    k := cond->>'kind';
    need := NULLIF(cond->>'gte', '')::numeric;
    actual := NULL;
    ok := NULL;
    CASE k
      WHEN 'memorizedPages' THEN
        actual := GREATEST(cardinality(pages), mem_spans); ok := actual >= COALESCE(need, 0);
      WHEN 'reviewPages' THEN
        actual := rev_spans; ok := actual >= COALESCE(need, 0);
      WHEN 'attendedDays' THEN
        actual := (SELECT count(DISTINCT a.session_date) FROM public.attendance a
                    WHERE a.student_id = _student AND a.status IN ('present', 'late'));
        ok := actual >= COALESCE(need, 0);
      WHEN 'surahComplete' THEN
        su := CASE WHEN _ref->>'kind' = 'surah' THEN NULLIF(_ref->>'surah', '')::int END;
        IF su BETWEEN 1 AND 114 THEN
          SELECT round(100.0 * count(*) FILTER (WHERE p = ANY (pages)) / count(*)) INTO actual
            FROM public.quran_units u, generate_series(u.first_page::int, u.last_page::int) p WHERE u.kind = 'surah' AND u.no = su;
          ok := actual >= 100;
        ELSE ok := false; END IF;
        need := 100;
      WHEN 'juzComplete' THEN
        jz := CASE WHEN _ref->>'kind' = 'juz' THEN NULLIF(_ref->>'juz', '')::int END;
        IF jz BETWEEN 1 AND 30 THEN
          SELECT round(100.0 * count(*) FILTER (WHERE p = ANY (pages)) / count(*)) INTO actual
            FROM public.quran_units u, generate_series(u.first_page::int, u.last_page::int) p WHERE u.kind = 'juz' AND u.no = jz;
          ok := actual >= 100;
        ELSE ok := false; END IF;
        need := 100;
      WHEN 'khatm' THEN
        actual := round(100.0 * cardinality(pages) / 604); need := 100; ok := cardinality(pages) >= 604;
      ELSE
        -- النِّسب والمعدّلات وما لا يعرفه الخادم: «لم يُفحص» (ok = null) ولا يحجب.
        NULL;
    END CASE;
    checks := checks || jsonb_build_object('kind', k, 'ok', ok, 'actual', actual, 'need', need);
  END LOOP;
  RETURN jsonb_build_object('ok', NOT EXISTS (SELECT 1 FROM jsonb_array_elements(checks) c WHERE c->>'ok' = 'false'),
                            'manual', false, 'checks', checks);
END;
$$;

-- لماذا تحتاج هذه الشهادة اعتماد المدير؟ (فارغة = تصدر مباشرة)
CREATE OR REPLACE FUNCTION private.cert_approval_reasons(_me uuid, _center uuid, _design jsonb, _check jsonb, _override boolean)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT array_remove(ARRAY[
    CASE WHEN COALESCE(_override, false) THEN 'override' END,
    CASE WHEN NOT COALESCE((_check->>'ok')::boolean, true) THEN 'ineligible' END,
    CASE WHEN COALESCE((SELECT (c.certificate_brand->>'requireApproval')::boolean FROM public.centers c WHERE c.id = _center), false)
         THEN 'center_policy' END,
    CASE WHEN EXISTS (
      SELECT 1 FROM public.certificate_assets a
       WHERE a.center_id = _center AND a.kind = 'signature' AND a.created_by IS DISTINCT FROM _me
         AND a.id::text IN (SELECT (regexp_matches(COALESCE(_design::text, ''),
               'asset:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})', 'g'))[1]))
         THEN 'foreign_signature' END], NULL)
$$;

CREATE OR REPLACE FUNCTION private.cert_notify_pending(_center uuid, _count int, _halaqa text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.notifications (user_id, kind, title, body, link)
  SELECT DISTINCT u, 'certificate', 'شهادات بانتظار الاعتماد',
         _count || ' شهادة من ' || COALESCE(_halaqa, 'الحلقة') || ' تنتظر اعتمادك.', '/certificates?status=pending'
    FROM (SELECT c.created_by AS u FROM public.centers c WHERE c.id = _center
          UNION SELECT s.user_id FROM public.center_staff s WHERE s.center_id = _center AND s.role = 'manager') m
   WHERE u IS NOT NULL AND u IS DISTINCT FROM (SELECT auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.cert_issue(_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  chk jsonb;
  why text[];
  ist text;
  pend int := 0;
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
  -- تجاوز الشرط من غير المدير لم يعد مرفوضاً (1.24.0): تذهب الشهادة لاعتماد المدير (cert_approval_reasons).

  IF rep IS NOT NULL THEN
    SELECT * INTO old FROM public.certificates WHERE id = rep FOR UPDATE;
    IF old.id IS NULL OR old.source <> 'studio' OR old.status NOT IN ('issued', 'revoked', 'archived')
       OR old.halaqa_id IS DISTINCT FROM hal OR n <> 1 OR st <> 'issued'
       OR items->0->>'student_id' <> old.student_id::text THEN
      RAISE EXCEPTION 'INVALID_REPLACE';
    END IF;
    IF EXISTS (SELECT 1 FROM public.certificates r WHERE r.replaces_id = rep AND r.status IN ('pending', 'issued', 'revoked', 'archived')) THEN
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
    chk := private.cert_server_check(sid, ty.conditions, item->'achievement_ref');
    why := private.cert_approval_reasons(me, h.center_id, d, chk, COALESCE((item->>'override')::boolean, false));
    ist := CASE WHEN st = 'issued' AND NOT mgr AND cardinality(why) > 0 THEN 'pending' ELSE st END;
    IF ist = 'pending' THEN pend := pend + 1; END IF;
    num := CASE WHEN ist = 'issued' THEN private.cert_next_center_number(cen.id, idate) END;
    cid := gen_random_uuid();
    vc := private.new_verify_code();
    INSERT INTO public.certificates (
      id, source, status, student_id, student_name, halaqa_name, center_name, teacher_name, center_id, halaqa_id,
      teacher_id, type_key, template_id, system_template, design_id, issue_date, period_from, period_to, snapshot,
      batch_id, replaces_id, certificate_number, verify_code, created_by, issued_by, issued_at)
    VALUES (
      cid, 'studio', ist, sid, pname, h.name, cen.name, tname, cen.id, h.id,
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
        'override', COALESCE((item->>'override')::boolean, false),
        'server_check', chk, 'approval', jsonb_build_object('reasons', to_jsonb(why))),
      bid, rep, num, vc, me, CASE WHEN ist = 'issued' THEN me END, CASE WHEN ist = 'issued' THEN now() END);
    res := res || jsonb_build_object('id', cid, 'student_id', sid, 'student_name', pname, 'status', ist,
                                     'certificate_number', num, 'verify_code', CASE WHEN ist = 'issued' THEN vc END,
                                     'reasons', to_jsonb(why));
    IF ist = 'issued' THEN PERFORM private.cert_notify_issued(cid); END IF;
  END LOOP;

  IF rep IS NOT NULL THEN
    -- الشهادة المستبدَلة لا تبقى «صحيحة» بجانب بديلتها: تُلغى بسبب يذكر رقم البديلة، والتحقق يقول «استُبدلت».
    rep_num := res->0->>'certificate_number';
    IF old.status = 'issued' AND res->0->>'status' = 'issued' THEN
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
  IF pend > 0 THEN PERFORM private.cert_notify_pending(h.center_id, pend, h.name); END IF;
  RETURN jsonb_build_object('batch_id', bid, 'design_id', did, 'status', st, 'pending', pend, 'certificates', res);
END;
$$;

CREATE OR REPLACE FUNCTION public.cert_finalize(_batch uuid, _ids uuid[] DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  chk jsonb;
  why text[];
  pend int := 0;
  hname text;
  mgr boolean;
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
  mgr := public.manages_center(me, cen);
  hname := (SELECT h.name FROM public.halaqat h WHERE h.id = hal);
  FOR c IN SELECT * FROM public.certificates x
            WHERE x.batch_id = _batch AND x.status IN ('draft', 'ready') AND (_ids IS NULL OR x.id = ANY (_ids))
            ORDER BY x.created_at, x.id FOR UPDATE
  LOOP
    -- قد تمضي أيام بين المسودة وإصدارها: من خرج من الحلقة لا تصدر له.
    IF NOT EXISTS (SELECT 1 FROM public.halaqa_students hs WHERE hs.halaqa_id = c.halaqa_id AND hs.student_id = c.student_id) THEN
      RAISE EXCEPTION 'NOT_IN_HALAQA';
    END IF;
    chk := private.cert_server_check(c.student_id,
             (SELECT t.conditions FROM public.certificate_types t WHERE t.key = c.type_key
                 AND (t.center_id IS NULL OR t.center_id = c.center_id) ORDER BY t.center_id NULLS LAST LIMIT 1),
             c.snapshot->'achievement_ref');
    why := private.cert_approval_reasons(me, c.center_id, (SELECT x.design FROM public.certificate_designs x WHERE x.id = c.design_id),
                                         chk, COALESCE((c.snapshot->>'override')::boolean, false));
    IF NOT mgr AND cardinality(why) > 0 THEN
      UPDATE public.certificates
         SET status = 'pending', snapshot = snapshot || jsonb_build_object('server_check', chk,
                                                     'approval', jsonb_build_object('reasons', to_jsonb(why)))
       WHERE id = c.id;
      pend := pend + 1;
      res := res || jsonb_build_object('id', c.id, 'student_id', c.student_id, 'certificate_number', NULL,
                                       'verify_code', NULL, 'status', 'pending', 'reasons', to_jsonb(why));
      CONTINUE;
    END IF;
    num := private.cert_next_center_number(c.center_id, COALESCE(c.issue_date, public.zen_today()));
    UPDATE public.certificates
       SET status = 'issued', certificate_number = num, issued_by = me, issued_at = now(),
           issue_date = COALESCE(issue_date, public.zen_today()),
           snapshot = jsonb_set(snapshot, '{vars,certificate,number}', to_jsonb(num)) || jsonb_build_object('server_check', chk)
     WHERE id = c.id;
    PERFORM private.cert_notify_issued(c.id);
    res := res || jsonb_build_object('id', c.id, 'student_id', c.student_id, 'certificate_number', num,
                                     'verify_code', c.verify_code, 'status', 'issued');
  END LOOP;
  PERFORM private.cert_audit(cen, CASE WHEN jsonb_array_length(res) > 1 THEN 'certificate.batch_issue' ELSE 'certificate.issue' END,
                             _batch, jsonb_build_object('count', jsonb_array_length(res), 'from_draft', true));
  IF pend > 0 THEN PERFORM private.cert_notify_pending(cen, pend, hname); END IF;
  RETURN jsonb_build_object('batch_id', _batch, 'pending', pend, 'certificates', res);
END;
$$;

-- ─────────── الاعتماد والردّ (إدارة المركز) ───────────
CREATE OR REPLACE FUNCTION public.cert_approve(_ids uuid[])
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
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF _ids IS NULL OR cardinality(_ids) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'INVALID_ITEMS'; END IF;
  FOR c IN SELECT * FROM public.certificates x WHERE x.id = ANY (_ids) ORDER BY x.created_at, x.id FOR UPDATE LOOP
    IF c.source <> 'studio' OR NOT public.manages_center(me, c.center_id) THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
    IF c.status <> 'pending' THEN RAISE EXCEPTION 'NOT_PENDING'; END IF;
    num := private.cert_next_center_number(c.center_id, COALESCE(c.issue_date, public.zen_today()));
    UPDATE public.certificates
       SET status = 'issued', certificate_number = num, issued_by = COALESCE(c.created_by, me), issued_at = now(),
           issue_date = COALESCE(issue_date, public.zen_today()), approved_by = me, approved_at = now(),
           snapshot = jsonb_set(snapshot, '{vars,certificate,number}', to_jsonb(num))
                      || jsonb_build_object('approval', COALESCE(snapshot->'approval', '{}'::jsonb)
                           || jsonb_build_object('by', (SELECT p.name FROM public.profiles p WHERE p.id = me),
                                                 'at', now()))
     WHERE id = c.id;
    -- إعادة إصدار معلّقة: تُستبدل السابقة الآن فقط.
    IF c.replaces_id IS NOT NULL THEN
      UPDATE public.certificates
         SET status = 'revoked', revoked_by = me, revoked_at = now(), revoke_reason = left('استُبدلت بالشهادة ' || num, 300)
       WHERE id = c.replaces_id AND status = 'issued';
    END IF;
    PERFORM private.cert_notify_issued(c.id);
    IF c.created_by IS NOT NULL AND c.created_by <> me THEN
      INSERT INTO public.notifications (user_id, kind, title, body, link)
      VALUES (c.created_by, 'certificate', 'اعتُمدت الشهادة', c.student_name || ' — ' || num, '/certificates/' || c.id);
    END IF;
    PERFORM private.cert_audit(c.center_id, 'certificate.approve', c.id, jsonb_build_object('number', num));
    res := res || jsonb_build_object('id', c.id, 'certificate_number', num, 'status', 'issued');
  END LOOP;
  IF jsonb_array_length(res) <> cardinality(_ids) THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  RETURN jsonb_build_object('certificates', res);
END;
$$;

CREATE OR REPLACE FUNCTION public.cert_reject(_ids uuid[], _reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := (SELECT auth.uid());
  why text := btrim(COALESCE(_reason, ''));
  c record;
  n int := 0;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF char_length(why) NOT BETWEEN 3 AND 300 THEN RAISE EXCEPTION 'INVALID_REASON'; END IF;
  IF _ids IS NULL OR cardinality(_ids) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'INVALID_ITEMS'; END IF;
  FOR c IN SELECT * FROM public.certificates x WHERE x.id = ANY (_ids) ORDER BY x.created_at, x.id FOR UPDATE LOOP
    IF c.source <> 'studio' OR NOT public.manages_center(me, c.center_id) THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
    IF c.status <> 'pending' THEN RAISE EXCEPTION 'NOT_PENDING'; END IF;
    UPDATE public.certificates SET status = 'rejected', review_note = why, approved_by = me, approved_at = now()
     WHERE id = c.id;
    IF c.created_by IS NOT NULL AND c.created_by <> me THEN
      INSERT INTO public.notifications (user_id, kind, title, body, link)
      VALUES (c.created_by, 'certificate', 'لم تُعتمد الشهادة', c.student_name || ': ' || why, '/certificates/' || c.id);
    END IF;
    PERFORM private.cert_audit(c.center_id, 'certificate.reject', c.id, jsonb_build_object('reason', why));
    n := n + 1;
  END LOOP;
  IF n <> cardinality(_ids) THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  RETURN jsonb_build_object('rejected', n);
END;
$$;

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
    WHEN 'pending' THEN ARRAY['pending']
    WHEN 'rejected' THEN ARRAY['rejected']
    WHEN 'all' THEN ARRAY['draft', 'ready', 'pending', 'rejected', 'issued', 'revoked', 'archived']
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
          'can_issue', x.halaqa_id IS NOT NULL AND private.cert_can_issue(me, x.halaqa_id),
          'approved_at', x.approved_at, 'review_note', x.review_note,
          'reasons', x.snapshot #> '{approval,reasons}', 'server_check', x.snapshot -> 'server_check',
          'can_approve', x.status = 'pending' AND public.manages_center(me, x.center_id))
          ORDER BY x.created_at DESC, x.id)
        FROM (SELECT * FROM v ORDER BY v.created_at DESC, v.id LIMIT lim OFFSET off) x), '[]'::jsonb))
  );
END;
$$;

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
      'pending', (SELECT count(*) FROM v WHERE status = 'pending'),
      'to_approve', (SELECT count(*) FROM v WHERE status = 'pending' AND public.manages_center(me, v.center_id)),
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
    'can_issue', c.halaqa_id IS NOT NULL AND private.cert_can_issue(me, c.halaqa_id),
    'approved_at', c.approved_at, 'review_note', c.review_note,
    'approved_by_name', (SELECT p.name FROM public.profiles p WHERE p.id = c.approved_by),
    'can_approve', c.status = 'pending' AND public.manages_center(me, c.center_id));
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
    'revoked_at', c.revoked_at, 'approved', c.approved_at IS NOT NULL, 'approved_at', c.approved_at);
END;
$$;


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
    'revoked_at', c.revoked_at::date, 'replaced_by', rn, 'approved', c.approved_at IS NOT NULL);
END;
$$;

REVOKE ALL ON FUNCTION private.cert_center_prefix(uuid), private.cert_next_center_number(uuid, date),
  private.cert_server_check(uuid, jsonb, jsonb), private.cert_approval_reasons(uuid, uuid, jsonb, jsonb, boolean),
  private.cert_notify_pending(uuid, int, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cert_approve(uuid[]), public.cert_reject(uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cert_approve(uuid[]), public.cert_reject(uuid[], text) TO authenticated;
