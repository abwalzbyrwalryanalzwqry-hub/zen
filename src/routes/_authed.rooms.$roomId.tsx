import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { PhoneFrame } from "@/components/zen/PhoneFrame";
import { useSession } from "@/hooks/useSession";
import { ScheduleSheet } from "@/components/zen/rooms/ScheduleSheet";
import { MentionPicker } from "@/components/zen/rooms/MentionPicker";
import { RoomVoiceButton } from "@/components/zen/rooms/RoomVoice";
import { useRoomVoice } from "@/hooks/rooms/use-room-voice";
import { useRoomFeed } from "@/hooks/rooms/use-room-feed";
import { RoomMessageBubble } from "@/components/zen/rooms/RoomMessageBubble";
import {
  activeMentionQuery,
  encodeMentions,
  insertMention,
  type MentionCandidate,
} from "@/lib/mentions";
import {
  ArrowLeft,
  CalendarClock,
  Loader2,
  Megaphone,
  MessagesSquare,
  Pin,
  Send,
  Settings,
  ShieldAlert,
} from "lucide-react";
import {
  MAX_ROOM_MESSAGE,
  postRoomMessage,
  mentionCandidates,
  myRoomVoiceAllowed,
  sendRoomVoice,
  roomErrorMessage,
  roomTitle,
  validateRoomMessage,
} from "@/lib/rooms";
import { ReportsSheet, SettingsSheet } from "@/components/zen/rooms/RoomSheets";
import { useNow } from "@/hooks/useNow";
import { intlLocale, t as tr } from "@/lib/i18n";
export const Route = createFileRoute("/_authed/rooms/$roomId")({
  component: RoomPage,
});

type Sheet = null | "reports" | "settings" | "schedule";

