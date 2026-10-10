-- ════════════════════════════════════════════════════════════════════════════
-- المرحلة 9.5 — جدولة رسائل الغرف
-- ════════════════════════════════════════════════════════════════════════════
-- مشرف الغرفة (المعلّم) يكتب رسالة ويحدّد وقتها؛ مهمة pg_cron كل 5 دقائق تنشرها باسمه عبر
-- post_room_message نفسها (الصلاحيات والإشعارات نفسها وقت النشر لا وقت الجدولة).
--  - مرة واحدة فقط: الصف يُقفل (FOR UPDATE SKIP LOCKED) وتتغيّر حالته في المعاملة نفسها التي تنشر.
--  - إن لم يعد المرسل مشرفاً أو أُغلقت الغرفة: failed بسببه، ولا يُعاد.
--  - حدّ الإرسال (10/دقيقة): يبقى pending للدورة التالية.

CREATE TABLE IF NOT EXISTS public.room_scheduled_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.halaqa_rooms(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
  scheduled_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'cancelled', 'failed')),
  sent_message_id uuid REFERENCES public.room_messages(id) ON DELETE SET NULL,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
CREATE INDEX IF NOT EXISTS room_scheduled_due_idx ON public.room_scheduled_messages (scheduled_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS room_scheduled_room_idx ON public.room_scheduled_messages (room_id, scheduled_at);
ALTER TABLE public.room_scheduled_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.room_scheduled_messages FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.room_scheduled_messages TO service_role;

CREATE OR REPLACE FUNCTION public.schedule_room_message(_room uuid, _content text, _at timestamptz)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := (SELECT auth.uid());
  t text := btrim(COALESCE(_content, ''));
  id uuid;
BEGIN
  IF caller IS NULL OR public.room_role(caller, _room) IS DISTINCT FROM 'mod' THEN
    RAISE EXCEPTION 'NOT_ROOM_MOD';
  END IF;
  IF char_length(t) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'MESSAGE_LENGTH'; END IF;
  IF _at IS NULL OR _at < now() + interval '2 minutes' OR _at > now() + interval '30 days' THEN
    RAISE EXCEPTION 'INVALID_TIME';
  END IF;
  IF (SELECT count(*) FROM public.room_scheduled_messages WHERE room_id = _room AND status = 'pending') >= 20 THEN
    RAISE EXCEPTION 'TOO_MANY_SCHEDULED';
  END IF;
  INSERT INTO public.room_scheduled_messages (room_id, sender_id, content, scheduled_at)
  VALUES (_room, caller, t, _at) RETURNING room_scheduled_messages.id INTO id;
  RETURN id;
END;
$$;
REVOKE ALL ON FUNCTION public.schedule_room_message(uuid, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.schedule_room_message(uuid, text, timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_scheduled_room_message(_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := (SELECT auth.uid());
  n int;
BEGIN
  UPDATE public.room_scheduled_messages s
     SET status = 'cancelled', processed_at = now()
   WHERE s.id = _id AND s.status = 'pending'
     AND (s.sender_id = caller OR public.room_role(caller, s.room_id) = 'mod');
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n = 1;
END;
$$;
REVOKE ALL ON FUNCTION public.cancel_scheduled_room_message(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_scheduled_room_message(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.room_scheduled_list(_room uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.room_role((SELECT auth.uid()), _room) IS DISTINCT FROM 'mod' THEN RAISE EXCEPTION 'NOT_ROOM_MOD'; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id', s.id, 'content', s.content, 'scheduled_at', s.scheduled_at,
                                        'status', s.status, 'error', s.error) ORDER BY s.scheduled_at)
      FROM public.room_scheduled_messages s
     WHERE s.room_id = _room
       AND (s.status = 'pending' OR s.processed_at > now() - interval '7 days')
  ), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.room_scheduled_list(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.room_scheduled_list(uuid) TO authenticated;

-- ينشر المستحق. آمن للتكرار والتزامن: كل صف يُقفل ويُعلَّم في المعاملة نفسها.
CREATE OR REPLACE FUNCTION public.room_schedule_tick(_limit int DEFAULT 100)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.room_scheduled_messages;
  mid uuid;
  sent int := 0;
  failed int := 0;
  prev text := current_setting('request.jwt.claim.sub', true);
BEGIN
  FOR s IN
    SELECT * FROM public.room_scheduled_messages
     WHERE status = 'pending' AND scheduled_at <= now()
     ORDER BY scheduled_at
     LIMIT _limit
     FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      -- النشر باسم المرسل: post_room_message تتحقّق من صلاحياته الحالية.
      PERFORM set_config('request.jwt.claim.sub', s.sender_id::text, true);
      mid := public.post_room_message(s.room_id, s.content);
      UPDATE public.room_scheduled_messages
         SET status = 'sent', sent_message_id = mid, processed_at = now(), error = NULL
       WHERE id = s.id;
      sent := sent + 1;
    EXCEPTION WHEN others THEN
      IF SQLERRM = 'rate limit' THEN
        NULL; -- يبقى للدورة التالية
      ELSE
        UPDATE public.room_scheduled_messages
           SET status = 'failed', error = left(SQLERRM, 200), processed_at = now()
         WHERE id = s.id;
        failed := failed + 1;
      END IF;
    END;
  END LOOP;
  PERFORM set_config('request.jwt.claim.sub', COALESCE(prev, ''), true);
  RETURN jsonb_build_object('sent', sent, 'failed', failed);
END;
$$;
REVOKE ALL ON FUNCTION public.room_schedule_tick(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.room_schedule_tick(int) TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('zen-room-schedule', '*/5 * * * *', 'SELECT public.room_schedule_tick()');
  END IF;
END
$$;
