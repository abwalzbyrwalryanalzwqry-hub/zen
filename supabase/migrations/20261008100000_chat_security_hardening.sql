-- ═══════════════════════════════════════════════════════════════════════════
-- تطوير المحادثات — المرحلة 0: سدّ ثغرات المحادثات الثنائية
-- (docs/CHAT_AI_ROADMAP.md — البنود S1 وS2 وS3 وS4 وS5 وS6 وS7)
--
--   S1  المُرسِل كان يستطيع تعديل أي عمود في رسالته (chat_id وtype وcreated_at وstatus).
--       ← لا تعديل مباشر إطلاقاً؛ تعديل النص فقط عبر edit_message() خلال 15 دقيقة مع edited_at.
--   S2  العميل كان يستطيع إدراج رسالة type='ai' تبدو كأنها من المساعد.
--       ← الإدراج من العميل يقبل text وimage وvoice فقط، والأعمدة المسموحة محددة.
--   S3  أي طرف كان يستطيع تعديل last_message وtitle وis_group في المحادثة.
--       ← لا تعديل مباشر؛ يكتبها المُشغِّل bump_chat_last_message وحده.
--   S4  المراسلة كانت تستمر بعد انتهاء العلاقة (خروج من الحلقة، فكّ ربط ولي الأمر...).
--       ← الإرسال يشترط can_start_chat الآن، والرسائل القديمة تبقى للقراءة.
--   S5  صلاحيات زائدة لـ anon وauthenticated (DELETE وTRUNCATE وTRIGGER...).
--   S6  محادثة مكررة بين الشخصين نفسيهما عند ضغطتين متزامنتين.
--       ← فهرس فريد على الزوج + get_or_create_direct_chat().
--   S7  حصة الذكاء الاصطناعي قابلة للتجاوز بطلبات متوازية ← قفل لكل مستخدم.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1) الصلاحيات (S5) ───
REVOKE ALL ON public.chats, public.messages, public.chat_reads FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.chats, public.messages, public.chat_reads TO authenticated;
GRANT INSERT (participants, is_group) ON public.chats TO authenticated;
GRANT INSERT (chat_id, sender_id, type, content, media_path, duration_seconds)
  ON public.messages TO authenticated;
GRANT ALL ON public.chats, public.messages, public.chat_reads TO service_role;

-- ─── 2) لا تعديل مباشر للرسائل ولا للمحادثات (S1، S3) ───
DROP POLICY IF EXISTS "update own messages" ON public.messages;
DROP POLICY IF EXISTS "chat participants update" ON public.chats;

ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS edited_at timestamptz;

-- ─── 3) من يحق له الإرسال في هذه المحادثة الآن؟ (S4) ───
CREATE OR REPLACE FUNCTION public.can_post_in_chat(_chat_id uuid, _uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chats c
     WHERE c.id = _chat_id
       AND _uid = ANY (c.participants)
       AND c.is_group = false
       AND cardinality(c.participants) = 2
       AND public.can_start_chat(c.participants[1], c.participants[2])
  )
$$;
REVOKE ALL ON FUNCTION public.can_post_in_chat(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_post_in_chat(uuid, uuid) TO authenticated, service_role;

-- ─── 4) سياسة الإرسال (S2، S4) ───
DROP POLICY IF EXISTS "send messages to own chats" ON public.messages;
CREATE POLICY "send messages to own chats" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = (SELECT auth.uid())
    AND type IN ('text', 'image', 'voice')
    AND public.can_post_in_chat(chat_id, (SELECT auth.uid()))
    -- المرفق من مجلد هذه المحادثة ومن مجلد المُرسِل نفسه فقط.
    AND (media_path IS NULL OR (
          split_part(media_path, '/', 1) = chat_id::text
      AND split_part(media_path, '/', 2) = (SELECT auth.uid())::text))
  );

