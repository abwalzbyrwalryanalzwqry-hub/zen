import { useCallback, useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import {
  guardianApproveInvite,
  guardianPendingInvites,
  type GuardianPendingInvite,
} from "@/lib/zen-api";

/** لوليّ الأمر (11.1): دعوات حلقات قبلها ابنه وتنتظر موافقته. لا تظهر إن لم يوجد شيء. */
export function GuardianInviteApprovals() {
  const [rows, setRows] = useState<GuardianPendingInvite[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const load = useCallback(() => {
    guardianPendingInvites()
      .then(setRows)
      .catch(() => undefined);
  }, []);
  useEffect(load, [load]);

  if (!rows.length && !msg) return null;

  const decide = async (r: GuardianPendingInvite, approve: boolean) => {
    setBusy(r.id);
    setMsg(null);
    try {
      await guardianApproveInvite(r.id, approve);
      setMsg({
        ok: true,
        text: approve
          ? `انضم ${r.student_name} إلى «${r.halaqa_name}».`
          : `لم توافق على «${r.halaqa_name}».`,
      });
      load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "تعذّرت العملية." });
    } finally {
      setBusy(null);
    }
  };

  return (
    <section
      aria-label="طلبات الانضمام إلى حلقات"
      className="glass rounded-3xl p-4 space-y-3 border border-gold/40"
    >
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-gold" aria-hidden="true" />
        <h2 className="text-sm font-black">تنتظر موافقتك</h2>
      </div>
      {rows.map((r) => (
        <div key={r.id} className="rounded-2xl bg-background/60 p-3 space-y-2" data-invite={r.id}>
          <p className="text-xs leading-relaxed">
            <b>{r.student_name}</b> قبل دعوة المعلّم <b>{r.teacher_name}</b> للانضمام إلى «
            {r.halaqa_name}»{r.center_name ? ` في ${r.center_name}` : ""}
            {r.schedule ? ` (${r.schedule})` : ""}.
          </p>
          <p className="text-[0.625rem] text-muted-foreground">
            بالموافقة يرى المعلّم تقدّمه في الحفظ والحضور، ويشارك في غرف الحلقة وفق إعداداتك.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => void decide(r, true)}
              disabled={busy === r.id}
              className="rounded-xl bg-primary text-primary-foreground py-2 text-xs font-bold disabled:opacity-50"
            >
              موافقة
            </button>
            <button
              onClick={() => void decide(r, false)}
              disabled={busy === r.id}
              className="rounded-xl glass py-2 text-xs font-bold disabled:opacity-50"
            >
              رفض
            </button>
          </div>
        </div>
      ))}
      {msg && (
        <p
          role={msg.ok ? "status" : "alert"}
          className={`text-xs ${msg.ok ? "text-primary" : "text-destructive"}`}
        >
          {msg.text}
        </p>
      )}
    </section>
  );
}
