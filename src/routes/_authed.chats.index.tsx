import { createFileRoute, Link } from "@tanstack/react-router";
import { useNow } from "@/hooks/useNow";
import { useOnResume } from "@/hooks/useOnResume";
import { useEffect, useMemo, useRef, useState } from "react";
import { PhoneFrame } from "@/components/zen/PhoneFrame";
import { BottomNav } from "@/components/zen/BottomNav";
import { ThemeToggle } from "@/components/zen/ThemeToggle";
import { Search, Plus, Sparkles, Loader2, BellOff, X } from "lucide-react";
import { QueryError } from "@/components/zen/QueryError";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { useHomeContext } from "@/hooks/useHomeContext";
import { useT } from "@/lib/i18n";
import { useSession } from "@/hooks/useSession";
import { subscribeLive } from "@/lib/realtime-hub";
import {
  myInbox,
  timeAgo,
  colorFor,
  initialOf,
  searchMessages,
  type InboxRow,
  type MessageRow,
} from "@/lib/zen-api";
import { HalaqaRooms } from "@/components/zen/HalaqaRooms";
import { ChatModeration } from "@/components/zen/ChatModeration";
import { usePagesDict } from "@/lib/pages-i18n";

/** مرشّحات القائمة (فحص الأقسام P1): كانت الحلقات والمباشرة مختلطة بلا تصفية. */
const CHAT_FILTERS = ["all", "unread", "rooms", "direct"] as const;
type ChatFilter = (typeof CHAT_FILTERS)[number];

export const Route = createFileRoute("/_authed/chats/")({
  component: ChatsIndex,
});

const NO_HITS: MessageRow[] = [];

