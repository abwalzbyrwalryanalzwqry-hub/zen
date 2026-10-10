import type { ReactNode } from "react";
import { BackButton } from "@/components/zen/BackButton";
import { CERT_CSS } from "@/lib/certificates/render";

/**
 * إطار استوديو الشهائد: عريض (لا إطار الجوال 440px) لأن المصمم يحتاج المساحة على الجهاز اللوحي والحاسوب،
 * ويبقى ملء الشاشة على الجوال. هوية زن: خلفية عاجية هادئة وأخضر رسمي.
 */
export function StudioFrame({
  title,
  subtitle,
  back = "/certificates",
  actions,
  children,
  wide = false,
  scroll = true,
}: {
  title: string;
  subtitle?: ReactNode;
  back?: string | null;
  actions?: ReactNode;
  children: ReactNode;
  /** المصمم: بلا حدّ للعرض. */
  wide?: boolean;
  scroll?: boolean;
}) {
  return (
    <div
      dir="rtl"
      className="zen-safe h-[100dvh] w-full flex flex-col bg-background text-foreground"
    >
      <style>{CERT_CSS}</style>
      <header className="shrink-0 border-b border-border/60 bg-card/70 backdrop-blur">
        <div
          className={`${wide ? "" : "max-w-6xl mx-auto"} px-4 pt-[max(env(safe-area-inset-top),0.75rem)] pb-3 flex items-center gap-3`}
        >
          {back && <BackButton fallback={back} />}
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-black truncate">{title}</h1>
            {subtitle && (
              <p className="text-[0.6875rem] text-muted-foreground truncate">{subtitle}</p>
            )}
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </div>
      </header>
      <main
        className={`flex-1 min-h-0 ${scroll ? "overflow-y-auto overscroll-contain" : "overflow-hidden"}`}
      >
        {wide ? children : <div className="max-w-6xl mx-auto px-4 py-4">{children}</div>}
      </main>
    </div>
  );
}

/** زر الاستوديو الموحّد. */
export function SBtn({
  children,
  onClick,
  disabled,
  tone = "ghost",
  type = "button",
  title,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone?: "primary" | "ghost" | "danger" | "gold";
  type?: "button" | "submit";
  title?: string;
  className?: string;
}) {
  const tones = {
    primary: "bg-primary text-primary-foreground hover:opacity-90",
    ghost: "bg-card border border-border hover:bg-muted",
    danger: "bg-destructive text-destructive-foreground hover:opacity-90",
    gold: "bg-gold/15 text-foreground border border-gold/40 hover:bg-gold/25",
  };
  return (
    <button
      type={type}
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition disabled:opacity-40 disabled:pointer-events-none ${tones[tone]} ${className}`}
    >
      {children}
    </button>
  );
}
