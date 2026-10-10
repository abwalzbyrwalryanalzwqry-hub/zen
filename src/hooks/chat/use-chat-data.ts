import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  listMessages,
  sendMessage,
  listReactions,
  type Reaction,
  MESSAGES_PAGE,
  getProfile,
  type Profile,
} from "@/lib/zen-api";
import {
  markChatSeen,
  chatMediaUrl,
  mediaExt,
  sendMediaMessage,
  uploadChatMediaAt,
  type MessageWithMedia,
} from "@/lib/chat-extras";
import {
  OUTBOX_MAX_AGE_MS,
  isPermanentSendError,
  newOutboxItem,
  readOutbox,
  reconcileOutbox,
  writeOutbox,
  type OutboxItem,
} from "@/lib/chat-outbox";
import {
  deliverMedia,
  mediaStore,
  pendingLabel,
  pruneMedia,
  type MediaKind,
  type MediaSender,
} from "@/lib/chat-media-outbox";

const MEDIA_SENDER: MediaSender = {
  upload: uploadChatMediaAt,
  ext: mediaExt,
  insert: (r) =>
    sendMediaMessage({
      chatId: r.chat_id,
      senderId: r.sender_id,
      kind: r.kind,
      mediaPath: r.media_path,
      durationSeconds: r.duration,
      clientId: r.client_id,
    }),
};
import { chatSendErrorMessage, getChatContext, type ChatContext } from "@/lib/chat-safety";
import { useLatest } from "@/hooks/use-latest";

/**
 * بيانات المحادثة (المرحلة 7.6): الرسائل والطرف الآخر والسياق، والبث اللحظي والكتابة الجارية،
 * والصادر على الجهاز وإعادة إرساله، والتفاعلات، والكتم، وروابط المرفقات الموقّتة، وتعليم المقروء.
 * منقول حرفياً من شاشة المحادثة.
 */
