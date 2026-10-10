import { Reply, Pencil, Mic, Paperclip, Send, Sparkles, Loader2, Square, X } from "lucide-react";
import { formatDuration, type MessageWithMedia } from "@/lib/chat-extras";
import { type ChatContext } from "@/lib/chat-safety";
import { snippet } from "@/components/chat/snippet";
import { useT } from "@/lib/i18n";

const QUICK = ["jazak", "done", "reviewing", "barak", "question", "late"] as const;

/** منطقة الكتابة: التنبيهات، والرد/التعديل، والمرفق، والمساعد، والتسجيل، والإرسال (المرحلة 7.6). */
export function Composer({
  notice,
  error,
  canPost,
  supervising,
  ctx,
  recording,
  recSeconds,
  replyTo,
  editing,
  uploading,
  aiBusy,
  sending,
  input,
  setInput,
  inputRef,
  fileRef,
  onType,
  onSend,
  onAttach,
  onAskAi,
  onStartRecording,
  onStopRecording,
  onCancelTarget,
}: {
  notice: string | null;
  error: string | null;
  canPost: boolean;
  supervising: boolean;
  ctx: ChatContext | null;
  recording: boolean;
  recSeconds: number;
  replyTo: MessageWithMedia | null;
  editing: MessageWithMedia | null;
  uploading: boolean;
  aiBusy: boolean;
  sending: boolean;
  input: string;
  setInput: (v: string) => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  fileRef: React.RefObject<HTMLInputElement | null>;
  onType: () => void;
  onSend: () => void | Promise<void>;
  onAttach: (f: File | null) => void | Promise<void>;
  onAskAi: () => void | Promise<void>;
  onStartRecording: () => void | Promise<void>;
  onStopRecording: (cancel: boolean) => void;
  onCancelTarget: () => void;
}) {
  const t = useT();
  const showQuick = !input.trim() && !editing;
  return (
    <div className="p-3 pb-4 space-y-2">
      {notice && (
        <p role="status" className="text-xs text-primary text-center">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive text-center">
          {error}
        </p>
      )}
      {!canPost ? (
        <p className="glass rounded-3xl px-4 py-3 text-xs text-muted-foreground text-center">
          {supervising
            ? "وضع الاطلاع: لا يمكنك الكتابة في محادثة الطالبين."
            : ctx?.blocked_by_me
              ? "حظرت هذا المستخدم. ارفع الحظر من أعلى الشاشة لتعود المراسلة."
              : "لا يمكن إرسال رسائل جديدة في هذه المحادثة الآن (انتهت العلاقة، أو أوقف المركز محادثات الطلاب، أو حُظرت المراسلة). تبقى الرسائل السابقة للقراءة."}
        </p>
      ) : recording ? (
        <div className="glass-strong rounded-3xl p-2 flex items-center gap-3">
          <span className="w-2.5 h-2.5 rounded-full bg-destructive animate-pulse" />
          <span className="flex-1 text-sm">جارٍ التسجيل… {formatDuration(recSeconds)}</span>
          <button
            onClick={() => onStopRecording(true)}
            aria-label="إلغاء التسجيل"
            className="min-h-11 min-w-11 rounded-2xl flex items-center justify-center hover:bg-accent"
          >
            <X className="w-5 h-5" />
          </button>
          <button
            onClick={() => onStopRecording(false)}
            aria-label="إرسال التسجيل"
            className="w-11 h-11 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center"
          >
            <Square className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <>
          {(replyTo || editing) && (
            <div className="glass rounded-2xl px-3 py-2 flex items-center gap-2 text-xs">
              {editing ? (
                <Pencil className="w-3.5 h-3.5 text-primary" />
              ) : (
                <Reply className="w-3.5 h-3.5 text-primary" />
              )}
              <p className="flex-1 truncate text-muted-foreground">
                {editing ? "تعديل: " : "رد على: "}
                {snippet(editing ?? replyTo ?? undefined)}
              </p>
              <button
                onClick={onCancelTarget}
                aria-label="إلغاء"
                className="min-h-11 min-w-11 rounded-lg flex items-center justify-center hover:bg-accent"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          {showQuick && (
            <div
              role="group"
              aria-label={t("chat.quick.label")}
              className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5"
            >
              {QUICK.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    setInput(t(`chat.quick.${k}`));
                    inputRef.current?.focus();
                  }}
                  className="shrink-0 min-h-11 px-3 rounded-full glass text-xs font-bold text-primary whitespace-nowrap hover:bg-primary/10"
                >
                  {t(`chat.quick.${k}`)}
                </button>
              ))}
            </div>
          )}
          <div className="glass-strong rounded-3xl p-2 flex items-end gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(e) => onAttach(e.target.files?.[0] ?? null)}
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              aria-label="إرفاق صورة"
              className="min-h-11 min-w-11 rounded-2xl flex items-center justify-center text-primary hover:bg-primary/10 disabled:opacity-50"
            >
              {uploading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Paperclip className="w-5 h-5" />
              )}
            </button>
            <button
              onClick={onAskAi}
              disabled={aiBusy}
              aria-label={input.trim() ? "اسأل المساعد الذكي (رد خاص بك)" : "لخّص المحادثة لي"}
              className="min-h-11 min-w-11 rounded-2xl flex items-center justify-center bg-gradient-to-br from-primary to-primary-glow text-white shrink-0 hover:scale-105 transition-transform"
            >
              <Sparkles className="w-4 h-4" />
            </button>
            <textarea
              ref={inputRef}
              value={input}
              rows={Math.min(4, Math.max(1, input.split("\n").length))}
              onChange={(e) => {
                setInput(e.target.value);
                onType();
              }}
              onKeyDown={(e) => {
                // Enter يرسل، وShift+Enter سطر جديد، ولا إرسال أثناء تركيب الحروف.
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void onSend();
                }
              }}
              placeholder={editing ? "عدّل رسالتك…" : "اكتب رسالة…"}
              aria-label="نص الرسالة"
              className="flex-1 bg-transparent outline-none text-sm px-2 py-2.5 placeholder:text-muted-foreground resize-none max-h-28"
            />
            {input.trim() ? (
              <button
                onClick={onSend}
                disabled={sending}
                aria-label="إرسال الرسالة"
                className="w-11 h-11 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center glow-primary hover:scale-105 transition-transform disabled:opacity-50"
              >
                {sending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4 rtl:-scale-x-100" />
                )}
              </button>
            ) : (
              <button
                onClick={onStartRecording}
                disabled={uploading}
                aria-label="تسجيل رسالة صوتية"
                className="w-11 h-11 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center glow-primary hover:scale-105 transition-transform disabled:opacity-50"
              >
                <Mic className="w-5 h-5" />
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
