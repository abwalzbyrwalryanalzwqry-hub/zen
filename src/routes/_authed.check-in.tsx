import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, ScanLine } from "lucide-react";
import { PhoneFrame } from "@/components/zen/PhoneFrame";
import { BackButton } from "@/components/zen/BackButton";
import { canScan, checkIn, checkInMessage, parseCode, scanCode } from "@/lib/qr-attendance";

/** تسجيل الحضور برمز المعلّم (9.2): مسح QR بماسح Google في Android، أو كتابة الأرقام الستة. */
export const Route = createFileRoute("/_authed/check-in")({
  head: () => ({ meta: [{ title: "سجّل حضورك — Zen" }] }),
  component: CheckInScreen,
});

function CheckInScreen() {
  const [manual, setManual] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async (code: string | null) => {
    if (!code) {
      setMsg({ ok: false, text: "الرمز ستة أرقام." });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const r = await checkIn(code);
      setMsg({ ok: r.status !== "invalid", text: checkInMessage(r) });
      if (r.status !== "invalid") setManual("");
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "تعذّر تسجيل الحضور." });
    } finally {
      setBusy(false);
    }
  };

  const scan = async () => {
    try {
      const code = await scanCode();
      if (code) await submit(code);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "تعذّر فتح الماسح." });
    }
  };

  return (
    <PhoneFrame>
      <div className="flex-1 flex flex-col" dir="rtl">
        <header className="px-4 pt-12 pb-3 flex items-center gap-3">
          <BackButton fallback="/today" />
          <h1 className="text-lg font-black flex-1">سجّل حضورك</h1>
        </header>
        <div className="flex-1 overflow-y-auto px-4 pb-8 space-y-4">
          {canScan() && (
            <button
              onClick={() => void scan()}
              disabled={busy}
              className="w-full rounded-3xl gradient-primary text-primary-foreground py-6 text-base font-black flex items-center justify-center gap-3 disabled:opacity-50"
            >
              <ScanLine className="w-6 h-6" /> امسح رمز المعلّم
            </button>
          )}
          <form
            className="glass rounded-3xl p-4 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void submit(parseCode(manual));
            }}
          >
            <label htmlFor="checkin-code" className="block text-xs font-bold">
              أو اكتب الأرقام الستة الظاهرة تحت الرمز
            </label>
            <input
              id="checkin-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={7}
              dir="ltr"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              className="w-full rounded-2xl bg-background/70 px-3 py-3 text-center font-mono text-2xl tracking-[0.3em] tabular-nums"
            />
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-2xl bg-primary text-primary-foreground py-2.5 text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />} تسجيل الحضور
            </button>
          </form>
          {msg && (
            <p
              role={msg.ok ? "status" : "alert"}
              className={`text-sm text-center ${msg.ok ? "text-primary" : "text-destructive"}`}
            >
              {msg.text}
            </p>
          )}
        </div>
      </div>
    </PhoneFrame>
  );
}
