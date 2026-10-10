import type { CSSProperties, ReactNode } from "react";
import { BookOpen, Circle, type LucideIcon } from "lucide-react";
import { LUCIDE, type IconKey } from "./shell-icons";
import { PhoneFrame } from "@/components/zen/PhoneFrame";
import { BottomNav } from "@/components/zen/BottomNav";
import { BackButton } from "@/components/zen/BackButton";

/**
 * هيكل شاشات قسم المصحف في زِن.
 *
 * واجهة برمجية مطابقة لقسم القرآن في منار (Screen / ScreenHeader / Icon / icons…) كي تُنقل
 * الشاشات كما هي، لكن المظهر مظهر زِن: إطار PhoneFrame وشريطه السفلي، وزر الرجوع الموحَّد،
 * وأيقونات lucide، وألوان زِن الخضراء والذهبية.
 */

export function Icon({
  d,
  size = 22,
  strokeWidth = 1.8,
}: {
  d: IconKey | string;
  size?: number;
  strokeWidth?: number;
}) {
  const C = (LUCIDE as Record<string, LucideIcon>)[d] ?? Circle;
  return <C aria-hidden="true" width={size} height={size} strokeWidth={strokeWidth} />;
}

/* ---------- الزخرفة ---------- */

/** نجمة ثمانية بخطوط رفيعة — علامة مائية بروح زخرفة زِن (bg-pattern). */
export function Arabesque({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 200" className={className} aria-hidden>
      <defs>
        <pattern
          id="zen-quran-star"
          x="0"
          y="0"
          width="60"
          height="60"
          patternUnits="userSpaceOnUse"
        >
          <g stroke="currentColor" strokeWidth="0.6" fill="none" opacity="0.5">
            <path d="M30 4 L39 21 L56 21 L43 34 L47 52 L30 42 L13 52 L17 34 L4 21 L21 21 Z" />
            <circle cx="30" cy="30" r="10" />
            <path d="M30 20 L40 30 L30 40 L20 30 Z" />
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#zen-quran-star)" />
    </svg>
  );
}

/* ---------- الهياكل ---------- */

export function Skeleton({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return <div className={`zq-skeleton ${className}`} style={style} />;
}

export function EmptyState({ icon, title, hint }: { icon: string; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <div className="glass flex h-16 w-16 items-center justify-center rounded-3xl text-primary">
        <Icon d={icon} size={28} />
      </div>
      <p className="mt-4 text-sm font-medium text-foreground">{title}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * شاشة قسم المصحف: إطار زِن، ومنطقة تمرير وسطى (`data-quran-scroll`)، والشريط السفلي في
 * الصفحة الرئيسية للقسم. `contain: layout` يجعل العناصر الثابتة (شريط التلاوة…) داخل الإطار.
 */
export function Screen({
  children,
  padBottom = true,
  nav = true,
  className = "",
}: {
  children: ReactNode;
  padBottom?: boolean;
  /** إظهار شريط التنقّل السفلي (الصفحة الرئيسية للقسم). */
  nav?: boolean;
  className?: string;
}) {
  return (
    <PhoneFrame>
      <div className={`zq-screen flex-1 flex flex-col text-foreground ${className}`}>
        <div
          data-quran-scroll
          className={`flex-1 overflow-y-auto overflow-x-hidden overscroll-contain ${padBottom ? "pb-10" : ""}`}
        >
          {children}
        </div>
        {nav && <BottomNav />}
      </div>
    </PhoneFrame>
  );
}

export function ScreenHeader({
  title,
  subtitle,
  backTo,
  action,
}: {
  title: string;
  subtitle?: string;
  backTo?: string;
  action?: ReactNode;
}) {
  return (
    <header className="px-5 pt-12 pb-3 flex items-center justify-between gap-3 anim-float-in">
      <div className="flex items-center gap-3 min-w-0">
        {backTo && <BackButton fallback={backTo} />}
        <div className="min-w-0">
          <h1 className="text-2xl font-black text-foreground leading-tight truncate">{title}</h1>
          {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
        </div>
      </div>
      {action ?? (
        <div className="w-10 h-10 shrink-0 rounded-2xl bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center glow-primary text-white">
          <BookOpen className="w-5 h-5" aria-hidden="true" />
        </div>
      )}
    </header>
  );
}

export function SectionLabel({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mt-7 mb-3 flex items-end justify-between px-5">
      <div className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-gold" />
        <h2 className="text-sm font-medium text-foreground">{children}</h2>
      </div>
      {hint && <span className="text-[0.6875rem] text-muted-foreground">{hint}</span>}
    </div>
  );
}

/* ---------- حلقة التقدّم ---------- */
export function RingProgress({
  value, // 0..1
  size = 200,
  stroke = 6,
  trackColor = "rgba(255,255,255,0.15)",
  children,
  gradient = true,
}: {
  value: number;
  size?: number;
  stroke?: number;
  trackColor?: string;
  children?: ReactNode;
  gradient?: boolean;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.max(0, Math.min(1, value)));
  const gid = "zen-ring-grad";
  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="absolute inset-0 -rotate-90">
        {gradient && (
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--gold)" />
              <stop offset="100%" stopColor="var(--primary-glow)" />
            </linearGradient>
          </defs>
        )}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={trackColor}
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={gradient ? `url(#${gid})` : "white"}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 1s ease" }}
        />
      </svg>
      <div className="relative">{children}</div>
    </div>
  );
}
