-- ════════════════════════════════════════════════════════════════════════════
-- استوديو الشهائد (1.17.0) — 1/2: البنية والقوالب والأصول والهوية والأنواع — docs/CERTIFICATES.md
-- ════════════════════════════════════════════════════════════════════════════
-- امتداد لنظام الشهادات القائم (المرحلة 12 و10.2) لا نظام موازٍ:
--   • public.certificates نفسه يحمل شهادات الاستوديو (source = 'studio') بجانب شهادات الجزء التلقائية
--     (source = 'auto' كما هي: award_badges ← decide_certificate). رمز التحقق verify_code ومحدّد المعدّل كما هما.
--   • البيانات من مصدرها: اسم الطالب والحلقة والمركز والمعلّم تكتبها الدالة من profiles/halaqat/centers وقت
--     الإصدار (لقطة ثابتة)، والإنجاز يأتي من محرّك سجل الإنجاز (src/lib/reports) كما يراه المعلّم.
--   • التصميم المستخدم يُجمَّد في certificate_designs (نسخة لا تتغيّر، بلا تكرار بالبصمة)، فتعديل القالب لاحقاً
--     لا يمسّ شهادة صادرة. والشهادة الصادرة لا تُعدَّل: الإلغاء حالة (revoked) بسبب وفاعل ووقت، والتصحيح شهادة جديدة.
--   • كل الكتابة عبر دوال SECURITY DEFINER؛ الجداول الجديدة بلا سياسات للعميل (القاعدة 11 و14).
-- الصلاحيات من الدوال القائمة: private.manages_halaqa (معلّم الحلقة أو منشئ مركزها) للإصدار، وpublic.manages_center
-- (المنشئ أو المدير) لإدارة القوالب والهوية والإلغاء، وprivate.can_view_center للقراءة. المشرف يصدر لحلقات مركزه (private.cert_can_issue) ويبقى قارئاً فيما سواها.
-- التراجع: انظر آخر الملف الثاني (20261206110000_certificate_issue.sql).

-- ─────────── 1) امتداد جدول الشهادات ───────────
ALTER TABLE public.certificates ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'auto';
ALTER TABLE public.certificates DROP CONSTRAINT IF EXISTS certificates_source_check;
ALTER TABLE public.certificates ADD CONSTRAINT certificates_source_check CHECK (source IN ('auto', 'studio'));

ALTER TABLE public.certificates ALTER COLUMN juz DROP NOT NULL;
ALTER TABLE public.certificates DROP CONSTRAINT IF EXISTS certificates_auto_juz;
-- الجزء لشهادة الطلب التلقائي وحدها؛ شهادة الاستوديو juz فيها NULL (والجزء في لقطتها)، فيبقى القيد الأصلي
-- UNIQUE (student_id, juz) كما هو (NULL لا يتصادم) ويستمر ON CONFLICT (student_id, juz) القائم.
ALTER TABLE public.certificates ADD CONSTRAINT certificates_auto_juz CHECK (
  (source = 'auto' AND juz IS NOT NULL) OR (source = 'studio' AND juz IS NULL));

ALTER TABLE public.certificates DROP CONSTRAINT IF EXISTS certificates_status_check;
ALTER TABLE public.certificates ADD CONSTRAINT certificates_status_check CHECK (
  (source = 'auto' AND status IN ('pending', 'approved', 'rejected'))
  OR (source = 'studio' AND status IN ('draft', 'ready', 'issued', 'revoked', 'archived')));

CREATE SEQUENCE IF NOT EXISTS public.certificate_number_seq;
REVOKE ALL ON SEQUENCE public.certificate_number_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.certificate_number_seq TO service_role;