export function useChatData(
  chatId: string,
  userId: string | null | undefined,
  setInput: (f: (cur: string) => string) => void,
  setError: (e: string | null) => void,
) {
  const [messages, setMessages] = useState<MessageWithMedia[]>([]);
  const [peer, setPeer] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [typing, setTyping] = useState(false);
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const [hasOlder, setHasOlder] = useState(false);
  const [ctx, setCtx] = useState<ChatContext | null>(null);
  const [outbox, setOutbox] = useState<OutboxItem[]>([]);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [muted, setMuted] = useState(false);
  const refreshCtx = () => getChatContext(chatId).then((c) => c && setCtx(c));
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Load chat + messages + realtime
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    (async () => {
      const { data: chat } = await supabase
        .from("chats")
        .select("*")
        .eq("id", chatId)
        .maybeSingle();
      if (cancelled) return;
      const otherId = (chat?.participants as string[] | undefined)?.find(
        (p: string) => p !== userId,
      );
      if (otherId) setPeer(await getProfile(otherId).catch(() => null));
      const [msgs, context] = await Promise.all([
        listMessages(chatId).catch(() => [] as MessageWithMedia[]),
        getChatContext(chatId),
      ]);
      if (!cancelled) {
        setMessages(msgs);
        setHasOlder(msgs.length >= MESSAGES_PAGE);
        if (context) setCtx(context);
        setOutbox(reconcileOutbox(readOutbox(chatId), msgs));
        setLoading(false);
      }
    })();

    const channel = supabase
      .channel(`chat-${chatId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `chat_id=eq.${chatId}` },
        (payload) => {
          setMessages((m) => {
            const row = payload.new as MessageWithMedia;
            if (m.some((x) => x.id === row.id)) return m;
            return [...m, row];
          });
        },
      )
      // تحديث حالة الرسالة (sent ⇒ seen) حتى تظهر ✓✓ لحظياً عند قراءة الطرف الآخر
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: `chat_id=eq.${chatId}` },
        (payload) => {
          const row = payload.new as MessageWithMedia;
          setMessages((m) => m.map((x) => (x.id === row.id ? { ...x, ...row } : x)));
        },
      )
      .on("broadcast", { event: "typing" }, (msg) => {
        if (msg.payload?.user !== userId) {
          setTyping(true);
          setTimeout(() => setTyping(false), 2000);
        }
      })
      .subscribe();
    typingChannelRef.current = channel;

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [chatId, userId]);

  // الصندوق الصادر: يُحفظ على الجهاز، ويُحذف منه ما وصل، ويُعاد إرسال الفاشل عند عودة الاتصال.
  useEffect(() => {
    if (!loading) writeOutbox(chatId, outbox);
  }, [chatId, outbox, loading]);
  // ما وصل من الصندوق يُحذف منه عند تغيّر الرسائل — أثناء العرض لا في أثر (M12).
  const [reconciledFor, setReconciledFor] = useState(messages);
  if (reconciledFor !== messages) {
    setReconciledFor(messages);
    setOutbox((o) => {
      const next = reconcileOutbox(o, messages);
      return next.length === o.length ? o : next;
    });
  }

  const deliver = async (item: OutboxItem) => {
    if (!userId) return;
    setOutbox((o) =>
      o.map((x) => (x.client_id === item.client_id ? { ...x, status: "sending" } : x)),
    );
    try {
      if (item.kind) await deliverMedia(item, userId, MEDIA_SENDER);
      else await sendMessage(chatId, userId, item.content, item.client_id, item.reply_to);
      // الإدراج نجح؛ إن تأخر البث اللحظي نجلب آخر الرسائل حتى يختفي المؤقت.
      setTimeout(() => {
        setOutbox((o) => {
          if (!o.some((x) => x.client_id === item.client_id)) return o;
          listMessages(chatId)
            .then((latest) =>
              setMessages((m) => {
                const seen = new Set(m.map((x) => x.id));
                return [...m, ...latest.filter((x) => !seen.has(x.id))];
              }),
            )
            .catch(() => {});
          return o;
        });
      }, 3000);
    } catch (e) {
      const mediaGone =
        !!item.kind &&
        /MEDIA_MISSING|UNSUPPORTED_MEDIA|10 ميغابايت/.test(String((e as Error)?.message));
      if (isPermanentSendError(e) || mediaGone) {
        // رفض دائم: تُزال من الصادر وتعود إلى حقل الكتابة مع السبب.
        setOutbox((o) => o.filter((x) => x.client_id !== item.client_id));
        if (item.kind)
          void mediaStore()
            .delete(item.client_id)
            .catch(() => undefined);
        else setInput((cur) => cur || item.content);
        setError(chatSendErrorMessage(e));
        void refreshCtx();
      } else {
        setOutbox((o) =>
          o.map((x) => (x.client_id === item.client_id ? { ...x, status: "failed" } : x)),
        );
      }
    }
  };

  /** صورة أو رسالة صوتية: تُحفظ على الجهاز أولاً، ثم تُرسل الآن أو عند عودة الاتصال (M9). */
  const queueMedia = async (kind: MediaKind, blob: Blob, duration: number | null = null) => {
    const item = newOutboxItem(chatId, pendingLabel(kind), null, kind);
    try {
      await mediaStore().put({
        client_id: item.client_id,
        blob,
        duration,
        created_at: item.created_at,
      });
    } catch {
      // بلا IndexedDB (نادر): إرسال مباشر دون حفظ.
    }
    setOutbox((o) => [...o, item]);
    await deliver(item);
  };

  useEffect(() => {
    void pruneMedia(OUTBOX_MAX_AGE_MS).catch(() => undefined);
  }, []);

  const outboxRef = useLatest(outbox);
  useEffect(() => {
    if (loading) return;
    const retry = () => outboxRef.current.filter((x) => x.status === "failed").forEach(deliver);
    retry();
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, chatId]);

  useEffect(() => {
    if (!userId) return;
    supabase
      .from("chat_mutes")
      .select("until")
      .eq("chat_id", chatId)
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => setMuted(!!data && Date.parse(data.until) > Date.now()));
  }, [chatId, userId]);

  // التفاعلات: تُجلب للرسائل المعروضة وتُحدَّث لحظياً.
  const idsKey = messages.map((x) => x.id).join(",");
  useEffect(() => {
    if (!idsKey) return;
    let alive = true;
    listReactions(idsKey.split(",")).then((r) => alive && setReactions(r));
    return () => {
      alive = false;
    };
  }, [idsKey]);
  useEffect(() => {
    const ch = supabase
      .channel(`reactions-${chatId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "message_reactions" }, () => {
        const ids = idsKey ? idsKey.split(",") : [];
        if (ids.length) listReactions(ids).then(setReactions);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [chatId, idsKey]);

  // تعليم المحادثة مقروءة عند فتحها وعند وصول رسالة جديدة من الطرف الآخر
  const incomingCount = messages.filter((m) => m.sender_id !== userId).length;
  useEffect(() => {
    if (!userId || loading) return;
    markChatSeen(chatId).catch(() => {
      /* ليست حرجة: الشارة ستُصحّح في الزيارة التالية */
    });
  }, [chatId, userId, loading, incomingCount]);

  // روابط موقّتة لمرفقات الرسائل (الحاوية خاصة)
  useEffect(() => {
    const missing = messages
      .map((m) => m.media_path)
      .filter((p): p is string => !!p && !mediaUrls[p]);
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      const pairs = await Promise.all(
        missing.map(async (path) => [path, await chatMediaUrl(path)] as const),
      );
      if (cancelled) return;
      setMediaUrls((prev) => {
        const next = { ...prev };
        for (const [path, url] of pairs) if (url) next[path] = url;
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [messages, mediaUrls]);

  // الرابط الموقّت انتهى (بعد ساعة): نطلب رابطاً جديداً مرة واحدة لكل مسار.
  const refreshedRef = useRef<Set<string>>(new Set());
  const refreshMedia = (path: string) => {
    if (refreshedRef.current.has(path)) return;
    refreshedRef.current.add(path);
    chatMediaUrl(path).then((url) => url && setMediaUrls((u) => ({ ...u, [path]: url })));
  };

  return {
    messages,
    setMessages,
    peer,
    loading,
    typing,
    hasOlder,
    setHasOlder,
    ctx,
    refreshCtx,
    outbox,
    setOutbox,
    deliver,
    queueMedia,
    typingChannelRef,
    reactions,
    setReactions,
    muted,
    setMuted,
    mediaUrls,
    refreshMedia,
  };
}
