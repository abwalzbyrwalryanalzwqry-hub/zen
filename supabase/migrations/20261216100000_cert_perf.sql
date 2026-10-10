-- ════════════════════════════════════════════════════════════════════
-- استوديو الشهادات 1.25.0 — الأداء والمتانة (فحص الاستوديو، المرحلة 4)
--   M5: فهارس جزئية للشهادات (source='studio') + بحث trigram، ونطاق مسبق في cert_list/cert_stats
--       (مراكز المستخدم ∪ حلقاته ∪ طلابه/أبناؤه) قبل cert_visible.
--   M6: cert_get_many — شهادات كثيرة في طلب واحد، والتصميم والأصول مرة واحدة لا مع كل شهادة.
--   L4: حذف مركز له شهادات صادرة: certificate_designs.center_id يصير NULL (اللقطة تبقى، والتحقق يعمل).
--   L1: فحص SVG أشد في cert_save_asset (والعميل يحوّل SVG إلى PNG عند الرفع).
-- ════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS certificates_studio_center_idx
  ON public.certificates (center_id, status, created_at DESC) WHERE source = 'studio';
CREATE INDEX IF NOT EXISTS certificates_studio_halaqa_idx
  ON public.certificates (halaqa_id, status, created_at DESC) WHERE source = 'studio';
CREATE INDEX IF NOT EXISTS certificates_studio_student_idx
  ON public.certificates (student_id, status) WHERE source = 'studio';

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
CREATE INDEX IF NOT EXISTS certificates_student_name_trgm
  ON public.certificates USING gin (student_name extensions.gin_trgm_ops) WHERE source = 'studio';
CREATE INDEX IF NOT EXISTS certificates_number_trgm
  ON public.certificates USING gin (certificate_number extensions.gin_trgm_ops) WHERE source = 'studio';