ALTER TABLE public.certificates
  ADD COLUMN IF NOT EXISTS certificate_number text,
  ADD COLUMN IF NOT EXISTS type_key text,
  ADD COLUMN IF NOT EXISTS template_id uuid,
  ADD COLUMN IF NOT EXISTS system_template text,
  ADD COLUMN IF NOT EXISTS design_id uuid,
  ADD COLUMN IF NOT EXISTS center_id uuid REFERENCES public.centers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS halaqa_id uuid REFERENCES public.halaqat(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS teacher_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS issue_date date,
  ADD COLUMN IF NOT EXISTS period_from date,
  ADD COLUMN IF NOT EXISTS period_to date,
  ADD COLUMN IF NOT EXISTS snapshot jsonb,
  ADD COLUMN IF NOT EXISTS batch_id uuid,
  ADD COLUMN IF NOT EXISTS replaces_id uuid REFERENCES public.certificates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS issued_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS issued_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoke_reason text,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS certificates_number_key ON public.certificates (certificate_number);
ALTER TABLE public.certificates DROP CONSTRAINT IF EXISTS certificates_number_format;
ALTER TABLE public.certificates ADD CONSTRAINT certificates_number_format
  CHECK (certificate_number IS NULL OR certificate_number ~ '^ZEN-[0-9]{4}-[0-9]{6,}$');
ALTER TABLE public.certificates DROP CONSTRAINT IF EXISTS certificates_studio_issued;
ALTER TABLE public.certificates ADD CONSTRAINT certificates_studio_issued CHECK (
  source = 'auto' OR status IN ('draft', 'ready')
  OR (certificate_number IS NOT NULL AND issued_at IS NOT NULL AND design_id IS NOT NULL AND snapshot IS NOT NULL));
ALTER TABLE public.certificates DROP CONSTRAINT IF EXISTS certificates_revoked_fields;
ALTER TABLE public.certificates ADD CONSTRAINT certificates_revoked_fields CHECK (
  status <> 'revoked' OR (revoked_at IS NOT NULL AND char_length(btrim(COALESCE(revoke_reason, ''))) BETWEEN 3 AND 300));
ALTER TABLE public.certificates DROP CONSTRAINT IF EXISTS certificates_snapshot_size;
ALTER TABLE public.certificates ADD CONSTRAINT certificates_snapshot_size CHECK (
  snapshot IS NULL OR (jsonb_typeof(snapshot) = 'object' AND pg_column_size(snapshot) <= 60000));

CREATE INDEX IF NOT EXISTS certificates_center_idx ON public.certificates (center_id, created_at DESC);
CREATE INDEX IF NOT EXISTS certificates_halaqa_idx ON public.certificates (halaqa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS certificates_teacher_idx ON public.certificates (teacher_id);
CREATE INDEX IF NOT EXISTS certificates_batch_idx ON public.certificates (batch_id);
CREATE INDEX IF NOT EXISTS certificates_replaces_idx ON public.certificates (replaces_id);
CREATE INDEX IF NOT EXISTS certificates_created_by_idx ON public.certificates (created_by);
CREATE INDEX IF NOT EXISTS certificates_issued_by_idx ON public.certificates (issued_by);
CREATE INDEX IF NOT EXISTS certificates_revoked_by_idx ON public.certificates (revoked_by);
CREATE INDEX IF NOT EXISTS certificates_decided_by_idx ON public.certificates (decided_by);
CREATE INDEX IF NOT EXISTS certificates_template_idx ON public.certificates (template_id);
CREATE INDEX IF NOT EXISTS certificates_design_idx ON public.certificates (design_id);
CREATE INDEX IF NOT EXISTS certificates_student_created_idx ON public.certificates (student_id, created_at DESC);

-- القراءة المباشرة كما كانت (الطالب ومعلّمه ووليّه)، لكن مسودات الاستوديو لا تظهر للطالب ووليّه.
DROP POLICY IF EXISTS "certificates read" ON public.certificates;
CREATE POLICY "certificates read" ON public.certificates FOR SELECT TO authenticated
  USING (private.teaches_student((SELECT auth.uid()), student_id)
         OR ((student_id = (SELECT auth.uid()) OR private.is_guardian_of((SELECT auth.uid()), student_id))
             AND (source = 'auto' OR status IN ('issued', 'revoked', 'archived'))));

-- الشهادة الصادرة لقطة ثابتة: لا يتغيّر فيها إلا الانتقال إلى «ملغاة» أو «مؤرشفة» بحقولهما.
CREATE OR REPLACE FUNCTION public.certificates_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  moving constant text[] := ARRAY['status', 'revoked_by', 'revoked_at', 'revoke_reason', 'archived_at', 'updated_at'];
BEGIN
  NEW.updated_at := now();
  IF OLD.source <> 'studio' THEN
    IF NEW.source <> OLD.source THEN RAISE EXCEPTION 'CERTIFICATE_IMMUTABLE'; END IF;
    RETURN NEW;
  END IF;
  IF OLD.status NOT IN ('issued', 'revoked', 'archived') THEN RETURN NEW; END IF;
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
     OR NEW.revoke_reason IS DISTINCT FROM OLD.revoke_reason OR NEW.revoked_by IS DISTINCT FROM OLD.revoked_by) THEN
    RAISE EXCEPTION 'CERTIFICATE_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.certificates_guard() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS certificates_guard ON public.certificates;
CREATE TRIGGER certificates_guard BEFORE UPDATE ON public.certificates
  FOR EACH ROW EXECUTE FUNCTION public.certificates_guard();

-- ─────────── 2) أنواع الشهادات (قابلة للتوسعة: أنواع النظام + أنواع المركز) ───────────
CREATE TABLE IF NOT EXISTS public.certificate_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL CHECK (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  center_id uuid REFERENCES public.centers(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 60),
  category text NOT NULL CHECK (category IN ('memorization', 'completion', 'attendance', 'achievement',
                                             'excellence', 'participation', 'thanks', 'revision', 'special')),
  text_kind text NOT NULL DEFAULT 'achievement' CHECK (text_kind IN ('memorization', 'completion', 'attendance',
                                             'achievement', 'excellence', 'participation', 'thanks', 'revision', 'special')),
  param text CHECK (param IS NULL OR param IN ('surah', 'juz', 'course', 'milestone')),
  conditions jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(conditions) = 'array' AND pg_column_size(conditions) <= 4000),
  texts jsonb CHECK (texts IS NULL OR (jsonb_typeof(texts) = 'object' AND pg_column_size(texts) <= 4000)),
  sort smallint NOT NULL DEFAULT 100,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS certificate_types_system_key ON public.certificate_types (key) WHERE center_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS certificate_types_center_key ON public.certificate_types (center_id, key) WHERE center_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS certificate_types_created_by_idx ON public.certificate_types (created_by);
