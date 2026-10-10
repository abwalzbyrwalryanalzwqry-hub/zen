import { RotateCw, Sparkles, Loader2, X } from "lucide-react";
import { type OutboxItem } from "@/lib/chat-outbox";

/** ما بعد الرسائل: الصادر المنتظر، ومؤشّر الكتابة، ورد المساعد الخاص (المرحلة 7.6). */
export function ChatTail({
  outbox,
  typing,
  aiBusy,
  aiNote,
  onRetry,
  onCloseAi,
}: {
  outbox: OutboxItem[];
  typing: boolean;
  aiBusy: boolean;
  aiNote: { title: string; text: string; error?: boolean } | null;
  onRetry: (o: OutboxItem) => Promise<void>;
  onCloseAi: () => void;
}) {
  return (
    <>
      {outbox.map((o) => (
        <div key={o.client_id} className="flex justify-start">
          <div className="max-w-[78%] rounded-3xl rounded-br-md px-4 py-2.5 bg-primary/70 text-primary-foreground">
            <p className="text-sm leading-relaxed whitespace-pre-line">{o.content}</p>
            <p className="text-[0.625rem] mt-1 text-primary-foreground/80 flex items-center gap-1">
              {o.status === "sending" ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" /> جارٍ الإرسال…
                </>
              ) : (
                <button
                  onClick={() => void onRetry(o)}
                  className="inline-flex items-center gap-1 underline underline-offset-2"
                >
                  <RotateCw className="w-3 h-3" /> لم تُرسل، اضغط لإعادة المحاولة
                </button>
              )}
            </p>
          </div>
        </div>
      ))}
      {typing && (
        <div className="flex justify-end">
          <div className="glass rounded-3xl px-4 py-3 flex gap-1.5 items-center">
            <span className="w-1.5 h-1.5 rounded-full bg-primary anim-typing-dot" />
            <span
              className="w-1.5 h-1.5 rounded-full bg-primary anim-typing-dot"
              style={{ animationDelay: "150ms" }}
            />
            <span
              className="w-1.5 h-1.5 rounded-full bg-primary anim-typing-dot"
              style={{ animationDelay: "300ms" }}
            />
          </div>
        </div>
      )}
      {(aiBusy || aiNote) && (
        <div
          role="status"
          className={`glass-strong rounded-3xl px-4 py-3 border ${aiNote?.error ? "border-destructive/40" : "border-gold/40"}`}
        >
          <div className="flex items-center gap-2 mb-1.5">
            <Sparkles className="w-3.5 h-3.5 text-gold shrink-0" />
            <p className="text-[0.6875rem] font-bold text-foreground flex-1 truncate">
              {aiBusy ? "المساعد يفكّر…" : aiNote?.title}
            </p>
            {!aiBusy && (
              <button
                onClick={onCloseAi}
                aria-label="إغلاق رد المساعد"
                className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-accent"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {aiBusy ? (
            <Loader2 className="w-4 h-4 animate-spin text-gold" />
          ) : (
            <p className="text-xs leading-relaxed text-foreground whitespace-pre-line">
              {aiNote?.text}
            </p>
          )}
          <p className="text-[0.625rem] text-muted-foreground mt-2">
            يظهر لك وحدك ولا يُرسل في المحادثة.
          </p>
        </div>
      )}
    </>
  );
}