function ChatsIndex() {
  usePagesDict();
  // الجلسة مضمونة هنا: مسار _authed يحجب الوصول غير المسجَّل قبل تحميل هذه الصفحة.
  const { userId } = useSession();
  const [chats, setChats] = useState<InboxRow[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ChatFilter>("all");
  const now = useNow();
  // نتيجة آخر بحث مع نصّه: «جارٍ البحث» مشتق من أنها لنصّ آخر (M12، لا ضبط متزامن في الأثر).
  const [search, setSearch] = useState<{ q: string; hits: MessageRow[]; error: boolean }>({
    q: "",
    hits: [],
    error: false,
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);
  // العودة من الخلفية: إعادة تحميل القائمة (رسائل وصلت والتطبيق مغلق).
  useOnResume(() => setReloadTick((n) => n + 1));
  const searchQ = query.trim();
  const searchActive = searchQ.length >= 2;
  const searchFresh = searchActive && search.q === searchQ;
  const hits = searchFresh ? search.hits : NO_HITS;
  const searching = searchActive && !searchFresh;
  const searchError = searchFresh && search.error;
  const t = useT();
  const { on } = useFeatureFlags();
  const { mode } = useHomeContext();
  const chatIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    // استدعاء واحد (my_inbox) بدل المحادثات ثم غير المقروء ثم ملف كل طرف.
    const load = async () => {
      try {
        const rows = await myInbox();
        if (!cancelled) {
          setChats(rows);
          setLoadError(false);
        }
      } catch {
        // تبقى القائمة السابقة عند انقطاع الشبكة؛ وإن لم تكن قائمة بعد نعرض «تعذّر التحميل» لا «لا محادثات».
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();

    // من المحور المشترك (M6): رسائل محادثاتي فقط، وإدراج محادثة جديدة.
    const off = subscribeLive(userId, (e) => {
      if (e.kind === "chat") {
        const row = e.row as unknown as InboxRow;
        // محادثة جديدة لا نعرفها: نعيد التحميل. غير ذلك تكفي أحداث الرسائل أدناه.
        if (row?.participants?.includes(userId) && !chatIdsRef.current.has(row.id)) void load();
        return;
      }
      if (e.kind !== "message" || e.type !== "INSERT") return;
      const row = e.row as unknown as MessageRow;
      if (!chatIdsRef.current.has(row.chat_id)) return;
      // تحديث محلي بلا طلب شبكة: آخر رسالة، والترتيب، وغير المقروء.
      const preview =
        row.type === "image"
          ? t("chatsList.image")
          : row.type === "voice"
            ? t("chatsList.voice")
            : row.content;
      setChats((list) => {
        const next = list.map((c) =>
          c.id === row.chat_id
            ? {
                ...c,
                last_message: preview,
                last_sender: row.sender_id,
                updated_at: row.created_at,
                unread: row.sender_id === userId ? c.unread : c.unread + 1,
              }
            : c,
        );
        return next.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
      });
    });

    // العودة إلى الشاشة (بعد قراءة محادثة) تحدّث العدّادات. «focus» وحده لا يصل في Capacitor عند عودة
    // التطبيق من الخلفية، فنستمع أيضاً لتغيّر الظهور.
    const onFocus = () => void load();
    const onVisible = () => document.visibilityState === "visible" && void load();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      off();
    };
  }, [userId, reloadTick, t]);

  // Debounced keyword search inside message contents.
  useEffect(() => {
    if (!searchActive) return;
    let alive = true;
    const timer = setTimeout(() => {
      searchMessages(searchQ)
        .then((found) => alive && setSearch({ q: searchQ, hits: found, error: false }))
        .catch(() => alive && setSearch({ q: searchQ, hits: [], error: true }));
    }, 350);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [searchQ, searchActive]);

  const titleOf = (c: InboxRow) =>
    c.is_group ? (c.title ?? t("chatsList.group")) : (c.peer?.name ?? t("chatsList.user"));

  const view = useMemo(() => {
    const q = query.trim();
    return chats
      .map((c) => {
        const title = titleOf(c);
        return {
          id: c.id,
          title,
          subtitle: c.last_message ?? t("chatsList.startHint"),
          time: timeAgo(c.updated_at),
          initial: initialOf(title),
          color: colorFor(c.peer?.id ?? c.id),
          unread: c.unread ?? 0,
          muted: c.muted,
        };
      })
      .filter((c) => !q || c.title.includes(q) || (c.subtitle ?? "").includes(q))
      .filter((c) => filter !== "unread" || c.unread > 0);
    // now: تحديث «منذ…» كل دقيقة.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chats, query, filter, now]);

  const chatById = useMemo(() => Object.fromEntries(chats.map((c) => [c.id, c])), [chats]);

  // مجموعة معرّفات محادثات المستخدم، تُستخدم لتصفية أحداث الرسائل اللحظية
  useEffect(() => {
    chatIdsRef.current = new Set(chats.map((c) => c.id));
  }, [chats]);

  return (
    <PhoneFrame>
      <div className="flex-1 flex flex-col">
        <header className="px-5 pt-12 pb-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{t("chatsList.greeting")}</p>
            <h1 className="text-2xl font-black text-foreground">{t("chatsList.title")}</h1>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            {/* كان زراً عائماً يغطي آخر محادثة في القائمة؛ مكانه الآن الرأس. */}
            <Link
              aria-label={t("contacts.title")}
              to="/chats/new"
              className="w-11 h-11 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center glow-primary"
            >
              <Plus className="w-5 h-5" aria-hidden="true" />
            </Link>
          </div>
        </header>

        <div className="px-5">
          <div className="glass rounded-2xl h-12 flex items-center px-4 gap-3">
            <Search className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("chatsList.searchPh")}
              className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
            />
            {searching ? (
              <Loader2
                className="w-4 h-4 animate-spin text-primary"
                role="status"
                aria-label={t("common.loading")}
              />
            ) : query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label={t("chatsList.clearSearch")}
                className="w-8 h-8 -me-2 flex items-center justify-center text-muted-foreground"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            ) : null}
          </div>
          {!query && (
            <div
              className="flex gap-1.5 mt-3 overflow-x-auto"
              role="group"
              aria-label={t("chatsList.filterAria")}
            >
              {CHAT_FILTERS.map((f) => (
                <button
                  key={f}
                  type="button"
                  aria-pressed={filter === f}
                  onClick={() => setFilter(f)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-[0.6875rem] font-bold ${
                    filter === f ? "bg-primary/15 text-primary" : "glass text-muted-foreground"
                  }`}
                >
                  {t(`chatsList.filters.${f}`)}
                </button>
              ))}
            </div>
          )}
        </div>

        {!query && on("assistant") && (
          <Link
            to="/assistant"
            className="mx-5 mt-4 glass-strong rounded-3xl p-4 flex items-center gap-3 hover:scale-[1.01] transition-transform relative overflow-hidden group"
          >
            <div className="absolute -left-6 -top-6 w-24 h-24 rounded-full bg-gold/30 blur-2xl group-hover:bg-gold/40 transition-colors" />
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center glow-primary shrink-0">
              <Sparkles className="w-6 h-6 text-white" aria-hidden="true" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">{t("chatsList.assistant")}</p>
              <p className="text-xs text-muted-foreground truncate">
                {t("chatsList.assistantHint")}
              </p>
            </div>
            <span className="text-[0.625rem] text-gold font-medium px-2 py-1 rounded-full bg-gold/10">
              {t("chatsList.beta")}
            </span>
          </Link>
        )}

        {!query && <ChatModeration />}

        <div className="flex-1 overflow-y-auto mt-4 px-3 space-y-1 pb-4">
          {query.trim().length >= 2 && (
            <div className="mb-2">
              <p className="px-2 text-[0.6875rem] text-muted-foreground mb-1">
                {t("chatsList.hits")} {hits.length > 0 ? `(${hits.length})` : ""}
              </p>
              {searchError ? (
                <p role="alert" className="px-2 text-[0.6875rem] text-destructive">
                  {t("chatsList.searchFailed")}
                </p>
              ) : hits.length === 0 && !searching ? (
                <p className="px-2 text-[0.6875rem] text-muted-foreground">
                  {t("chatsList.noHits")}
                </p>
              ) : (
                hits.map((m) => {
                  const c = chatById[m.chat_id];
                  return (
                    <Link
                      key={m.id}
                      to="/chats/$chatId"
                      params={{ chatId: m.chat_id }}
                      className="block px-3 py-2 rounded-2xl hover:bg-accent/60"
                    >
                      <div className="flex justify-between items-baseline gap-2">
                        <p className="text-xs font-medium text-primary truncate">
                          {c ? titleOf(c) : t("chatsList.chat")}
                        </p>
                        <span className="text-[0.625rem] text-muted-foreground shrink-0">
                          {timeAgo(m.created_at)}
                        </span>
                      </div>
                      <p className="text-[0.6875rem] text-muted-foreground truncate">{m.content}</p>
                    </Link>
                  );
                })
              )}
              <div className="mt-3 border-t border-border/40" />
            </div>
          )}

          {!query && filter !== "direct" && <HalaqaRooms unreadOnly={filter === "unread"} />}

          {filter === "rooms" && !query ? null : loading ? (
            <div className="flex justify-center py-10">
              <Loader2
                className="w-6 h-6 animate-spin text-primary"
                role="status"
                aria-label={t("common.loading")}
              />
            </div>
          ) : loadError && chats.length === 0 ? (
            <QueryError
              onRetry={() => {
                setLoading(true);
                setReloadTick((n) => n + 1);
              }}
            />
          ) : view.length === 0 && !query && filter === "unread" ? (
            <p className="text-center px-8 pt-6 text-xs text-muted-foreground">
              {t("chatsList.noUnread")}
            </p>
          ) : view.length === 0 && !query ? (
            <div className="text-center px-8 pt-10 text-sm text-muted-foreground">
              {t(
                mode === "teacher"
                  ? "chatsList.emptyTeacher"
                  : mode === "guardian"
                    ? "chatsList.emptyGuardian"
                    : "chatsList.emptyStudent",
              )}
            </div>
          ) : (
            view.map((c, idx) => (
              <Link
                key={c.id}
                data-list-row
                to="/chats/$chatId"
                params={{ chatId: c.id }}
                className="flex items-center gap-3 p-3 rounded-2xl hover:bg-accent/60 transition-colors anim-float-in"
                style={{ animationDelay: `${Math.min(idx, 8) * 40}ms` }}
              >
                <div
                  className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${c.color} flex items-center justify-center text-white text-xl font-black shadow-lg shrink-0`}
                >
                  {c.initial}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline gap-2">
                    <p
                      className={`text-sm truncate ${c.unread > 0 ? "font-black text-foreground" : "font-medium text-foreground"}`}
                    >
                      {c.title}
                    </p>
                    <span className="text-[0.625rem] text-muted-foreground shrink-0 flex items-center gap-1">
                      {c.muted && <BellOff className="w-3 h-3" aria-label={t("chatsList.muted")} />}
                      {c.time}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <p
                      className={`text-xs truncate ${c.unread > 0 ? "text-foreground" : "text-muted-foreground"}`}
                    >
                      {c.subtitle}
                    </p>
                    {c.unread > 0 && (
                      <span
                        className={`shrink-0 min-w-5 h-5 px-1.5 rounded-full ${c.muted ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground"} text-[0.625rem] font-bold flex items-center justify-center`}
                        aria-label={t("chatsList.unreadN", { n: c.unread })}
                      >
                        {c.unread > 99 ? "99+" : c.unread}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>

        <BottomNav />
      </div>
    </PhoneFrame>
  );
}