ALTER TABLE public.certificate_types ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.certificate_types FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.certificate_types TO service_role;

-- أنواع النظام الأربعة عشر. الشروط تُقيَّم في محرّك سجل الإنجاز على الجهاز (src/lib/certificates/eligibility.ts)
-- بالأرقام نفسها التي يعرضها السجل والتقارير؛ النوع بلا شروط يصدره المخوَّل يدوياً.
INSERT INTO public.certificate_types (key, name, category, text_kind, param, conditions, sort) VALUES
  ('memorization',   'شهادة حفظ',                 'memorization',  'memorization',  NULL,  '[{"kind":"memorizedPages","gte":1}]', 10),
  ('surah_complete', 'شهادة إتمام سورة',          'completion',    'completion',    'surah', '[{"kind":"surahComplete"}]', 20),
  ('juz_complete',   'شهادة إتمام جزء',           'completion',    'completion',    'juz',   '[{"kind":"juzComplete"}]', 30),
  ('course_complete','شهادة إتمام مقرر',          'completion',    'completion',    'course', '[]', 40),
  ('achievement',    'شهادة إنجاز',               'achievement',   'achievement',   'milestone', '[]', 50),
  ('distinction',    'شهادة تميز',                'excellence',    'excellence',    NULL,  '[{"kind":"evaluationAverage","gte":4.5},{"kind":"attendanceRate","gte":90}]', 60),
  ('excellence',     'شهادة تفوق',                'excellence',    'excellence',    NULL,  '[{"kind":"gradeAverage","gte":4.5}]', 70),
  ('perseverance',   'شهادة مواظبة',              'attendance',    'attendance',    NULL,  '[{"kind":"attendanceRate","gte":95,"minDays":10}]', 80),
  ('attendance',     'شهادة حضور',                'attendance',    'attendance',    NULL,  '[{"kind":"attendedDays","gte":1}]', 90),
  ('participation',  'شهادة مشاركة',              'participation', 'participation', NULL,  '[]', 100),
  ('appreciation',   'شهادة شكر وتقدير',          'thanks',        'thanks',        NULL,  '[]', 110),
  ('quran_complete', 'شهادة إتمام القرآن الكريم', 'completion',    'completion',    NULL,  '[{"kind":"khatm"}]', 120),
  ('revision',       'شهادة مراجعة',              'revision',      'revision',      NULL,  '[{"kind":"reviewPages","gte":20}]', 130),
  ('special',        'شهادة خاصة',                'special',       'special',       NULL,  '[]', 140)
ON CONFLICT DO NOTHING;