-- ─── 5) تعديل نص الرسالة (S1) ───
CREATE OR REPLACE FUNCTION public.edit_message(_id uuid, _content text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _m public.messages;
  _text text := btrim(COALESCE(_content, ''));
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  SELECT * INTO _m FROM public.messages WHERE id = _id FOR UPDATE;
  IF _m.id IS NULL OR _m.sender_id <> auth.uid() THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  IF _m.type <> 'text' THEN RAISE EXCEPTION 'ONLY_TEXT'; END IF;
  IF _m.created_at < now() - interval '15 minutes' THEN RAISE EXCEPTION 'EDIT_WINDOW_CLOSED'; END IF;
  IF NOT public.can_post_in_chat(_m.chat_id, auth.uid()) THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  IF char_length(_text) NOT BETWEEN 1 AND 4000 THEN RAISE EXCEPTION 'MESSAGE_LENGTH'; END IF;
  IF _text = _m.content THEN RETURN; END IF;

  UPDATE public.messages SET content = _text, edited_at = now() WHERE id = _id;

  -- إن كانت آخر رسالة في المحادثة تُحدَّث معاينتها.
  UPDATE public.chats c SET last_message = LEFT(_text, 200)
   WHERE c.id = _m.chat_id
     AND NOT EXISTS (SELECT 1 FROM public.messages x
                      WHERE x.chat_id = _m.chat_id AND x.created_at > _m.created_at);
END;
$$;
REVOKE ALL ON FUNCTION public.edit_message(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.edit_message(uuid, text) TO authenticated;

-- ─── 6) محادثة ثنائية واحدة لكل زوج (S6) ───
-- فهرس فريد على الزوج المرتّب. (لا عمود مولَّد: جدول chats منشور في realtime بهوية نسخ كاملة،
-- وPostgreSQL يرفض تحديث جدول هويته تشمل عموداً مولَّداً غير منشور.)
CREATE UNIQUE INDEX IF NOT EXISTS chats_direct_pair_uniq ON public.chats
  ((LEAST(participants[1], participants[2])), (GREATEST(participants[1], participants[2])))
  WHERE is_group = false AND cardinality(participants) = 2;

CREATE OR REPLACE FUNCTION public.get_or_create_direct_chat(_peer uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _me uuid := auth.uid();
  _id uuid;
BEGIN
  IF _me IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF _peer IS NULL OR _peer = _me THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;

  -- محادثة قائمة تُفتح دائماً (للقراءة على الأقل)، حتى لو انتهت العلاقة.
  SELECT id INTO _id FROM public.chats
   WHERE is_group = false AND cardinality(participants) = 2
     AND LEAST(participants[1], participants[2]) = LEAST(_me, _peer)
     AND GREATEST(participants[1], participants[2]) = GREATEST(_me, _peer);
  IF _id IS NOT NULL THEN RETURN _id; END IF;

  IF NOT public.can_start_chat(_me, _peer) THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;

  INSERT INTO public.chats (participants, is_group)
  VALUES (ARRAY[_me, _peer], false)
  ON CONFLICT ((LEAST(participants[1], participants[2])), (GREATEST(participants[1], participants[2])))
    WHERE is_group = false AND cardinality(participants) = 2
  DO NOTHING
  RETURNING id INTO _id;

  IF _id IS NULL THEN
    SELECT id INTO _id FROM public.chats
     WHERE is_group = false AND cardinality(participants) = 2
       AND LEAST(participants[1], participants[2]) = LEAST(_me, _peer)
       AND GREATEST(participants[1], participants[2]) = GREATEST(_me, _peer);
  END IF;
  RETURN _id;
END;
$$;
REVOKE ALL ON FUNCTION public.get_or_create_direct_chat(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_or_create_direct_chat(uuid) TO authenticated;

-- ─── 7) حصة الذكاء الاصطناعي ذرّية فعلاً (S7) ───
CREATE OR REPLACE FUNCTION public.consume_ai_quota(
  _user_id uuid,
  _feature text,
  _daily_limit integer,
  _minute_limit integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  used_day integer;
  used_minute integer;
BEGIN
  -- الطلبات المتوازية للمستخدم نفسه تُنفَّذ واحداً تلو الآخر حتى نهاية المعاملة.
  PERFORM pg_advisory_xact_lock(hashtextextended('ai_quota:' || _user_id::text, 0));

  SELECT count(*) INTO used_day
    FROM public.ai_usage_events
   WHERE user_id = _user_id AND feature = _feature
     AND created_at >= now() - interval '1 day';

  SELECT count(*) INTO used_minute
    FROM public.ai_usage_events
   WHERE user_id = _user_id AND created_at >= now() - interval '1 minute';

  IF used_minute >= _minute_limit THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'minute',
                              'used_today', used_day, 'daily_limit', _daily_limit);
  END IF;
  IF used_day >= _daily_limit THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'daily',
                              'used_today', used_day, 'daily_limit', _daily_limit);
  END IF;

  INSERT INTO public.ai_usage_events (user_id, feature) VALUES (_user_id, _feature);
  RETURN jsonb_build_object('allowed', true, 'reason', null,
                            'used_today', used_day + 1, 'daily_limit', _daily_limit);
END;
$$;
REVOKE ALL ON FUNCTION public.consume_ai_quota(uuid, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_ai_quota(uuid, text, integer, integer) TO service_role;

-- ─── 8) رفع المرفقات يتبع قاعدة الإرسال نفسها (S4) ───
DROP POLICY IF EXISTS "chat media upload participant" ON storage.objects;
CREATE POLICY "chat media upload participant" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chat-media'
    AND public.can_post_in_chat(public.storage_folder_uuid(name), (SELECT auth.uid()))
    AND split_part(name, '/', 2) = (SELECT auth.uid())::text
  );
