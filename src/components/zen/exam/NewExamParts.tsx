import { AlertTriangle } from "lucide-react";
import { SURAH_NAMES } from "@/lib/exam/scope";
import { useT } from "@/lib/i18n";

// حقول شاشة «اختبار جديد» وصندوق أسباب تعذّر البناء (M5: من _authed.exams.new.tsx دون تغيير السلوك).

/** أسباب تعذّر بناء الاختبار ومقترحات توسيع النطاق؛ الرسائل نفسها من المحرّك. */
export function BuildProblems({
  problems,
  suggestions,
}: {
  problems: string[];
  suggestions: string[];
}) {
  const t = useT();
  if (problems.length === 0) return null;
  return (
    <section
      className="glass rounded-3xl p-4 space-y-2 border border-destructive/40"
      aria-live="assertive"
    >
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-destructive" aria-hidden />
        <p className="text-xs font-bold text-destructive">{t("newExam.notStarted")}</p>
      </div>
      {problems.map((p) => (
        <p key={p} className="text-[0.6875rem] text-foreground">
          {p}
        </p>
      ))}
      {suggestions.length > 0 && (
        <ul className="space-y-1 pt-1">
          {suggestions.map((s) => (
            <li key={s} className="text-[0.6875rem] text-muted-foreground">
              • {s}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function SurahPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[0.625rem] text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-xl glass-strong px-3 py-2 text-xs text-foreground bg-transparent"
      >
        {SURAH_NAMES.map((name, i) => (
          <option key={name} value={i + 1} className="bg-background">
            {name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function NumberField({
  label,
  value,
  min,
  max,
  onChange,
  compact,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  compact?: boolean;
}) {
  return (
    <label className={compact ? "flex items-center gap-2" : "block space-y-1"}>
      <span className="text-[0.625rem] text-muted-foreground whitespace-nowrap">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const next = Number(e.target.value);
          if (Number.isFinite(next)) onChange(Math.max(min, Math.min(max, Math.trunc(next))));
        }}
        className={`rounded-xl glass-strong px-3 py-2 text-xs text-foreground bg-transparent ${
          compact ? "w-16" : "w-full"
        }`}
      />
    </label>
  );
}
