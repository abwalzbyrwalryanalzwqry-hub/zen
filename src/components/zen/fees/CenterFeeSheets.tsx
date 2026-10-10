import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Image as ImageIcon, Loader2, X } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Field } from "./FeeStatementCard";
import {
  addCharges,
  balanceOf,
  cancelCharge,
  decideReceipt,
  formatMoney,
  getStudentStatement,
  ledgerLines,
  parseAmount,
  receiptImageUrl,
  recordPayment,
  voidPayment,
  type CenterReceipt,
  type FeeStudentRow,
  type PaymentMethod,
} from "@/lib/fees";
import { formatDay } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { toast } from "@/lib/toast";
import { localDayKey } from "@/lib/local-day";

/** نوافذ دفتر رسوم المركز (1.21.0): الإيصال المعلّق، والمستحق الجديد، وكشف الطالب مع تسجيل دفعة. */
export function ReceiptRow({ r, onDone }: { r: CenterReceipt; onDone: () => void }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [img, setImg] = useState<string | null>(null);
  const decide = async (confirm: boolean) => {
    setBusy(true);
    try {
      await decideReceipt(r.id, confirm, confirm ? null : reason.trim());
      toast.success(confirm ? t("fees.receipts.confirmed") : t("fees.receipts.rejected"));
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("fees.err.save"));
    } finally {
      setBusy(false);
    }
  };
  const showImage = async () => {
    if (!r.image_path) return;
    const url = await receiptImageUrl(r.image_path);
    if (url) setImg(url);
    else toast.error(t("fees.err.load"));
  };
  return (
    <div className="rounded-2xl bg-secondary/50 p-3 space-y-2" data-testid="fee-receipt">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold">
            {r.student_name} · {formatMoney(r.amount, r.currency)}
          </p>
          <p className="text-[0.6875rem] text-muted-foreground">
            {r.by_guardian
              ? t("fees.receipts.byGuardian", { name: r.submitted_by_name })
              : t("fees.receipts.byStudent")}
            {r.reference ? ` · ${t("fees.receipts.ref", { ref: r.reference })}` : ""}
            {` · ${formatDay(r.created_at)}`}
          </p>
          {r.note && <p className="text-[0.6875rem] text-foreground mt-1">{r.note}</p>}
        </div>
        {r.image_path && (
          <button
            type="button"
            onClick={() => void showImage()}
            aria-label={t("fees.receipts.viewImage")}
            className="w-11 h-11 rounded-xl glass flex items-center justify-center"
          >
            <ImageIcon className="w-4 h-4 text-primary" aria-hidden="true" />
          </button>
        )}
      </div>
      {img && (
        <img
          src={img}
          alt={t("fees.receipts.viewImage")}
          className="w-full rounded-xl max-h-80 object-contain"
        />
      )}
      {rejecting ? (
        <div className="flex gap-2">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={300}
            aria-label={t("fees.receipts.reason")}
            placeholder={t("fees.receipts.reason")}
            className="flex-1 min-h-11 rounded-xl glass px-3 text-xs"
          />
          <button
            type="button"
            disabled={busy || !reason.trim()}
            onClick={() => void decide(false)}
            className="min-h-11 px-3 rounded-xl bg-destructive text-destructive-foreground text-xs font-bold disabled:opacity-50"
          >
            {t("fees.receipts.reject")}
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void decide(true)}
            className="flex-1 min-h-11 rounded-xl bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center gap-1 disabled:opacity-50"
          >
            <Check className="w-4 h-4" aria-hidden="true" />
            {t("fees.receipts.confirm")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setRejecting(true)}
            className="flex-1 min-h-11 rounded-xl glass text-xs font-bold flex items-center justify-center gap-1"
          >
            <X className="w-4 h-4" aria-hidden="true" />
            {t("fees.receipts.reject")}
          </button>
        </div>
      )}
    </div>
  );
}

