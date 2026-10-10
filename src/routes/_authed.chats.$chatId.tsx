import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { PhoneFrame } from "@/components/zen/PhoneFrame";
import { Loader2 } from "lucide-react";
import { useSession } from "@/hooks/useSession";
import { listMessages, editMessage, MESSAGES_PAGE } from "@/lib/zen-api";
import { MAX_ATTACHMENT_BYTES, type MessageWithMedia } from "@/lib/chat-extras";
import { newOutboxItem, throttle } from "@/lib/chat-outbox";
import { chatSendErrorMessage, hasContactInfo, prepareChatImage } from "@/lib/chat-safety";
import { ChatHeader } from "@/components/chat/ChatHeader";
import { MessageItem } from "@/components/chat/MessageItem";
import { ChatTail } from "@/components/chat/ChatTail";
import { Composer } from "@/components/chat/Composer";
import { useChatData } from "@/hooks/chat/use-chat-data";
import { useVoiceRecorder } from "@/hooks/chat/use-voice-recorder";
import { useChatAi } from "@/hooks/chat/use-chat-ai";
import { useChatActions } from "@/hooks/chat/use-chat-actions";
import { useNow } from "@/hooks/useNow";
import { useConfirm } from "@/hooks/useConfirm";
import { ChatSearchBar, JumpToBottom } from "@/components/chat/ChatSearchBar";
import { ImageViewer } from "@/components/chat/ImageViewer";
import { loadDraft, saveDraft } from "@/lib/chat-search";
import { useChatNavigation } from "@/hooks/chat/use-chat-navigation";

export const Route = createFileRoute("/_authed/chats/$chatId")({
  component: ChatDetail,
});

