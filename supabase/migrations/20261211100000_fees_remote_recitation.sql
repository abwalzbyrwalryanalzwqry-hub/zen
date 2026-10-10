-- الإصدار 1.21.0 (المرحلة 5 من خطة التطوير): دفتر الرسوم بلا دفع داخل التطبيق، وتأكيد الدفع بالإيصال،
-- والتسميع غير المتزامن عن بُعد. (5.4 الربط المباشر بالمحافظ والبث الحيّ خارج النطاق: يحتاج عقداً/API رسمياً
-- ومراجعة سياسة العائلات — docs/decisions/0005-phase5-scope.md.)
--
-- 1) دفتر الرسوم: fee_charges (مستحقات على الطالب) وfee_payments (مدفوعات يسجّلها المدير أو تنشأ من إيصال
--    مؤكَّد). الرصيد = المستحق غير الملغى − المدفوع غير الملغى. الوحدة معطّلة لكل مركز حتى يفعّلها مديره
--    (centers.fees_enabled). الكتابة والقراءة الكاملة لمنشئ المركز ومديره فقط (manages_center)؛ المشرف لا يرى
--    المال. وليّ الأمر والطالب يقرآن كشف الطالب وحده (student_fee_statement). التذكير: مهمة يومية لمستحق حلّ
--    موعده أو تأخّر 7 أيام ولم يُسدَّد، مرة واحدة لكل مرحلة (fee_reminders_sent).
-- 2) الإيصالات: fee_receipts يرسلها وليّ الأمر أو الطالب (مرجع التحويل وصورة اختيارية في الحاوية الخاصة
--    fee-receipts، المسار {center}/{submitter}/{ملف})، ويؤكدها المدير فتنشأ دفعة، أو يرفضها بسبب.
-- 3) التسميع عن بُعد: remote_recitations يكلّف بها المعلّم طلاب حلقته بمقطع (سورة ومن آية إلى آية)، ويرفع الطالب
--    تسجيله كاملاً (حاوية recitations القائمة، المسار {student}/remote/…)، ويعلّم المعلّم الأخطاء على شبكة
--    الآيات فتدخل سجل اليوم للحلقة: جلسة تسميع وتقييم بأخطاء لكل آية (recitation_assessments.errors)، بالمسار
--    نفسه الذي يكتب به السجل اليومي (جدولة المراجعة وسجل التعديلات).
--
-- التراجع:
--   SELECT cron.unschedule('zen-fee-reminders');
--   DROP FUNCTION public.set_center_fees_enabled(uuid, boolean), public.fee_add_charges(uuid, uuid[], text, numeric, date, text),
--     public.fee_cancel_charge(uuid), public.fee_record_payment(uuid, uuid, numeric, text, text, text, date),
--     public.fee_void_payment(uuid), public.center_fee_overview(uuid), public.student_fee_statement(uuid),
--     public.fee_submit_receipt(uuid, uuid, numeric, text, text, text), public.fee_decide_receipt(uuid, boolean, text),
--     public.center_fee_receipts(uuid, text), public.my_fee_centers(), public.send_fee_reminders(),
--     public.remote_assign(uuid, uuid[], text, text, integer, integer, text, date), public.remote_submit(uuid, text, integer),
--     public.remote_review(uuid, integer, jsonb, text), public.remote_cancel(uuid), public.my_remote_recitations(),
--     public.teacher_remote_queue(), private.fee_student_in_center(uuid, uuid), private.can_read_fee_receipt(uuid, text),
--     private.fee_can_submit(uuid, uuid, uuid);
--   DROP TABLE public.remote_recitations, public.fee_receipts, public.fee_reminders_sent, public.fee_payments, public.fee_charges;
--   DELETE FROM storage.buckets WHERE id = 'fee-receipts';  ALTER TABLE public.centers DROP COLUMN fees_enabled;
-- الفحص: supabase/tests/checks.sql (160–162).

ALTER TABLE public.centers ADD COLUMN IF NOT EXISTS fees_enabled boolean NOT NULL DEFAULT false;

-- ─────────── 1. الجداول ───────────

CREATE TABLE IF NOT EXISTS public.fee_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id uuid NOT NULL REFERENCES public.centers(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  amount numeric(12, 2) NOT NULL CHECK (amount > 0 AND amount <= 100000000),
  currency text NOT NULL DEFAULT 'YER' CHECK (currency ~ '^[A-Z]{3}$'),
  due_date date NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  cancelled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS fee_charges_center_student_idx ON public.fee_charges (center_id, student_id);
CREATE INDEX IF NOT EXISTS fee_charges_due_idx ON public.fee_charges (due_date) WHERE cancelled_at IS NULL;

CREATE TABLE IF NOT EXISTS public.fee_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id uuid NOT NULL REFERENCES public.centers(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric(12, 2) NOT NULL CHECK (amount > 0 AND amount <= 100000000),
  currency text NOT NULL DEFAULT 'YER' CHECK (currency ~ '^[A-Z]{3}$'),
  method text NOT NULL DEFAULT 'cash' CHECK (method IN ('cash', 'transfer', 'other')),
  reference text CHECK (reference IS NULL OR char_length(reference) <= 120),
  note text CHECK (note IS NULL OR char_length(note) <= 500),
  paid_on date NOT NULL DEFAULT public.zen_today(),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'receipt')),
  receipt_id uuid,
  recorded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz,
  voided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS fee_payments_center_student_idx ON public.fee_payments (center_id, student_id);