export function ChargeSheet({
  open,
  onOpenChange,
  centerId,
  students,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  centerId: string;
  students: FeeStudentRow[];
  onDone: () => void;
}) {
  const t = useT();
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [due, setDue] = useState(localDayKey());
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const value = parseAmount(amount);
  const all = picked.size === students.length && students.length > 0;
  const ok = title.trim().length >= 2 && value !== null && picked.size > 0 && !!due;
  const save = async () => {
    if (!ok || value === null) return;
    setBusy(true);
    try {
      const n = await addCharges(centerId, [...picked], title.trim(), value, due);
      toast.success(t("fees.center.chargesAdded", { n }));
      onOpenChange(false);
      setTitle("");
      setAmount("");
      setPicked(new Set());
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("fees.err.save"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        title={t("fees.center.addCharge")}
        description={t("fees.center.addChargeHint")}
        footer={
          <button
            type="button"
            disabled={!ok || busy}
            onClick={() => void save()}
            className="w-full min-h-12 rounded-2xl bg-primary text-primary-foreground text-sm font-bold disabled:opacity-50"
          >
            {t("fees.center.saveCharge", { n: picked.size })}
          </button>
        }
      >
        <div className="space-y-3">
          <Field label={t("fees.center.chargeTitle")}>
            <input
              value={title}
              maxLength={120}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("fees.center.chargeTitlePh")}
              className="w-full min-h-11 rounded-xl glass px-3 text-sm"
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t("fees.amount")}>
              <input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full min-h-11 rounded-xl glass px-3 text-sm"
              />
            </Field>
            <Field label={t("fees.center.due")}>
              <input
                type="date"
                value={due}
                onChange={(e) => setDue(e.target.value)}
                className="w-full min-h-11 rounded-xl glass px-3 text-sm"
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 min-h-11 text-xs font-bold">
            <input
              type="checkbox"
              checked={all}
              onChange={(e) =>
                setPicked(e.target.checked ? new Set(students.map((s) => s.student_id)) : new Set())
              }
              className="w-5 h-5 accent-primary"
            />
            {t("fees.center.allStudents", { n: students.length })}
          </label>
          <ul className="space-y-1 max-h-64 overflow-y-auto">
            {students.map((s) => (
              <li key={s.student_id}>
                <label className="flex items-center gap-2 min-h-11 text-xs">
                  <input
                    type="checkbox"
                    checked={picked.has(s.student_id)}
                    onChange={(e) => {
                      const next = new Set(picked);
                      if (e.target.checked) next.add(s.student_id);
                      else next.delete(s.student_id);
                      setPicked(next);
                    }}
                    className="w-5 h-5 accent-primary"
                  />
                  <span className="flex-1 truncate">{s.name || "—"}</span>
                  <span className="text-muted-foreground truncate">{s.halaqat ?? ""}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function StudentSheet({
  centerId,
  student,
  onClose,
  onDone,
}: {
  centerId: string;
  student: FeeStudentRow | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const st = useQuery({
    queryKey: ["fee-statement", student?.student_id],
    queryFn: () => getStudentStatement(student!.student_id),
    enabled: !!student,
    retry: false,
  });
  const s = st.data?.find((x) => x.center_id === centerId);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const value = parseAmount(amount);
  const after = () => {
    void qc.invalidateQueries({ queryKey: ["fee-statement", student?.student_id] });
    onDone();
  };
  const pay = async () => {
    if (!student || value === null) return;
    setBusy(true);
    try {
      await recordPayment(
        centerId,
        student.student_id,
        value,
        method,
        reference.trim() || null,
        null,
        null,
      );
      toast.success(t("fees.center.paymentSaved"));
      setAmount("");
      setReference("");
      after();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("fees.err.save"));
    } finally {
      setBusy(false);
    }
  };
  const undo = async (kind: "charge" | "payment", id: string) => {
    try {
      await (kind === "charge" ? cancelCharge(id) : voidPayment(id));
      after();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("fees.err.save"));
    }
  };
  const bal = s ? balanceOf(s) : null;
  return (
    <Sheet open={!!student} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        title={student?.name || "—"}
        description={
          bal && s
            ? bal.credit > 0
              ? `${t("fees.credit")}: ${formatMoney(bal.credit, s.currency)}`
              : `${t("fees.balance")}: ${formatMoney(bal.due, s.currency)}`
            : undefined
        }
      >
        <div className="space-y-4">
          <div className="space-y-2" aria-label={t("fees.center.recordPayment")} role="group">
            <h3 className="text-xs font-bold">{t("fees.center.recordPayment")}</h3>
            <div className="grid grid-cols-2 gap-2">
              <input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                aria-label={t("fees.amount")}
                placeholder={t("fees.amount")}
                className="min-h-11 rounded-xl glass px-3 text-sm"
              />
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                aria-label={t("fees.center.method")}
                className="min-h-11 rounded-xl glass px-3 text-sm"
              >
                {(["cash", "transfer", "other"] as const).map((m) => (
                  <option key={m} value={m}>
                    {t(`fees.methods.${m}`)}
                  </option>
                ))}
              </select>
            </div>
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              maxLength={120}
              aria-label={t("fees.receipts.reference")}
              placeholder={t("fees.receipts.reference")}
              className="w-full min-h-11 rounded-xl glass px-3 text-sm"
            />
            <button
              type="button"
              disabled={busy || value === null}
              onClick={() => void pay()}
              className="w-full min-h-11 rounded-xl bg-primary text-primary-foreground text-xs font-bold disabled:opacity-50"
            >
              {t("fees.center.savePayment")}
            </button>
          </div>
          {st.isPending ? (
            <div className="flex justify-center py-4" role="status">
              <Loader2 className="w-5 h-5 animate-spin text-primary" aria-hidden="true" />
            </div>
          ) : s ? (
            <ul className="space-y-1.5" aria-label={t("fees.statement.lines")}>
              {ledgerLines(s).map((l) => (
                <li
                  key={`${l.kind}-${l.id}`}
                  className={`flex items-center gap-2 text-xs ${l.void ? "line-through opacity-60" : ""}`}
                >
                  <span className="text-muted-foreground tabular-nums w-20 shrink-0">
                    {formatDay(l.date)}
                  </span>
                  <span className="flex-1 truncate">
                    {l.kind === "charge"
                      ? l.label
                      : t("fees.statement.payment", { ref: l.label || "—" })}
                  </span>
                  <span
                    className={`font-bold tabular-nums ${l.kind === "payment" ? "text-primary" : ""}`}
                  >
                    {l.kind === "payment" ? "−" : ""}
                    {formatMoney(l.amount, s.currency)}
                  </span>
                  {!l.void && (
                    <button
                      type="button"
                      onClick={() => void undo(l.kind, l.id)}
                      aria-label={
                        l.kind === "charge"
                          ? t("fees.center.cancelCharge")
                          : t("fees.center.voidPayment")
                      }
                      className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground"
                    >
                      <X className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground text-center">{t("fees.center.noLines")}</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
