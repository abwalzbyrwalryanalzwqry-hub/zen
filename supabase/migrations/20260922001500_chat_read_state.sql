-- ════════════════════════════════════════════════════════════════════
-- حالة قراءة المحادثات: علامة «قُرئت» وعدّاد الرسائل غير المقروءة
--
-- المشكلة: عمود messages.status يقبل 'seen' لكن لا شيء في التطبيق يكتبه،
-- والسياسة "update own messages" تسمح بالتحديث للمُرسِل فقط — أي أن المستلم
-- لا يستطيع تعليم الرسالة مقروءة أصلاً، فعلامة ✓✓ في الواجهة لا تظهر أبداً.
-- ولا توجد أي طريقة لمعرفة عدد الرسائل غير المقروءة في قائمة المحادثات.
-- ════════════════════════════════════════════════════════════════════

-- ─────────── جدول آخر قراءة لكل مستخدم في كل محادثة ───────────
CREATE TABLE IF NOT EXISTS public.chat_reads (
  chat_id uuid NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chat_id, user_id)
);

CREATE INDEX IF NOT EXISTS chat_reads_user_idx ON public.chat_reads (user_id);

GRANT SELECT ON public.chat_reads TO authenticated;
GRANT ALL ON public.chat_reads TO service_role;
ALTER TABLE public.chat_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read own read-state" ON public.chat_reads;
CREATE POLICY "read own read-state" ON public.chat_reads
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- لا سياسات كتابة: التحديث يمر عبر mark_chat_seen() فقط.

-- ─────────── تعليم محادثة كمقروءة ───────────
CREATE OR REPLACE FUNCTION public.mark_chat_seen(_chat_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
  touched integer := 0;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  IF NOT public.is_chat_participant(_chat_id, caller) THEN
    RAISE EXCEPTION 'NOT_A_PARTICIPANT';
  END IF;

  -- رسائل الآخرين في هذه المحادثة تصبح 'seen'
  UPDATE public.messages
     SET status = 'seen'
   WHERE chat_id = _chat_id
     AND sender_id <> caller
     AND status <> 'seen';

  GET DIAGNOSTICS touched = ROW_COUNT;

  INSERT INTO public.chat_reads (chat_id, user_id, last_read_at)
  VALUES (_chat_id, caller, now())
  ON CONFLICT (chat_id, user_id)
  DO UPDATE SET last_read_at = now();

  RETURN touched;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_chat_seen(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.mark_chat_seen(uuid) TO authenticated;

COMMENT ON FUNCTION public.mark_chat_seen IS
  'تعليم كل رسائل الآخرين في المحادثة كمقروءة وتحديث آخر قراءة للمستخدم الحالي.';

-- ─────────── عدّادات غير المقروء لكل محادثات المستخدم ───────────
CREATE OR REPLACE FUNCTION public.unread_counts()
RETURNS TABLE (chat_id uuid, unread integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.chat_id,
         COUNT(*)::integer AS unread
    FROM public.messages m
    JOIN public.chats c ON c.id = m.chat_id
    LEFT JOIN public.chat_reads r
           ON r.chat_id = m.chat_id AND r.user_id = auth.uid()
   WHERE auth.uid() = ANY(c.participants)
     AND m.sender_id <> auth.uid()
     AND m.created_at > COALESCE(r.last_read_at, 'epoch'::timestamptz)
   GROUP BY m.chat_id;
$$;

REVOKE ALL ON FUNCTION public.unread_counts() FROM public;
GRANT EXECUTE ON FUNCTION public.unread_counts() TO authenticated;

COMMENT ON FUNCTION public.unread_counts IS
  'عدد الرسائل غير المقروءة في كل محادثة يشارك فيها المستخدم الحالي.';

-- ─────────── إجمالي غير المقروء (لشارة التنقّل السفلي) ───────────
CREATE OR REPLACE FUNCTION public.unread_total()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(unread), 0)::integer FROM public.unread_counts();
$$;

REVOKE ALL ON FUNCTION public.unread_total() FROM public;
GRANT EXECUTE ON FUNCTION public.unread_total() TO authenticated;

-- ─────────── دعم رسائل الصوت والصور ───────────
-- الرسالة من نوع voice/image يحمل محتواها مسار الملف في حاوية chat-media،
-- ومدّة الصوت بالثواني تُخزَّن لعرض الشريط قبل التحميل.
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS media_path text,
  ADD COLUMN IF NOT EXISTS duration_seconds integer;

ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_media_required;
ALTER TABLE public.messages
  ADD CONSTRAINT messages_media_required
  CHECK (type NOT IN ('image', 'voice') OR media_path IS NOT NULL);
