-- ═══════════════════════════════════════════════════════════════════════════
-- تطوير المحادثات — المرحلة 2: الاعتمادية والأداء والإشعارات
-- (docs/CHAT_AI_ROADMAP.md — البنود F2 وF3 وF8 وR1 وS9)
--
--   F2   إشعار (ومنه الإشعار الفوري عبر push_outbox القائم) لكل رسالة خاصة، مجمَّع: الرسائل
--        المتتالية تحدّث الإشعار غير المقروء نفسه ولا تُنشئ إشعاراً جديداً، ولا إشعار لمن يقرأ
--        المحادثة الآن، مع كتم محادثة (chat_mutes).
--   F3   client_id: معرّف يولّده العميل للإرسال المتفائل، فلا تتكرر الرسالة عند إعادة المحاولة.
--   F8/R1 my_inbox(): صندوق الوارد كاملاً (الطرف الآخر، وآخر رسالة، وغير المقروء، والكتم) في
--        استدعاء واحد بدل ثلاثة طلبات وإعادة تحميل كاملة مع كل رسالة.
--   S9   بحث عربي مطبَّع (بلا تشكيل، مع توحيد الألف والياء والتاء المربوطة) داخل محادثاتي فقط.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1) الكتم ───
CREATE TABLE IF NOT EXISTS public.chat_mutes (
  chat_id uuid NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  until timestamptz NOT NULL,
  PRIMARY KEY (chat_id, user_id)
);
ALTER TABLE public.chat_mutes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chat_mutes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.chat_mutes TO authenticated;
GRANT ALL ON public.chat_mutes TO service_role;
DROP POLICY IF EXISTS "read own mutes" ON public.chat_mutes;
CREATE POLICY "read own mutes" ON public.chat_mutes
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

-- _hours = 0 يرفع الكتم؛ الحد الأعلى سنة.
CREATE OR REPLACE FUNCTION public.set_chat_mute(_chat_id uuid, _hours integer)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _until timestamptz;
BEGIN
  IF NOT public.is_chat_participant(_chat_id, auth.uid()) THEN RAISE EXCEPTION 'NOT_ALLOWED'; END IF;
  IF COALESCE(_hours, 0) <= 0 THEN
    DELETE FROM public.chat_mutes WHERE chat_id = _chat_id AND user_id = auth.uid();
    RETURN NULL;
  END IF;
  _until := now() + make_interval(hours => LEAST(_hours, 8760));
  INSERT INTO public.chat_mutes (chat_id, user_id, until) VALUES (_chat_id, auth.uid(), _until)
  ON CONFLICT (chat_id, user_id) DO UPDATE SET until = EXCLUDED.until;
  RETURN _until;
END;
$$;
REVOKE ALL ON FUNCTION public.set_chat_mute(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_chat_mute(uuid, integer) TO authenticated;

-- ─── 2) إشعار الرسالة الخاصة (F2) ───
CREATE OR REPLACE FUNCTION public.notify_chat_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _c public.chats;
  _to uuid;
  _name text;
  _body text;
  _link text := '/chats/' || NEW.chat_id;
BEGIN
  IF NEW.type NOT IN ('text', 'image', 'voice') THEN RETURN NEW; END IF;
  SELECT * INTO _c FROM public.chats WHERE id = NEW.chat_id;
  SELECT COALESCE(name, 'رسالة جديدة') INTO _name FROM public.profiles WHERE id = NEW.sender_id;
  _body := CASE NEW.type WHEN 'image' THEN '📷 صورة' WHEN 'voice' THEN '🎤 رسالة صوتية'
                         ELSE left(NEW.content, 140) END;

  FOREACH _to IN ARRAY _c.participants LOOP
    CONTINUE WHEN _to = NEW.sender_id;
    -- مكتومة؟
    CONTINUE WHEN EXISTS (SELECT 1 FROM public.chat_mutes
                           WHERE chat_id = NEW.chat_id AND user_id = _to AND until > now());
    -- يقرأ المحادثة الآن (علّمها مقروءة خلال آخر 20 ثانية)؟
    CONTINUE WHEN EXISTS (SELECT 1 FROM public.chat_reads
                           WHERE chat_id = NEW.chat_id AND user_id = _to
                             AND last_read_at > now() - interval '20 seconds');
    -- تجميع: إشعار غير مقروء لهذه المحادثة خلال آخر 30 دقيقة يُحدَّث ولا يتكرر.
    UPDATE public.notifications
       SET body = _body, title = _name
     WHERE id = (SELECT id FROM public.notifications
                  WHERE user_id = _to AND kind = 'chat_message' AND link = _link
                    AND read = false AND created_at > now() - interval '30 minutes'
                  ORDER BY created_at DESC LIMIT 1);
    IF NOT FOUND THEN
      INSERT INTO public.notifications (user_id, kind, title, body, link)
      VALUES (_to, 'chat_message', _name, _body, _link);
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS messages_notify ON public.messages;
CREATE TRIGGER messages_notify
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_chat_message();