function RoomPage() {
  const now = useNow();
  const { roomId } = Route.useParams();
  const navigate = useNavigate();
  const { userId } = useSession();
  const [input, setInput] = useState("");
  const [caret, setCaret] = useState(0);
  const [candidates, setCandidates] = useState<MentionCandidate[]>([]);
  const [picked, setPicked] = useState<MentionCandidate[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [voiceAllowed, setVoiceAllowed] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const {
    info,
    latest,
    messages,
    readStats,
    hasOlder,
    loadingOlder,
    loading,
    denied,
    refresh,
    loadOlder,
  } = useRoomFeed(roomId, scrollRef, setError);

  // المرشّحون للإشارة في النقاش فقط (9.6).
  const discussion = info?.kind === "discussion" && info.can_post;
  useEffect(() => {
    if (!discussion) return;
    mentionCandidates(roomId)
      .then(setCandidates)
      .catch(() => undefined);
  }, [discussion, roomId]);
  const mentionQ = discussion ? activeMentionQuery(input, caret) : null;
  const pick = (c: MentionCandidate) => {
    const r = insertMention(input, caret, c);
    setInput(r.text);
    setCaret(r.caret);
    setPicked((p) => (p.some((x) => x.user_id === c.user_id) ? p : [...p, c]));
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(r.caret, r.caret);
    });
  };

  // الصوت (9.7): الزر لمن يسمح له الخادم فقط.
  const canPost = !!info?.can_post;
  useEffect(() => {
    if (!canPost) return;
    myRoomVoiceAllowed(roomId)
      .then(setVoiceAllowed)
      .catch(() => undefined);
  }, [canPost, roomId]);
  const voice = useRoomVoice(
    (blob, seconds) => {
      if (!userId) return;
      setVoiceBusy(true);
      setError(null);
      sendRoomVoice(roomId, userId, blob, seconds)
        .then(() => refresh())
        .catch((e) => setError(roomErrorMessage(e)))
        .finally(() => setVoiceBusy(false));
    },
    (m) => setError(m),
  );

  const lastId = latest[latest.length - 1]?.id;
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [lastId]);

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    setMenu(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(roomErrorMessage(e));
    }
  };

  const send = async () => {
    const problem = validateRoomMessage(input);
    if (problem) return setError(problem);
    setSending(true);
    setError(null);
    try {
      await postRoomMessage(roomId, encodeMentions(input, picked));
      setInput("");
      setPicked([]);
      await refresh();
    } catch (e) {
      setError(roomErrorMessage(e));
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <PhoneFrame>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </PhoneFrame>
    );
  }

  if (denied || !info) {
    return (
      <PhoneFrame>
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8 text-center">
          <p className="text-sm text-muted-foreground">
            هذه الغرفة غير متاحة لك. قد يكون النقاش موقوفاً أو بانتظار موافقة ولي الأمر.
          </p>
          <button
            onClick={() => navigate({ to: "/chats" })}
            className="px-4 py-2 rounded-2xl bg-primary text-primary-foreground text-sm"
          >
            العودة إلى المحادثات
          </button>
        </div>
      </PhoneFrame>
    );
  }

  const isMod = info.role === "mod";
  const muted = info.muted_until && Date.parse(info.muted_until) > now;
  const Icon = info.kind === "announcements" ? Megaphone : MessagesSquare;

  return (
    <PhoneFrame>
      <div className="flex-1 flex flex-col relative">
        <header className="glass-strong px-4 pt-12 pb-3 flex items-center gap-3 z-10">
          <Link
            to="/chats"
            className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-accent"
            aria-label="رجوع"
          >
            <ArrowLeft className="w-5 h-5 rotate-180" />
          </Link>
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center text-white">
            <Icon className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{roomTitle(info)}</p>
            <p className="text-[0.6875rem] text-muted-foreground">
              {info.kind === "announcements"
                ? "يكتب فيها المعلّم وحده"
                : info.enabled
                  ? "نقاش بإشراف المعلّم"
                  : "النقاش موقوف"}
            </p>
          </div>
          {isMod && (
            <>
              <button
                onClick={() => setSheet("reports")}
                className="relative w-10 h-10 rounded-xl flex items-center justify-center hover:bg-accent"
                aria-label="البلاغات"
              >
                <ShieldAlert className="w-5 h-5" />
                {info.open_reports > 0 && (
                  <span className="absolute -top-0.5 -left-0.5 min-w-4 h-4 px-1 rounded-full bg-destructive text-white text-[0.625rem] flex items-center justify-center">
                    {info.open_reports}
                  </span>
                )}
              </button>
              <button
                onClick={() => setSheet("settings")}
                className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-accent"
                aria-label="إعدادات الغرف"
              >
                <Settings className="w-5 h-5" />
              </button>
            </>
          )}
        </header>

        {info.pinned && (
          <div className="mx-4 mt-3 glass rounded-2xl px-3 py-2 flex items-start gap-2">
            <Pin className="w-4 h-4 text-gold shrink-0 mt-0.5" />
            <p className="text-xs text-foreground line-clamp-2 flex-1">{info.pinned.content}</p>
          </div>
        )}

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {hasOlder && (
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
          {messages.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground pt-10">لا رسائل بعد.</p>
          ) : (
            messages.map((m) => (
              <RoomMessageBubble
                key={m.id}
                m={m}
                info={info}
                roomId={roomId}
                userId={userId}
                readStats={readStats}
                open={menu === m.id}
                onToggle={() => setMenu(menu === m.id ? null : m.id)}
                run={run}
              />
            ))
          )}
        </div>

        {error && <p className="px-5 pb-1 text-xs text-destructive">{error}</p>}

        <div className="px-4 pb-6 pt-2">
          {mentionQ && (
            <MentionPicker candidates={candidates} query={mentionQ.query} onPick={pick} />
          )}
          {info.can_post && !muted ? (
            <div className="glass-strong rounded-3xl p-2 flex items-center gap-2">
              <textarea
                ref={inputRef}
                value={input}
                maxLength={MAX_ROOM_MESSAGE}
                rows={1}
                onChange={(e) => {
                  setInput(e.target.value);
                  setCaret(e.target.selectionStart ?? e.target.value.length);
                }}
                onSelect={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder={info.kind === "announcements" ? "اكتب إعلاناً للحلقة…" : "اكتب رسالة…"}
                className="flex-1 bg-transparent outline-none text-sm px-2 py-2 resize-none placeholder:text-muted-foreground"
              />
              {voiceAllowed && !input.trim() && (
                <RoomVoiceButton
                  recording={voice.recording}
                  seconds={voice.seconds}
                  busy={voiceBusy}
                  onStart={() => void voice.start()}
                  onStop={voice.stop}
                />
              )}
              {isMod && (
                <button
                  onClick={() => setSheet("schedule")}
                  aria-label="جدولة الرسالة"
                  className="w-11 h-11 rounded-2xl glass flex items-center justify-center"
                >
                  <CalendarClock className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={send}
                disabled={sending || !input.trim()}
                aria-label="إرسال"
                className="w-11 h-11 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-50"
              >
                {sending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4 -scale-x-100" />
                )}
              </button>
            </div>
          ) : (
            <p className="text-center text-xs text-muted-foreground glass rounded-2xl py-3">
              {muted
                ? tr("rooms.mutedUntil", {
                    time: new Date(info.muted_until!).toLocaleString(intlLocale()),
                  })
                : tr("rooms.readOnly")}
            </p>
          )}
        </div>

        {sheet === "reports" && (
          <ReportsSheet roomId={roomId} onClose={() => setSheet(null)} onChange={refresh} />
        )}
        {sheet === "schedule" && (
          <ScheduleSheet
            roomId={roomId}
            draft={input}
            onScheduled={() => setInput("")}
            onClose={() => setSheet(null)}
          />
        )}
        {sheet === "settings" && (
          <SettingsSheet halaqaId={info.halaqa_id} onClose={() => setSheet(null)} />
        )}
      </div>
    </PhoneFrame>
  );
}