CREATE TABLE IF NOT EXISTS public.fee_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id uuid NOT NULL REFERENCES public.centers(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  submitted_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric(12, 2) NOT NULL CHECK (amount > 0 AND amount <= 100000000),
  currency text NOT NULL DEFAULT 'YER' CHECK (currency ~ '^[A-Z]{3}$'),
  reference text CHECK (reference IS NULL OR char_length(reference) <= 120),
  image_path text,
  note text CHECK (note IS NULL OR char_length(note) <= 500),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected')),
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_note text CHECK (decision_note IS NULL OR char_length(decision_note) <= 500),
  payment_id uuid REFERENCES public.fee_payments(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fee_receipt_has_proof CHECK (reference IS NOT NULL OR image_path IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS fee_receipts_center_status_idx ON public.fee_receipts (center_id, status, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS fee_receipts_image_key ON public.fee_receipts (image_path) WHERE image_path IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.fee_reminders_sent (
  charge_id uuid NOT NULL REFERENCES public.fee_charges(id) ON DELETE CASCADE,
  stage text NOT NULL CHECK (stage IN ('due', 'overdue')),
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (charge_id, stage)
);

CREATE TABLE IF NOT EXISTS public.remote_recitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  halaqa_id uuid NOT NULL REFERENCES public.halaqat(id) ON DELETE CASCADE,
  teacher_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'review' CHECK (kind IN ('memorize', 'review')),
  surah_name text NOT NULL,
  from_ayah integer NOT NULL CHECK (from_ayah >= 1),
  to_ayah integer NOT NULL,
  instructions text CHECK (instructions IS NULL OR char_length(instructions) <= 500),
  due_date date,
  status text NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'submitted', 'reviewed', 'cancelled')),
  audio_path text,
  duration_seconds integer CHECK (duration_seconds IS NULL OR duration_seconds BETWEEN 1 AND 3600),
  submitted_at timestamptz,
  grade integer CHECK (grade IS NULL OR grade BETWEEN 1 AND 5),
  mistakes jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(mistakes) = 'array'),
  teacher_note text CHECK (teacher_note IS NULL OR char_length(teacher_note) <= 1000),
  reviewed_at timestamptz,
  session_id uuid REFERENCES public.recitation_sessions(id) ON DELETE SET NULL,
  record_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT remote_range CHECK (to_ayah >= from_ayah)
);
CREATE INDEX IF NOT EXISTS remote_recitations_student_idx ON public.remote_recitations (student_id, status);
CREATE INDEX IF NOT EXISTS remote_recitations_halaqa_idx ON public.remote_recitations (halaqa_id, status);