-- فتح المحادثة يعلّم إشعاراتها مقروءة.
CREATE OR REPLACE FUNCTION public.read_chat_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.notifications SET read = true
   WHERE user_id = NEW.user_id AND kind = 'chat_message'
     AND link = '/chats/' || NEW.chat_id AND read = false;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS chat_reads_clear_notifications ON public.chat_reads;
CREATE TRIGGER chat_reads_clear_notifications
  AFTER INSERT OR UPDATE ON public.chat_reads
  FOR EACH ROW EXECUTE FUNCTION public.read_chat_notifications();

-- ─── 3) الإرسال المتفائل بلا تكرار (F3) ───
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS client_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS messages_sender_client_uniq
  ON public.messages (sender_id, client_id) WHERE client_id IS NOT NULL;
GRANT INSERT (client_id) ON public.messages TO authenticated;

-- ─── 4) صندوق الوارد في استدعاء واحد (F8، R1) ───
CREATE OR REPLACE FUNCTION public.my_inbox()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(row ORDER BY (row ->> 'updated_at') DESC), '[]'::jsonb)
    FROM (
      SELECT jsonb_build_object(
               'id', c.id,
               'participants', c.participants,
               'is_group', c.is_group,
               'title', c.title,
               'last_message', c.last_message,
               'last_sender', c.last_sender,
               'updated_at', c.updated_at,
               'peer', (SELECT jsonb_build_object('id', p.id, 'name', p.name, 'avatar', p.avatar,
                                                  'role', p.role)
                          FROM public.profiles p
                         WHERE p.id = (SELECT x FROM unnest(c.participants) x
                                        WHERE x <> auth.uid() LIMIT 1)),
               'unread', (SELECT count(*) FROM public.messages m
                           WHERE m.chat_id = c.id AND m.sender_id <> auth.uid()
                             AND m.created_at > COALESCE(r.last_read_at, 'epoch'::timestamptz)),
               'muted', EXISTS (SELECT 1 FROM public.chat_mutes mu
                                 WHERE mu.chat_id = c.id AND mu.user_id = auth.uid()
                                   AND mu.until > now())
             ) AS row
        FROM public.chats c
        LEFT JOIN public.chat_reads r ON r.chat_id = c.id AND r.user_id = auth.uid()
       WHERE auth.uid() = ANY (c.participants)
    ) t
$$;
REVOKE ALL ON FUNCTION public.my_inbox() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_inbox() TO authenticated;

-- ─── 5) بحث عربي مطبَّع داخل محادثاتي (S9) ───
CREATE OR REPLACE FUNCTION public.normalize_ar(_t text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT lower(translate(
           regexp_replace(COALESCE(_t, ''), '[\u064B-\u065F\u0670\u0640]', '', 'g'),
           'أإآٱىةؤئ', 'اااايهوي'))
$$;
GRANT EXECUTE ON FUNCTION public.normalize_ar(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.search_my_messages(_q text, _limit integer DEFAULT 30)
RETURNS SETOF public.messages
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.*
    FROM public.messages m
    JOIN public.chats c ON c.id = m.chat_id
   WHERE auth.uid() = ANY (c.participants)
     AND m.type = 'text'
     AND char_length(btrim(COALESCE(_q, ''))) >= 2
     AND public.normalize_ar(m.content) LIKE
         '%' || replace(replace(replace(public.normalize_ar(btrim(_q)), '\', '\\'), '%', '\%'), '_', '\_') || '%'
   ORDER BY m.created_at DESC
   LIMIT LEAST(GREATEST(COALESCE(_limit, 30), 1), 100)
$$;
REVOKE ALL ON FUNCTION public.search_my_messages(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_my_messages(text, integer) TO authenticated;
