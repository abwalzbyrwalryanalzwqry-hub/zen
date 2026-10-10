import { useState } from "react";
import { CalendarRange, Loader2, MessageSquareText, Share2 } from "lucide-react";
import { draftGuardianNote, draftWeekPlan, type TeacherDraft } from "@/lib/tools-client";
import { shareText } from "@/lib/at-risk";

type Kind = "plan" | "note";
const LABEL: Record<Kind, string> = {
  plan: "مسودّة خطة الأسبوع",
  note: "مسودّة رسالة لوليّ الأمر",
};

/**
 * مساعد المعلّم (12.3): مسودّتان تُحرَّران هنا. لا يُرسل شيء ولا يُنشأ واجب تلقائياً: المشاركة
 * بضغطة المعلّم نفسه بعد المراجعة.
 */
export function TeacherDrafts({ studentId }: { studentId: string }) {
  const [kind, setKind] = useState<Kind | null>(null);
  const [busy, setBusy] = useState<Kind | null>(null);
  const [draft, setDraft] = useState<TeacherDraft | null>(null);
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const run = async (k: Kind) => {
    setBusy(k);
    setErr(null);
    setNote(null);
    try {
      const d = await (k === "plan" ? draftWeekPlan(studentId) : draftGuardianNote(studentId));
      setKind(k);
      setDraft(d);
      setText(d.text);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "تعذّر إعداد المسودّة.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section aria-label="مساعد المعلّم" className="glass-strong rounded-3xl p-4 space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {(["plan", "note"] as const).map((k) => (
          <button
            key={k}
            onClick={() => void run(k)}
            disabled={busy != null}
            className="rounded-2xl glass text-[0.6875rem] font-semibold py-2.5 flex items-center justify-center gap-1.5 disabled:opacity-60"
          >
            {busy === k ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : k === "plan" ? (
              <CalendarRange className="w-3.5 h-3.5" />
            ) : (
              <MessageSquareText className="w-3.5 h-3.5" />
            )}
            {LABEL[k]}
          </button>
        ))}
      </div>
      {err && (
        <p role="alert" className="text-xs text-destructive">
          {err}
        </p>
      )}
      {kind && draft && (
        <div className="space-y-2">
          <label className="block text-[0.6875rem] font-bold">
            {LABEL[kind]} (قابلة للتعديل)
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={7}
              maxLength={1500}
              className="mt-1 w-full rounded-2xl bg-background/70 p-3 text-xs leading-relaxed outline-none"
            />
          </label>
          <p className="text-[0.625rem] text-muted-foreground">
            {draft.ai ? "مسودّة آلية من أرقام الأسبوع فقط" : "مسودّة من الأرقام (المساعد غير متاح)"}
            {" — "}راجعها وعدّلها؛ لا يُرسل شيء إلا حين تضغط «مشاركة».
          </p>
          <button
            onClick={() =>
              void shareText(text.trim()).then((r) =>
                setNote(r === "copied" ? "نُسخت المسودّة." : r === "shared" ? "شُورِكت." : null),
              )
            }
            disabled={!text.trim()}
            className="w-full rounded-xl bg-primary text-primary-foreground py-2 text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <Share2 className="w-3.5 h-3.5" /> مشاركة
          </button>
          {note && (
            <p role="status" className="text-center text-[0.625rem] text-primary">
              {note}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
