import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useT, t as tStatic } from "@/lib/i18n";
import { useKeepAwake } from "@/hooks/quran/use-keep-awake";
import {
  CODE_TTL_MS,
  issueCode,
  qrPayload,
  qrSvg,
  secondsLeft,
  type IssuedCode,
} from "@/lib/qr-attendance";

/**
 * رمز الحضور (9.2): QR وأرقام تتجدّد كل 30 ثانية ما دام ظاهراً، والشاشة لا تنطفئ. يُعرض في صفحته، وفي نصف شاشة
 * من «المزيد» في السجل اليومي (1.14.0) فيبقى السجل خلفه.
 */
export function AttendanceCodePanel({ halaqa }: { halaqa: string }) {
  const t = useT();
  const [code, setCode] = useState<IssuedCode | null>(null);
  const [svg, setSvg] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useKeepAwake(true);

  // رمز جديد فور اختيار الحلقة، ثم قبل انتهاء كل رمز بثانيتين.
  useEffect(() => {
    if (!halaqa) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const next = async () => {
      try {
        const c = await issueCode(halaqa);
        if (cancelled) return;
        setCode(c);
        setSvg(await qrSvg(qrPayload(c.code)));
        setErr(null);
        timer = setTimeout(next, Math.max(5_000, Date.parse(c.expires_at) - Date.now() - 2_000));
      } catch {
        if (cancelled) return;
        setErr(tStatic("attendanceCode.issueFailed"));
        timer = setTimeout(next, 5_000);
      }
    };
    void next();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [halaqa]);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(tick);
  }, []);
  const left = code ? secondsLeft(code.expires_at, now) : 0;

  return (
    <div className="space-y-4">
      <div className="rounded-3xl bg-white p-4 aspect-square flex items-center justify-center">
        {svg ? (
          <div
            aria-label={t("attendanceCode.qr")}
            role="img"
            className="w-full h-full [&>svg]:w-full [&>svg]:h-full"
            // SVG مولَّد محلياً من مكتبة qrcode لنص ثابت البنية (zen-attend:######).
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : (
          <Loader2
            className="w-6 h-6 animate-spin text-primary"
            role="status"
            aria-label={t("common.loading")}
          />
        )}
      </div>
      <p
        className="text-center font-mono text-4xl font-black tracking-[0.3em] tabular-nums"
        aria-label={t("attendanceCode.digits")}
        dir="ltr"
      >
        {code?.code ?? "······"}
      </p>
      <p className="text-center text-xs text-muted-foreground" aria-live="polite">
        {t("attendanceCode.hint", { left, ttl: CODE_TTL_MS / 1000 })}
      </p>
      {err && (
        <p role="alert" className="text-center text-xs text-destructive">
          {err}
        </p>
      )}
    </div>
  );
}
