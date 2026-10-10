import type { ReactNode } from "react";

/** عناصر صغيرة مشتركة بين سجل الإنجاز ومعالج التقارير (بالهوية نفسها: glass وrounded وtext-xs فأكبر). */

export function Section({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="glass rounded-3xl p-3.5 space-y-2.5" aria-label={title}>
      <div className="flex items-center gap-2">
        <h3 className="flex-1 text-sm font-black text-foreground">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Stat({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <div
      className={`rounded-2xl px-2 py-2 text-center ${tone === "warn" ? "bg-gold/15" : "bg-muted/50"}`}
    >
      <dt className="text-xs text-muted-foreground leading-tight">{label}</dt>
      <dd className="text-sm font-black text-foreground tabular-nums mt-0.5 break-words">
        {value}
      </dd>
    </div>
  );
}

export function Stats({ children, cols = 3 }: { children: ReactNode; cols?: 2 | 3 | 4 }) {
  const c = cols === 2 ? "grid-cols-2" : cols === 4 ? "grid-cols-4" : "grid-cols-3";
  return <dl className={`grid ${c} gap-1.5`}>{children}</dl>;
}

export function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm py-1 border-b border-border/50 last:border-0">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="font-bold text-foreground text-end min-w-0 break-words">{value}</span>
    </div>
  );
}

/** مجموعة أزرار اختيار واحد (role=radiogroup) بأهداف لمس 44px. */
export function Choice<T extends string | number>({
  label,
  value,
  options,
  onChange,
  cols = 3,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; hint?: string }[];
  onChange: (v: T) => void;
  cols?: 2 | 3 | 4;
}) {
  const c = cols === 2 ? "grid-cols-2" : cols === 4 ? "grid-cols-4" : "grid-cols-3";
  return (
    <div role="radiogroup" aria-label={label} className={`grid ${c} gap-1.5`}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={`min-h-11 rounded-2xl px-2 py-1.5 text-xs font-bold transition-colors text-center ${
              on
                ? "gradient-primary text-primary-foreground shadow-soft"
                : "bg-muted/50 text-foreground"
            }`}
          >
            <span className="block">{o.label}</span>
            {o.hint && (
              <span className={`block font-normal ${on ? "opacity-90" : "text-muted-foreground"}`}>
                {o.hint}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** مفتاح تشغيل/إيقاف بنص (role=switch). */
export function Toggle({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="w-full min-h-11 rounded-2xl bg-muted/50 px-3 py-2 flex items-center gap-3 text-start"
    >
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-bold text-foreground">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
      <span
        aria-hidden="true"
        className={`w-10 h-6 rounded-full p-0.5 flex transition-colors ${
          checked ? "bg-primary justify-end" : "bg-border justify-start"
        }`}
      >
        <span className="block w-5 h-5 rounded-full bg-background shadow" />
      </span>
    </button>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="block text-xs font-bold text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

export const inputCls =
  "w-full min-h-11 rounded-2xl glass px-3 text-sm text-foreground placeholder:text-muted-foreground";
