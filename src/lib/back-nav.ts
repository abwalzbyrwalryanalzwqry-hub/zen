/**
 * الرجوع للخلف: زر الرجوع في أندرويد، وزر الرجوع داخل الصفحات.
 *
 * زر النظام يمرّ بهذا الترتيب:
 *   1. نافذة أو قائمة مفتوحة ← تُغلق فقط.
 *   2. الصفحة الرئيسية أو شاشة الدخول ← ضغطة أولى تنبّه، وضغطة ثانية خلال ثانيتين تُخرج.
 *   3. سجلّ تنقّل داخل التطبيق ← رجوع للصفحة السابقة.
 *   4. لا سجلّ (فُتحت الصفحة من إشعار مثلاً) ← الرئيسية.
 */

/** الصفحات التي يُخرج منها الرجوع بدل التنقّل. */
export const EXIT_PATHS = ["/", "/today", "/auth/login", "/onboarding"] as const;

export const EXIT_WINDOW_MS = 2000;

export type BackAction = "close-overlay" | "confirm-exit" | "exit" | "history-back" | "go-home";

export function normalizePath(path: string): string {
  const p = path.split(/[?#]/)[0].replace(/\/+$/, "");
  return p === "" ? "/" : p;
}

export function decideBack(opts: {
  path: string;
  overlayOpen: boolean;
  canGoBack: boolean;
  /** وقت الضغطة السابقة على صفحة خروج (أو null). */
  lastExitPress: number | null;
  now: number;
}): BackAction {
  if (opts.overlayOpen) return "close-overlay";
  const path = normalizePath(opts.path);
  if ((EXIT_PATHS as readonly string[]).includes(path)) {
    return opts.lastExitPress !== null && opts.now - opts.lastExitPress < EXIT_WINDOW_MS
      ? "exit"
      : "confirm-exit";
  }
  return opts.canGoBack ? "history-back" : "go-home";
}

/** هل في سجلّ الموجّه صفحة سابقة داخل التطبيق؟ (TanStack يحفظ ترتيب الصفحة في history.state) */
export function inAppHistoryIndex(): number {
  if (typeof window === "undefined") return 0;
  const idx = (window.history.state as { __TSR_index?: unknown } | null)?.__TSR_index;
  return typeof idx === "number" ? idx : 0;
}

const OVERLAY_SELECTOR = [
  '[role="dialog"][data-state="open"]',
  '[role="alertdialog"][data-state="open"]',
  '[role="menu"][data-state="open"]',
  '[role="listbox"][data-state="open"]',
  "[data-radix-popper-content-wrapper]",
  "[vaul-drawer][data-state='open']",
].join(",");

export function overlayOpen(): boolean {
  return typeof document !== "undefined" && document.querySelector(OVERLAY_SELECTOR) !== null;
}

/** نوافذ Radix تُغلق بمفتاح Escape؛ نرسله إلى العنصر المركَّز داخلها. */
export function closeTopOverlay(): void {
  const target = (document.activeElement as HTMLElement | null) ?? document.body;
  const ev = { key: "Escape", code: "Escape", keyCode: 27, bubbles: true, cancelable: true };
  target.dispatchEvent(new KeyboardEvent("keydown", ev));
  document.dispatchEvent(new KeyboardEvent("keydown", ev));
}
