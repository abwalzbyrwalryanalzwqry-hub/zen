import { createFileRoute } from "@tanstack/react-router";
import { track } from "@/lib/usage";
import { useEffect, useRef, useState } from "react";
import { PhoneFrame } from "@/components/zen/PhoneFrame";
import { BackButton } from "@/components/zen/BackButton";
import { BottomNav } from "@/components/zen/BottomNav";
import { AiMarkdown } from "@/components/zen/AiMarkdown";
import { AiContextConsent } from "@/components/zen/assistant/AiContextConsent";
import { TextAiConsentStatus } from "@/components/zen/ai/TextAiConsentDialog";
import {
  Sparkles,
  Send,
  BookOpen,
  FileText,
  HelpCircle,
  Wand2,
  Square,
  Copy,
  RotateCw,
  ThumbsUp,
  ThumbsDown,
  History,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import {
  askStream,
  deleteConversation,
  listConversations,
  loadConversation,
  myAiUsage,
  rateMessage,
  DAILY_CHAT_LIMIT,
  type AiConversation,
} from "@/lib/assistant-client";
import { timeAgo } from "@/lib/zen-api";

export const Route = createFileRoute("/_authed/assistant")({
  component: Assistant,
});

const suggestions = [
  { icon: BookOpen, text: "اشرح لي معنى سورة الفاتحة" },
  { icon: FileText, text: "أعطني نصائح لتنظيم الحفظ اليومي" },
  { icon: HelpCircle, text: "ما حكم النون الساكنة قبل الياء؟" },
  { icon: Wand2, text: "اقترح خطة حفظ لجزء عمّ" },
];

type M = {
  id?: string;
  from: "me" | "ai";
  text: string;
  error?: boolean;
  rating?: number | null;
  /** رد يُبث الآن (12.1). */
  stream?: string;
};

const WELCOME: M = {
  from: "ai",
  text: "السلام عليكم\nأنا مساعد زِن. أشرح الآيات والتجويد، وأقترح خطط الحفظ، وأجيب عن أسئلتك. نص الآيات يُعرض دائماً من المصحف المضمَّن.",
};

function Assistant() {
  const [messages, setMessages] = useState<M[]>([WELCOME]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [used, setUsed] = useState<number | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<AiConversation[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  // رقم الطلب الجاري: «إيقاف» يتجاهل ردّه عند وصوله.
  const reqRef = useRef(0);
  // يلغي البث الجاري فعلاً (12.1).
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    myAiUsage()
      .then(setUsed)
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, thinking, streaming]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 2000);
    return () => clearTimeout(t);
  }, [notice]);

  const remaining = used === null ? null : Math.max(0, DAILY_CHAT_LIMIT - used);

  const run = async (payload: { message?: string; regenerate?: boolean }) => {
    const req = ++reqRef.current;
    const key = `stream-${req}`;
    const ac = new AbortController();
    abortRef.current = ac;
    let acc = "";
    setThinking(true);
    setStreaming(false);
    const upsert = (text: string, patch: Partial<M> = {}) =>
      setMessages((m) => {
        const i = m.findIndex((x) => x.stream === key);
        const next: M = { from: "ai", text, stream: key, ...patch };
        if (i < 0) return [...m, next];
        const copy = m.slice();
        copy[i] = { ...copy[i], ...next };
        return copy;
      });
    track("assistant_ask");
    try {
      const r = await askStream(
        { conversationId, ...payload },
        {
          onStart: (id) => req === reqRef.current && setConversationId(id),
          onDelta: (t) => {
            if (req !== reqRef.current) return;
            acc += t;
            setStreaming(true);
            upsert(acc);
          },
        },
        ac.signal,
      );
      if (req !== reqRef.current) return;
      setConversationId(r.conversationId);
      setUsed(DAILY_CHAT_LIMIT - r.remaining);
      upsert(r.text, { id: r.messageId, stream: undefined });
    } catch (e) {
      if (req !== reqRef.current || ac.signal.aborted) return;
      const msg = e instanceof Error ? e.message : "تعذّر الاتصال بالمساعد.";
      setMessages((m) => [
        ...m.filter((x) => x.stream !== key),
        { from: "ai", text: msg, error: true },
      ]);
    } finally {
      if (req === reqRef.current) {
        setThinking(false);
        setStreaming(false);
      }
    }
  };

  const send = (text: string) => {
    const q = text.trim();
    if (!q || thinking) return;
    setMessages((m) => [...m.filter((x) => !x.error), { from: "me", text: q }]);
    setInput("");
    void run({ message: q });
  };

  const stop = () => {
    abortRef.current?.abort();
    reqRef.current++;
    setThinking(false);
    setStreaming(false);
    // ما ظهر من الرد يبقى (ويحفظه الخادم)، ويُعلَّم بأنه موقوف.
    setMessages((m) =>
      m.map((x) => (x.stream ? { ...x, stream: undefined, text: `${x.text}\n\n(أُوقف الرد)` } : x)),
    );
    setNotice("أُوقف الرد.");
  };

  const regenerate = () => {
    if (thinking || !conversationId) return;
    setMessages((m) => {
      const copy = m.filter((x) => !x.error);
      if (copy[copy.length - 1]?.from === "ai") copy.pop();
      return copy;
    });
    void run({ regenerate: true });
  };

  const rate = async (m: M, value: 1 | -1) => {
    if (!m.id) return;
    const next = m.rating === value ? null : value;
    try {
      await rateMessage(m.id, next);
      setMessages((list) => list.map((x) => (x.id === m.id ? { ...x, rating: next } : x)));
      if (next) setNotice("شكراً على تقييمك.");
    } catch {
      setNotice("تعذّر حفظ التقييم.");
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text.replace(/\[\[([^\]]+)\]\]/g, "($1)"));
      setNotice("نُسخ الرد.");
    } catch {
      setNotice("تعذّر النسخ.");
    }
  };

  const openHistory = async () => {
    setShowHistory(true);
    setHistory(await listConversations());
  };
  const openConversation = async (c: AiConversation) => {
    reqRef.current++;
    setThinking(false);
    const msgs = await loadConversation(c.id);
    setConversationId(c.id);
    setMessages([
      WELCOME,
      ...msgs.map((x) => ({
        id: x.id,
        from: x.role === "user" ? ("me" as const) : ("ai" as const),
        text: x.content,
        rating: x.rating,
      })),
    ]);
    setShowHistory(false);
  };
  const newConversation = () => {
    reqRef.current++;
    setThinking(false);
    setConversationId(null);
    setMessages([WELCOME]);
    setShowHistory(false);
  };
  const removeConversation = async (c: AiConversation) => {
    if (!window.confirm("حذف هذه المحادثة نهائياً؟")) return;
    await deleteConversation(c.id);
    setHistory((h) => h.filter((x) => x.id !== c.id));
    if (c.id === conversationId) newConversation();
  };

  const lastAiIndex = messages.map((m) => m.from).lastIndexOf("ai");

  return (
    <PhoneFrame>
      <div className="flex-1 flex flex-col">
        <header className="px-5 pt-12 pb-3 flex items-center gap-3">
          <BackButton fallback="/more" />
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center glow-primary">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-black text-foreground flex items-center gap-2">
              مساعد زِن
              <span className="text-[0.625rem] text-gold px-2 py-0.5 rounded-full bg-gold/10 font-medium">
                AI
              </span>
            </h1>
            <p className="text-[0.6875rem] text-muted-foreground">
              {remaining === null
                ? "ذكاء اصطناعي تعليمي"
                : `بقي لك ${remaining} من ${DAILY_CHAT_LIMIT} سؤالاً اليوم`}
            </p>
          </div>
          <button
            onClick={newConversation}
            aria-label="محادثة جديدة"
            className="w-10 h-10 rounded-2xl glass flex items-center justify-center"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            onClick={() => void openHistory()}
            aria-label="المحادثات السابقة"
            className="w-10 h-10 rounded-2xl glass flex items-center justify-center"
          >
            <History className="w-4 h-4" />
          </button>
        </header>
        <div className="px-4 pb-2">
          <TextAiConsentStatus />
        </div>
        <AiContextConsent />

        {showHistory && (
          <div className="mx-4 mb-2 glass-strong rounded-3xl p-3 max-h-72 overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold">المحادثات السابقة</p>
              <button
                onClick={() => setShowHistory(false)}
                aria-label="إغلاق"
                className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-accent"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            {history.length === 0 ? (
              <p className="text-[0.6875rem] text-muted-foreground py-3 text-center">
                لا توجد محادثات محفوظة بعد.
              </p>
            ) : (
              history.map((c) => (
                <div key={c.id} className="flex items-center gap-2 py-1">
                  <button
                    onClick={() => void openConversation(c)}
                    className="flex-1 text-right rounded-xl px-2 py-1.5 hover:bg-accent/60 min-w-0"
                  >
                    <p className="text-xs truncate">{c.title}</p>
                    <p className="text-[0.625rem] text-muted-foreground">{timeAgo(c.updated_at)}</p>
                  </button>
                  <button
                    onClick={() => void removeConversation(c)}
                    aria-label="حذف المحادثة"
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 pt-2 space-y-3">
          {messages.map((m, i) => (
            <div
              key={m.id ?? i}
              className={`flex flex-col ${m.from === "me" ? "items-start" : "items-end"} anim-float-in`}
            >
              <div
                className={`max-w-[88%] rounded-3xl px-4 py-3 ${
                  m.from === "me"
                    ? "bg-primary text-primary-foreground rounded-br-md"
                    : m.error
                      ? "glass border border-destructive/40 rounded-bl-md"
                      : "glass-strong border-gold/30 rounded-bl-md"
                }`}
              >
                {m.from === "ai" && (
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Sparkles className="w-3 h-3 text-gold" />
                    <span className="text-[0.625rem] font-medium text-gold">مساعد زِن</span>
                  </div>
                )}
                {m.from === "ai" && !m.error ? (
                  <AiMarkdown text={m.text} />
                ) : (
                  <p className="text-sm leading-relaxed whitespace-pre-line">{m.text}</p>
                )}
              </div>
              {m.from === "ai" && i > 0 && !m.error && !m.stream && (
                <div className="flex items-center gap-1 mt-1">
                  <IconBtn label="نسخ" onClick={() => void copy(m.text)}>
                    <Copy className="w-3.5 h-3.5" />
                  </IconBtn>
                  {m.id && (
                    <>
                      <IconBtn
                        label="رد مفيد"
                        active={m.rating === 1}
                        onClick={() => void rate(m, 1)}
                      >
                        <ThumbsUp className="w-3.5 h-3.5" />
                      </IconBtn>
                      <IconBtn
                        label="رد غير مفيد"
                        active={m.rating === -1}
                        onClick={() => void rate(m, -1)}
                      >
                        <ThumbsDown className="w-3.5 h-3.5" />
                      </IconBtn>
                    </>
                  )}
                  {i === lastAiIndex && conversationId && !thinking && (
                    <IconBtn label="إعادة توليد الرد" onClick={regenerate}>
                      <RotateCw className="w-3.5 h-3.5" />
                    </IconBtn>
                  )}
                </div>
              )}
              {m.error && i === messages.length - 1 && conversationId && (
                <button
                  onClick={regenerate}
                  className="mt-1 text-[0.6875rem] text-primary inline-flex items-center gap-1"
                >
                  <RotateCw className="w-3 h-3" /> أعد المحاولة
                </button>
              )}
            </div>
          ))}
          {thinking && !streaming && (
            <div className="flex justify-end">
              <div className="glass-strong rounded-3xl px-4 py-3 flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-gold" />
                <span className="text-xs text-muted-foreground">يفكر</span>
                <span className="w-1.5 h-1.5 rounded-full bg-gold anim-typing-dot" />
                <span
                  className="w-1.5 h-1.5 rounded-full bg-gold anim-typing-dot"
                  style={{ animationDelay: "150ms" }}
                />
                <span
                  className="w-1.5 h-1.5 rounded-full bg-gold anim-typing-dot"
                  style={{ animationDelay: "300ms" }}
                />
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {notice && (
          <p className="text-center text-[0.6875rem] text-muted-foreground py-1" role="status">
            {notice}
          </p>
        )}

        {messages.length <= 1 && (
          <div className="px-4 pb-2 grid grid-cols-2 gap-2">
            {suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => send(s.text)}
                className="glass rounded-2xl p-3 text-right flex flex-col gap-2 hover:bg-accent/50 transition-colors anim-float-in"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <s.icon className="w-4 h-4 text-primary" />
                <span className="text-[0.6875rem] leading-snug text-foreground">{s.text}</span>
              </button>
            ))}
          </div>
        )}

        <div className="px-3 pt-2">
          <div className="glass-strong rounded-3xl p-2 flex items-end gap-2">
            <textarea
              value={input}
              rows={Math.min(4, Math.max(1, input.split("\n").length))}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder="اسأل عن أي شيء…"
              aria-label="سؤالك للمساعد"
              className="flex-1 bg-transparent outline-none text-sm px-3 py-2.5 resize-none max-h-28 placeholder:text-muted-foreground"
            />
            {thinking ? (
              <button
                aria-label="إيقاف الرد"
                onClick={stop}
                className="w-11 h-11 rounded-2xl glass text-foreground flex items-center justify-center"
              >
                <Square className="w-4 h-4" />
              </button>
            ) : (
              <button
                aria-label="إرسال"
                onClick={() => send(input)}
                disabled={remaining === 0}
                className="w-11 h-11 rounded-2xl bg-gradient-to-br from-primary to-primary-glow text-white flex items-center justify-center glow-primary hover:scale-105 transition-transform disabled:opacity-50"
              >
                <Send className="w-4 h-4 -scale-x-100" />
              </button>
            )}
          </div>
          <p className="text-[0.625rem] text-muted-foreground text-center pt-1">
            قد يخطئ المساعد. راجع معلّمك في المسائل المهمة.
          </p>
        </div>

        <BottomNav />
      </div>
    </PhoneFrame>
  );
}

function IconBtn({
  label,
  onClick,
  active,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={`w-7 h-7 rounded-lg flex items-center justify-center hover:bg-accent ${active ? "text-primary" : "text-muted-foreground"}`}
    >
      {children}
    </button>
  );
}
