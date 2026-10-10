-- ════════════════════════════════════════════════════════════════════
-- تحليل قسم «المزيد» (GAP-02): «أبلغ عن مشكلة أو اقترح».
--
-- لم يكن في التطبيق طريق للمستخدم ليقول «هذا لا يعمل» أو «أقترح كذا» إلا خارج
-- التطبيق. feedback يحفظ الرسالة مع سياق تقني قصير يرسله العميل (الإصدار، المنصة،
-- اللغة، الصفحة) دون أي بيانات أخرى. صاحب الرسالة يرى رسائله فقط، وصاحب التطبيق
-- يرى الكل ويغيّر حالتها. لا حذف ولا تعديل للمرسِل بعد الإرسال (سجل).
-- الحد: 5 رسائل في الساعة لكل مستخدم (ضد الإغراق)، يفرضه الخادم.
-- الحذف مع الحساب: ON DELETE CASCADE من auth.users.
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('bug', 'idea', 'content', 'other')),
  message text NOT NULL CHECK (char_length(btrim(message)) BETWEEN 5 AND 2000),
  app_version text CHECK (char_length(app_version) <= 40),
  platform text CHECK (char_length(platform) <= 40),
  locale text CHECK (char_length(locale) <= 10),
  route text CHECK (char_length(route) <= 200),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'seen', 'done')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS feedback_user_created_idx ON public.feedback (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS feedback_status_created_idx ON public.feedback (status, created_at DESC);

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

-- شروط السياسات في private (المرحلة 7.2، الفحص 96): نسخة من is_app_owner لا تُطلب عبر /rpc.
CREATE OR REPLACE FUNCTION private.is_app_owner()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL AND (SELECT auth.uid()) = public.app_owner_id();
$$;
REVOKE ALL ON FUNCTION private.is_app_owner() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_app_owner() TO authenticated, service_role;

DROP POLICY IF EXISTS feedback_insert_own ON public.feedback;
CREATE POLICY feedback_insert_own ON public.feedback
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND status = 'new');

DROP POLICY IF EXISTS feedback_select_own_or_owner ON public.feedback;
CREATE POLICY feedback_select_own_or_owner ON public.feedback
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR (SELECT private.is_app_owner()));

DROP POLICY IF EXISTS feedback_update_owner ON public.feedback;
CREATE POLICY feedback_update_owner ON public.feedback
  FOR UPDATE TO authenticated
  USING ((SELECT private.is_app_owner()))
  WITH CHECK ((SELECT private.is_app_owner()));

REVOKE ALL ON public.feedback FROM anon;
GRANT SELECT, INSERT ON public.feedback TO authenticated;
GRANT UPDATE (status) ON public.feedback TO authenticated;

-- حدّ الإرسال: 5 في الساعة. SECURITY DEFINER ليعدّ دون أن تقيّده RLS.
CREATE OR REPLACE FUNCTION private.feedback_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (SELECT count(*) FROM public.feedback f
       WHERE f.user_id = NEW.user_id AND f.created_at > now() - interval '1 hour') >= 5 THEN
    RAISE EXCEPTION 'FEEDBACK_RATE_LIMIT' USING ERRCODE = 'P0001';
  END IF;
  NEW.message := btrim(NEW.message);
  NEW.created_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.feedback_rate_limit() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS feedback_rate_limit ON public.feedback;
CREATE TRIGGER feedback_rate_limit
  BEFORE INSERT ON public.feedback
  FOR EACH ROW EXECUTE FUNCTION private.feedback_rate_limit();

COMMENT ON TABLE public.feedback IS
  'بلاغات المستخدمين واقتراحاتهم من «المزيد»: الرسالة وسياق تقني قصير. يراها صاحبها وصاحب التطبيق.';
