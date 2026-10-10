import { useEffect, useRef, type ReactNode } from "react";
import { Check, CloudOff, Loader2, RotateCcw, X } from "lucide-react";
import type { SyncStatus } from "@/lib/muhasaba/useMuhasaba";
import { isOnline } from "@/lib/network";

/**
 * لوحة سفلية بنمط التطبيق نفسه (SheetShell في centers.tsx): زجاجية، زوايا 3xl،
 * تنزلق من الأسفل. مع إغلاق بزر Esc ونقل التركيز إليها لقارئات الشاشة.
 */
export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      className="absolute inset-0 z-30 bg-background/70 backdrop-blur-sm flex items-end"
      onClick={onClose}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="w-full glass-strong rounded-t-3xl p-5 pb-6 anim-float-in max-h-[85%] overflow-y-auto outline-none"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-black text-foreground">{title}</h2>
          <button
            onClick={onClose}
            aria-label="إغلاق"
            className="w-9 h-9 -m-2 rounded-xl flex items-center justify-center"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-2">
      <h2 className="text-xs font-bold text-muted-foreground">{children}</h2>
      {action}
    </div>
  );
}

/** شريط تقدّم هادئ؛ القيمة تُقرأ نصاً أيضاً فلا يُعتمد على اللون وحده. */
export function Bar({
  label,
  value,
  total,
  text,
  tone = "primary",
}: {
  label: string;
  value: number;
  total: number;
  text: string;
  tone?: "primary" | "gold";
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[0.6875rem]">
        <span className="font-bold text-foreground">{label}</span>
        <span className="text-muted-foreground">{text}</span>
      </div>
      <div
        className="h-2 rounded-full bg-muted overflow-hidden"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={value}
        aria-valuetext={text}
      >
        <div
          className={`h-full rounded-full transition-all duration-500 ${tone === "gold" ? "bg-gold" : "bg-primary"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/** شريحة اختيار بنمط التطبيق. */
export function Chip({
  active,
  onClick,
  children,
  label,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      className={`min-h-9 px-3 py-1.5 rounded-2xl text-xs font-semibold transition-all active:scale-95 ${
        active ? "bg-primary text-primary-foreground" : "glass text-foreground hover:bg-primary/10"
      }`}
    >
      {active && <Check className="inline w-3 h-3 me-1 -mt-0.5" aria-hidden />}
      {children}
    </button>
  );
}

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`w-11 h-6 shrink-0 rounded-full transition-colors relative ${checked ? "bg-primary" : "bg-muted"}`}
    >
      <span
        className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${checked ? "start-0.5" : "end-0.5"}`}
      />
    </button>
  );
}

/** حالة الحفظ: تُعلن لقارئ الشاشة بهدوء (aria-live=polite). */
export function SyncBadge({
  status,
  pending,
  onRetry,
}: {
  status: SyncStatus;
  pending: number;
  onRetry: () => void;
}) {
  let content: ReactNode = null;
  if (status === "saving") {
    content = (
      <>
        <Loader2 className="w-3 h-3 animate-spin" aria-hidden /> يُحفظ…
      </>
    );
  } else if (status === "offline" || (pending > 0 && status !== "error" && !navigatorOnline())) {
    content = (
      <>
        <CloudOff className="w-3 h-3" aria-hidden /> محفوظ على جهازك، وسيُزامَن عند الاتصال
      </>
    );
  } else if (status === "error") {
    content = (
      <button
        onClick={onRetry}
        className="inline-flex items-center gap-1 text-destructive font-semibold"
      >
        <RotateCcw className="w-3 h-3" aria-hidden /> لم يُحفظ في السحابة — أعد المحاولة
      </button>
    );
  } else if (status === "saved") {
    content = (
      <>
        <Check className="w-3 h-3 text-primary" aria-hidden /> حُفظ
      </>
    );
  }
  return (
    <p
      aria-live="polite"
      className="min-h-4 text-[0.625rem] text-muted-foreground inline-flex items-center gap-1"
    >
      {content}
    </p>
  );
}

function navigatorOnline() {
  return isOnline();
}
