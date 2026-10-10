import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock, Headphones, Loader2, Send } from "lucide-react";
import { PhoneFrame } from "@/components/zen/PhoneFrame";
import { BackButton } from "@/components/zen/BackButton";
import { Recorder, type RecorderResult } from "@/components/zen/Recorder";
import { useSession } from "@/hooks/useSession";
import { formatDay } from "@/lib/format";
import { useT, t as tStatic } from "@/lib/i18n";
import { usePagesDict } from "@/lib/pages-i18n";
import {
  formatDuration,
  mistakeCounts,
  myRemote,
  submitRemote,
  type RemoteItem,
} from "@/lib/remote-recitation";
import { toast } from "@/lib/toast";

/**
 * التسميع عن بُعد للطالب (1.21.0، 5.3): /recite/remote — المقاطع التي أرسلها المعلّم، يسجّلها الطالب كاملة
 * ويرسلها، ثم يرى الدرجة والآيات التي فيها خطأ بعد المراجعة (وقد دخلت سجل اليوم في حلقته).
 */
export const Route = createFileRoute("/_authed/recite_/remote")({
  head: () => ({ meta: [{ title: tStatic("meta.remote") }] }),
  component: RemoteStudentPage,
});

function RemoteStudentPage() {
  usePagesDict();
  const t = useT();
  const { userId } = useSession();
  const q = useQuery({
    queryKey: ["remote-mine", userId],
    enabled: !!userId,
    queryFn: myRemote,
  });
  const open = q.data?.filter((r) => r.status === "assigned") ?? [];
  const rest = q.data?.filter((r) => r.status !== "assigned") ?? [];
  return (
    <PhoneFrame>
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="px-5 pt-12 pb-3 flex items-center gap-3">
          <BackButton fallback="/more" />
          <div className="flex-1">
            <h1 className="text-xl font-black text-foreground">{t("remote.student.title")}</h1>
            <p className="text-[0.6875rem] text-muted-foreground">{t("remote.student.sub")}</p>
          </div>
          <Headphones className="w-5 h-5 text-primary" aria-hidden="true" />
        </header>
        <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-3">
          {q.isPending ? (
            <div className="py-10 flex justify-center" role="status">
              <Loader2 className="w-5 h-5 animate-spin text-primary" aria-hidden="true" />
            </div>
          ) : q.isError ? (
            <p role="alert" className="text-xs text-destructive text-center">
              {q.error.message}
            </p>
          ) : q.data.length === 0 ? (
            <p className="glass rounded-3xl p-6 text-center text-xs text-muted-foreground">
              {t("remote.student.empty")}
            </p>
          ) : (
            <>
              {open.map((r) => userId && <AssignedCard key={r.id} r={r} userId={userId} />)}
              {rest.map((r) => (
                <DoneCard key={r.id} r={r} />
              ))}
            </>
          )}
        </div>
      </div>
    </PhoneFrame>
  );
}

function Passage({ r }: { r: RemoteItem }) {
  const t = useT();
  return (
    <div className="space-y-0.5">
      <p className="text-sm font-black">
        {t("remote.passage", { surah: r.surah_name, from: r.from_ayah, to: r.to_ayah })}
      </p>
      <p className="text-[0.6875rem] text-muted-foreground">
        {t(`remote.kind.${r.kind}`)} · {r.halaqa_name}
        {r.teacher_name ? ` · ${r.teacher_name}` : ""}
        {r.due_date ? ` · ${t("remote.due", { d: formatDay(r.due_date) })}` : ""}
      </p>
      {r.instructions && <p className="text-xs text-foreground pt-1">{r.instructions}</p>}
    </div>
  );
}

function AssignedCard({ r, userId }: { r: RemoteItem; userId: string }) {
  const t = useT();
  const qc = useQueryClient();
  const [rec, setRec] = useState<RecorderResult | null>(null);
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (!rec) return;
    setBusy(true);
    try {
      await submitRemote(r, userId, rec.blob, rec.seconds);
      toast.success(t("remote.student.sent"));
      void qc.invalidateQueries({ queryKey: ["remote-mine"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("remote.err.save"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="glass rounded-3xl p-4 space-y-3" data-testid="remote-assigned">
      <Passage r={r} />
      <p className="text-[0.6875rem] text-muted-foreground">{t("remote.student.recordHint")}</p>
      <Recorder onReady={setRec} disabled={busy} />
      <button
        type="button"
        disabled={!rec || busy}
        onClick={() => void send()}
        className="w-full min-h-12 rounded-2xl bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {busy ? (
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
        ) : (
          <Send className="w-4 h-4" aria-hidden="true" />
        )}
        {t("remote.student.send")}
      </button>
    </section>
  );
}

function DoneCard({ r }: { r: RemoteItem }) {
  const t = useT();
  const c = mistakeCounts(r.mistakes);
  return (
    <section className="glass rounded-3xl p-4 space-y-2" data-testid="remote-done">
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <Passage r={r} />
        </div>
        {r.status === "reviewed" ? (
          <CheckCircle2 className="w-5 h-5 text-primary shrink-0" aria-hidden="true" />
        ) : (
          <Clock className="w-5 h-5 text-muted-foreground shrink-0" aria-hidden="true" />
        )}
      </div>
      <p className="text-xs font-bold">
        {t(`remote.status.${r.status}`)}
        {r.status === "submitted" ? ` · ${formatDuration(r.duration_seconds)}` : ""}
        {r.status === "reviewed" && r.grade ? ` · ${t("remote.grade", { n: r.grade })}` : ""}
      </p>
      {r.status === "reviewed" && (
        <>
          {r.mistakes.length === 0 ? (
            <p className="text-xs text-primary">{t("remote.student.noMistakes")}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              {(["hifz", "tajweed", "tashkeel", "waqf"] as const)
                .filter((k) => c[k] > 0)
                .map(
                  (k) =>
                    `${t(`remote.mistake.${k}`)}: ${r.mistakes
                      .filter((m) => m.type === k)
                      .map((m) => m.ayah)
                      .join("، ")}`,
                )
                .join(" · ")}
            </p>
          )}
          {r.teacher_note && <p className="text-xs text-foreground">{r.teacher_note}</p>}
        </>
      )}
    </section>
  );
}
