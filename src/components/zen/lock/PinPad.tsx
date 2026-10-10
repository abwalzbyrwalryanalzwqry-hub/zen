import { useEffect, useLayoutEffect, useRef } from "react";
import { Delete, Fingerprint } from "lucide-react";
import { useT } from "@/lib/i18n";
import { PIN_MAX, PIN_MIN } from "@/lib/app-lock-core";

/**
 * لوحة أرقام PIN لشاشة القفل والإعداد. الأرقام بترتيب لوحة الهاتف (من اليسار) حتى في الواجهة العربية،
 * وأهداف لمس لا تقل عن 56px، وتعمل بلوحة المفاتيح الفعلية أيضاً (أرقام، Backspace، Enter).
 *
 * `length`: طول الرمز المعروف (الفتح) فيُرسل تلقائياً عند اكتماله؛ بدونه (الإنشاء) يُقبل من 4 إلى 6
 * ويظهر زر التأكيد، ويُرسل تلقائياً عند 6. الرمز لا يُعرض أبداً: نقاط فقط.
 */
export function PinPad({
  value,
  onChange,
  onSubmit,
  length,
  disabled,
  onBiometric,
  testId = "pin-pad",
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
  length?: number;
  disabled?: boolean;
  onBiometric?: () => void;
  testId?: string;
}) {
  const t = useT();
  const fixed = length && length >= PIN_MIN && length <= PIN_MAX ? length : undefined;
  const max = fixed ?? PIN_MAX;
  const latest = useRef({ value, onChange, onSubmit, disabled, max, fixed });
  useLayoutEffect(() => {
    latest.current = { value, onChange, onSubmit, disabled, max, fixed };
  });

  const press = (d: string) => {
    const cur = latest.current;
    if (cur.disabled || cur.value.length >= cur.max) return;
    const next = cur.value + d;
    cur.onChange(next);
    if (next.length === cur.max) cur.onSubmit(next);
  };
  const back = () => {
    const cur = latest.current;
    if (cur.disabled) return;
    cur.onChange(cur.value.slice(0, -1));
  };
  const submit = () => {
    const cur = latest.current;
    if (!cur.disabled && cur.value.length >= PIN_MIN) cur.onSubmit(cur.value);
  };

  // لوحة مفاتيح فعلية (وأجهزة الإدخال المساعدة).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        press(e.key);
      } else if (e.key === "Backspace") {
        e.preventDefault();
        back();
      } else if (e.key === "Enter") {
        e.preventDefault();
        submit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // الدوال تقرأ آخر القيم من latest.
  }, []);

  const slots =
    fixed ?? Math.max(PIN_MIN, Math.min(PIN_MAX, value.length + (value.length < PIN_MAX ? 1 : 0)));
  const key =
    "flex items-center justify-center rounded-full glass-strong text-2xl font-bold text-foreground select-none " +
    "size-[clamp(3.5rem,18vw,4.5rem)] active:scale-95 transition-transform focus-visible:outline-none " +
    "focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40";

  return (
    <div className="flex flex-col items-center gap-5" data-testid={testId}>
      <div
        role="status"
        aria-live="polite"
        aria-label={
          fixed
            ? t("appLock.pin.progress", { n: value.length, total: fixed })
            : t("appLock.pin.progressOpen", { n: value.length })
        }
        className="flex items-center gap-3 h-5"
        dir="ltr"
        data-testid="pin-dots"
        data-filled={value.length}
      >
        {Array.from({ length: slots }, (_, i) => (
          <span
            key={i}
            aria-hidden="true"
            className={`size-3.5 rounded-full border-2 transition-colors ${
              i < value.length ? "bg-primary border-primary" : "border-muted-foreground/40"
            }`}
          />
        ))}
      </div>

      <div className="grid grid-cols-3 gap-x-6 gap-y-3" dir="ltr">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button
            key={d}
            type="button"
            className={key}
            disabled={disabled}
            onClick={() => press(d)}
            aria-label={t("appLock.pin.digit", { n: d })}
          >
            {d}
          </button>
        ))}
        {onBiometric ? (
          <button
            type="button"
            className={key}
            disabled={disabled}
            onClick={onBiometric}
            aria-label={t("appLock.pin.biometric")}
            data-testid="pin-biometric"
          >
            <Fingerprint className="size-7 text-primary" aria-hidden="true" />
          </button>
        ) : !fixed && value.length >= PIN_MIN && value.length < PIN_MAX ? (
          <button
            type="button"
            className={`${key} text-sm bg-primary text-primary-foreground`}
            disabled={disabled}
            onClick={submit}
            aria-label={t("appLock.pin.submit")}
            data-testid="pin-submit"
          >
            {t("appLock.setup.continue")}
          </button>
        ) : (
          <span aria-hidden="true" />
        )}
        <button
          type="button"
          className={key}
          disabled={disabled}
          onClick={() => press("0")}
          aria-label={t("appLock.pin.digit", { n: "0" })}
        >
          0
        </button>
        <button
          type="button"
          className={`${key} glass bg-transparent`}
          disabled={disabled || value.length === 0}
          onClick={back}
          aria-label={t("appLock.pin.delete")}
        >
          <Delete className="size-6" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
