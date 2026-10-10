import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, History, Info, Loader2, ShieldCheck } from "lucide-react";
import { EmptyState } from "@/components/zen/common/EmptyState";
import { QueryError } from "@/components/zen/QueryError";
import { intlLocale, useT } from "@/lib/i18n";
import { usePagesDict } from "@/lib/pages-i18n";
import { toast } from "@/lib/toast";
import { segmentsText } from "@/lib/daily-record-text";
import { gradeLabel, gradeOf } from "@/lib/grading";
import {
  ANOMALY_SEVERITY,
  anomalyText,
  changedFields,
  fetchAnomalies,
  fetchAuditList,
  fetchAuditSample,
  reviewAuditSample,
  sortAnomalies,
  type Anomaly,
  type AuditRow,
  type AuditSnapshot,
  type ChangeField,
  type SampleItem,
} from "@/lib/record-audit";
import { ensureRegisterDict } from "@/lib/register-i18n";

ensureRegisterDict();

/**
 * تبويب «التدقيق» في السجل اليومي (1.18.0، المرحلة 2): تنبيهات المراقب، والتعديلات بعد الإغلاق بمن وقبل وبعد،
 * وعيّنة الأسبوع للمشرف وإدارة المركز (تظهر لمن يملكها فقط).
 */
export function RecordAuditTab({
  halaqa,
  onOpenDay,
}: {
  halaqa: string;
  onOpenDay: (date: string) => void;
}) {
  usePagesDict();
  const t = useT();
  const anomalies = useQuery({
    queryKey: ["record-anomalies", halaqa],
    enabled: !!halaqa,
    queryFn: () => fetchAnomalies(halaqa, 30),
  });
  const audit = useQuery({
    queryKey: ["record-audit", halaqa],
    enabled: !!halaqa,
    queryFn: () => fetchAuditList(halaqa),
  });
  const sample = useQuery({
    queryKey: ["audit-sample", halaqa],
    enabled: !!halaqa,
    retry: false,
    queryFn: () => fetchAuditSample(halaqa),
  });

  if (anomalies.isPending || audit.isPending)
    return (
      <div className="flex justify-center py-10" role="status" aria-label={t("common.loading")}>
        <Loader2 className="w-5 h-5 animate-spin text-primary" aria-hidden="true" />
      </div>
    );
  if (anomalies.isError || audit.isError)
    return (
      <QueryError
        onRetry={() => {
          void anomalies.refetch();
          void audit.refetch();
        }}
      />
    );
  const items = sortAnomalies(anomalies.data.items);
  return (
    <div className="space-y-3" data-testid="record-audit">
      <section aria-labelledby="audit-warnings" className="space-y-1.5">
        <h2 id="audit-warnings" className="text-sm font-bold text-foreground px-1">
          {t("dailyRecord.audit.warnings", { n: anomalies.data.days })}
        </h2>
        <p className="text-xs text-muted-foreground px-1">{t("dailyRecord.audit.warningsHint")}</p>
        {items.length === 0 ? (
          <p className="glass rounded-2xl p-3 text-xs text-muted-foreground flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
            {t("dailyRecord.audit.noWarnings")}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {items.map((a, i) => (
              <AnomalyRow
                key={`${a.code}-${a.student_id ?? ""}-${a.date ?? ""}-${i}`}
                a={a}
                onOpenDay={onOpenDay}
              />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="audit-edits" className="space-y-1.5">
        <h2 id="audit-edits" className="text-sm font-bold text-foreground px-1">
          {t("dailyRecord.audit.edits")}
        </h2>
        {audit.data.length === 0 ? (
          <EmptyState icon={History} title={t("dailyRecord.audit.noEdits")} />
        ) : (
          <ul className="space-y-1.5">
            {audit.data.map((r) => (
              <AuditItem key={r.id} r={r} onOpenDay={onOpenDay} />
            ))}
          </ul>
        )}
      </section>

      {sample.data && <SampleSection halaqa={halaqa} items={sample.data.items} />}
    </div>
  );
}

function AnomalyRow({ a, onOpenDay }: { a: Anomaly; onOpenDay: (d: string) => void }) {
  const t = useT();
  const check = ANOMALY_SEVERITY[a.code] === "check";
  const Icon = check ? AlertTriangle : Info;
  const text = anomalyText(a);
  return (
    <li
      data-anomaly={a.code}
      className={`rounded-2xl p-3 text-xs flex items-start gap-2 ${check ? "bg-gold/12" : "glass"}`}
    >
      <Icon
        className={`w-4 h-4 shrink-0 mt-0.5 ${check ? "text-gold-ink" : "text-muted-foreground"}`}
        aria-hidden="true"
      />
      <div className="flex-1 min-w-0">
        {a.student_name && <p className="font-bold text-foreground">{a.student_name}</p>}
        <p className="text-foreground">{text}</p>
      </div>
      {a.date && (
        <button
          type="button"
          onClick={() => onOpenDay(a.date!)}
          className="min-h-11 px-2 rounded-xl text-primary font-bold shrink-0"
          aria-label={t("dailyRecord.audit.openDay", { date: a.date })}
        >
          {shortDate(a.date)}
        </button>
      )}
    </li>
  );
}

function shortDate(d: string): string {
  return new Intl.DateTimeFormat(intlLocale(), { day: "numeric", month: "short" }).format(
    new Date(`${d}T12:00:00`),
  );
}

function fieldText(t: ReturnType<typeof useT>, f: ChangeField, s: AuditSnapshot | null): string {
  if (!s) return t("dailyRecord.audit.empty");
  switch (f) {
    case "status":
      return s.status ? t(`dailyRecord.attendance.${s.status}`) : t("dailyRecord.audit.empty");
    case "reason":
      return s.reason ?? t("dailyRecord.audit.empty");
    case "note":
      return s.note ?? t("dailyRecord.audit.empty");
    case "evaluation":
      return s.evaluation?.overall ? String(s.evaluation.overall) : t("dailyRecord.audit.empty");
    case "memorize":
    case "review": {
      const w = s[f];
      if (!w) return t("dailyRecord.audit.empty");
      return [
        segmentsText(w.segments),
        typeof w.score === "number" ? gradeLabel(gradeOf(w.score)) : null,
        w.error_type && w.error_type !== "none"
          ? t(`dailyRecord.errorTypes.${w.error_type}`)
          : null,
      ]
        .filter(Boolean)
        .join(" · ");
    }
  }
}

function AuditItem({ r, onOpenDay }: { r: AuditRow; onOpenDay: (d: string, r: AuditRow) => void }) {
  const t = useT();
  const when = new Intl.DateTimeFormat(intlLocale(), {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(r.at));
  const fields = r.action === "edit" ? changedFields(r.before, r.after) : [];
  return (
    <li className="glass rounded-2xl p-3 text-xs space-y-1" data-audit={r.action}>
      <div className="flex items-center gap-2">
        <p className="flex-1 min-w-0 font-bold text-foreground truncate">
          {r.action === "edit"
            ? (r.student_name ?? t("students.someone"))
            : t(`dailyRecord.audit.actions.${r.action}`)}
        </p>
        <button
          type="button"
          onClick={() => onOpenDay(r.record_date, r)}
          className="min-h-11 px-2 rounded-xl text-primary font-bold shrink-0"
          aria-label={t("dailyRecord.audit.openDay", { date: r.record_date })}
        >
          {shortDate(r.record_date)}
        </button>
      </div>
      {fields.map((f) => (
        <p key={f} className="text-foreground">
          <span className="text-muted-foreground">{t(`dailyRecord.audit.fields.${f}`)}: </span>
          <span className="line-through text-muted-foreground">{fieldText(t, f, r.before)}</span>
          {" ← "}
          <span className="font-semibold">{fieldText(t, f, r.after)}</span>
        </p>
      ))}
      <p className="text-muted-foreground">
        {t("dailyRecord.audit.by", { name: r.actor_name ?? t("students.someone"), time: when })}
      </p>
    </li>
  );
}

function SampleSection({ halaqa, items }: { halaqa: string; items: SampleItem[] }) {
  const t = useT();
  const qc = useQueryClient();
  const [flagging, setFlagging] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const key = (i: SampleItem) => `${i.record_id}:${i.student_id}`;
  const submit = async (i: SampleItem, ok: boolean) => {
    if (!ok && !note.trim()) return void toast.error(t("dailyRecord.audit.sample.reasonRequired"));
    setBusy(key(i));
    try {
      await reviewAuditSample(i.record_id, i.student_id, ok, ok ? null : note.trim());
      toast.success(
        t(ok ? "dailyRecord.audit.sample.confirmed" : "dailyRecord.audit.sample.flagged"),
      );
      setFlagging(null);
      setNote("");
      await qc.invalidateQueries({ queryKey: ["audit-sample", halaqa] });
    } catch {
      toast.error(t("dailyRecord.audit.sample.failed"));
    } finally {
      setBusy(null);
    }
  };
  return (
    <section aria-labelledby="audit-sample" className="space-y-1.5" data-testid="audit-sample">
      <h2
        id="audit-sample"
        className="text-sm font-bold text-foreground px-1 flex items-center gap-1.5"
      >
        <ShieldCheck className="w-4 h-4 text-primary" aria-hidden="true" />
        {t("dailyRecord.audit.sample.title")}
      </h2>
      <p className="text-xs text-muted-foreground px-1">{t("dailyRecord.audit.sample.hint")}</p>
      {items.length === 0 ? (
        <p className="glass rounded-2xl p-3 text-xs text-muted-foreground">
          {t("dailyRecord.audit.sample.empty")}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((i) => (
            <li
              key={key(i)}
              className="glass rounded-2xl p-3 text-xs space-y-1.5"
              data-sample={i.student_id}
            >
              <div className="flex items-center gap-2">
                <p className="flex-1 font-bold text-foreground">{i.student_name}</p>
                <span className="text-muted-foreground">{shortDate(i.date)}</span>
              </div>
              <p className="text-foreground">
                {(["status", "memorize", "review"] as const)
                  .map((f) => (i.entry[f] ? fieldText(t, f, i.entry) : null))
                  .filter(Boolean)
                  .join(" — ")}
              </p>
              {i.review ? (
                <p
                  className={i.review.ok ? "text-primary font-bold" : "text-destructive font-bold"}
                >
                  {i.review.ok
                    ? t("dailyRecord.audit.sample.okBy", { name: i.review.reviewer_name ?? "" })
                    : t("dailyRecord.audit.sample.flaggedBy", {
                        name: i.review.reviewer_name ?? "",
                        note: i.review.note ?? "",
                      })}
                </p>
              ) : flagging === key(i) ? (
                <div className="space-y-1.5">
                  <label className="block">
                    <span className="sr-only">{t("dailyRecord.audit.sample.reasonLabel")}</span>
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      maxLength={500}
                      rows={2}
                      placeholder={t("dailyRecord.audit.sample.reasonLabel")}
                      className="w-full rounded-xl bg-background/70 border border-border p-2 text-xs text-foreground"
                    />
                  </label>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      disabled={busy === key(i)}
                      onClick={() => void submit(i, false)}
                      className="flex-1 min-h-11 rounded-xl bg-destructive text-destructive-foreground font-bold disabled:opacity-50"
                    >
                      {t("dailyRecord.audit.sample.sendFlag")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setFlagging(null)}
                      className="min-h-11 px-3 rounded-xl glass text-foreground font-bold"
                    >
                      {t("common.cancel")}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    disabled={busy === key(i)}
                    onClick={() => void submit(i, true)}
                    className="flex-1 min-h-11 rounded-xl bg-primary/15 text-primary font-bold disabled:opacity-50"
                  >
                    {t("dailyRecord.audit.sample.ok")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNote("");
                      setFlagging(key(i));
                    }}
                    className="flex-1 min-h-11 rounded-xl glass text-destructive font-bold"
                  >
                    {t("dailyRecord.audit.sample.flag")}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * صفحة الطالب (1.18.0): ما عُدّل في سجلاته بعد إغلاق أيامها، في كل حلقة يقرؤها المستخدم. لا يظهر إن لم يُعدَّل
 * شيء، فلا يزاحم الصفحة.
 */
export function StudentRecordEdits({ studentId }: { studentId: string }) {
  usePagesDict();
  const t = useT();
  const navigate = useNavigate();
  const q = useQuery({
    queryKey: ["record-audit-student", studentId],
    queryFn: () => fetchAuditList(null, studentId, 20),
    retry: false,
  });
  if (!q.data?.length) return null;
  return (
    <section
      aria-labelledby="student-edits"
      className="space-y-1.5"
      data-testid="student-record-edits"
    >
      <h2
        id="student-edits"
        className="text-sm font-bold text-foreground px-1 flex items-center gap-1.5"
      >
        <History className="w-4 h-4 text-primary" aria-hidden="true" />
        {t("dailyRecord.audit.studentEdits", { n: q.data.length })}
      </h2>
      <ul className="space-y-1.5">
        {q.data.map((r) => (
          <AuditItem
            key={r.id}
            r={r}
            onOpenDay={(date, row) =>
              void navigate({ to: "/teacher/register", search: { halaqa: row.halaqa_id, date } })
            }
          />
        ))}
      </ul>
    </section>
  );
}