-- L4 ───────────────────────────────────────────────────────────────────
ALTER TABLE public.certificate_designs ALTER COLUMN center_id DROP NOT NULL;
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT con.conname FROM pg_constraint con
            WHERE con.conrelid = 'public.certificate_designs'::regclass AND con.contype = 'f'
              AND con.confrelid = 'public.centers'::regclass LOOP
    EXECUTE format('ALTER TABLE public.certificate_designs DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;
ALTER TABLE public.certificate_designs ADD CONSTRAINT certificate_designs_center_fk
  FOREIGN KEY (center_id) REFERENCES public.centers(id) ON DELETE SET NULL;

-- التصميم المجمّد يبقى ثابتاً؛ الاستثناء فكّه عن مركز أو منشئ محذوف (center_id/created_by → NULL، بـ ON DELETE SET NULL).
CREATE OR REPLACE FUNCTION public.certificate_frozen_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_TABLE_NAME = 'certificate_assets' THEN
    IF (to_jsonb(NEW) - 'archived') IS DISTINCT FROM (to_jsonb(OLD) - 'archived') THEN
      RAISE EXCEPTION 'ASSET_IMMUTABLE';
    END IF;
  ELSIF (to_jsonb(NEW) - 'template_id'
           - CASE WHEN NEW.center_id IS NULL THEN 'center_id' ELSE '' END
           - CASE WHEN NEW.created_by IS NULL THEN 'created_by' ELSE '' END)
        IS DISTINCT FROM
        (to_jsonb(OLD) - 'template_id'
           - CASE WHEN NEW.center_id IS NULL THEN 'center_id' ELSE '' END
           - CASE WHEN NEW.created_by IS NULL THEN 'created_by' ELSE '' END) THEN
    RAISE EXCEPTION 'DESIGN_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.certificates_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  moving text[] := ARRAY['status', 'revoked_by', 'revoked_at', 'revoke_reason', 'archived_at', 'updated_at'];
  -- 1.25.0 (L4): مراجع تُفرَّغ بـ ON DELETE SET NULL عند حذف مركز أو حلقة أو حساب؛ اللقطة تحفظ أسماءها.
  fks constant text[] := ARRAY['center_id', 'halaqa_id', 'teacher_id', 'template_id', 'replaces_id', 'issued_by',
                                'approved_by', 'created_by', 'revoked_by'];
BEGIN
  NEW.updated_at := now();
  IF OLD.source <> 'studio' THEN
    IF NEW.source <> OLD.source THEN RAISE EXCEPTION 'CERTIFICATE_IMMUTABLE'; END IF;
    RETURN NEW;
  END IF;
  IF OLD.status NOT IN ('issued', 'revoked', 'archived') THEN RETURN NEW; END IF;
  moving := moving || ARRAY(SELECT k FROM unnest(fks) k
                             WHERE to_jsonb(NEW) ? k AND jsonb_typeof(to_jsonb(NEW) -> k) = 'null');
  IF (to_jsonb(NEW) - moving) IS DISTINCT FROM (to_jsonb(OLD) - moving) THEN
    RAISE EXCEPTION 'CERTIFICATE_IMMUTABLE';
  END IF;
  IF NOT ((OLD.status = 'issued' AND NEW.status IN ('issued', 'revoked', 'archived'))
          OR (OLD.status = 'revoked' AND NEW.status IN ('revoked', 'archived'))
          OR (OLD.status = 'archived' AND NEW.status = 'archived')) THEN
    RAISE EXCEPTION 'CERTIFICATE_IMMUTABLE';
  END IF;
  -- الإلغاء نهائي: لا يُمحى سببه ولا فاعله بالأرشفة.
  IF OLD.revoked_at IS NOT NULL AND (NEW.revoked_at IS DISTINCT FROM OLD.revoked_at
     OR NEW.revoke_reason IS DISTINCT FROM OLD.revoke_reason
     OR (NEW.revoked_by IS DISTINCT FROM OLD.revoked_by AND NEW.revoked_by IS NOT NULL)) THEN
    RAISE EXCEPTION 'CERTIFICATE_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;

-- M5 ───────────────────────────────────────────────────────────────────
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
  -- M5 (1.25.0): نطاق مسبق بالفهارس قبل cert_visible (لا مرور على شهادات المنصة كلها لكل طلب).
  sc_centers uuid[];
  sc_halaqat uuid[];
  sc_students uuid[];
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  sc_centers := ARRAY(SELECT x.id FROM public.centers x WHERE x.created_by = me
                      UNION SELECT s.center_id FROM public.center_staff s WHERE s.user_id = me);
  sc_halaqat := ARRAY(SELECT h.id FROM public.halaqat h
                       WHERE h.teacher_id = me OR h.center_id = ANY (sc_centers) OR private.manages_halaqa(me, h.id));
  sc_students := ARRAY(SELECT me
                       UNION SELECT g.student_id FROM public.guardian_links g WHERE g.guardian_id = me
                       UNION SELECT hs.student_id FROM public.halaqa_students hs JOIN public.halaqat h ON h.id = hs.halaqa_id
                              WHERE h.teacher_id = me);
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
         AND (c.center_id = ANY (sc_centers) OR c.halaqa_id = ANY (sc_halaqat) OR c.student_id = ANY (sc_students))
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
  -- M5 (1.25.0): نطاق مسبق بالفهارس قبل cert_visible (لا مرور على شهادات المنصة كلها لكل طلب).
  sc_centers uuid[];
  sc_halaqat uuid[];
  sc_students uuid[];
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  sc_centers := ARRAY(SELECT x.id FROM public.centers x WHERE x.created_by = me
                      UNION SELECT s.center_id FROM public.center_staff s WHERE s.user_id = me);
  sc_halaqat := ARRAY(SELECT h.id FROM public.halaqat h
                       WHERE h.teacher_id = me OR h.center_id = ANY (sc_centers) OR private.manages_halaqa(me, h.id));
  sc_students := ARRAY(SELECT me
                       UNION SELECT g.student_id FROM public.guardian_links g WHERE g.guardian_id = me
                       UNION SELECT hs.student_id FROM public.halaqa_students hs JOIN public.halaqat h ON h.id = hs.halaqa_id
                              WHERE h.teacher_id = me);
  RETURN (
    WITH v AS (
      SELECT c.* FROM public.certificates c
       WHERE c.source = 'studio'
         AND (_center IS NULL OR c.center_id = _center)
         AND (_halaqa IS NULL OR c.halaqa_id = _halaqa)
         AND (c.center_id = ANY (sc_centers) OR c.halaqa_id = ANY (sc_halaqat) OR c.student_id = ANY (sc_students))
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

-- M6 ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cert_get_many(_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := (SELECT auth.uid());
  i uuid;
  r jsonb;
  a jsonb;
  items jsonb := '[]'::jsonb;
  designs jsonb := '{}'::jsonb;
  assets jsonb := '{}'::jsonb;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF COALESCE(cardinality(_ids), 0) > 200 THEN RAISE EXCEPTION 'TOO_MANY'; END IF;
  FOR i IN SELECT DISTINCT ON (u) u FROM unnest(COALESCE(_ids, '{}'::uuid[])) u LOOP
    BEGIN
      r := public.cert_get(i);
    EXCEPTION WHEN others THEN
      CONTINUE; -- غير المرئية تُسقط بصمت كما في cert_list
    END;
    IF r->>'design_id' IS NOT NULL AND NOT designs ? (r->>'design_id') THEN
      designs := designs || jsonb_build_object(r->>'design_id', r->'design');
    END IF;
    FOR a IN SELECT * FROM jsonb_array_elements(COALESCE(r->'assets', '[]'::jsonb)) LOOP
      IF NOT assets ? (a->>'id') THEN assets := assets || jsonb_build_object(a->>'id', a); END IF;
    END LOOP;
    items := items || jsonb_build_array(r - 'design' - 'assets');
  END LOOP;
  RETURN jsonb_build_object('items', items, 'designs', designs,
    'assets', COALESCE((SELECT jsonb_agg(v) FROM jsonb_each(assets) e(k, v)), '[]'::jsonb));
END;
$$;
REVOKE ALL ON FUNCTION public.cert_get_many(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cert_get_many(uuid[]) TO authenticated, service_role;
COMMENT ON FUNCTION public.cert_get_many(uuid[]) IS
  'حتى 200 شهادة بطلب واحد: البنود بلا تصميم ولا أصول، والتصاميم بمعرّفها، والأصول مرة واحدة (1.25.0).';

-- L1 ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cert_save_asset(_center uuid, _asset jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := (SELECT auth.uid());
  k text := _asset->>'kind';
  data text := _asset->>'data_url';
  m text := substring(COALESCE(_asset->>'data_url', '') FROM '^data:(image/(?:png|jpeg|webp|svg\+xml));base64,');
  h text;
  aid uuid;
  svg text;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  -- الشعار والختم هوية المركز: لإدارته. التواقيع والصور والزخارف لمن يصدر في المركز.
  IF k IN ('logo', 'logo_white', 'stamp') THEN
    IF NOT public.manages_center(me, _center) THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  ELSIF NOT (public.manages_center(me, _center)
             OR EXISTS (SELECT 1 FROM public.halaqat x WHERE x.center_id = _center AND private.manages_halaqa(me, x.id))) THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;
  IF m IS NULL OR data IS NULL OR char_length(data) > 1400000 THEN RAISE EXCEPTION 'INVALID_IMAGE'; END IF;
  IF m = 'image/svg+xml' THEN
    BEGIN
      svg := convert_from(decode(substr(data, char_length('data:image/svg+xml;base64,') + 1), 'base64'), 'UTF8');
    EXCEPTION WHEN others THEN RAISE EXCEPTION 'INVALID_IMAGE';
    END;
    -- SVG آمن فقط: لا نصوص برمجية ولا محتوى أجنبي ولا روابط خارجية ولا معالجات أحداث.
    -- L1 (1.25.0): وكيانات مرمّزة (&#) وDOCTYPE وurl() لغير مرجع داخلي وروابط data: وعناصر التحريك والتضمين.
    IF svg ~* '<\s*script|<\s*foreignObject|javascript:|\son[a-z]+\s*=|(href|src)\s*=\s*["'']?\s*(https?:|//|data:)|<!ENTITY|<!DOCTYPE|@import|&#|url\(\s*["'']?[^#"''\s]|<\s*(iframe|embed|object|animate|set|handler|listener)\M|<\s*use[^>]+href\s*=\s*["'']?[^#"'']' THEN
      RAISE EXCEPTION 'UNSAFE_SVG';
    END IF;
  END IF;
  h := md5(data);
  INSERT INTO public.certificate_assets (center_id, kind, label, signer_name, signer_title, mime, data_url,
                                         width, height, hash, created_by)
  VALUES (_center, k, NULLIF(btrim(_asset->>'label'), ''), NULLIF(btrim(_asset->>'signer_name'), ''),
          NULLIF(btrim(_asset->>'signer_title'), ''), m, data, (_asset->>'width')::int, (_asset->>'height')::int, h, me)
  ON CONFLICT (center_id, hash) DO NOTHING
  RETURNING id INTO aid;
  IF aid IS NULL THEN
    SELECT a.id INTO aid FROM public.certificate_assets a WHERE a.center_id = _center AND a.hash = h;
    UPDATE public.certificate_assets SET archived = false WHERE id = aid AND archived;
    RETURN aid;
  END IF;
  PERFORM private.cert_audit(_center, 'asset.' || CASE WHEN k IN ('logo', 'logo_white') THEN 'logo'
                                                     WHEN k = 'signature' THEN 'signature'
                                                     WHEN k = 'stamp' THEN 'stamp' ELSE 'upload' END,
                             aid, jsonb_build_object('kind', k));
  RETURN aid;
END;
$$;

