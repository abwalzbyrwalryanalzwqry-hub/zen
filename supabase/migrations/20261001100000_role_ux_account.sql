-- ════════════════════════════════════════════════════════════════════
-- المرحلة 9: تجربة حسب الدور، وحساب ولي الأمر، وحذف الحساب وتصدير البيانات
--
-- 1. profiles.account_kind: كيف يستخدم صاحب الحساب زِن ('student' أو 'guardian').
--    تفضيل واجهة فقط، لا يمنح أي صلاحية: صلاحيات ولي الأمر تبقى من guardian_links
--    (برمز يُصدره المعلّم)، وصلاحيات المعلّم من user_roles (برمز دعوة).
--    لذلك لم يُوسَّع app_role: توسيعه يعني صلاحيات، والدور هنا عرض فقط.
-- 2. my_home_context(): كل ما تحتاجه الشاشة الرئيسية لاختيار واجهتها في نداء واحد.
-- 3. export_my_data(): نسخة JSON من بيانات صاحب الحساب وحده (متطلب Google Play واللائحة).
-- 4. my_storage_objects(): ملفات صاحب الحساب ليحذفها العميل عبر واجهة التخزين قبل الحذف
--    (Supabase يمنع الحذف المباشر من storage.objects).
-- 5. delete_my_account(): يحذف الحساب وكل ما يخصّه. يرفض إن كان المالك الوحيد لمركز فيه
--    آخرون، كي لا يُحذف مركز كامل ببيانات غيره.
-- ════════════════════════════════════════════════════════════════════

