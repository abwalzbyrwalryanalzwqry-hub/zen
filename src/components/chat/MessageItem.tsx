import { Check, CheckCheck, Copy, Flag, Pencil, Reply, Sparkles, Trash2 } from "lucide-react";
import { splitMatches } from "@/lib/chat-search";
import { useT, intlLocale } from "@/lib/i18n";
import { REACTIONS, timeAgo } from "@/lib/zen-api";
import { formatDuration, type MessageWithMedia } from "@/lib/chat-extras";
import { AyahCard } from "@/components/zen/AyahCard";
import { dayLabel, parseAyahRef, startsNewDay } from "@/lib/chat-format";
import { type ChatContext } from "@/lib/chat-safety";
import { snippet } from "@/components/chat/snippet";

type Rx = [string, { n: number; mine: boolean }][];

/** رسالة واحدة وقائمة أوامرها (المرحلة 7.6)، منقولة حرفياً من شاشة المحادثة. */
export function MessageItem({
  m,
  prevCreatedAt,
  isLast,
  userId,
  ctx,
  supervising,
  canPost,
  replied,
  rx,
  menuOpen,
  canEdit,
  mediaUrls,
  refreshMedia,
  memberName,
  onToggleMenu,
  onCloseMenu,
  onReact,
  onReply,
  onCopy,
  onEdit,
  onRemove,
  onReport,
  query = "",
  active = false,
  onJumpTo,
  onOpenImage,
}: {
  m: MessageWithMedia;
  prevCreatedAt: string | undefined;
  isLast: boolean;
  userId: string | null | undefined;
  ctx: ChatContext | null;
  supervising: boolean;
  canPost: boolean;
  replied: MessageWithMedia | undefined;
  rx: Rx;
  menuOpen: boolean;
  canEdit: boolean;
  mediaUrls: Record<string, string>;
  refreshMedia: (path: string) => void;
  memberName: (id: string) => string;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onReact: (m: MessageWithMedia, emoji: string) => Promise<void>;
  onReply: (m: MessageWithMedia) => void;
  onCopy: (m: MessageWithMedia) => Promise<void>;
  onEdit: (m: MessageWithMedia) => void;
  onRemove: (m: MessageWithMedia) => Promise<void>;
  onReport: (id: string) => Promise<void>;
  /** استعلام البحث داخل المحادثة لتظليل مواضعه. */
  query?: string;
  /** هذه الرسالة هي نتيجة البحث الحالية. */
  active?: boolean;
  onJumpTo?: (id: string) => void;
  onOpenImage?: (src: string) => void;
}) {
  const t = useT();
  // في وضع اطلاع المعلّم: الطرف الأول في جهة والثاني في الجهة الأخرى.
  const mine = supervising ? m.sender_id === ctx?.members?.[0]?.id : m.sender_id === userId;
  if (m.type === "ai") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] glass-strong border-gold/40 rounded-3xl px-4 py-3 flex gap-3 items-start">
          <Sparkles className="w-4 h-4 text-gold mt-0.5 shrink-0" />
          <p className="text-xs leading-relaxed text-foreground whitespace-pre-line">{m.content}</p>
        </div>
      </div>
    );
  }
  const newDay = startsNewDay(prevCreatedAt, m.created_at);
  const ayah = m.type === "text" && !m.deleted_at ? parseAyahRef(m.content) : null;
  const canAct = !m.deleted_at && !supervising;
  const exact = new Date(m.created_at).toLocaleString(intlLocale(), {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const clock = new Date(m.created_at).toLocaleTimeString(intlLocale(), {
    hour: "numeric",
    minute: "2-digit",
  });
  return (
    <div id={`msg-${m.id}`} className="scroll-mt-24">
      {newDay && (
        <div className="flex justify-center my-2">
          <span className="text-xs px-3 py-1 rounded-full glass text-muted-foreground">
            {dayLabel(m.created_at)}
          </span>
        </div>
      )}
      <div
        className={`flex flex-col ${mine ? "items-start" : "items-end"}${isLast ? " anim-float-in" : ""}`}
      >
        <div
          role={canAct ? "button" : undefined}
          tabIndex={canAct ? 0 : undefined}
          aria-label={canAct ? "خيارات الرسالة" : undefined}
          onClick={() => canAct && onToggleMenu()}
          onKeyDown={(e) => {
            if (canAct && (e.key === "Enter" || e.key === " ")) {
              e.preventDefault();
              onToggleMenu();
            }
          }}
          data-bubble
          className={`max-w-[78%] rounded-3xl px-4 py-2.5 transition-shadow ${mine ? "bg-primary text-primary-foreground rounded-es-md" : "glass text-foreground rounded-ee-md"} ${active ? "ring-2 ring-gold" : ""}`}
        >
          {m.reply_to && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (replied) onJumpTo?.(replied.id);
              }}
              disabled={!replied}
              aria-label={t("chat.jump.toReply")}
              className={`mb-1.5 block w-full text-start rounded-lg border-s-2 ps-2 py-1 text-xs opacity-85 line-clamp-2 ${mine ? "border-primary-foreground/60 bg-primary-foreground/10" : "border-primary bg-primary/5"}`}
            >
              {snippet(replied)}
            </button>
          )}
          {supervising && (
            <p className="text-xs font-bold opacity-80 mb-0.5">{memberName(m.sender_id)}</p>
          )}
          {m.type === "image" && m.media_path ? (
            mediaUrls[m.media_path] ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenImage?.(mediaUrls[m.media_path!]);
                }}
                aria-label={t("chat.image.open")}
                className="block rounded-2xl overflow-hidden"
              >
                <img
                  src={mediaUrls[m.media_path]}
                  alt={t("chat.image.alt")}
                  loading="lazy"
                  onError={() => refreshMedia(m.media_path!)}
                  className="rounded-2xl max-h-64 w-auto"
                />
              </button>
            ) : (
              <span className="text-xs opacity-70">جارٍ تحميل الصورة…</span>
            )
          ) : m.type === "voice" && m.media_path ? (
            mediaUrls[m.media_path] ? (
              <div className="flex items-center gap-2">
                <audio
                  controls
                  preload="none"
                  src={mediaUrls[m.media_path]}
                  onError={() => refreshMedia(m.media_path!)}
                  className="h-9 max-w-[200px]"
                />
                {m.duration_seconds ? (
                  <span className="text-xs opacity-70">{formatDuration(m.duration_seconds)}</span>
                ) : null}
              </div>
            ) : (
              <span className="text-xs opacity-70">جارٍ تحميل التسجيل…</span>
            )
          ) : m.deleted_at ? (
            <p className="text-xs opacity-70">رسالة محذوفة</p>
          ) : (
            <>
              <p className="text-sm leading-relaxed whitespace-pre-line break-words">
                {query
                  ? splitMatches(m.content, query).map((part, i) =>
                      part.hit ? (
                        <mark key={i} className="rounded bg-gold/60 text-foreground px-0.5">
                          {part.text}
                        </mark>
                      ) : (
                        part.text
                      ),
                    )
                  : m.content}
              </p>
              {ayah && <AyahCard refr={ayah} />}
            </>
          )}
          <p
            title={exact}
            className={`text-xs mt-1 flex items-center gap-1 ${mine ? "text-primary-foreground/75" : "text-muted-foreground"}`}
          >
            <time dateTime={m.created_at}>
              {clock} · {timeAgo(m.created_at)}
            </time>
            {m.edited_at ? <span>· {t("chat.edited")}</span> : null}
            {mine &&
              !supervising &&
              (m.status === "seen" ? (
                <CheckCheck
                  className="w-3.5 h-3.5 text-gold"
                  aria-label={t("chat.receipt.seen")}
                  role="img"
                />
              ) : (
                <Check className="w-3.5 h-3.5" aria-label={t("chat.receipt.sent")} role="img" />
              ))}
          </p>
        </div>
        {rx.length > 0 && (
          <div className="flex gap-1 mt-1">
            {rx.map(([emoji, c]) => (
              <button
                key={emoji}
                onClick={() => canAct && void onReact(m, emoji)}
                aria-label={`${emoji} ${c.n}`}
                className={`min-h-11 text-xs px-2 rounded-full glass ${c.mine ? "ring-1 ring-primary" : ""}`}
              >
                {emoji} {c.n > 1 ? c.n : ""}
              </button>
            ))}
          </div>
        )}
        {menuOpen && canAct && (
          <div className="mt-1 glass-strong rounded-2xl p-1.5 flex flex-wrap items-center gap-1 max-w-[90%]">
            {canPost &&
              REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => void onReact(m, emoji)}
                  aria-label={`تفاعل ${emoji}`}
                  className="min-h-11 min-w-11 rounded-xl hover:bg-accent text-base"
                >
                  {emoji}
                </button>
              ))}
            {canPost && <MenuBtn icon={Reply} label="رد" onClick={() => onReply(m)} />}
            {m.type === "text" && (
              <MenuBtn icon={Copy} label="نسخ" onClick={() => void onCopy(m)} />
            )}
            {canEdit && <MenuBtn icon={Pencil} label="تعديل" onClick={() => onEdit(m)} />}
            {m.sender_id === userId && (
              <MenuBtn icon={Trash2} label="حذف" onClick={() => void onRemove(m)} />
            )}
            {m.sender_id !== userId && ctx?.participant && (
              <MenuBtn
                icon={Flag}
                label="إبلاغ"
                onClick={() => {
                  onCloseMenu();
                  void onReport(m.id);
                }}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function MenuBtn({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      type="button"
      className="min-h-11 px-2.5 rounded-xl hover:bg-accent text-xs inline-flex items-center gap-1 text-foreground"
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}
