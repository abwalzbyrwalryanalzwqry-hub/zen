import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { ArrowLeft, Ban, Bell, BellOff, Eye, Search } from "lucide-react";
import { useT } from "@/lib/i18n";
import { colorFor, initialOf, type Profile } from "@/lib/zen-api";
import { PEER_KIND_LABEL, type PeerKind } from "@/lib/chat-format";
import { type ChatContext } from "@/lib/chat-safety";

/** رأس المحادثة: الطرف الآخر، والكتم، والحظر، وتنبيه اطلاع المعلّم (المرحلة 7.6). */
export function ChatHeader({
  ctx,
  peer,
  chatId,
  chatTitle,
  supervising,
  muted,
  onToggleMute,
  onToggleBlock,
  onSearch,
}: {
  ctx: ChatContext | null;
  peer: Profile | null;
  chatId: string;
  chatTitle: string;
  supervising: boolean;
  muted: boolean;
  onToggleMute: () => void;
  onToggleBlock: () => void;
  onSearch: () => void;
}) {
  const t = useT();
  const peerKind: PeerKind | null | undefined = ctx?.peer_kind;
  const peerAvatar = ctx?.peer_avatar ?? peer?.avatar;
  const chatColor = useMemo(() => colorFor(peer?.id ?? chatId), [peer?.id, chatId]);
  return (
    <>
      <header className="glass-strong px-4 pt-12 pb-3 flex items-center gap-3 z-10">
        <Link
          aria-label="رجوع"
          to="/chats"
          className="min-h-11 min-w-11 rounded-xl flex items-center justify-center hover:bg-accent"
        >
          <ArrowLeft className="w-5 h-5 rtl:rotate-180" aria-hidden="true" />
        </Link>
        <div
          className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${chatColor} flex items-center justify-center text-white font-black`}
        >
          {peerAvatar && /^https?:\/\//.test(peerAvatar) && !supervising ? (
            <img src={peerAvatar} alt="" className="w-full h-full rounded-2xl object-cover" />
          ) : (
            initialOf(chatTitle)
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{chatTitle}</p>
          <p className="text-xs text-muted-foreground">
            {supervising
              ? "محادثة بين طالبين في حلقتك"
              : peerKind
                ? PEER_KIND_LABEL[peerKind]
                : peer?.role === "teacher"
                  ? "معلّم"
                  : "طالب"}
          </p>
        </div>
        <button
          type="button"
          onClick={onSearch}
          aria-label={t("chat.search.open")}
          title={t("chat.search.open")}
          className="min-h-11 min-w-11 rounded-xl flex items-center justify-center hover:bg-accent text-muted-foreground"
        >
          <Search className="w-4 h-4" aria-hidden="true" />
        </button>
        {ctx?.participant && (
          <button
            onClick={onToggleMute}
            aria-label={muted ? "إلغاء الكتم" : "كتم الإشعارات"}
            title={muted ? "إلغاء الكتم" : "كتم الإشعارات"}
            className="min-h-11 min-w-11 rounded-xl flex items-center justify-center hover:bg-accent text-muted-foreground"
          >
            {muted ? <BellOff className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
          </button>
        )}
        {ctx?.participant && ctx.peer_id && (
          <button
            onClick={onToggleBlock}
            aria-label={ctx.blocked_by_me ? "رفع الحظر" : "حظر المستخدم"}
            title={ctx.blocked_by_me ? "رفع الحظر" : "حظر المستخدم"}
            className={`min-h-11 min-w-11 rounded-xl flex items-center justify-center hover:bg-accent ${ctx.blocked_by_me ? "text-destructive" : "text-muted-foreground"}`}
          >
            <Ban className="w-4 h-4" />
          </button>
        )}
      </header>
      {ctx?.student_pair && (
        <p className="px-4 py-2 text-xs text-muted-foreground bg-accent/40 flex items-center gap-2">
          <Eye className="w-3.5 h-3.5 shrink-0" />
          {supervising
            ? "تطّلع على هذه المحادثة بصفتك معلّم الحلقة (قراءة فقط)."
            : "يطّلع معلّم الحلقة على هذه المحادثة."}
        </p>
      )}
    </>
  );
}
