import type { Reaction } from "@/lib/zen-api";
import type { ChatContext } from "@/lib/chat-safety";
import { setChatMute, deleteMessage, listReactions, toggleReaction } from "@/lib/zen-api";
import { type MessageWithMedia } from "@/lib/chat-extras";
import { reportMessage, setUserBlock } from "@/lib/chat-safety";
import type { ConfirmOptions } from "@/components/zen/common/ConfirmDialog";
import { t } from "@/lib/i18n";

/** أوامر المحادثة ورسائلها التي تمرّ بالخادم: الكتم، والحذف، والنسخ، والتفاعل، والإبلاغ، والحظر (المرحلة 7.6). */
export function useChatActions(o: {
  chatId: string;
  messages: MessageWithMedia[];
  setMessages: React.Dispatch<React.SetStateAction<MessageWithMedia[]>>;
  setReactions: (r: Reaction[]) => void;
  ctx: ChatContext | null;
  refreshCtx: () => Promise<unknown>;
  muted: boolean;
  setMuted: (v: boolean) => void;
  setMenuFor: (v: string | null) => void;
  setNotice: (v: string | null) => void;
  setError: (v: string | null) => void;
  /** تأكيد مترجَم (useConfirm) بدل window.confirm. */
  ask: (o: ConfirmOptions) => Promise<boolean>;
}) {
  const { ask } = o;
  const { chatId, messages, setMessages, setReactions, ctx, refreshCtx, muted, setMuted } = o;
  const { setMenuFor, setNotice, setError } = o;
  const toggleMute = async () => {
    try {
      await setChatMute(chatId, muted ? 0 : 24 * 7);
      setMuted(!muted);
      setNotice(muted ? "عادت الإشعارات لهذه المحادثة." : "كُتمت الإشعارات أسبوعاً.");
    } catch {
      setError("تعذّر تغيير الكتم.");
    }
  };
  const removeMessage = async (m: MessageWithMedia) => {
    setMenuFor(null);
    if (
      !(await ask({
        title: t("chat.confirm.deleteTitle"),
        description: t("chat.confirm.deleteBody"),
        confirmLabel: t("chat.confirm.delete"),
      }))
    )
      return;
    try {
      await deleteMessage(m.id);
      setMessages((list) =>
        list.map((x) =>
          x.id === m.id ? { ...x, deleted_at: new Date().toISOString(), media_path: null } : x,
        ),
      );
    } catch {
      setError("تعذّر حذف الرسالة.");
    }
  };
  const copyMessage = async (m: MessageWithMedia) => {
    setMenuFor(null);
    try {
      await navigator.clipboard.writeText(m.content);
      setNotice("نُسخت الرسالة.");
    } catch {
      setError("تعذّر النسخ.");
    }
  };
  const react = async (m: MessageWithMedia, emoji: string) => {
    setMenuFor(null);
    try {
      await toggleReaction(m.id, emoji);
      setReactions(await listReactions(messages.map((x) => x.id)));
    } catch {
      setError("تعذّر إضافة التفاعل.");
    }
  };
  const report = async (messageId: string) => {
    if (
      !(await ask({
        title: t("chat.confirm.reportTitle"),
        description: t("chat.confirm.reportBody"),
        confirmLabel: t("chat.confirm.report"),
      }))
    )
      return;
    try {
      await reportMessage(messageId);
      setNotice("وصل البلاغ. شكراً لك، سيراجعه المشرف.");
    } catch {
      setError("تعذّر إرسال البلاغ.");
    }
  };

  const toggleBlock = async () => {
    if (!ctx?.peer_id) return;
    const next = !ctx.blocked_by_me;
    if (
      next &&
      !(await ask({
        title: t("chat.confirm.blockTitle"),
        description: t("chat.confirm.blockBody"),
        confirmLabel: t("chat.confirm.block"),
      }))
    )
      return;
    try {
      await setUserBlock(ctx.peer_id, next);
      setNotice(next ? "تم الحظر." : "رُفع الحظر.");
      await refreshCtx();
    } catch {
      setError("تعذّر تنفيذ الطلب.");
    }
  };
  return { toggleMute, removeMessage, copyMessage, react, report, toggleBlock };
}