-- ─────────── 3) أصول الهوية (شعارات وأختام وتواقيع وخلفيات وزخارف) ───────────
-- الأصل لا يتغيّر بعد رفعه (الشهادات القديمة ترسمه كما كان)، ويُؤرشف بدل الحذف. لا تكرار: بصمة لكل مركز.
CREATE TABLE IF NOT EXISTS public.certificate_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id uuid NOT NULL REFERENCES public.centers(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('logo', 'logo_white', 'stamp', 'signature', 'background', 'decoration', 'image')),
  label text CHECK (label IS NULL OR char_length(label) <= 80),
  signer_name text CHECK (signer_name IS NULL OR char_length(signer_name) <= 80),
  signer_title text CHECK (signer_title IS NULL OR char_length(signer_title) <= 80),
  mime text NOT NULL CHECK (mime IN ('image/png', 'image/jpeg', 'image/webp', 'image/svg+xml')),
  data_url text NOT NULL CHECK (char_length(data_url) <= 1400000),
  width int CHECK (width IS NULL OR width BETWEEN 1 AND 6000),
  height int CHECK (height IS NULL OR height BETWEEN 1 AND 6000),
  hash text NOT NULL,
  archived boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT certificate_assets_data_mime CHECK (left(data_url, char_length(mime) + 13) = 'data:' || mime || ';base64,')
);
CREATE UNIQUE INDEX IF NOT EXISTS certificate_assets_center_hash ON public.certificate_assets (center_id, hash);
CREATE INDEX IF NOT EXISTS certificate_assets_created_by_idx ON public.certificate_assets (created_by);
ALTER TABLE public.certificate_assets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.certificate_assets FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.certificate_assets TO service_role;

