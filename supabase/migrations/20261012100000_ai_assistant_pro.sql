-- المرحلة 4: مساعد زِن الاحترافي
-- محادثات محفوظة على الخادم (A4، A5)، وتقييم الردود (A7)، واسترجاع الحصة عند الفشل وعرض المتبقّي (A9).
-- الكتابة في المحادثات للخادم وحده (service_role): فلا يستطيع العميل حقن ردود «مساعد» مزيّفة في السياق.

-- ─── 1) المحادثات والرسائل ───
CREATE TABLE IF NOT EXISTS public.ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 80),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_conversations_user_idx ON public.ai_conversations (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 8000),
  rating smallint CHECK (rating IN (-1, 1)),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS ai_messages_conv_idx ON public.ai_messages (conversation_id, created_at);

ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_conversations, public.ai_messages FROM anon, authenticated;
GRANT SELECT, DELETE ON public.ai_conversations TO authenticated;
GRANT SELECT ON public.ai_messages TO authenticated;
GRANT ALL ON public.ai_conversations, public.ai_messages TO service_role;

DROP POLICY IF EXISTS "ai conv own read" ON public.ai_conversations;
CREATE POLICY "ai conv own read" ON public.ai_conversations
  FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "ai conv own delete" ON public.ai_conversations;
CREATE POLICY "ai conv own delete" ON public.ai_conversations
  FOR DELETE TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "ai msg own read" ON public.ai_messages;
CREATE POLICY "ai msg own read" ON public.ai_messages
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.ai_conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid()));

-- آخر نشاط يرتّب القائمة.
CREATE OR REPLACE FUNCTION public.touch_ai_conversation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.ai_conversations SET updated_at = now() WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_touch_ai_conversation ON public.ai_messages;
CREATE TRIGGER trg_touch_ai_conversation AFTER INSERT ON public.ai_messages
  FOR EACH ROW EXECUTE FUNCTION public.touch_ai_conversation();

-- ─── 2) تقييم الردود ───
CREATE OR REPLACE FUNCTION public.rate_ai_message(_id uuid, _rating smallint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF _rating IS NOT NULL AND _rating NOT IN (-1, 1) THEN RAISE EXCEPTION 'BAD_RATING'; END IF;
  UPDATE public.ai_messages m SET rating = _rating
   WHERE m.id = _id AND m.role = 'assistant'
     AND EXISTS (SELECT 1 FROM public.ai_conversations c
                  WHERE c.id = m.conversation_id AND c.user_id = auth.uid());
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.rate_ai_message(uuid, smallint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rate_ai_message(uuid, smallint) TO authenticated;

-- ─── 3) الحصة: المتبقّي، والاسترجاع عند الفشل ───
CREATE OR REPLACE FUNCTION public.my_ai_usage(_feature text DEFAULT 'chat')
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::int FROM public.ai_usage_events
   WHERE user_id = auth.uid() AND feature = _feature AND created_at >= now() - interval '1 day';
$$;
REVOKE ALL ON FUNCTION public.my_ai_usage(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_ai_usage(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.refund_ai_quota(_user_id uuid, _feature text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.ai_usage_events WHERE ctid = (
    SELECT ctid FROM public.ai_usage_events
     WHERE user_id = _user_id AND feature = _feature AND created_at >= now() - interval '10 minutes'
     ORDER BY created_at DESC LIMIT 1);
$$;
REVOKE ALL ON FUNCTION public.refund_ai_quota(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_ai_quota(uuid, text) TO service_role;
