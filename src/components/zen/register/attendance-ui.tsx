import { useT } from "@/lib/i18n";
import { ATTENDANCE, type AttendanceStatus } from "@/lib/daily-record";
import { ATTENDANCE_ICON, ATTENDANCE_TEXT, ATTENDANCE_TONE } from "./attendance-tone";
import { RadioRow } from "./RadioRow";
import { ensureRegisterDict } from "@/lib/register-i18n";

ensureRegisterDict();

/**
 * أربعة أزرار متجاورة (مجموعة اختيار واحد): لمسة واحدة تسجّل الحالة، ولمسة على الحالة المختارة تمسحها
 * (DR-16: حالة سُجّلت خطأً لطالب لم يُحسم حضوره بعد). لوحة المفاتيح: الأسهم وHome/End (DR-14).
 */
export function AttendanceControl({
  name,
  value,
  disabled,
  onChange,
  compact = false,
}: {
  /** صف الطالب المضغوط (1.14.0): أربعة أزرار صغيرة بأيقونة ونص قصير، بهدف لمس 44px. */
  compact?: boolean;
  name: string;
  value: AttendanceStatus | null;
  disabled: boolean;
  onChange: (s: AttendanceStatus | null) => void;
}) {
  const t = useT();
  return (
    <RadioRow
      label={t("dailyRecord.attendance.group", { name })}
      value={value}
      disabled={disabled}
      onSelect={onChange}
      onRepeat={() => onChange(null)}
      className={
        compact ? "grid shrink-0 grid-cols-4 gap-0.5 w-[11.5rem]" : "grid grid-cols-4 gap-1"
      }
      items={ATTENDANCE.map((s) => {
        const Icon = ATTENDANCE_ICON[s];
        return {
          value: s,
          label: t(`dailyRecord.attendance.${s}`),
          content: (
            <>
              <Icon className="w-4 h-4" aria-hidden="true" />
              <span className={compact ? "leading-none" : undefined}>
                {t(`dailyRecord.attendance.${s}`)}
              </span>
            </>
          ),
          className: (on: boolean) =>
            `min-h-11 rounded-xl px-1 text-xs font-bold flex flex-col items-center justify-center gap-0.5 transition active:scale-[0.97] disabled:opacity-60 ${
              on ? ATTENDANCE_TONE[s] : `bg-muted/60 ${ATTENDANCE_TEXT[s]}`
            }`,
        };
      })}
    />
  );
}
