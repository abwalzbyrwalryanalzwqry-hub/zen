-- الإشعارات الفورية 1.16.1: «إرسال إشعار تجريبي» من الإعدادات يمرّ بالسلسلة كاملة
-- (notifications ← enqueue_push ← push_outbox ← zen-push-dispatch ← FCM ← الجهاز) فيتأكد المستخدم أن
-- الإشعار يصل بصوت جواله والتطبيق مغلق. للمستخدم نفسه فقط، وله جهاز مسجَّل، وحدّه إشعار كل 30 ثانية،
-- ويتجاوز ساعات الهدوء وتفضيل الفئات (طلبه بنفسه الآن).

CREATE OR REPLACE FUNCTION public.send_test_push(_title text, _body text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := (SELECT auth.uid());
  nid uuid;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.native_push_tokens t WHERE t.user_id = caller) THEN
    RAISE EXCEPTION 'NO_DEVICE';
  END IF;
  IF EXISTS (SELECT 1 FROM public.notifications n
              WHERE n.user_id = caller AND n.kind = 'push_test'
                AND n.created_at > now() - interval '30 seconds') THEN
    RAISE EXCEPTION 'RATE_LIMITED';
  END IF;

  INSERT INTO public.notifications (user_id, kind, title, body, link)
  VALUES (caller, 'push_test',
          left(coalesce(nullif(btrim(_title), ''), 'زِن'), 120),
          left(coalesce(nullif(btrim(_body), ''), ''), 240),
          '/settings/notifications')
  RETURNING id INTO nid;

  -- المشغّل enqueue_push يضعه في الصندوق إن سمحت التفضيلات؛ التجربة تُرسل الآن على أي حال.
  IF EXISTS (SELECT 1 FROM public.push_outbox o WHERE o.notification_id = nid) THEN
    UPDATE public.push_outbox SET send_after = now() WHERE notification_id = nid;
  ELSE
    INSERT INTO public.push_outbox (user_id, notification_id, category, title, body, url, send_after)
    SELECT caller, nid, 'general', n.title, n.body, n.link, now() FROM public.notifications n WHERE n.id = nid;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.send_test_push(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_test_push(text, text) TO authenticated;