function ChatDetail() {
  // نافذة التعديل (15 دقيقة) تُقاس بساعة تتحدّث كل دقيقة لا بـ Date.now() أثناء العرض (M12)،
  // وتحديثها يعيد رسم الأوقات النسبية («منذ دقيقة») أيضاً.
  const now = useNow();
  const { chatId } = Route.useParams();
  // الجلسة مضمونة هنا: مسار _authed يحجب الوصول غير المسجَّل قبل تحميل هذه الصفحة.
  const { userId } = useSession();
  // المسودة تبقى على الجهاز لكل محادثة وتعود عند فتحها.
  const [input, setInput] = useState(() => loadDraft(chatId));
  const [draftChat, setDraftChat] = useState(chatId);
  if (draftChat !== chatId) {
    setDraftChat(chatId);
    setInput(loadDraft(chatId));
  }
  const [viewer, setViewer] = useState<string | null>(null);
  const [confirmNode, ask] = useConfirm();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<MessageWithMedia | null>(null);
  const [editing, setEditing] = useState<MessageWithMedia | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const typingGate = useRef(throttle(2500));
  const stickToBottomRef = useRef(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const {
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
  } = useChatData(chatId, userId, setInput, setError);
  const canPost = ctx ? ctx.can_post : true;
  const { recording, recSeconds, startRecording, stopRecording } = useVoiceRecorder(
    userId,
    setError,
    (blob, seconds) => queueMedia("voice", blob, seconds),
  );
  const { aiNote, setAiNote, aiBusy, askAi } = useChatAi({
    userId,
    peer,
    messages,
    input,
    setInput,
    onBegin: () => {
      stickToBottomRef.current = true;
    },
  });

  const { toggleMute, removeMessage, copyMessage, react, report, toggleBlock } = useChatActions({
    chatId,
    messages,
    setMessages,
    setReactions,
    ctx,
    refreshCtx,
    muted,
    setMuted,
    setMenuFor,
    setNotice,
    setError,
    ask,
  });

  useEffect(() => {
    if (!editing) saveDraft(chatId, input);
  }, [chatId, input, editing]);

  const nav = useChatNavigation({ messages, userId, scrollRef, stickToBottomRef });

  const startReply = (m: MessageWithMedia) => {
    setEditing(null);
    setReplyTo(m);
    setMenuFor(null);
    inputRef.current?.focus();
  };
  const startEdit = (m: MessageWithMedia) => {
    setReplyTo(null);
    setEditing(m);
    setInput(m.content);
    setMenuFor(null);
    inputRef.current?.focus();
  };
  const canEdit = (m: MessageWithMedia) =>
    m.sender_id === userId &&
    m.type === "text" &&
    !m.deleted_at &&
    now - Date.parse(m.created_at) < 15 * 60 * 1000;

  // التمرير التلقائي للأسفل فقط إن كان المستخدم قريباً منه (لا يقفز أثناء قراءة القديم).
  useEffect(() => {
    if (!stickToBottomRef.current) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, typing, aiNote, outbox]);

  const loadOlder = async () => {
    const first = messages[0];
    if (!first || loadingOlder) return;
    setLoadingOlder(true);
    const el = scrollRef.current;
    const prevHeight = el?.scrollHeight ?? 0;
    try {
      const older = await listMessages(chatId, { before: first.created_at });
      setHasOlder(older.length >= MESSAGES_PAGE);
      stickToBottomRef.current = false;
      setMessages((m) => {
        const seen = new Set(m.map((x) => x.id));
        return [...older.filter((x) => !seen.has(x.id)), ...m];
      });
      // يبقى موضع القراءة ثابتاً بعد إضافة الرسائل الأقدم فوقه.
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - prevHeight;
      });
    } catch {
      setError("تعذّر تحميل الرسائل الأقدم.");
    } finally {
      setLoadingOlder(false);
    }
  };

  const send = async () => {
    if (!input.trim() || !userId || sending) return;
    const text = input.trim();
    if (ctx?.student_pair && hasContactInfo(text)) {
      setError("لا يُسمح بإرسال أرقام الهواتف أو الروابط بين الطلاب.");
      return;
    }
    if (editing) {
      const target = editing;
      setSending(true);
      try {
        await editMessage(target.id, text);
        setMessages((list) =>
          list.map((x) =>
            x.id === target.id ? { ...x, content: text, edited_at: new Date().toISOString() } : x,
          ),
        );
        setEditing(null);
        setInput("");
      } catch (e) {
        const msg = e instanceof Error ? e.message : String((e as { message?: string })?.message);
        setError(
          msg.includes("EDIT_WINDOW") ? "انتهت مهلة التعديل (15 دقيقة)." : chatSendErrorMessage(e),
        );
      } finally {
        setSending(false);
      }
      return;
    }
    setInput("");
    setError(null);
    stickToBottomRef.current = true;
    // إرسال متفائل: تظهر الرسالة فوراً، وتُحفظ على الجهاز حتى تصل.
    const item = newOutboxItem(chatId, text, replyTo?.id ?? null);
    setReplyTo(null);
    setOutbox((o) => [...o, item]);
    setSending(true);
    try {
      await deliver(item);
    } finally {
      setSending(false);
    }
  };

  const attach = async (file: File | null) => {
    if (!file || !userId) return;
    setError(null);
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setError("حجم الصورة أكبر من 10 ميغابايت.");
      return;
    }
    setUploading(true);
    try {
      // تصغير الصورة وحذف بيانات EXIF (ومنها الموقع) قبل الرفع.
      const image = await prepareChatImage(file);
      // عبر صندوق الوسائط (M9): تُحفظ على الجهاز وتظهر في الصادر حتى تصل.
      setUploading(false);
      await queueMedia("image", image);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر إرسال الصورة.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const onType = () => {
    if (!typingGate.current()) return;
    typingChannelRef.current?.send({
      type: "broadcast",
      event: "typing",
      payload: { user: userId },
    });
  };

  const supervising = ctx?.supervisor === true && ctx.participant === false;
  const byId = useMemo(() => new Map(messages.map((x) => [x.id, x])), [messages]);
  const reactionsOf = (id: string) => {
    const counts = new Map<string, { n: number; mine: boolean }>();
    for (const r of reactions) {
      if (r.message_id !== id) continue;
      const c = counts.get(r.emoji) ?? { n: 0, mine: false };
      c.n += 1;
      c.mine ||= r.user_id === userId;
      counts.set(r.emoji, c);
    }
    return [...counts.entries()];
  };
  const memberName = (id: string) => ctx?.members?.find((x) => x.id === id)?.name ?? "";
  const chatTitle = supervising
    ? (ctx?.members ?? []).map((x) => x.name).join(" و")
    : (peer?.name ?? "محادثة");

  return (
    <PhoneFrame>
      <div className="flex-1 flex flex-col">
        <ChatHeader
          ctx={ctx}
          peer={peer}
          chatId={chatId}
          chatTitle={chatTitle}
          supervising={supervising}
          muted={muted}
          onToggleMute={() => void toggleMute()}
          onToggleBlock={() => void toggleBlock()}
          onSearch={nav.toggleSearch}
        />
        {nav.searchOpen && (
          <ChatSearchBar
            query={nav.query}
            setQuery={nav.changeQuery}
            count={nav.hits.length}
            index={nav.index}
            onPrev={() => nav.stepHit(-1)}
            onNext={() => nav.stepHit(1)}
            onClose={nav.closeSearch}
          />
        )}
        <div className="relative flex-1 min-h-0 flex flex-col">
          <div
            ref={scrollRef}
            onScroll={nav.onScroll}
            className="flex-1 overflow-y-auto px-4 py-4 space-y-3"
          >
            {!loading && hasOlder && (
              <div className="flex justify-center">
                <button
                  onClick={() => void loadOlder()}
                  disabled={loadingOlder}
                  className="text-[0.6875rem] px-3 py-1.5 rounded-full glass text-muted-foreground disabled:opacity-60"
                >
                  {loadingOlder ? "جارٍ التحميل…" : "عرض الرسائل الأقدم"}
                </button>
              </div>
            )}
            {loading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : messages.length === 0 && outbox.length === 0 ? (
              <p className="text-center text-xs text-muted-foreground pt-10">
                لا توجد رسائل بعد. ابدأ المحادثة 🌿
              </p>
            ) : (
              messages.map((m, idx) => {
                return (
                  <MessageItem
                    key={m.id}
                    m={m}
                    prevCreatedAt={messages[idx - 1]?.created_at}
                    isLast={idx >= messages.length - 1}
                    userId={userId}
                    ctx={ctx}
                    supervising={supervising}
                    canPost={canPost}
                    replied={m.reply_to ? byId.get(m.reply_to) : undefined}
                    rx={reactionsOf(m.id)}
                    menuOpen={menuFor === m.id}
                    canEdit={canEdit(m)}
                    mediaUrls={mediaUrls}
                    refreshMedia={refreshMedia}
                    memberName={memberName}
                    onToggleMenu={() => setMenuFor((cur) => (cur === m.id ? null : m.id))}
                    onCloseMenu={() => setMenuFor(null)}
                    onReact={react}
                    onReply={startReply}
                    onCopy={copyMessage}
                    onEdit={startEdit}
                    onRemove={removeMessage}
                    onReport={report}
                    query={nav.searchOpen ? nav.query : ""}
                    active={nav.activeHit === m.id}
                    onJumpTo={nav.jumpTo}
                    onOpenImage={setViewer}
                  />
                );
              })
            )}
            <ChatTail
              outbox={outbox}
              typing={typing}
              aiBusy={aiBusy}
              aiNote={aiNote}
              onRetry={deliver}
              onCloseAi={() => setAiNote(null)}
            />
          </div>
          {!nav.atBottom && !loading && (
            <JumpToBottom count={nav.unseen} onClick={nav.scrollToBottom} />
          )}
        </div>

        <Composer
          notice={notice}
          error={error}
          canPost={canPost}
          supervising={supervising}
          ctx={ctx}
          recording={recording}
          recSeconds={recSeconds}
          replyTo={replyTo}
          editing={editing}
          uploading={uploading}
          aiBusy={aiBusy}
          sending={sending}
          input={input}
          setInput={setInput}
          inputRef={inputRef}
          fileRef={fileRef}
          onType={onType}
          onSend={send}
          onAttach={attach}
          onAskAi={askAi}
          onStartRecording={startRecording}
          onStopRecording={stopRecording}
          onCancelTarget={() => {
            if (editing) setInput("");
            setEditing(null);
            setReplyTo(null);
          }}
        />
        <ImageViewer src={viewer} onClose={() => setViewer(null)} />
        {confirmNode}
      </div>
    </PhoneFrame>
  );
}
