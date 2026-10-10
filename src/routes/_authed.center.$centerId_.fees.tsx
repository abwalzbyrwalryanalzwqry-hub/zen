import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Image as Loader2, Plus, Search, Wallet } from "lucide-react";
import { PhoneFrame } from "@/components/zen/PhoneFrame";
import { BackButton } from "@/components/zen/BackButton";
import { ChargeSheet, ReceiptRow, StudentSheet } from "@/components/zen/fees/CenterFeeSheets";
import {
  formatMoney,
  getCenterReceipts,
  getFeeOverview,
  setFeesEnabled,
  type FeeStudentRow,
} from "@/lib/fees";
import { formatDay } from "@/lib/format";
import { useT, t as tStatic } from "@/lib/i18n";
import { usePagesDict } from "@/lib/pages-i18n";
import { toast } from "@/lib/toast";

/**
 * دفتر رسوم المركز (1.21.0، 5.1–5.2): /center/$centerId/fees — لمنشئ المركز ومديره وحدهما (manages_center).
 * المستحقات لطالب أو لعدة طلاب، وتسجيل الدفعات، وتأكيد إيصالات أولياء الأمور أو رفضها بسبب. لا دفع داخل التطبيق.
 */
export const Route = createFileRoute("/_authed/center/$centerId_/fees")({
  head: () => ({ meta: [{ title: tStatic("meta.fees") }] }),
  component: CenterFeesPage,
});