-- ─────────── 4) القوالب ونسخ التصميم المجمَّدة ───────────
CREATE TABLE IF NOT EXISTS public.certificate_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id uuid NOT NULL REFERENCES public.centers(id) ON DELETE CASCADE,
  halaqa_id uuid REFERENCES public.halaqat(id) ON DELETE CASCADE,
  type_key text CHECK (type_key IS NULL OR type_key ~ '^[a-z][a-z0-9_]{1,40}$'),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 80),
  description text CHECK (description IS NULL OR char_length(description) <= 300),
  categories text[] NOT NULL DEFAULT '{}' CHECK (cardinality(categories) <= 6),
  design jsonb NOT NULL CHECK (jsonb_typeof(design) = 'object' AND pg_column_size(design) <= 300000),
  based_on text CHECK (based_on IS NULL OR char_length(based_on) <= 80),
  version int NOT NULL DEFAULT 0,
  current_design_id uuid,
  archived boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS certificate_templates_center_idx ON public.certificate_templates (center_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS certificate_templates_halaqa_idx ON public.certificate_templates (halaqa_id);
CREATE INDEX IF NOT EXISTS certificate_templates_created_by_idx ON public.certificate_templates (created_by);
CREATE INDEX IF NOT EXISTS certificate_templates_updated_by_idx ON public.certificate_templates (updated_by);
ALTER TABLE public.certificate_templates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.certificate_templates FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.certificate_templates TO service_role;

CREATE TABLE IF NOT EXISTS public.certificate_designs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id uuid NOT NULL REFERENCES public.centers(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.certificate_templates(id) ON DELETE SET NULL,
  system_template text,
  version int,
  design jsonb NOT NULL CHECK (jsonb_typeof(design) = 'object' AND pg_column_size(design) <= 300000),
  hash text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS certificate_designs_center_hash ON public.certificate_designs (center_id, hash);
CREATE INDEX IF NOT EXISTS certificate_designs_template_idx ON public.certificate_designs (template_id);
CREATE INDEX IF NOT EXISTS certificate_designs_created_by_idx ON public.certificate_designs (created_by);
ALTER TABLE public.certificate_designs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.certificate_designs FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.certificate_designs TO service_role;

ALTER TABLE public.certificate_templates DROP CONSTRAINT IF EXISTS certificate_templates_current_design_fk;
ALTER TABLE public.certificate_templates ADD CONSTRAINT certificate_templates_current_design_fk
  FOREIGN KEY (current_design_id) REFERENCES public.certificate_designs(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS certificate_templates_current_design_idx ON public.certificate_templates (current_design_id);
ALTER TABLE public.certificates DROP CONSTRAINT IF EXISTS certificates_template_fk;
ALTER TABLE public.certificates ADD CONSTRAINT certificates_template_fk
  FOREIGN KEY (template_id) REFERENCES public.certificate_templates(id) ON DELETE SET NULL;
ALTER TABLE public.certificates DROP CONSTRAINT IF EXISTS certificates_design_fk;
ALTER TABLE public.certificates ADD CONSTRAINT certificates_design_fk
  FOREIGN KEY (design_id) REFERENCES public.certificate_designs(id) ON DELETE RESTRICT;

-- نسخة التصميم والأصل لا يُعدَّلان أبداً (حتى من دوال الخادم): ما صدر يُرسم كما صدر.
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
  ELSIF (to_jsonb(NEW) - 'template_id') IS DISTINCT FROM (to_jsonb(OLD) - 'template_id') THEN
    RAISE EXCEPTION 'DESIGN_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.certificate_frozen_guard() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS certificate_designs_frozen ON public.certificate_designs;
CREATE TRIGGER certificate_designs_frozen BEFORE UPDATE ON public.certificate_designs
  FOR EACH ROW EXECUTE FUNCTION public.certificate_frozen_guard();
DROP TRIGGER IF EXISTS certificate_assets_frozen ON public.certificate_assets;
CREATE TRIGGER certificate_assets_frozen BEFORE UPDATE ON public.certificate_assets
  FOR EACH ROW EXECUTE FUNCTION public.certificate_frozen_guard();

-- ─────────── 5) الهوية البصرية للمركز ───────────
-- مراجع لأصول المركز (لا صور مكرّرة) والألوان والاسم الرسمي. الألوان الافتراضية من هوية التقارير (report_identity).
ALTER TABLE public.centers ADD COLUMN IF NOT EXISTS certificate_brand jsonb;
ALTER TABLE public.centers DROP CONSTRAINT IF EXISTS centers_certificate_brand_check;
ALTER TABLE public.centers ADD CONSTRAINT centers_certificate_brand_check CHECK (
  certificate_brand IS NULL OR (jsonb_typeof(certificate_brand) = 'object' AND pg_column_size(certificate_brand) <= 20000));

-- ─────────── 6) سجل التدقيق للشهائد ───────────
CREATE TABLE IF NOT EXISTS public.certificate_audit_log (
  id bigserial PRIMARY KEY,
  center_id uuid REFERENCES public.centers(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action ~ '^[a-z_]+\.[a-z_]+$'),
  entity_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (pg_column_size(details) <= 8000),
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS certificate_audit_center_at ON public.certificate_audit_log (center_id, at DESC);
CREATE INDEX IF NOT EXISTS certificate_audit_actor_idx ON public.certificate_audit_log (actor_id);
ALTER TABLE public.certificate_audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.certificate_audit_log FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.certificate_audit_log TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.certificate_audit_log_id_seq TO service_role;

-- ─────────── 7) شروط داخلية (private، لا تُنادى من العميل) ───────────
CREATE OR REPLACE FUNCTION private.cert_audit(_center uuid, _action text, _entity uuid, _details jsonb DEFAULT '{}'::jsonb)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  INSERT INTO public.certificate_audit_log (center_id, actor_id, action, entity_id, details)
  VALUES (_center, (SELECT auth.uid()), _action, _entity, COALESCE(_details, '{}'::jsonb))
$$;

-- يصدر للحلقة: معلّمها أو منشئ مركزها (manages_halaqa) أو مدير مركزها أو مشرف مركزها.
-- المشرف التعليمي قارئ في كل ما سوى الشهائد (فحص 110، القاعدة 11)؛ والشهادة وثيقة يصدرها المركز لا كتابة على سجل
-- الطالب، فيُستثنى بها: يصدر لكل حلقات مركزه فردياً وجماعياً، ويدير قوالب الحلقة، ويلغي ويعيد إصدار ما أصدره هو.
-- ويبقى للإدارة وحدها: هوية المركز وشعاره وختمه، وقوالب المركز، وتجاوز شرط الاستحقاق، وإلغاء ما أصدره غيره.
CREATE OR REPLACE FUNCTION private.cert_can_issue(_uid uuid, _halaqa uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT _uid IS NOT NULL AND _halaqa IS NOT NULL AND (
    private.manages_halaqa(_uid, _halaqa)
    OR EXISTS (
      SELECT 1 FROM public.halaqat h
       WHERE h.id = _halaqa AND h.center_id IS NOT NULL
         AND (public.manages_center(_uid, h.center_id)
              OR EXISTS (SELECT 1 FROM public.center_staff s
                          WHERE s.center_id = h.center_id AND s.user_id = _uid AND s.role = 'supervisor'))))
$$;

-- يرى شهائد المركز وقوالبه: طاقمه (ومنه المشرف) ومنشئه، ومن يدير حلقة فيه.
CREATE OR REPLACE FUNCTION private.cert_can_view_center(_uid uuid, _center uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT _uid IS NOT NULL AND _center IS NOT NULL AND (
    private.can_view_center(_uid, _center)
    OR EXISTS (SELECT 1 FROM public.halaqat h WHERE h.center_id = _center AND private.manages_halaqa(_uid, h.id)))
$$;

-- يرى شهادة بعينها: الطالب ووليّه (الصادرة فقط)، ومعلّمه، ومن يرى مركزها أو يدير حلقتها.
CREATE OR REPLACE FUNCTION private.cert_can_view(_uid uuid, _cert uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.certificates c
     WHERE c.id = _cert AND _uid IS NOT NULL AND (
       ((c.student_id = _uid OR private.is_guardian_of(_uid, c.student_id))
         AND (c.source = 'auto' OR c.status IN ('issued', 'revoked', 'archived')))
       OR private.teaches_student(_uid, c.student_id)
       OR (c.center_id IS NOT NULL AND private.can_view_center(_uid, c.center_id))
       OR (c.halaqa_id IS NOT NULL AND private.cert_can_issue(_uid, c.halaqa_id))))
$$;

REVOKE ALL ON FUNCTION private.cert_audit(uuid, text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
COMMENT ON COLUMN public.center_staff.role IS
  'manager: يرى اللوحة ويدير المواعيد والغرف والشهائد. supervisor: مشرف تعليمي للقراءة فقط (لوحة المركز ومؤشراته وتقارير الطلاب، فحص 110)، إلا الشهائد: يصدرها لحلقات مركزه (private.cert_can_issue، فحص 150).';
REVOKE ALL ON FUNCTION private.cert_can_issue(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.cert_can_view_center(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.cert_can_view(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.cert_can_issue(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION private.cert_can_view_center(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION private.cert_can_view(uuid, uuid) TO service_role;

-- ─────────── 8) سياق الاستوديو: المراكز والحلقات والأنواع وصلاحيات المستخدم ───────────
CREATE OR REPLACE FUNCTION public.cert_studio_context()
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
  RETURN jsonb_build_object(
    'centers', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'name', c.name, 'can_manage', public.manages_center(me, c.id),
        'can_view', private.can_view_center(me, c.id)) ORDER BY c.name)
      FROM public.centers c WHERE private.cert_can_view_center(me, c.id)), '[]'::jsonb),
    'halaqat', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', h.id, 'name', h.name, 'center_id', h.center_id, 'teacher_id', h.teacher_id,
        'teacher_name', (SELECT p.name FROM public.profiles p WHERE p.id = h.teacher_id),
        'can_issue', private.cert_can_issue(me, h.id),
        'students', (SELECT count(*) FROM public.halaqa_students hs WHERE hs.halaqa_id = h.id)) ORDER BY h.name)
      FROM public.halaqat h WHERE private.cert_can_view_center(me, h.center_id)
        AND (private.can_view_center(me, h.center_id) OR private.cert_can_issue(me, h.id))), '[]'::jsonb),
    'types', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', t.id, 'key', t.key, 'center_id', t.center_id, 'name', t.name, 'category', t.category,
        'text_kind', t.text_kind, 'param', t.param, 'conditions', t.conditions, 'texts', t.texts,
        'sort', t.sort, 'active', t.active) ORDER BY t.sort, t.name)
      FROM public.certificate_types t
     WHERE t.center_id IS NULL OR private.cert_can_view_center(me, t.center_id)), '[]'::jsonb));
