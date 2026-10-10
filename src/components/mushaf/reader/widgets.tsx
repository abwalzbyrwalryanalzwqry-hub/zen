import { Link } from "@tanstack/react-router";
import { Icon } from "@/components/zen/quran/shell";
import { icons } from "@/components/zen/quran/shell-icons";
import { formatRelativeArabic } from "@/lib/quran/reader-state";
import { useNow } from "@/hooks/useNow";

/** عناصر صغيرة مشتركة لشاشة القارئ (المرحلة 7.5). */
export function SelectorPill({
  label,
  value,
  iconKey,
  onClick,
}: {
  label: string;
  value: string;
  iconKey: keyof typeof icons;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group relative flex items-center gap-3 overflow-hidden rounded-2xl border border-border/60 bg-card/70 p-3 text-right shadow-soft backdrop-blur-xl transition hover:-translate-y-0.5 hover:shadow-elegant active:scale-[0.98]"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition group-hover:scale-110">
        <Icon d={icons[iconKey]} size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[0.625rem] uppercase tracking-[0.25em] text-muted-foreground">
          {label}
        </div>
        <div className="mt-0.5 truncate font-display text-sm font-medium">{value}</div>
      </div>
      <span className="rotate-90 text-muted-foreground transition group-hover:translate-y-0.5">
        <Icon d={icons.chevron} size={14} />
      </span>
    </button>
  );
}

export function ReaderAction({
  icon,
  label,
  active,
  onClick,
  to,
  search,
  disabled,
  ariaLabel,
}: {
  icon: string;
  label: string;
  active?: boolean;
  onClick?: () => void;
  to?: string;
  /** معاملات الرابط (السورة والآية الحالية) حتى لا تفتح الشاشة على الفاتحة. */
  search?: Record<string, string | number | undefined>;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const className = `flex flex-col items-center gap-1 rounded-2xl py-2 transition active:scale-95 disabled:opacity-60 ${
    active
      ? "gradient-primary text-primary-foreground shadow-glow"
      : "text-muted-foreground hover:text-foreground hover:bg-background/60"
  }`;
  const inner = (
    <>
      <Icon d={icon} size={16} />
      <span className="text-[0.5625rem] font-medium">{label}</span>
    </>
  );
  if (to) {
    return (
      <Link to={to} search={search as never} className={className} aria-label={ariaLabel}>
        {inner}
      </Link>
    );
  }
  return (
    <button
      onClick={onClick}
      className={className}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-pressed={active}
    >
      {inner}
    </button>
  );
}

export function ToolCard({
  iconKey,
  title,
  hint,
  to,
}: {
  iconKey: keyof typeof icons;
  title: string;
  hint: string;
  to: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card/70 p-3 text-right shadow-soft backdrop-blur-xl transition hover:-translate-y-0.5 hover:shadow-elegant active:scale-[0.98]"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold/15 text-gold">
        <Icon d={icons[iconKey]} size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[0.8125rem] font-medium leading-tight">{title}</div>
        <div className="mt-0.5 text-[0.625rem] leading-snug text-muted-foreground">{hint}</div>
      </div>
      <span className="rotate-180 text-muted-foreground">
        <Icon d={icons.chevron} size={14} />
      </span>
    </Link>
  );
}

export function Chip({
  label,
  tone = "muted",
}: {
  label: string;
  tone?: "muted" | "gold" | "primary";
}) {
  const toneClass =
    tone === "gold"
      ? "border-gold/40 bg-gold/10 text-gold"
      : tone === "primary"
        ? "border-primary/40 bg-primary/10 text-primary"
        : "border-border/60 bg-background/70 text-muted-foreground";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[0.625rem] font-medium ${toneClass}`}
    >
      {label}
    </span>
  );
}

export function MetaStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass rounded-2xl border border-border/50 p-3 text-right transition hover:-translate-y-0.5 hover:shadow-soft">
      <div className="text-[0.625rem] uppercase tracking-[0.25em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 font-display text-lg font-medium tabular-nums text-foreground">
        {value}
      </div>
    </div>
  );
}

/** وقت نسبي («قبل 5 دقائق») يُعاد حسابه كل دقيقة؛ التطبيق SPA بلا عرض على الخادم (6.10) فلا تعارض. */
export function RelativeTime({ at }: { at: number }) {
  useNow();
  return <>{formatRelativeArabic(at)}</>;
}
