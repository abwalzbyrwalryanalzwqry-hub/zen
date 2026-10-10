import { Flag, MicOff, Pin, PinOff, Trash2 } from "lucide-react";
import { AyahCard } from "@/components/zen/AyahCard";
import { MentionText } from "@/components/zen/rooms/MentionText";
import { RoomVoicePlayer } from "@/components/zen/rooms/RoomVoice";
import { ActionBtn } from "@/components/zen/rooms/RoomSheets";
import { parseAyahRef } from "@/lib/chat-format";
import { timeAgo } from "@/lib/zen-api";
import {
  MUTE_OPTIONS,
  deleteRoomMessage,
  messageActions,
  muteRoomMember,
  pinRoomMessage,
  reportRoomMessage,
  type RoomInfo,
  type RoomMessage,
  type RoomReadStats,
} from "@/lib/rooms";

/** رسالة في غرفة الحلقة مع قائمة إجراءاتها (إبلاغ، تثبيت، إيقاف، حذف). فُصلت من صفحة الغرفة (M5). */
export function RoomMessageBubble({
  m,
  info,
  roomId,
  userId,
  readStats,
  open,
  onToggle,
  run,
}: {
  m: RoomMessage;
  info: RoomInfo;
  roomId: string;
  userId: string | null | undefined;
  readStats: RoomReadStats | null;
  open: boolean;
  onToggle: () => void;
  run: (fn: () => Promise<unknown>) => Promise<void> | void;
}) {
  const acts = messageActions(m, info.role);
  const any = acts.report || acts.delete || acts.pin || acts.mute;
  return (
    <div className={`flex ${m.mine ? "justify-start" : "justify-end"}`}>
      <div className="max-w-[85%]">
        <div
          className={`rounded-3xl px-4 py-2.5 text-sm ${
            m.deleted
              ? "border border-dashed border-border text-muted-foreground italic"
              : m.mine
                ? "bg-primary text-primary-foreground"
                : "glass"
          }`}
          onClick={() => any && onToggle()}
        >
          {!m.mine && (
            <p className="text-[0.6875rem] font-medium mb-0.5 opacity-80">
              {m.sender_name}
              {m.sender_is_mod && <span className="text-gold"> · المعلّم</span>}
            </p>
          )}
          {m.hidden && (
            <p className="text-[0.625rem] text-destructive mb-0.5">
              {info.role === "mod"
                ? "مخفية بعد 3 بلاغات. راجعها من البلاغات."
                : "أُخفيت بعد بلاغات، بانتظار مراجعة المعلّم."}
            </p>
          )}
          <p className="whitespace-pre-wrap break-words">
            {m.deleted
              ? "حُذفت هذه الرسالة"
              : m.hidden && !m.content
                ? "رسالة مخفية"
                : m.kind === "voice"
                  ? null
                  : m.content && <MentionText text={m.content} me={userId} />}
          </p>
          {m.kind === "voice" && m.media_path && (
            <RoomVoicePlayer path={m.media_path} seconds={m.duration_seconds} />
          )}
          {!m.deleted && m.content && parseAyahRef(m.content) && (
            <AyahCard refr={parseAyahRef(m.content)!} />
          )}
          <p className="text-[0.625rem] opacity-60 mt-1 flex items-center gap-1">
            {m.pinned && <Pin className="w-3 h-3" />}
            {timeAgo(m.created_at)}
            {readStats && info.kind === "announcements" && !m.deleted && (
              <span>
                {" "}
                · قرأه {readStats.messages[m.id] ?? 0} من {readStats.total}
              </span>
            )}
          </p>
        </div>
        {open && (
          <div className="mt-1 flex flex-wrap gap-1">
            {acts.report && (
              <ActionBtn
                icon={<Flag className="w-3.5 h-3.5" />}
                label="إبلاغ"
                onClick={() => {
                  const reason = window.prompt("سبب البلاغ (اختياري)") ?? undefined;
                  run(() => reportRoomMessage(m.id, reason));
                }}
              />
            )}
            {acts.pin && (
              <ActionBtn
                icon={
                  m.pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />
                }
                label={m.pinned ? "إلغاء التثبيت" : "تثبيت"}
                onClick={() => run(() => pinRoomMessage(m.id, !m.pinned))}
              />
            )}
            {acts.mute &&
              MUTE_OPTIONS.map((o) => (
                <ActionBtn
                  key={o.hours}
                  icon={<MicOff className="w-3.5 h-3.5" />}
                  label={`إيقاف ${o.label}`}
                  onClick={() => run(() => muteRoomMember(roomId, m.sender_id, o.hours))}
                />
              ))}
            {acts.delete && (
              <ActionBtn
                icon={<Trash2 className="w-3.5 h-3.5" />}
                label="حذف"
                danger
                onClick={() => {
                  if (window.confirm("حذف الرسالة؟")) run(() => deleteRoomMessage(m.id));
                }}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