END;
$$;

-- ─────────── 9) الأنواع الخاصة بالمركز ───────────
CREATE OR REPLACE FUNCTION public.cert_save_type(_center uuid, _type jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := (SELECT auth.uid());
  tid uuid;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT public.manages_center(me, _center) THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  IF _type IS NULL OR jsonb_typeof(_type) <> 'object' THEN RAISE EXCEPTION 'INVALID_PAYLOAD'; END IF;
  INSERT INTO public.certificate_types (key, center_id, name, category, text_kind, param, conditions, texts, sort, active, created_by)
  VALUES (_type->>'key', _center, btrim(_type->>'name'), _type->>'category',
          COALESCE(_type->>'text_kind', _type->>'category'), NULLIF(_type->>'param', ''),
          COALESCE(_type->'conditions', '[]'::jsonb), _type->'texts', COALESCE((_type->>'sort')::smallint, 200),
          COALESCE((_type->>'active')::boolean, true), me)
  ON CONFLICT (center_id, key) WHERE center_id IS NOT NULL DO UPDATE
     SET name = EXCLUDED.name, category = EXCLUDED.category, text_kind = EXCLUDED.text_kind,
         param = EXCLUDED.param, conditions = EXCLUDED.conditions, texts = EXCLUDED.texts,
         sort = EXCLUDED.sort, active = EXCLUDED.active
  RETURNING id INTO tid;
  PERFORM private.cert_audit(_center, 'type.save', tid, jsonb_build_object('key', _type->>'key'));
  RETURN tid;
END;
$$;

-- ─────────── 10) الأصول ───────────
CREATE OR REPLACE FUNCTION public.cert_assets(_center uuid, _ids uuid[] DEFAULT NULL)
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
  IF NOT private.cert_can_view_center(me, _center) THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  -- بلا معرّفات: القائمة دون البيانات (خفيفة). بمعرّفات: البيانات للرسم (حتى 40 أصلاً في النداء).
  IF _ids IS NULL THEN
    RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', a.id, 'kind', a.kind, 'label', a.label, 'signer_name', a.signer_name,
        'signer_title', a.signer_title, 'mime', a.mime, 'width', a.width, 'height', a.height,
        'archived', a.archived, 'created_at', a.created_at, 'mine', a.created_by = me,
        'owner', a.created_by) ORDER BY a.created_at DESC)
      FROM public.certificate_assets a WHERE a.center_id = _center), '[]'::jsonb);
  END IF;
  IF cardinality(_ids) > 40 THEN RAISE EXCEPTION 'TOO_MANY'; END IF;
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', a.id, 'kind', a.kind, 'mime', a.mime, 'data_url', a.data_url,
      'width', a.width, 'height', a.height, 'signer_name', a.signer_name, 'signer_title', a.signer_title))
    FROM public.certificate_assets a WHERE a.center_id = _center AND a.id = ANY (_ids)), '[]'::jsonb);
