-- ════════════════════════════════════════════════════════════════════════════
-- المرحلة 9.3 — استيراد الطلاب جماعياً
-- ════════════════════════════════════════════════════════════════════════════
-- teacher_create_students_bulk(_halaqa, _rows) ينشئ حتى 100 طالب بـ teacher_create_student نفسها
-- (التحقق نفسه، وكلمة مرور مؤقتة يُلزَم الطالب بتغييرها، ورمز استرداد)، ولكل صف نتيجته:
-- الصف الخاطئ (اسم مستخدم مأخوذ مثلاً) لا يُفسد بقية الصفوف، ولا يُنشئ شيئاً جزئياً (معاملة فرعية لكل صف).
-- حدّ إضافي: 5 استيرادات في الساعة لكل معلّم، فوق حدّ 120 حساباً في الساعة.

CREATE OR REPLACE FUNCTION public.teacher_create_students_bulk(_halaqa uuid, _rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := (SELECT auth.uid());
  r jsonb;
  i int := 0;
  res jsonb;
  out jsonb := '[]'::jsonb;
  ok int := 0;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501'; END IF;
  IF _halaqa IS NULL OR NOT private.manages_halaqa(caller, _halaqa) THEN
    RAISE EXCEPTION 'not_allowed: لا يمكنك إضافة طلاب إلى حلقة ليست حلقتك.' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(_rows) = 0 THEN
    RAISE EXCEPTION 'EMPTY_IMPORT' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(_rows) > 100 THEN
    RAISE EXCEPTION 'TOO_MANY_ROWS: 100 طالب على الأكثر في الاستيراد الواحد.' USING ERRCODE = '22023';
  END IF;
  PERFORM public._auth_rate_hit('teacher_bulk', caller::text, 5, interval '1 hour');

  FOR r IN SELECT value FROM jsonb_array_elements(_rows) LOOP
    i := i + 1;
    BEGIN
      res := public.teacher_create_student(_halaqa, r ->> 'username', r ->> 'password', r ->> 'name');
      out := out || jsonb_build_array(jsonb_build_object('row', i, 'ok', true) || res);
      ok := ok + 1;
    EXCEPTION WHEN others THEN
      out := out || jsonb_build_array(jsonb_build_object(
        'row', i, 'ok', false, 'username', r ->> 'username', 'name', r ->> 'name',
        'error', split_part(SQLERRM, ':', 1)));
    END;
  END LOOP;
  RETURN jsonb_build_object('created', ok, 'failed', i - ok, 'rows', out);
END;
$$;
REVOKE ALL ON FUNCTION public.teacher_create_students_bulk(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.teacher_create_students_bulk(uuid, jsonb) TO authenticated;
