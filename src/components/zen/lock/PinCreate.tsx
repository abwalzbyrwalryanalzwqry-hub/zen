import { useState } from "react";
import { useT } from "@/lib/i18n";
import { pinProblem, pinProblemKey, pinStrength } from "@/lib/app-lock-core";
import { PinPad } from "./PinPad";

/**
 * إنشاء رمز PIN: إدخال ثم تأكيد. الرمز البديهي أو غير المتطابق يُرفض هنا قبل الإرسال (والطبقة الأصلية
 * تعيد الفحص نفسه). لا يُحفظ الرمز في أي مكان غير حالة هذا المكوّن حتى يُسلَّم إلى `onDone`.
 */
export function PinCreate({
  onDone,
  busy,
  error,
}: {
  onDone: (pin: string) => void;
  busy?: boolean;
  error?: string | null;
}) {
  const t = useT();
  const [stage, setStage] = useState<"create" | "confirm">("create");
  const [first, setFirst] = useState("");
  const [value, setValue] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const submit = (v: string) => {
    if (stage === "create") {
      const p = pinProblem(v);
      setValue("");
      if (p) {
        setMsg(t(pinProblemKey(p)));
        return;
      }
      setMsg(null);
      setFirst(v);
      setStage("confirm");
      return;
    }
    if (v !== first) {
      setValue("");
      setFirst("");
      setStage("create");
      setMsg(t("appLock.pin.mismatch"));
      return;
    }
    setMsg(null);
    onDone(v);
  };

  const shown = msg ?? error ?? null;
  // 1.29.0: تلميح القوة أثناء الكتابة (للتوجيه فقط؛ الرفض في pinProblem والطبقة الأصلية).
  const strength = stage === "create" ? pinStrength(value) : null;
  return (
    <div className="flex flex-col items-center gap-4" data-testid="pin-create" data-stage={stage}>
      <p className="text-sm font-bold text-foreground text-center" aria-live="polite">
        {stage === "create" ? t("appLock.pin.create") : t("appLock.pin.confirm")}
      </p>
      <p
        role={shown ? "alert" : undefined}
        className="min-h-5 text-xs text-destructive text-center leading-relaxed"
      >
        {shown}
      </p>
      <PinPad
        value={value}
        onChange={setValue}
        onSubmit={submit}
        length={stage === "confirm" ? first.length : undefined}
        disabled={busy}
        testId={`pin-pad-${stage}`}
      />
      <p
        className={`min-h-4 text-xs text-center ${
          strength === "weak"
            ? "text-destructive"
            : strength === "strong"
              ? "text-primary"
              : "text-muted-foreground"
        }`}
        aria-live="polite"
        data-testid="pin-strength"
        data-strength={strength ?? ""}
      >
        {strength ? t(`appLock.pin.strength.${strength}`) : null}
      </p>
    </div>
  );
}
