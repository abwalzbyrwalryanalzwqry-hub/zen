import { useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { teacherWeeklySummary, type WeekFacts } from "@/lib/tools-client";

/** زر «ملخّص الأسبوع» للمعلّم: أرقام الأسبوع من قاعدة البيانات، وملخّص نصي مبني عليها. */
export function TeacherWeekSummary({ studentId }: { studentId: string }) {
  const summarize = teacherWeeklySummary;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [res, setRes] = useState<{ facts: WeekFacts; text: string; ai: boolean } | null>(null);

  const run = async () => {
    setBusy(true);
    setErr(null);
    try {
      setRes(await summarize({ data: { student_id: studentId } }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "تعذّر إعداد الملخّص.");
    } finally {
      setBusy(false);
    }
  };

  const f = res?.facts;
  return (
    <div className="glass-strong rounded-3xl p-4 space-y-3">
      <button
        onClick={() => void run()}
        disabled={busy}
        className="w-full rounded-2xl glass text-xs font-semibold py-2.5 flex items-center justify-center gap-1.5 text-foreground disabled:opacity-60"
      >
        {busy ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <FileText className="w-3.5 h-3.5" />
        )}
        ملخّص الأسبوع
      </button>
      {err && (
        <p role="alert" className="text-xs text-destructive">
          {err}
        </p>
      )}
      {f && res && (
        <>
          <div className="grid grid-cols-4 gap-1.5 text-center">
            {(
              [
                ["حضور", f.attendance?.present ?? 0],
                ["غياب", f.attendance?.absent ?? 0],
                ["متوسط", f.avg_score ?? "—"],
                ["مراجعة مستحقة", f.reviews?.due ?? 0],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="rounded-xl glass py-1.5">
                <p className="text-sm font-black text-foreground">{v}</p>
                <p className="text-[0.5625rem] text-muted-foreground">{k}</p>
              </div>
            ))}
          </div>
          <p className="text-sm leading-7 whitespace-pre-line text-foreground/90">{res.text}</p>
          <p className="text-[0.625rem] text-muted-foreground/80">
            {res.ai
              ? "ملخّص آلي مبني على أرقام هذا الأسبوع فقط؛ راجعه قبل مشاركته."
              : "ملخّص رقمي (المساعد غير متاح حالياً)."}
          </p>
        </>
      )}
    </div>
  );
}
