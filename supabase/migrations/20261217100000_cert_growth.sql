-- ════════════════════════════════════════════════════════════════════
-- استوديو الشهادات 1.26.0 — التكريم والحفل والإجازة والبصمة (فحص الاستوديو، المرحلة 5)
--   • cert_honor: لوحة التكريم والإنصاف لحلقة — شهادات كل طالب في الفترة (العدد والأنواع والمرجع واليدوي).
--   • نوع «إجازة» للنظام (شرطه الختم؛ غير المستوفي ينتظر اعتماد المدير كأي شهادة).
--   • بصمة SHA-256 للّقطة الصادرة تظهر في التحقق وصفحة الشهادة. التوقيع التشفيري Ed25519 مؤجّل (القرار 0008).
-- ════════════════════════════════════════════════════════════════════

INSERT INTO public.certificate_types (key, name, category, text_kind, param, conditions, sort)
SELECT 'ijazah', 'إجازة في القرآن الكريم', 'special', 'special', NULL, '[{"kind":"khatm"}]'::jsonb, 150
 WHERE NOT EXISTS (SELECT 1 FROM public.certificate_types WHERE key = 'ijazah' AND center_id IS NULL);

-- بصمة ثابتة من حقول الشهادة الصادرة كلها (لا تتغيّر بعد الإصدار: certificates_guard). 16 خانة مجمّعة للقراءة.
CREATE OR REPLACE FUNCTION private.cert_fingerprint(c public.certificates)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT regexp_replace(upper(left(encode(sha256(convert_to(concat_ws('|',
           c.certificate_number, c.verify_code, c.student_name, c.issue_date::text, c.type_key,
           c.design_id::text, c.snapshot::text), 'UTF8')), 'hex'), 16)), '(.{4})(?!$)', '\1-', 'g')
$$;
REVOKE ALL ON FUNCTION private.cert_fingerprint(public.certificates) FROM PUBLIC, anon, authenticated;

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
    'revoked_at', c.revoked_at, 'approved', c.approved_at IS NOT NULL, 'approved_at', c.approved_at,
    'fingerprint', private.cert_fingerprint(c));
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
    'revoked_at', c.revoked_at::date, 'replaced_by', rn, 'approved', c.approved_at IS NOT NULL,
    'fingerprint', private.cert_fingerprint(c));
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
    'can_approve', c.status = 'pending' AND public.manages_center(me, c.center_id),
    'fingerprint', CASE WHEN c.status IN ('issued', 'revoked', 'archived') THEN private.cert_fingerprint(c) END);
END;
$$;

CREATE OR REPLACE FUNCTION public.cert_honor(_halaqa uuid, _from date, _to date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := (SELECT auth.uid());
  h public.halaqat;
  t date := COALESCE(_to, public.zen_today());
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  SELECT * INTO h FROM public.halaqat WHERE id = _halaqa;
  IF h.id IS NULL OR NOT (private.cert_can_issue(me, h.id) OR private.can_view_center(me, h.center_id)) THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;
  IF _from IS NULL OR _from > t OR t - _from > 731 THEN RAISE EXCEPTION 'INVALID_PERIOD'; END IF;
  RETURN jsonb_build_object('from', _from, 'to', t, 'students', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'student_id', s.student_id,
             'name', COALESCE(p.name, ''),
             'count', COALESCE(x.n, 0),
             'manual', COALESCE(x.manual, 0),
             'last', x.last,
             'items', COALESCE(x.items, '[]'::jsonb)) ORDER BY COALESCE(x.n, 0), p.name)
      FROM public.halaqa_students s
      LEFT JOIN public.profiles p ON p.id = s.student_id
      LEFT JOIN LATERAL (
        SELECT count(*) n,
               count(*) FILTER (WHERE COALESCE((c.snapshot->>'override')::boolean, false)
                                OR COALESCE(c.snapshot #> '{approval,reasons}', '[]'::jsonb) ? 'override') manual,
               max(c.issue_date) last,
               jsonb_agg(jsonb_build_object('type_key', c.type_key, 'ref', c.snapshot -> 'achievement_ref',
                                            'issue_date', c.issue_date) ORDER BY c.issue_date DESC) items
          FROM public.certificates c
         WHERE c.source = 'studio' AND c.student_id = s.student_id AND c.status IN ('issued', 'archived')
           AND c.issue_date BETWEEN _from AND t
           AND (c.center_id = h.center_id OR c.halaqa_id = h.id)
      ) x ON true
     WHERE s.halaqa_id = h.id), '[]'::jsonb));
END;
$$;
REVOKE ALL ON FUNCTION public.cert_honor(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cert_honor(uuid, date, date) TO authenticated, service_role;
COMMENT ON FUNCTION public.cert_honor(uuid, date, date) IS
  'لوحة التكريم والإنصاف (1.26.0): لكل طالب في الحلقة شهاداته الصادرة في الفترة، واليدوية منها، وأنواعها ومراجعها.';