END;
$$;

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
    IF svg ~* '<\s*script|<\s*foreignObject|javascript:|\son[a-z]+\s*=|(href|src)\s*=\s*["'']?\s*(https?:|//)|<!ENTITY|<\s*iframe|<\s*use[^>]+href\s*=\s*["'']?[^#"'']' THEN
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

CREATE OR REPLACE FUNCTION public.cert_archive_asset(_id uuid, _archived boolean DEFAULT true)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := (SELECT auth.uid());
  a public.certificate_assets;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  SELECT * INTO a FROM public.certificate_assets WHERE id = _id;
  IF a.id IS NULL OR NOT (public.manages_center(me, a.center_id) OR a.created_by = me) THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;
  UPDATE public.certificate_assets SET archived = COALESCE(_archived, true) WHERE id = _id;
  PERFORM private.cert_audit(a.center_id, 'asset.archive', _id, jsonb_build_object('kind', a.kind, 'archived', _archived));
END;
$$;

-- ─────────── 11) الهوية ───────────
CREATE OR REPLACE FUNCTION public.cert_brand(_center uuid)
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
  IF NOT private.cert_can_view_center(me, _center) THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  RETURN (SELECT jsonb_build_object(
    'center', jsonb_build_object('id', c.id, 'name', c.name, 'city', c.city),
    'brand', c.certificate_brand,
    'report_colors', c.report_identity -> 'colors',
    'can_edit', public.manages_center(me, c.id))
    FROM public.centers c WHERE c.id = _center);
END;
$$;