-- كل الكتابة عبر الدوال؛ للعميل لا شيء مباشرة (القراءة عبر الدوال أيضاً).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['fee_charges', 'fee_payments', 'fee_receipts', 'fee_reminders_sent', 'remote_recitations'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

-- ─────────── 2. شروط مساعدة ───────────

CREATE OR REPLACE FUNCTION private.fee_student_in_center(_student uuid, _center uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.halaqa_students hs JOIN public.halaqat h ON h.id = hs.halaqa_id
                  WHERE hs.student_id = _student AND h.center_id = _center)
$$;
REVOKE ALL ON FUNCTION private.fee_student_in_center(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.fee_student_in_center(uuid, uuid) TO authenticated, service_role;

/** يرسل إيصالاً عن الطالب: الطالب نفسه أو وليّ أمره، في مركز فعّل الرسوم ويدرس فيه الطالب. */
CREATE OR REPLACE FUNCTION private.fee_can_submit(_uid uuid, _center uuid, _student uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _uid IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.centers c WHERE c.id = _center AND c.fees_enabled)
     AND private.fee_student_in_center(_student, _center)
     AND (_uid = _student OR EXISTS (SELECT 1 FROM public.guardian_links gl
                                      WHERE gl.guardian_id = _uid AND gl.student_id = _student))
$$;
REVOKE ALL ON FUNCTION private.fee_can_submit(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.fee_can_submit(uuid, uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.can_read_fee_receipt(_uid uuid, _name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.fee_receipts r
                  WHERE r.image_path = _name
                    AND (r.submitted_by = _uid OR public.manages_center(_uid, r.center_id)))
$$;
REVOKE ALL ON FUNCTION private.can_read_fee_receipt(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_read_fee_receipt(uuid, text) TO authenticated, service_role;

-- ─────────── 3. حاوية الإيصالات ───────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('fee-receipts', 'fee-receipts', false, 3145728, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = false, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "fee receipts upload" ON storage.objects;
CREATE POLICY "fee receipts upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'fee-receipts'
    AND split_part(name, '/', 2) = (SELECT auth.uid())::text
    AND EXISTS (SELECT 1 FROM public.centers c WHERE c.id = public.storage_folder_uuid(name) AND c.fees_enabled)
  );
DROP POLICY IF EXISTS "fee receipts read" ON storage.objects;
CREATE POLICY "fee receipts read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'fee-receipts' AND (
    split_part(name, '/', 2) = (SELECT auth.uid())::text
    OR private.can_read_fee_receipt((SELECT auth.uid()), name)));
DROP POLICY IF EXISTS "fee receipts delete own" ON storage.objects;
CREATE POLICY "fee receipts delete own" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'fee-receipts' AND split_part(name, '/', 2) = (SELECT auth.uid())::text);

-- ─────────── 4. دفتر الرسوم: الإدارة ───────────

CREATE OR REPLACE FUNCTION public.set_center_fees_enabled(_center uuid, _on boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT public.manages_center(auth.uid(), _center) THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  UPDATE public.centers SET fees_enabled = COALESCE(_on, false), updated_at = now() WHERE id = _center;
END;
$$;
REVOKE ALL ON FUNCTION public.set_center_fees_enabled(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_center_fees_enabled(uuid, boolean) TO authenticated;

/** مستحق واحد لعدة طلاب دفعة واحدة (رسوم الشهر لحلقة كاملة). يعيد عدد المستحقات المنشأة. */
CREATE OR REPLACE FUNCTION public.fee_add_charges(
  _center uuid, _students uuid[], _title text, _amount numeric, _due date, _currency text DEFAULT 'YER')
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := (SELECT auth.uid());
  n integer;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT public.manages_center(caller, _center) THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.centers WHERE id = _center AND fees_enabled) THEN RAISE EXCEPTION 'FEES_DISABLED'; END IF;
  IF _students IS NULL OR cardinality(_students) = 0 OR cardinality(_students) > 2000 THEN RAISE EXCEPTION 'INVALID_STUDENTS'; END IF;
  IF nullif(trim(_title), '') IS NULL OR char_length(trim(_title)) > 120 THEN RAISE EXCEPTION 'INVALID_TITLE'; END IF;
  IF _amount IS NULL OR _amount <= 0 OR _amount > 100000000 THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;
  IF _due IS NULL THEN RAISE EXCEPTION 'INVALID_DATE'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(_students) s WHERE NOT private.fee_student_in_center(s, _center)) THEN
    RAISE EXCEPTION 'STUDENT_NOT_IN_CENTER';
  END IF;
  INSERT INTO public.fee_charges (center_id, student_id, title, amount, currency, due_date, created_by)
  SELECT DISTINCT _center, s, trim(_title), round(_amount, 2), upper(coalesce(nullif(trim(_currency), ''), 'YER')), _due, caller
    FROM unnest(_students) s;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.fee_add_charges(uuid, uuid[], text, numeric, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fee_add_charges(uuid, uuid[], text, numeric, date, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.fee_cancel_charge(_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := (SELECT auth.uid());
  c public.fee_charges;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  SELECT * INTO c FROM public.fee_charges WHERE id = _id FOR UPDATE;
  IF c.id IS NULL OR NOT public.manages_center(caller, c.center_id) THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  UPDATE public.fee_charges SET cancelled_at = coalesce(cancelled_at, now()), cancelled_by = coalesce(cancelled_by, caller)
   WHERE id = _id;
END;
$$;
REVOKE ALL ON FUNCTION public.fee_cancel_charge(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fee_cancel_charge(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.fee_record_payment(
  _center uuid, _student uuid, _amount numeric, _method text, _reference text, _note text, _paid_on date)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := (SELECT auth.uid());
  pid uuid;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT public.manages_center(caller, _center) THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.centers WHERE id = _center AND fees_enabled) THEN RAISE EXCEPTION 'FEES_DISABLED'; END IF;
  IF NOT private.fee_student_in_center(_student, _center) THEN RAISE EXCEPTION 'STUDENT_NOT_IN_CENTER'; END IF;
  IF _amount IS NULL OR _amount <= 0 OR _amount > 100000000 THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;
  IF coalesce(_method, 'cash') NOT IN ('cash', 'transfer', 'other') THEN RAISE EXCEPTION 'INVALID_METHOD'; END IF;
  IF _paid_on IS NOT NULL AND _paid_on > public.zen_today() THEN RAISE EXCEPTION 'INVALID_DATE'; END IF;
  INSERT INTO public.fee_payments (center_id, student_id, amount, currency, method, reference, note, paid_on, recorded_by)
  VALUES (_center, _student, round(_amount, 2),
          coalesce((SELECT fc.currency FROM public.fee_charges fc WHERE fc.center_id = _center AND fc.student_id = _student
                     ORDER BY fc.created_at DESC LIMIT 1), 'YER'),
          coalesce(_method, 'cash'), nullif(trim(_reference), ''), nullif(trim(_note), ''),
          coalesce(_paid_on, public.zen_today()), caller)
  RETURNING id INTO pid;
  RETURN pid;
END;
$$;
REVOKE ALL ON FUNCTION public.fee_record_payment(uuid, uuid, numeric, text, text, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fee_record_payment(uuid, uuid, numeric, text, text, text, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.fee_void_payment(_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := (SELECT auth.uid());
  p public.fee_payments;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  SELECT * INTO p FROM public.fee_payments WHERE id = _id FOR UPDATE;
  IF p.id IS NULL OR NOT public.manages_center(caller, p.center_id) THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  UPDATE public.fee_payments SET voided_at = coalesce(voided_at, now()), voided_by = coalesce(voided_by, caller) WHERE id = _id;
END;
$$;
REVOKE ALL ON FUNCTION public.fee_void_payment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fee_void_payment(uuid) TO authenticated;

/** نظرة المدير: الإجماليات ورصيد كل طالب (الأكثر مستحقاً أولاً) وعدد الإيصالات المعلّقة. */
CREATE OR REPLACE FUNCTION public.center_fee_overview(_center uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := (SELECT auth.uid());
  today date := public.zen_today();
  out jsonb;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT public.manages_center(caller, _center) THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  WITH st AS (
    SELECT DISTINCT hs.student_id FROM public.halaqa_students hs JOIN public.halaqat h ON h.id = hs.halaqa_id
     WHERE h.center_id = _center
    UNION
    SELECT student_id FROM public.fee_charges WHERE center_id = _center
  ), ch AS (
    SELECT student_id, sum(amount) AS charged,
           sum(amount) FILTER (WHERE due_date < today) AS due_past,
           max(currency) AS currency
      FROM public.fee_charges WHERE center_id = _center AND cancelled_at IS NULL GROUP BY student_id
  ), pa AS (
    SELECT student_id, sum(amount) AS paid, max(paid_on) AS last_paid
      FROM public.fee_payments WHERE center_id = _center AND voided_at IS NULL GROUP BY student_id
  ), rows AS (
    SELECT st.student_id, coalesce(p.name, '') AS name,
           (SELECT string_agg(DISTINCT h.name, '، ') FROM public.halaqa_students hs JOIN public.halaqat h ON h.id = hs.halaqa_id
             WHERE hs.student_id = st.student_id AND h.center_id = _center) AS halaqat,
           coalesce(ch.charged, 0) AS charged, coalesce(pa.paid, 0) AS paid,
           coalesce(ch.charged, 0) - coalesce(pa.paid, 0) AS balance,
           greatest(coalesce(ch.due_past, 0) - coalesce(pa.paid, 0), 0) AS overdue,
           pa.last_paid, coalesce(ch.currency, 'YER') AS currency
      FROM st LEFT JOIN ch ON ch.student_id = st.student_id LEFT JOIN pa ON pa.student_id = st.student_id
      LEFT JOIN public.profiles p ON p.id = st.student_id
  )
  SELECT jsonb_build_object(
    'center_id', _center,
    'enabled', (SELECT fees_enabled FROM public.centers WHERE id = _center),
    'totals', jsonb_build_object(
      'charged', coalesce((SELECT sum(charged) FROM rows), 0),
      'paid', coalesce((SELECT sum(paid) FROM rows), 0),
      'balance', coalesce((SELECT sum(greatest(balance, 0)) FROM rows), 0),
      'overdue', coalesce((SELECT sum(overdue) FROM rows), 0),
      'students_due', (SELECT count(*) FROM rows WHERE balance > 0),
      'pending_receipts', (SELECT count(*) FROM public.fee_receipts WHERE center_id = _center AND status = 'pending')),
    'students', coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.overdue DESC, r.balance DESC, r.name) FROM rows r), '[]'::jsonb)
  ) INTO out;
  RETURN out;
END;
$$;
REVOKE ALL ON FUNCTION public.center_fee_overview(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.center_fee_overview(uuid) TO authenticated;

/**
 * كشف حساب طالب لكل مركز فعّل الرسوم: المستحقات والمدفوعات والإيصالات والرصيد. للطالب نفسه ولوليّ أمره
 * ولمدير مركز الطالب (يرى مركزه وحده).
 */
CREATE OR REPLACE FUNCTION public.student_fee_statement(_student uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := (SELECT auth.uid());
  family boolean;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  family := caller = _student OR EXISTS (SELECT 1 FROM public.guardian_links gl
                                          WHERE gl.guardian_id = caller AND gl.student_id = _student);
  IF NOT family AND NOT EXISTS (SELECT 1 FROM public.centers c
                                 WHERE public.manages_center(caller, c.id) AND private.fee_student_in_center(_student, c.id)) THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'center_id', c.id, 'center_name', c.name,
      'charged', coalesce((SELECT sum(amount) FROM public.fee_charges WHERE center_id = c.id AND student_id = _student AND cancelled_at IS NULL), 0),
      'paid', coalesce((SELECT sum(amount) FROM public.fee_payments WHERE center_id = c.id AND student_id = _student AND voided_at IS NULL), 0),
      'currency', coalesce((SELECT max(currency) FROM public.fee_charges WHERE center_id = c.id AND student_id = _student), 'YER'),
      'charges', coalesce((SELECT jsonb_agg(jsonb_build_object('id', id, 'title', title, 'amount', amount, 'currency', currency,
                                  'due_date', due_date, 'cancelled', cancelled_at IS NOT NULL) ORDER BY due_date DESC, created_at DESC)
                             FROM public.fee_charges WHERE center_id = c.id AND student_id = _student), '[]'::jsonb),
      'payments', coalesce((SELECT jsonb_agg(jsonb_build_object('id', id, 'amount', amount, 'currency', currency, 'method', method,
                                   'reference', reference, 'paid_on', paid_on, 'source', source, 'voided', voided_at IS NOT NULL)
                                   ORDER BY paid_on DESC, created_at DESC)
                              FROM public.fee_payments WHERE center_id = c.id AND student_id = _student), '[]'::jsonb),
      'receipts', coalesce((SELECT jsonb_agg(jsonb_build_object('id', id, 'amount', amount, 'reference', reference,
                                   'status', status, 'decision_note', decision_note, 'created_at', created_at,
                                   'has_image', image_path IS NOT NULL) ORDER BY created_at DESC)
                              FROM public.fee_receipts WHERE center_id = c.id AND student_id = _student), '[]'::jsonb)
    ) ORDER BY c.name)
      FROM public.centers c
     WHERE c.fees_enabled AND private.fee_student_in_center(_student, c.id)
       AND (family OR public.manages_center(caller, c.id))
  ), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.student_fee_statement(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.student_fee_statement(uuid) TO authenticated;

-- ─────────── 5. الإيصالات ───────────

CREATE OR REPLACE FUNCTION public.fee_submit_receipt(
  _center uuid, _student uuid, _amount numeric, _reference text, _image_path text, _note text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := (SELECT auth.uid());
  rid uuid;
  sname text;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT private.fee_can_submit(caller, _center, _student) THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  IF _amount IS NULL OR _amount <= 0 OR _amount > 100000000 THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;
  IF nullif(trim(_reference), '') IS NULL AND nullif(_image_path, '') IS NULL THEN RAISE EXCEPTION 'PROOF_REQUIRED'; END IF;
  IF nullif(_image_path, '') IS NOT NULL AND (
       split_part(_image_path, '/', 1) <> _center::text OR split_part(_image_path, '/', 2) <> caller::text
       OR NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'fee-receipts' AND o.name = _image_path)) THEN
    RAISE EXCEPTION 'INVALID_IMAGE';
  END IF;
  IF (SELECT count(*) FROM public.fee_receipts WHERE submitted_by = caller AND status = 'pending') >= 10 THEN
    RAISE EXCEPTION 'TOO_MANY_PENDING';
  END IF;
  INSERT INTO public.fee_receipts (center_id, student_id, submitted_by, amount, currency, reference, image_path, note)
  VALUES (_center, _student, caller, round(_amount, 2),
          coalesce((SELECT fc.currency FROM public.fee_charges fc WHERE fc.center_id = _center AND fc.student_id = _student
                     ORDER BY fc.created_at DESC LIMIT 1), 'YER'),
          nullif(trim(_reference), ''), nullif(_image_path, ''), nullif(trim(_note), ''))
  RETURNING id INTO rid;
  SELECT coalesce(name, '') INTO sname FROM public.profiles WHERE id = _student;
  INSERT INTO public.notifications (user_id, kind, title, body, link)
  SELECT m.uid, 'fee_receipt', 'إيصال دفع بانتظار التأكيد',
         'إيصال بمبلغ ' || round(_amount, 2)::text || ' عن ' || coalesce(nullif(sname, ''), 'طالب'), '/center/' || _center || '/fees'
    FROM (SELECT c.created_by AS uid FROM public.centers c WHERE c.id = _center
          UNION SELECT cs.user_id FROM public.center_staff cs WHERE cs.center_id = _center AND cs.role = 'manager') m
   WHERE m.uid IS NOT NULL;
  RETURN rid;
END;
$$;
REVOKE ALL ON FUNCTION public.fee_submit_receipt(uuid, uuid, numeric, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fee_submit_receipt(uuid, uuid, numeric, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.fee_decide_receipt(_id uuid, _confirm boolean, _note text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := (SELECT auth.uid());
  r public.fee_receipts;
  pid uuid;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  SELECT * INTO r FROM public.fee_receipts WHERE id = _id FOR UPDATE;
  IF r.id IS NULL OR NOT public.manages_center(caller, r.center_id) THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  IF r.status <> 'pending' THEN RAISE EXCEPTION 'ALREADY_DECIDED'; END IF;
  IF NOT coalesce(_confirm, false) AND nullif(trim(_note), '') IS NULL THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
  IF _confirm THEN
    INSERT INTO public.fee_payments (center_id, student_id, amount, currency, method, reference, note, paid_on, source, receipt_id, recorded_by)
    VALUES (r.center_id, r.student_id, r.amount, r.currency, 'transfer', r.reference, nullif(trim(_note), ''),
            (r.created_at AT TIME ZONE 'Asia/Aden')::date, 'receipt', r.id, caller)
    RETURNING id INTO pid;
  END IF;
  UPDATE public.fee_receipts
     SET status = CASE WHEN _confirm THEN 'confirmed' ELSE 'rejected' END,
         decided_by = caller, decided_at = now(), decision_note = nullif(trim(_note), ''), payment_id = pid
   WHERE id = _id;
  INSERT INTO public.notifications (user_id, kind, title, body, link)
  VALUES (r.submitted_by, 'fee_receipt_decided',
          CASE WHEN _confirm THEN 'تأكّد استلام الدفعة' ELSE 'لم يُعتمد الإيصال' END,
          CASE WHEN _confirm THEN 'سُجّلت دفعة بمبلغ ' || r.amount::text || ' في كشف الحساب.'
               ELSE 'السبب: ' || trim(_note) END,
          '/fees');
  RETURN jsonb_build_object('status', CASE WHEN _confirm THEN 'confirmed' ELSE 'rejected' END, 'payment_id', pid);
END;
$$;
REVOKE ALL ON FUNCTION public.fee_decide_receipt(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fee_decide_receipt(uuid, boolean, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.center_fee_receipts(_center uuid, _status text DEFAULT 'pending')
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT public.manages_center(auth.uid(), _center) THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id', r.id, 'student_id', r.student_id, 'student_name', coalesce(ps.name, ''),
      'submitted_by_name', coalesce(pb.name, ''), 'by_guardian', r.submitted_by <> r.student_id,
      'amount', r.amount, 'currency', r.currency, 'reference', r.reference, 'image_path', r.image_path,
      'note', r.note, 'status', r.status, 'decision_note', r.decision_note, 'created_at', r.created_at)
      ORDER BY r.created_at)
      FROM (SELECT * FROM public.fee_receipts
             WHERE center_id = _center AND (_status IS NULL OR status = _status)
             ORDER BY created_at DESC LIMIT 200) r
      LEFT JOIN public.profiles ps ON ps.id = r.student_id
      LEFT JOIN public.profiles pb ON pb.id = r.submitted_by
  ), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.center_fee_receipts(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.center_fee_receipts(uuid, text) TO authenticated;

/** المراكز التي فعّلت الرسوم ويدرس فيها المستدعي أو أحد أبنائه (لصفحة العائلة). */
CREATE OR REPLACE FUNCTION public.my_fee_centers()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(jsonb_agg(DISTINCT jsonb_build_object('center_id', c.id, 'center_name', c.name, 'student_id', s.sid,
           'student_name', coalesce((SELECT p.name FROM public.profiles p WHERE p.id = s.sid), ''), 'self', s.sid = (SELECT auth.uid()))), '[]'::jsonb)
    FROM (SELECT (SELECT auth.uid()) AS sid
          UNION SELECT gl.student_id FROM public.guardian_links gl WHERE gl.guardian_id = (SELECT auth.uid())) s
    JOIN public.centers c ON c.fees_enabled AND private.fee_student_in_center(s.sid, c.id)
   WHERE (SELECT auth.uid()) IS NOT NULL
$$;
REVOKE ALL ON FUNCTION public.my_fee_centers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_fee_centers() TO authenticated;

-- ─────────── 6. التذكير (مهمة يومية) ───────────
-- يوم الاستحقاق ثم بعد 7 أيام إن بقي على الطالب رصيد في المركز؛ لوليّ الأمر، وللطالب إن لم يُربط بوليّ.
-- الإشعار شخصي لوليّ الأمر (أو الطالب غير المربوط) ولا يظهر في غرف الحلقة ولا لوحاتها.

CREATE OR REPLACE FUNCTION public.send_fee_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  today date := public.zen_today();
  c record;
  n integer := 0;
BEGIN
  FOR c IN
    SELECT fc.id, fc.center_id, fc.student_id, fc.title, fc.amount, fc.currency, ce.name AS center_name,
           CASE WHEN fc.due_date = today THEN 'due' ELSE 'overdue' END AS stage
      FROM public.fee_charges fc JOIN public.centers ce ON ce.id = fc.center_id AND ce.fees_enabled
     WHERE fc.cancelled_at IS NULL
       AND (fc.due_date = today OR fc.due_date = today - 7)
       AND (SELECT coalesce(sum(x.amount), 0) FROM public.fee_charges x
             WHERE x.center_id = fc.center_id AND x.student_id = fc.student_id AND x.cancelled_at IS NULL AND x.due_date <= today)
           > (SELECT coalesce(sum(p.amount), 0) FROM public.fee_payments p
               WHERE p.center_id = fc.center_id AND p.student_id = fc.student_id AND p.voided_at IS NULL)
  LOOP
    INSERT INTO public.fee_reminders_sent (charge_id, stage) VALUES (c.id, c.stage) ON CONFLICT DO NOTHING;
    CONTINUE WHEN NOT FOUND;
    INSERT INTO public.notifications (user_id, kind, title, body, link)
    SELECT r.uid, 'fee_reminder',
           CASE WHEN c.stage = 'due' THEN 'تذكير بموعد الرسوم' ELSE 'رسوم متأخرة' END,
           c.title || ' — ' || c.amount::text || ' ' || c.currency || ' (' || c.center_name || ')', '/fees'
      FROM (SELECT gl.guardian_id AS uid FROM public.guardian_links gl WHERE gl.student_id = c.student_id
            UNION SELECT c.student_id WHERE NOT EXISTS (SELECT 1 FROM public.guardian_links gl2 WHERE gl2.student_id = c.student_id)) r;
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.send_fee_reminders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.send_fee_reminders() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'zen-fee-reminders';
    PERFORM cron.schedule('zen-fee-reminders', '0 6 * * *', 'SELECT public.send_fee_reminders()');
  END IF;
END $$;

-- ─────────── 7. التسميع عن بُعد ───────────

CREATE OR REPLACE FUNCTION public.remote_assign(
  _halaqa uuid, _students uuid[], _kind text, _surah text, _from integer, _to integer,
  _instructions text, _due date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := (SELECT auth.uid());
  sname text;
  n integer;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT private.manages_halaqa(caller, _halaqa) THEN RAISE EXCEPTION 'NOT_YOUR_HALAQA'; END IF;
  IF coalesce(_kind, 'review') NOT IN ('memorize', 'review') THEN RAISE EXCEPTION 'INVALID_KIND'; END IF;
  sname := trim(_surah);
  IF private.surah_no(sname) IS NULL OR _from IS NULL OR _to IS NULL OR _from < 1 OR _to < _from OR _to > private.surah_ayahs(sname) THEN
    RAISE EXCEPTION 'INVALID_RANGE';
  END IF;
  IF _students IS NULL OR cardinality(_students) = 0 OR cardinality(_students) > 200 THEN RAISE EXCEPTION 'INVALID_STUDENTS'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(_students) s
              WHERE NOT EXISTS (SELECT 1 FROM public.halaqa_students hs WHERE hs.halaqa_id = _halaqa AND hs.student_id = s)) THEN
    RAISE EXCEPTION 'STUDENT_NOT_IN_HALAQA';
  END IF;
  IF _due IS NOT NULL AND _due < public.zen_today() THEN RAISE EXCEPTION 'INVALID_DATE'; END IF;
  INSERT INTO public.remote_recitations (halaqa_id, teacher_id, student_id, kind, surah_name, from_ayah, to_ayah, instructions, due_date)
  SELECT DISTINCT _halaqa, caller, s, coalesce(_kind, 'review'), sname, _from, _to, nullif(trim(_instructions), ''), _due
    FROM unnest(_students) s;
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO public.notifications (user_id, kind, title, body, link)
  SELECT DISTINCT s, 'remote_assigned', 'تسميع عن بُعد',
         'سجّل تلاوتك لسورة ' || sname || ' من الآية ' || _from || ' إلى ' || _to || ' وأرسلها لمعلّمك.', '/recite/remote'
    FROM unnest(_students) s;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.remote_assign(uuid, uuid[], text, text, integer, integer, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remote_assign(uuid, uuid[], text, text, integer, integer, text, date) TO authenticated;

/** يرفع الطالب تسجيله إلى مجلده في حاوية recitations ثم يرسله. يعاد الإرسال ما لم يُراجَع. */
CREATE OR REPLACE FUNCTION public.remote_submit(_id uuid, _path text, _seconds integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := (SELECT auth.uid());
  r public.remote_recitations;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  SELECT * INTO r FROM public.remote_recitations WHERE id = _id FOR UPDATE;
  IF r.id IS NULL OR r.student_id <> caller THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  IF r.status NOT IN ('assigned', 'submitted') THEN RAISE EXCEPTION 'ALREADY_REVIEWED'; END IF;
  IF _seconds IS NULL OR _seconds NOT BETWEEN 1 AND 3600 THEN RAISE EXCEPTION 'INVALID_DURATION'; END IF;
  IF _path IS NULL OR split_part(_path, '/', 1) <> caller::text
     OR NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'recitations' AND o.name = _path) THEN
    RAISE EXCEPTION 'INVALID_AUDIO';
  END IF;
  UPDATE public.remote_recitations
     SET status = 'submitted', audio_path = _path, duration_seconds = _seconds, submitted_at = now()
   WHERE id = _id;
  INSERT INTO public.notifications (user_id, kind, title, body, link)
  SELECT r.teacher_id, 'remote_submitted', 'تسميع عن بُعد جديد',
         coalesce((SELECT name FROM public.profiles WHERE id = caller), 'طالب') || ' أرسل تلاوة سورة ' || r.surah_name
           || ' (' || r.from_ayah || '–' || r.to_ayah || ').', '/teacher/remote'
   WHERE r.teacher_id IS NOT NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.remote_submit(uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remote_submit(uuid, text, integer) TO authenticated;

/**
 * مراجعة المعلّم: الدرجة (1..5) والأخطاء على شبكة الآيات [{ayah, type}] والملاحظة، وتدخل سجل اليوم للحلقة:
 * يُفتح سجل اليوم إن لم يُفتح، ويُسجَّل الطالب حاضراً ضمناً إن لم يُسجَّل حضوره (كما يفعل save_daily_entry)،
 * وتُنشأ جلسة تسميع بالمقطع وتقييم بالأخطاء، وتُطبَّق جدولة المراجعة. السجل المغلق يرفض (يُعاد فتحه أولاً).
 */
CREATE OR REPLACE FUNCTION public.remote_review(_id uuid, _grade integer, _mistakes jsonb, _note text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := (SELECT auth.uid());
  r public.remote_recitations;
  rec public.halaqa_daily_records;
  rec_id uuid;
  att public.attendance;
  sess uuid;
  ass uuid;
  errs jsonb;
  m jsonb;
  idx integer;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  SELECT * INTO r FROM public.remote_recitations WHERE id = _id FOR UPDATE;
  IF r.id IS NULL OR NOT private.manages_halaqa(caller, r.halaqa_id) THEN RAISE EXCEPTION 'NOT_YOUR_HALAQA'; END IF;
  IF r.status <> 'submitted' THEN RAISE EXCEPTION 'NOT_SUBMITTED'; END IF;
  IF _grade IS NULL OR _grade NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'INVALID_GRADE'; END IF;
  IF _mistakes IS NULL THEN _mistakes := '[]'::jsonb; END IF;
  IF jsonb_typeof(_mistakes) <> 'array' OR jsonb_array_length(_mistakes) > 300 THEN RAISE EXCEPTION 'INVALID_MISTAKES'; END IF;
  FOR m IN SELECT * FROM jsonb_array_elements(_mistakes) LOOP
    IF jsonb_typeof(m) <> 'object' OR (m ->> 'ayah') IS NULL OR (m ->> 'ayah') !~ '^\d+$'
       OR (m ->> 'ayah')::integer NOT BETWEEN r.from_ayah AND r.to_ayah
       OR coalesce(m ->> 'type', '') NOT IN ('hifz', 'tajweed', 'tashkeel', 'waqf') THEN
      RAISE EXCEPTION 'INVALID_MISTAKES';
    END IF;
  END LOOP;
  IF _note IS NOT NULL AND char_length(_note) > 1000 THEN RAISE EXCEPTION 'INVALID_NOTES'; END IF;
  -- أخطاء التقييم: الأكثر تكراراً أولاً (ما يقرؤه مراقب الأنماط في errors -> 0)، ثم كل آية بسورتها.
  SELECT coalesce(jsonb_agg(jsonb_build_object('type', x.type, 'surah', r.surah_name, 'ayah', x.ayah)
                            ORDER BY x.freq DESC, x.ayah), '[]'::jsonb)
    INTO errs
    FROM (SELECT e ->> 'type' AS type, (e ->> 'ayah')::integer AS ayah,
                 count(*) OVER (PARTITION BY e ->> 'type') AS freq
            FROM jsonb_array_elements(_mistakes) e) x;

  rec_id := (public.open_daily_record(r.halaqa_id, public.zen_today()) ->> 'id')::uuid;
  rec := private.daily_record_for_write(rec_id, false);
  SELECT * INTO att FROM public.attendance a
   WHERE a.student_id = r.student_id AND a.halaqa_id = rec.halaqa_id AND a.session_date = rec.record_date;
  IF att.id IS NULL THEN
    INSERT INTO public.attendance (student_id, halaqa_id, teacher_id, session_date, status)
    VALUES (r.student_id, rec.halaqa_id, caller, rec.record_date, 'present')
    RETURNING * INTO att;
  ELSIF att.status IN ('absent', 'excused') THEN
    RAISE EXCEPTION 'STUDENT_NOT_PRESENT';
  END IF;

  SELECT s.id INTO sess FROM public.recitation_sessions s
   WHERE s.daily_record_id = rec.id AND s.student_id = r.student_id AND s.kind = r.kind
     AND s.surah_name = r.surah_name AND s.from_ayah = r.from_ayah AND s.to_ayah = r.to_ayah;
  IF sess IS NULL THEN
    SELECT coalesce(max(s.seg_index), 0) + 1 INTO idx FROM public.recitation_sessions s
     WHERE s.daily_record_id = rec.id AND s.student_id = r.student_id AND s.kind = r.kind;
    INSERT INTO public.recitation_sessions
      (student_id, halaqa_id, surah_name, from_ayah, to_ayah, kind, status, session_date, daily_record_id, seg_index,
       audio_path, duration_seconds)
    VALUES (r.student_id, rec.halaqa_id, r.surah_name, r.from_ayah, r.to_ayah, r.kind, 'approved', rec.record_date, rec.id, idx,
            r.audio_path, r.duration_seconds)
    RETURNING id INTO sess;
    INSERT INTO public.recitation_assessments (session_id, student_id, teacher_id, score, errors, teacher_notes, approved)
    VALUES (sess, r.student_id, caller, public.grade_to_score(_grade), errs, nullif(trim(_note), ''), true)
    RETURNING id INTO ass;
    PERFORM private.daily_apply_review(sess, r.student_id, r.surah_name, r.from_ayah, r.to_ayah, public.grade_to_score(_grade));
  ELSE
    UPDATE public.recitation_assessments
       SET score = public.grade_to_score(_grade), errors = errs, teacher_notes = nullif(trim(_note), ''), updated_at = now()
     WHERE session_id = sess
    RETURNING id INTO ass;
  END IF;

  INSERT INTO public.halaqa_register_entries AS e
    (halaqa_id, session_date, student_id, attendance_id, recitation_session_id, assessment_id, recorded_by)
  VALUES (rec.halaqa_id, rec.record_date, r.student_id, att.id, sess, ass, caller)
  ON CONFLICT (halaqa_id, session_date, student_id) DO UPDATE SET
    attendance_id = coalesce(e.attendance_id, att.id),
    recitation_session_id = coalesce(e.recitation_session_id, sess),
    assessment_id = coalesce(e.assessment_id, ass),
    recorded_by = caller,
    version = e.version + 1,
    updated_at = now();

  UPDATE public.remote_recitations
     SET status = 'reviewed', grade = _grade, mistakes = _mistakes, teacher_note = nullif(trim(_note), ''),
         reviewed_at = now(), session_id = sess, record_date = rec.record_date
   WHERE id = _id;
  INSERT INTO public.notifications (user_id, kind, title, body, link)
  VALUES (r.student_id, 'remote_reviewed', 'راجع معلّمك تسميعك',
          'سورة ' || r.surah_name || ': ' || jsonb_array_length(_mistakes) || ' ملاحظة على الآيات.', '/recite/remote');
  RETURN jsonb_build_object('session_id', sess, 'record_id', rec.id, 'record_date', rec.record_date);
END;
$$;
REVOKE ALL ON FUNCTION public.remote_review(uuid, integer, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remote_review(uuid, integer, jsonb, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.remote_cancel(_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.remote_recitations;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  SELECT * INTO r FROM public.remote_recitations WHERE id = _id FOR UPDATE;
  IF r.id IS NULL OR NOT private.manages_halaqa(auth.uid(), r.halaqa_id) THEN RAISE EXCEPTION 'NOT_YOUR_HALAQA'; END IF;
  IF r.status = 'reviewed' THEN RAISE EXCEPTION 'ALREADY_REVIEWED'; END IF;
  UPDATE public.remote_recitations SET status = 'cancelled' WHERE id = _id;
END;
$$;
REVOKE ALL ON FUNCTION public.remote_cancel(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remote_cancel(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.my_remote_recitations()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'halaqa_name', h.name, 'teacher_name', p.name, 'kind', r.kind, 'surah_name', r.surah_name,
    'from_ayah', r.from_ayah, 'to_ayah', r.to_ayah, 'instructions', r.instructions, 'due_date', r.due_date,
    'status', r.status, 'audio_path', r.audio_path, 'duration_seconds', r.duration_seconds, 'submitted_at', r.submitted_at,
    'grade', r.grade, 'mistakes', r.mistakes, 'teacher_note', r.teacher_note, 'reviewed_at', r.reviewed_at,
    'created_at', r.created_at)
    ORDER BY (r.status = 'assigned') DESC, r.created_at DESC), '[]'::jsonb)
    FROM (SELECT * FROM public.remote_recitations
           WHERE student_id = (SELECT auth.uid()) AND status <> 'cancelled'
           ORDER BY created_at DESC LIMIT 100) r
    JOIN public.halaqat h ON h.id = r.halaqa_id
    LEFT JOIN public.profiles p ON p.id = r.teacher_id
$$;
REVOKE ALL ON FUNCTION public.my_remote_recitations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_remote_recitations() TO authenticated;

/** طابور المعلّم: المرسَل أولاً (الأقدم أولاً)، ثم المكلَّف بلا إرسال، ثم آخر المراجَع، في حلقاته وحدها. */
CREATE OR REPLACE FUNCTION public.teacher_remote_queue()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'halaqa_id', r.halaqa_id, 'halaqa_name', h.name, 'student_id', r.student_id, 'student_name', coalesce(p.name, ''),
    'kind', r.kind, 'surah_name', r.surah_name, 'from_ayah', r.from_ayah, 'to_ayah', r.to_ayah,
    'instructions', r.instructions, 'due_date', r.due_date, 'status', r.status, 'audio_path', r.audio_path,
    'duration_seconds', r.duration_seconds, 'submitted_at', r.submitted_at, 'grade', r.grade, 'mistakes', r.mistakes,
    'teacher_note', r.teacher_note, 'reviewed_at', r.reviewed_at, 'record_date', r.record_date, 'created_at', r.created_at)
    ORDER BY CASE r.status WHEN 'submitted' THEN 0 WHEN 'assigned' THEN 1 ELSE 2 END,
             CASE WHEN r.status = 'reviewed' THEN NULL ELSE coalesce(r.submitted_at, r.created_at) END,
             r.reviewed_at DESC NULLS LAST), '[]'::jsonb)
    FROM public.remote_recitations r
    JOIN public.halaqat h ON h.id = r.halaqa_id
    LEFT JOIN public.profiles p ON p.id = r.student_id
   WHERE private.manages_halaqa((SELECT auth.uid()), r.halaqa_id)
     AND r.status <> 'cancelled'
     AND (r.status <> 'reviewed' OR r.reviewed_at > now() - interval '14 days')
$$;
REVOKE ALL ON FUNCTION public.teacher_remote_queue() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.teacher_remote_queue() TO authenticated;
