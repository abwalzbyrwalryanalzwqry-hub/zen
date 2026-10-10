import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Loader2, Receipt, Send } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  balanceOf,
  formatMoney,
  getStudentStatement,
  ledgerLines,
  parseAmount,
  submitReceipt,
  type FeeStatement,
} from "@/lib/fees";
import { formatDay } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { usePagesDict } from "@/lib/pages-i18n";
import { toast } from "@/lib/toast";

/**
 * كشف رسوم طالب لوليّه أو له (1.21.0، 5.1–5.2): المستحق والمدفوع والرصيد لكل مركز فعّل الرسوم، والإيصالات
 * المرسلة وحالتها، وزر «أرسلت دفعة» لمرجع التحويل أو صورة الإيصال. لا دفع داخل التطبيق.
 */
export function FeeStatementCard({ studentId, userId }: { studentId: string; userId: string }) {
  usePagesDict();
  const t = useT();
  const q = useQuery({
    queryKey: ["fee-statement", studentId],
    queryFn: () => getStudentStatement(studentId),
    staleTime: 60_000,
    retry: false,
  });
  if (q.isPending || q.isError || q.data.length === 0) return null;
  return (
    <>
      {q.data.map((s) => (
        <StatementBlock key={s.center_id} s={s} studentId={studentId} userId={userId} t={t} />
      ))}
    </>
  );
}

function StatementBlock({
  s,
  studentId,
  userId,
  t,
}: {
  s: FeeStatement;
  studentId: string;
  userId: string;
  t: ReturnType<typeof useT>;
}) {
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState(false);
  const { due, credit } = balanceOf(s);
  const lines = ledgerLines(s);
  const shown = all ? lines : lines.slice(0, 5);
  const pending = s.receipts.filter((r) => r.status === "pending").length;
  return (
    <section
      aria-label={t("fees.statement.title", { center: s.center_name })}
      className="glass rounded-3xl p-4 space-y-3"
      data-testid="fee-statement"
    >
      <div className="flex items-center gap-2">
        <Receipt className="w-4 h-4 text-primary" aria-hidden="true" />
        <h2 className="text-sm font-bold flex-1">
          {t("fees.statement.title", { center: s.center_name })}
        </h2>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <Tile label={t("fees.charged")} value={formatMoney(s.charged, s.currency)} />
        <Tile label={t("fees.paid")} value={formatMoney(s.paid, s.currency)} />
        <Tile
          label={credit > 0 ? t("fees.credit") : t("fees.balance")}
          value={formatMoney(credit > 0 ? credit : due, s.currency)}
          tone={due > 0 ? "warn" : "ok"}
        />
      </div>
      {lines.length > 0 && (
        <ul className="space-y-1.5" aria-label={t("fees.statement.lines")}>
          {shown.map((l) => (
            <li
              key={`${l.kind}-${l.id}`}
              className={`flex items-center gap-2 text-xs ${l.void ? "line-through opacity-60" : ""}`}
            >
              <span className="text-muted-foreground tabular-nums w-20 shrink-0">
                {formatDay(l.date)}
              </span>
              <span className="flex-1 min-w-0 truncate">
                {l.kind === "charge"
                  ? l.label
                  : t("fees.statement.payment", { ref: l.label || "—" })}
              </span>
              <span
                className={`font-bold tabular-nums ${l.kind === "payment" ? "text-primary" : "text-foreground"}`}
              >
                {l.kind === "payment" ? "−" : ""}
                {formatMoney(l.amount, s.currency)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {lines.length > 5 && (
        <button
          type="button"
          onClick={() => setAll((v) => !v)}
          className="text-xs text-primary font-bold min-h-11"
        >
          {all ? t("fees.statement.less") : t("fees.statement.more", { n: lines.length - 5 })}
        </button>
      )}
      {s.receipts.length > 0 && (
        <ul className="space-y-1" aria-label={t("fees.receipts.mine")}>
          {s.receipts.slice(0, 5).map((r) => (
            <li key={r.id} className="text-[0.6875rem] text-muted-foreground">
              {t(`fees.receipts.status.${r.status}`)} · {formatMoney(r.amount, s.currency)}
              {r.reference ? ` · ${r.reference}` : ""}
              {r.decision_note ? ` · ${r.decision_note}` : ""}
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={pending >= 5}
        className="w-full min-h-11 rounded-2xl bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-50"
      >
        <Send className="w-4 h-4" aria-hidden="true" />
        {t("fees.receipts.send")}
      </button>
      <p className="text-[0.6875rem] text-muted-foreground">{t("fees.noInAppPayment")}</p>
      <ReceiptSheet
        open={open}
        onOpenChange={setOpen}
        centerId={s.center_id}
        studentId={studentId}
        userId={userId}
        suggested={due}
      />
    </section>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: "warn" | "ok" }) {
  return (
    <div className="rounded-2xl bg-secondary/60 px-2 py-2">
      <p className="text-[0.625rem] text-muted-foreground">{label}</p>
      <p
        className={`text-xs font-black tabular-nums ${tone === "warn" ? "text-gold" : tone === "ok" ? "text-primary" : ""}`}
      >
        {value}
      </p>
    </div>
  );
}

function ReceiptSheet({
  open,
  onOpenChange,
  centerId,
  studentId,
  userId,
  suggested,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  centerId: string;
  studentId: string;
  userId: string;
  suggested: number;
}) {
  const t = useT();
  const qc = useQueryClient();
  const [amount, setAmount] = useState(suggested > 0 ? String(suggested) : "");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const value = parseAmount(amount);
  const ok = value !== null && (reference.trim() !== "" || image !== null);
  const send = async () => {
    if (!ok || busy || value === null) return;
    setBusy(true);
    try {
      await submitReceipt({
        centerId,
        studentId,
        userId,
        amount: value,
        reference: reference.trim() || null,
        note: note.trim() || null,
        image,
      });
      toast.success(t("fees.receipts.sent"));
      onOpenChange(false);
      setReference("");
      setNote("");
      setImage(null);
      void qc.invalidateQueries({ queryKey: ["fee-statement", studentId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("fees.err.save"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        title={t("fees.receipts.send")}
        description={t("fees.receipts.sendHint")}
        footer={
          <button
            type="button"
            onClick={() => void send()}
            disabled={!ok || busy}
            className="w-full min-h-12 rounded-2xl bg-primary text-primary-foreground text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
            {t("fees.receipts.submit")}
          </button>
        }
      >
        <div className="space-y-3">
          <Field label={t("fees.amount")}>
            <input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-invalid={amount !== "" && value === null}
              className="w-full min-h-11 rounded-xl glass px-3 text-sm"
            />
          </Field>
          <Field label={t("fees.receipts.reference")}>
            <input
              value={reference}
              maxLength={120}
              onChange={(e) => setReference(e.target.value)}
              className="w-full min-h-11 rounded-xl glass px-3 text-sm"
            />
          </Field>
          <label className="flex items-center gap-2 min-h-11 rounded-xl glass px-3 text-xs cursor-pointer">
            <ImagePlus className="w-4 h-4 text-primary" aria-hidden="true" />
            <span className="flex-1 truncate">{image ? image.name : t("fees.receipts.image")}</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(e) => setImage(e.target.files?.[0] ?? null)}
            />
          </label>
          <Field label={t("fees.note")}>
            <input
              value={note}
              maxLength={300}
              onChange={(e) => setNote(e.target.value)}
              className="w-full min-h-11 rounded-xl glass px-3 text-sm"
            />
          </Field>
          <p className="text-[0.6875rem] text-muted-foreground">{t("fees.receipts.proofHint")}</p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