CREATE OR REPLACE FUNCTION public.cert_save_brand(_center uuid, _brand jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := (SELECT auth.uid());
  old jsonb;
  ref text;
  changed text[];
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT public.manages_center(me, _center) THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  IF _brand IS NOT NULL AND (jsonb_typeof(_brand) <> 'object' OR pg_column_size(_brand) > 20000) THEN
    RAISE EXCEPTION 'INVALID_PAYLOAD';
  END IF;
  -- كل أصل مُشار إليه من أصول المركز نفسه.
  FOR ref IN SELECT (regexp_matches(COALESCE(_brand::text, ''), '"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"', 'g'))[1]
  LOOP
    IF NOT EXISTS (SELECT 1 FROM public.certificate_assets a WHERE a.id = ref::uuid AND a.center_id = _center) THEN
      RAISE EXCEPTION 'FOREIGN_ASSET';
    END IF;
  END LOOP;
  SELECT certificate_brand INTO old FROM public.centers WHERE id = _center;
  SELECT array_agg(k) INTO changed FROM (
    SELECT k FROM jsonb_object_keys(COALESCE(_brand, '{}'::jsonb) || COALESCE(old, '{}'::jsonb)) k
     WHERE (COALESCE(_brand, '{}'::jsonb) -> k) IS DISTINCT FROM (COALESCE(old, '{}'::jsonb) -> k)) x;
  UPDATE public.centers SET certificate_brand = _brand, updated_at = now() WHERE id = _center;
  PERFORM private.cert_audit(_center, 'brand.update', _center, jsonb_build_object('changed', COALESCE(changed, '{}')));
END;
$$;

-- ─────────── 12) القوالب ───────────
CREATE OR REPLACE FUNCTION public.cert_templates(_center uuid)
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
  IF NOT private.cert_can_view_center(me, _center) THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', t.id, 'center_id', t.center_id, 'halaqa_id', t.halaqa_id, 'type_key', t.type_key,
      'name', t.name, 'description', t.description, 'categories', to_jsonb(t.categories),
      'design', t.design, 'based_on', t.based_on, 'version', t.version, 'current_design_id', t.current_design_id,
      'archived', t.archived, 'updated_at', t.updated_at,
      'used', (SELECT count(*) FROM public.certificates c WHERE c.template_id = t.id AND c.status IN ('issued', 'revoked', 'archived')),
      'can_edit', CASE WHEN t.halaqa_id IS NULL THEN public.manages_center(me, t.center_id)
                       ELSE private.cert_can_issue(me, t.halaqa_id) END)
      ORDER BY t.archived, t.updated_at DESC)
    FROM public.certificate_templates t WHERE t.center_id = _center), '[]'::jsonb);
END;
$$;

-- يحفظ القالب: _publish=false مسودة (حفظ تلقائي)، وtrue نسخة جديدة مجمَّدة يصدر بها ما بعدها.
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
  IF tid IS NOT NULL THEN
    SELECT * INTO t FROM public.certificate_templates WHERE id = tid FOR UPDATE;
    IF t.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
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

-- نسخ قالب (إلى نطاق المركز أو إلى حلقة يصدر فيها المستدعي) أو أرشفته واستعادته. الأصل لا يتأثر بالنسخ.
CREATE OR REPLACE FUNCTION public.cert_template_action(_id uuid, _action text, _halaqa uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := (SELECT auth.uid());
  t public.certificate_templates;
  target uuid;
  nid uuid;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  SELECT * INTO t FROM public.certificate_templates WHERE id = _id;
  IF t.id IS NULL OR NOT private.cert_can_view_center(me, t.center_id) THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF _action = 'duplicate' THEN
    target := COALESCE(_halaqa, t.halaqa_id);
    IF target IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.halaqat h WHERE h.id = target AND h.center_id = t.center_id) THEN
      RAISE EXCEPTION 'NOT_ALLOWED';
    END IF;
    IF NOT (CASE WHEN target IS NULL THEN public.manages_center(me, t.center_id) ELSE private.cert_can_issue(me, target) END) THEN
      RAISE EXCEPTION 'NOT_ALLOWED';
    END IF;
    INSERT INTO public.certificate_templates (center_id, halaqa_id, type_key, name, description, categories, design,
                                              based_on, created_by, updated_by)
    VALUES (t.center_id, target, t.type_key, left(t.name || ' (نسخة)', 80), t.description, t.categories, t.design,
            t.id::text, me, me)
    RETURNING id INTO nid;
    PERFORM private.cert_audit(t.center_id, 'template.copy', nid, jsonb_build_object('from', t.id));
    RETURN nid;
  END IF;
  IF NOT (CASE WHEN t.halaqa_id IS NULL THEN public.manages_center(me, t.center_id) ELSE private.cert_can_issue(me, t.halaqa_id) END) THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;
  IF _action NOT IN ('archive', 'restore') THEN RAISE EXCEPTION 'INVALID_ACTION'; END IF;
  UPDATE public.certificate_templates SET archived = (_action = 'archive'), updated_by = me, updated_at = now() WHERE id = _id;
  PERFORM private.cert_audit(t.center_id, 'template.' || _action, _id, '{}'::jsonb);
  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.cert_studio_context() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cert_save_type(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cert_assets(uuid, uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cert_save_asset(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cert_archive_asset(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cert_brand(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cert_save_brand(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cert_templates(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cert_save_template(jsonb, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cert_template_action(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cert_studio_context() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cert_save_type(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cert_assets(uuid, uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cert_save_asset(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cert_archive_asset(uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cert_brand(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cert_save_brand(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cert_templates(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cert_save_template(jsonb, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cert_template_action(uuid, text, uuid) TO authenticated, service_role;
