import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";
import { sheetRelease } from "@/lib/sheet-gesture";

/**
 * نصف شاشة منبثقة من الأسفل (1.14.0) بدل النوافذ الكاملة في السجل اليومي.
 *
 * - مبنية على Radix Dialog: حبس التركيز، وEscape، وزر الرجوع في أندرويد (role=dialog data-state=open في
 *   back-nav)، وaria-modal — فلا مكتبة سحب إضافية في الحزمة.
 * - snap="half": تفتح على نحو نصف الشاشة (55dvh) والمحتوى يتمرّر داخلها؛ تتوسّع إلى 92dvh بسحب المقبض لأعلى،
 *   أو بلمسه، أو تلقائياً عند التركيز على حقل كتابة (كي لا تغطيه لوحة المفاتيح).
 *   snap="auto": بارتفاع المحتوى حتى 92dvh (قوائم الإجراءات القصيرة).
 * - السحب لأسفل من المقبض أو العنوان يغلقها (أو يصغّرها إن كانت موسّعة)، والقرار في sheetRelease.
 * - حواف آمنة أسفل الشاشة، وبلا حركة مع prefers-reduced-motion.
 */

type SheetCtx = { onOpenChange: (open: boolean) => void };
const Ctx = React.createContext<SheetCtx>({ onOpenChange: () => {} });

export function Sheet({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  const value = React.useMemo(() => ({ onOpenChange }), [onOpenChange]);
  return (
    <Ctx.Provider value={value}>
      <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
        {children}
      </DialogPrimitive.Root>
    </Ctx.Provider>
  );
}

const SheetClose = DialogPrimitive.Close;

export interface SheetContentProps extends Omit<
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>,
  "title"
> {
  /** العنوان (اسم النافذة لقارئ الشاشة). */
  title: React.ReactNode;
  /** سطر تحت العنوان (يُربط بـ aria-describedby). */
  description?: React.ReactNode;
  /** عناصر في رأس النافذة قبل زر الإغلاق (مثل التالي/السابق). */
  headerExtra?: React.ReactNode;
  /** شريط ثابت أسفل النافذة (أزرار الإجراء). */
  footer?: React.ReactNode;
  snap?: "half" | "auto";
  /** يبدأ موسّعاً (snap="half"). */
  defaultExpanded?: boolean;
  /** صنف جسم المحتوى المتمرّر. */
  bodyClassName?: string;
  /** يُخفي العنوان بصرياً (يبقى لقارئ الشاشة). */
  hideTitle?: boolean;
  /** يفرض التوسيع (عرض فرعي يحتاج الشاشة كلها، كالمصحف). */
  forceExpanded?: boolean;
}

const EDITABLE = "input:not([type=checkbox]):not([type=radio]):not([type=button]), textarea";

export const SheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  SheetContentProps
>(
  (
    {
      title,
      description,
      headerExtra,
      footer,
      snap = "half",
      defaultExpanded = false,
      className,
      bodyClassName,
      hideTitle,
      forceExpanded,
      children,
      onFocusCapture,
      ...props
    },
    ref,
  ) => {
    const { onOpenChange } = React.useContext(Ctx);
    const [expandedState, setExpanded] = React.useState(defaultExpanded);
    const expanded = expandedState || !!forceExpanded;
    const [drag, setDrag] = React.useState(0);
    const start = React.useRef<{ y: number; t: number } | null>(null);

    const onPointerDown = (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      // الأزرار داخل الرأس (الإغلاق، التالي) تعمل باللمس العادي.
      if ((e.target as HTMLElement).closest("button:not([data-sheet-handle]), a, input")) return;
      start.current = { y: e.clientY, t: e.timeStamp };
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    };
    const onPointerMove = (e: React.PointerEvent) => {
      if (!start.current) return;
      setDrag(e.clientY - start.current.y);
    };
    const onPointerEnd = (e: React.PointerEvent) => {
      if (!start.current) return;
      const dy = e.clientY - start.current.y;
      const dt = Math.max(1, e.timeStamp - start.current.t);
      start.current = null;
      setDrag(0);
      const action = sheetRelease({ dy, velocity: dy / dt, expanded, snap });
      if (action === "close") onOpenChange(false);
      else if (action === "expand") setExpanded(true);
      else if (action === "collapse") setExpanded(false);
    };

    const height =
      snap === "auto" ? "max-h-[92dvh]" : expanded ? "h-[92dvh]" : "h-[55dvh] max-h-[92dvh]";

    return (
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 motion-reduce:animate-none" />
        <DialogPrimitive.Content
          ref={ref}
          data-sheet=""
          data-expanded={expanded ? "" : undefined}
          {...(description ? {} : { "aria-describedby": undefined })}
          onFocusCapture={(e) => {
            onFocusCapture?.(e);
            if (snap === "half" && !expanded && (e.target as HTMLElement).matches?.(EDITABLE))
              setExpanded(true);
          }}
          style={drag ? { transform: `translateY(${Math.max(drag, -40)}px)` } : undefined}
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 mx-auto flex w-full max-w-lg flex-col rounded-t-3xl border border-b-0 bg-background shadow-2xl outline-none",
            "pb-[env(safe-area-inset-bottom)]",
            drag ? "" : "transition-[height,transform] duration-200 motion-reduce:transition-none",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom duration-200 motion-reduce:animate-none",
            height,
            className,
          )}
          {...props}
        >
          <div
            className="shrink-0 touch-none select-none px-4 pt-2"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
          >
            {snap === "half" ? (
              <button
                type="button"
                data-sheet-handle=""
                aria-label={expanded ? t("sheet.collapse") : t("sheet.expand")}
                aria-expanded={expanded}
                onClick={() => setExpanded((x) => !x)}
                className="mx-auto flex h-6 w-16 items-center justify-center rounded-full"
              >
                <span
                  className="h-1.5 w-10 rounded-full bg-muted-foreground/30"
                  aria-hidden="true"
                />
              </button>
            ) : (
              <div
                className="mx-auto h-1.5 w-10 rounded-full bg-muted-foreground/30"
                aria-hidden="true"
              />
            )}
            <div className="flex min-h-12 items-center gap-2 pb-2">
              <div className={cn("min-w-0 flex-1", hideTitle && "sr-only")}>
                <DialogPrimitive.Title className="truncate font-display text-base font-bold">
                  {title}
                </DialogPrimitive.Title>
                {description && (
                  <DialogPrimitive.Description className="truncate text-xs text-muted-foreground">
                    {description}
                  </DialogPrimitive.Description>
                )}
              </div>
              {hideTitle && <div className="flex-1" />}
              {headerExtra}
              <DialogPrimitive.Close className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <X className="h-5 w-5" aria-hidden="true" />
                <span className="sr-only">{t("common.close")}</span>
              </DialogPrimitive.Close>
            </div>
          </div>
          <div
            className={cn(
              "min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4",
              bodyClassName,
            )}
          >
            {children}
          </div>
          {footer && (
            <div className="shrink-0 border-t border-border/60 bg-background/95 px-4 py-3">
              {footer}
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    );
  },
);
SheetContent.displayName = "SheetContent";

export { SheetClose };