-- ─────────── 1. نوع الحساب ───────────
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS account_kind text;
DO $$ BEGIN
  ALTER TABLE public.profiles ADD CONSTRAINT profiles_account_kind_check
    CHECK (account_kind IS NULL OR account_kind IN ('student', 'guardian'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.set_account_kind(_kind text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'سجّل الدخول أولاً.'; END IF;
  IF _kind NOT IN ('student', 'guardian') THEN RAISE EXCEPTION 'نوع حساب غير معروف.'; END IF;
  UPDATE public.profiles SET account_kind = _kind WHERE id = _uid;
END $$;
REVOKE ALL ON FUNCTION public.set_account_kind(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_account_kind(text) TO authenticated;

-- ─────────── 2. سياق الشاشة الرئيسية ───────────
CREATE OR REPLACE FUNCTION public.my_home_context()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'account_kind', (SELECT account_kind FROM public.profiles WHERE id = auth.uid()),
    'is_teacher', public.is_teacher(auth.uid()),
    'children', (SELECT count(*) FROM public.guardian_links WHERE guardian_id = auth.uid()),
    'halaqas_joined', (SELECT count(*) FROM public.halaqa_students WHERE student_id = auth.uid()),
    'halaqas_taught', (SELECT count(*) FROM public.halaqat WHERE teacher_id = auth.uid()),
    'center_staff', EXISTS (SELECT 1 FROM public.center_staff WHERE user_id = auth.uid())
  )
  WHERE auth.uid() IS NOT NULL
$$;
REVOKE ALL ON FUNCTION public.my_home_context() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_home_context() TO authenticated;

-- ─────────── 3. تصدير البيانات ───────────
-- يمرّ على كل جدول في public فيه عمود يشير إلى صاحب الحساب نفسه (user_id / student_id /
-- sender_id / guardian_id)، فلا يُنسى جدول يُضاف لاحقاً. لا تُصدَّر أعمدة teacher_id لأنها
-- بيانات طلاب آخرين، ولا سجلات الأمان والرموز.
CREATE OR REPLACE FUNCTION public.export_my_data()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _out jsonb;
  _rows jsonb;
  r record;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'سجّل الدخول أولاً.'; END IF;

  _out := jsonb_build_object(
    'format', 'zen-export-v1',
    'exported_at', now(),
    'user_id', _uid,
    'profile', (SELECT to_jsonb(p) FROM public.profiles p WHERE p.id = _uid),
    'contacts', (SELECT to_jsonb(c) - 'user_id' FROM public.profile_contacts c WHERE c.user_id = _uid),
    'roles', (SELECT coalesce(jsonb_agg(role), '[]') FROM public.user_roles WHERE user_id = _uid)
  );

  FOR r IN
    SELECT c.table_name, string_agg(format('%I = $1', c.column_name), ' OR ') AS cond
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
    WHERE c.table_schema = 'public'
      AND c.column_name IN ('user_id', 'student_id', 'sender_id', 'guardian_id')
      AND c.table_name NOT IN (
        'profiles', 'profile_contacts', 'user_roles', 'client_errors',
        'guardian_claim_failures', 'center_code_failures', 'guardian_link_codes',
        'center_staff_codes', 'teacher_invites', 'halaqa_invites', 'guardian_weekly_sent'
      )
      AND c.table_name NOT LIKE '\_%'
    GROUP BY c.table_name
    ORDER BY c.table_name
  LOOP
    EXECUTE format(
      'SELECT coalesce(jsonb_agg(to_jsonb(x)), ''[]'') FROM (SELECT * FROM public.%I WHERE %s LIMIT 5000) x',
      r.table_name, r.cond
    ) INTO _rows USING _uid;
    IF jsonb_array_length(_rows) > 0 THEN
      _out := jsonb_set(_out, ARRAY['tables'], coalesce(_out -> 'tables', '{}') || jsonb_build_object(r.table_name, _rows));
    END IF;
  END LOOP;

  RETURN _out;
END $$;
REVOKE ALL ON FUNCTION public.export_my_data() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.export_my_data() TO authenticated;

-- ─────────── 4. ملفات صاحب الحساب ───────────
-- recitations/{uid}/...   و   chat-media/{chat_id}/{uid}/...
CREATE OR REPLACE FUNCTION public.my_storage_objects()
RETURNS TABLE (bucket_id text, name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, storage
AS $$
  SELECT o.bucket_id, o.name FROM storage.objects o
  WHERE auth.uid() IS NOT NULL AND (
    (o.bucket_id = 'recitations' AND split_part(o.name, '/', 1) = auth.uid()::text)
    OR (o.bucket_id = 'chat-media' AND split_part(o.name, '/', 2) = auth.uid()::text)
  )
  LIMIT 5000
$$;
REVOKE ALL ON FUNCTION public.my_storage_objects() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_storage_objects() TO authenticated;

-- ─────────── 5. حذف الحساب ───────────
CREATE OR REPLACE FUNCTION public.delete_my_account(_confirm text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  r record;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'سجّل الدخول أولاً.'; END IF;
  IF _confirm IS DISTINCT FROM 'احذف حسابي' THEN
    RAISE EXCEPTION 'اكتب «احذف حسابي» للتأكيد.';
  END IF;

  -- مالك وحيد لمركز فيه أعضاء آخرون: حذفه يحذف المركز ببيانات غيره.
  IF EXISTS (
    SELECT 1 FROM public.center_staff s
    WHERE s.user_id = _uid AND s.role = 'manager'
      AND NOT EXISTS (SELECT 1 FROM public.center_staff o
                      WHERE o.center_id = s.center_id AND o.role = 'manager' AND o.user_id <> _uid)
      AND (EXISTS (SELECT 1 FROM public.center_staff o WHERE o.center_id = s.center_id AND o.user_id <> _uid)
           OR EXISTS (SELECT 1 FROM public.halaqat h WHERE h.center_id = s.center_id AND h.teacher_id IS DISTINCT FROM _uid))
  ) THEN
    RAISE EXCEPTION 'أنت المالك الوحيد لمركز فيه أعضاء آخرون. أضف مالكاً آخر أو احذف المركز أولاً.';
  END IF;

  -- بيانات صاحب الحساب في كل جدول (بعضها بلا مفتاح أجنبي، مثل notifications).
  FOR r IN
    SELECT c.table_name AS tbl, c.column_name AS col
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
    WHERE c.table_schema = 'public'
      AND c.column_name IN ('user_id', 'student_id', 'sender_id', 'guardian_id')
      AND c.table_name NOT LIKE '\_%'
  LOOP
    EXECUTE format('DELETE FROM public.%I WHERE %I = $1', r.tbl, r.col) USING _uid;
  END LOOP;

  -- المفاتيح الأجنبية بلا ON DELETE (سجلات أنشأها: created_by، teacher_id في التقييمات…):
  -- العمود الاختياري يُفرَّغ فيبقى السجل لصاحبه الآخر، والإلزامي يُحذف صفّه.
  FOR r IN
    SELECT cl.relname AS tbl, a.attname AS col, a.attnotnull AS notnull
    FROM pg_constraint k
    JOIN pg_class cl ON cl.oid = k.conrelid
    JOIN pg_namespace n ON n.oid = cl.relnamespace AND n.nspname = 'public'
    JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = k.conkey[1]
    WHERE k.contype = 'f' AND k.confdeltype IN ('a', 'r')
      AND k.confrelid IN ('auth.users'::regclass, 'public.profiles'::regclass)
      AND array_length(k.conkey, 1) = 1
  LOOP
    IF r.notnull THEN
      EXECUTE format('DELETE FROM public.%I WHERE %I = $1', r.tbl, r.col) USING _uid;
    ELSE
      EXECUTE format('UPDATE public.%I SET %I = NULL WHERE %I = $1', r.tbl, r.col, r.col) USING _uid;
    END IF;
  END LOOP;

  -- مراكز كان مديرها الوحيد ولا أحد فيها غيره: تُحذف مع حسابه.
  DELETE FROM public.centers c
  WHERE c.created_by = _uid
    AND NOT EXISTS (SELECT 1 FROM public.center_staff s WHERE s.center_id = c.id)
    AND NOT EXISTS (SELECT 1 FROM public.halaqat h WHERE h.center_id = c.id AND h.teacher_id IS NOT NULL)
    AND NOT EXISTS (SELECT 1 FROM public.halaqat h JOIN public.halaqa_students hs ON hs.halaqa_id = h.id
                    WHERE h.center_id = c.id);

  -- الباقي يُحذف بالتتالي (ON DELETE CASCADE) من auth.users ثم profiles.
  DELETE FROM auth.users WHERE id = _uid;
END $$;
REVOKE ALL ON FUNCTION public.delete_my_account(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_my_account(text) TO authenticated;