function CenterFeesPage() {
  usePagesDict();
  const t = useT();
  const { centerId } = Route.useParams();
  const qc = useQueryClient();
  const ov = useQuery({
    queryKey: ["fee-overview", centerId],
    queryFn: () => getFeeOverview(centerId),
    retry: false,
  });
  const rc = useQuery({
    queryKey: ["fee-receipts", centerId],
    queryFn: () => getCenterReceipts(centerId, "pending"),
    enabled: !!ov.data?.enabled,
    retry: false,
  });
  const [query, setQuery] = useState("");
  const [charge, setCharge] = useState(false);
  const [student, setStudent] = useState<FeeStudentRow | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["fee-overview", centerId] });
    void qc.invalidateQueries({ queryKey: ["fee-receipts", centerId] });
    void qc.invalidateQueries({ queryKey: ["fee-statement"] });
  };
  const toggle = async (on: boolean) => {
    setBusy(true);
    try {
      await setFeesEnabled(centerId, on);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("fees.err.save"));
    } finally {
      setBusy(false);
    }
  };
  const rows = useMemo(() => {
    const q = query.trim();
    const list = ov.data?.students ?? [];
    return list
      .filter((s) => !q || s.name.includes(q) || (s.halaqat ?? "").includes(q))
      .sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name, "ar"));
  }, [ov.data, query]);
  const currency = ov.data?.students.find((s) => s.charged > 0)?.currency ?? "YER";

  return (
    <PhoneFrame>
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="px-5 pt-12 pb-3 flex items-center gap-3">
          <BackButton fallback={`/center/${centerId}`} />
          <div className="flex-1">
            <h1 className="text-xl font-black text-foreground">{t("fees.center.title")}</h1>
            <p className="text-[0.6875rem] text-muted-foreground">{t("fees.center.sub")}</p>
          </div>
          <Wallet className="w-5 h-5 text-primary" aria-hidden="true" />
        </header>
        <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-3">
          {ov.isPending ? (
            <div className="py-10 flex justify-center" role="status">
              <Loader2 className="w-5 h-5 animate-spin text-primary" aria-hidden="true" />
            </div>
          ) : ov.isError ? (
            <p role="alert" className="glass rounded-3xl p-6 text-xs text-destructive text-center">
              {ov.error.message}
            </p>
          ) : !ov.data.enabled ? (
            <section className="glass rounded-3xl p-5 space-y-3 text-center">
              <h2 className="text-sm font-bold">{t("fees.center.offTitle")}</h2>
              <p className="text-xs text-muted-foreground leading-6">{t("fees.center.offBody")}</p>
              <button
                type="button"
                disabled={busy}
                onClick={() => void toggle(true)}
                className="w-full min-h-12 rounded-2xl bg-primary text-primary-foreground text-sm font-bold disabled:opacity-50"
              >
                {t("fees.center.enable")}
              </button>
            </section>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Stat
                  label={t("fees.charged")}
                  value={formatMoney(ov.data.totals.charged, currency)}
                />
                <Stat label={t("fees.paid")} value={formatMoney(ov.data.totals.paid, currency)} />
                <Stat
                  label={t("fees.balance")}
                  value={formatMoney(ov.data.totals.balance, currency)}
                  warn={ov.data.totals.balance > 0}
                />
                <Stat
                  label={t("fees.center.overdue")}
                  value={t("fees.center.studentsDue", { n: ov.data.totals.students_due })}
                  warn={ov.data.totals.overdue > 0}
                />
              </div>
              <button
                type="button"
                onClick={() => setCharge(true)}
                className="w-full min-h-12 rounded-2xl bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                {t("fees.center.addCharge")}
              </button>

              {(rc.data?.length ?? 0) > 0 && (
                <section
                  aria-label={t("fees.receipts.pending")}
                  className="glass rounded-3xl p-4 space-y-2"
                  data-testid="fee-pending"
                >
                  <h2 className="text-sm font-bold">
                    {t("fees.receipts.pending")} ({rc.data?.length})
                  </h2>
                  {rc.data?.map((r) => (
                    <ReceiptRow key={r.id} r={r} onDone={refresh} />
                  ))}
                </section>
              )}

              <section
                aria-label={t("fees.center.students")}
                className="glass rounded-3xl p-4 space-y-2"
              >
                <div className="relative">
                  <Search
                    className="w-4 h-4 text-muted-foreground absolute start-3 top-1/2 -translate-y-1/2"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    aria-label={t("fees.center.search")}
                    placeholder={t("fees.center.search")}
                    className="w-full min-h-11 rounded-2xl bg-secondary/60 ps-9 pe-3 text-sm"
                  />
                </div>
                {rows.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    {t("fees.center.noStudents")}
                  </p>
                ) : (
                  <ul className="divide-y divide-border/50">
                    {rows.map((s) => (
                      <li key={s.student_id}>
                        <button
                          type="button"
                          onClick={() => setStudent(s)}
                          className="w-full min-h-12 flex items-center gap-2 py-2 text-start"
                        >
                          <span className="flex-1 min-w-0">
                            <span className="block text-sm font-bold truncate">
                              {s.name || "—"}
                            </span>
                            <span className="block text-[0.6875rem] text-muted-foreground truncate">
                              {s.halaqat ?? ""}
                              {s.last_paid
                                ? ` · ${t("fees.center.lastPaid", { d: formatDay(s.last_paid) })}`
                                : ""}
                            </span>
                          </span>
                          <span
                            className={`text-xs font-black tabular-nums ${s.overdue > 0 ? "text-gold" : s.balance > 0 ? "text-foreground" : "text-primary"}`}
                          >
                            {s.balance > 0
                              ? formatMoney(s.balance, s.currency)
                              : t("fees.center.clear")}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <button
                type="button"
                disabled={busy}
                onClick={() => void toggle(false)}
                className="w-full min-h-11 rounded-2xl glass text-xs text-muted-foreground"
              >
                {t("fees.center.disable")}
              </button>
            </>
          )}
        </div>
      </div>
      {ov.data?.enabled && (
        <ChargeSheet
          open={charge}
          onOpenChange={setCharge}
          centerId={centerId}
          students={ov.data.students}
          onDone={refresh}
        />
      )}
      <StudentSheet
        centerId={centerId}
        student={student}
        onClose={() => setStudent(null)}
        onDone={refresh}
      />
    </PhoneFrame>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="glass rounded-2xl px-3 py-2.5">
      <p className="text-[0.6875rem] text-muted-foreground">{label}</p>
      <p className={`text-sm font-black tabular-nums ${warn ? "text-gold" : "text-foreground"}`}>
        {value}
      </p>
    </div>
  );
}
