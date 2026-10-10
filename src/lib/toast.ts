/**
 * واجهة `toast` نفسها من sonner، لكن المكتبة (12KB gzip) تُحمَّل خارج الحزمة الأولى (M1).
 * الإشعار ينتظر حتى تُحمَّل المكتبة ويُركَّب `<Toaster />` (يُعلن جاهزيته من `components/ui/sonner`)،
 * فلا يضيع إشعار يُطلق مبكراً. القيمة المعادة غير مستعملة في التطبيق، فلا تُعاد.
 */
type Sonner = typeof import("sonner");
type ToastFn = Sonner["toast"];
type Kind = "success" | "error" | "info" | "warning";

let ready: () => void = () => undefined;
const mounted = new Promise<void>((r) => (ready = r));
let lib: Promise<Sonner> | null = null;

/** يستدعيه `<Toaster />` بعد تركيبه. */
export function markToasterReady(): void {
  ready();
}

function load(): Promise<Sonner> {
  lib ??= import("sonner");
  return lib;
}

function show(kind: Kind | null, args: unknown[]): void {
  void Promise.all([load(), mounted]).then(([m]) => {
    const fn = (kind ? m.toast[kind] : m.toast) as (...a: unknown[]) => unknown;
    fn(...args);
  });
}

type Base = (...args: Parameters<ToastFn>) => void;
type Variant = (...args: Parameters<ToastFn["success"]>) => void;

export const toast: Base & Record<Kind, Variant> = Object.assign(
  (...args: Parameters<ToastFn>) => show(null, args),
  {
    success: (...args: Parameters<ToastFn["success"]>) => show("success", args),
    error: (...args: Parameters<ToastFn["error"]>) => show("error", args),
    info: (...args: Parameters<ToastFn["info"]>) => show("info", args),
    warning: (...args: Parameters<ToastFn["warning"]>) => show("warning", args),
  },
);
