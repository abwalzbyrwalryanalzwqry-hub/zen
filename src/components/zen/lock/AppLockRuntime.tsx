import {
  Component,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "@tanstack/react-router";
import { installAppLock, useAppLock } from "@/lib/app-lock-state";
import { isReadPath, leaveQuranWhileLocked, useQuranWhileLocked } from "@/lib/app-lock-quran";
import { useLockSideEffects } from "./lock-effects";

const QuranWhileLockedBar = lazy(() =>
  Promise.all([
    import("./QuranWhileLockedBar"),
    import("@/lib/lock-i18n").then((m) => m.ensureLockDict().catch(() => undefined)),
  ]).then(([m]) => m),
);

// الشاشة وقاموسها معاً: لا تُرسم بمفاتيح خام.
const LockScreen = lazy(() =>
  Promise.all([
    import("./LockScreen"),
    import("@/lib/lock-i18n").then((m) => m.ensureLockDict().catch(() => undefined)),
  ]).then(([m]) => m),
);

/** المسار الحالي بـ router.subscribe (useRouterState يضيف قطعة مشتركة إلى الحزمة الأولى). */
function usePathname(): string {
  const router = useRouter();
  const sub = useCallback((cb: () => void) => router.subscribe("onResolved", cb), [router]);
  return useSyncExternalStore(
    sub,
    () => router.state.location.pathname,
    () => router.state.location.pathname,
  );
}

/**
 * تشغيل قفل التطبيق داخل Android (تحمّله AppLockGate)، فوق كل المسارات والروابط الداخلية والإشعارات.
 *
 * - القفل معطّل: يُعرض التطبيق فور وصول الحالة.
 * - الإقلاع والقفل مفعّل: لا يُركَّب أي محتوى (ولا تُطلب صفحاته) قبل أول فتح ناجح. الرابط الداخلي يغيّر
 *   المسار خلف الشاشة فقط، فيصل إليه المستخدم بعد التحقق.
 * - القفل أثناء الاستخدام (العودة من الخلفية): يبقى المحتوى مركَّباً كي لا تضيع حالة الصفحة، لكنه مغطّى
 *   بشاشة معتمة فوق كل شيء، ومعطَّل بـ inert وaria-hidden (لا لمس ولا تركيز ولا قارئ شاشة)، ومعه النوافذ
 *   المنبثقة التي تُضاف إلى body لاحقاً.
 * - قبل وصول الحالة من الطبقة الأصلية لا يُعرض شيء؛ الغطاء الأصلي (شاشة البداية) يملأ الشاشة.
 * - «قراءة المصحف دون فتح القفل» (1.29.0، اختياري): صفحة القراءة وحدها تُعرض والطبقة الأصلية مقفلة؛
 *   مغادرتها تعيد شاشة القفل، والمحتوى الذي لم يُفتح بعد لا يبقى مركَّباً.
 */
export default function AppLockRuntime({ children }: { children: ReactNode }) {
  const snap = useAppLock();
  const locked = snap.status !== "ready" || (snap.state.enabled && snap.state.locked);
  const [opened, setOpened] = useState(false);
  const path = usePathname();
  const quranPass = useQuranWhileLocked();
  const reading =
    locked &&
    snap.status === "ready" &&
    snap.state.quranWhileLocked &&
    quranPass &&
    isReadPath(path);

  useEffect(() => installAppLock(), []);
  useLockSideEffects(snap, locked);
  // خارج صفحة القراءة، أو بعد الفتح: ينتهي وضع «المصحف دون فتح القفل».
  useEffect(() => {
    if (quranPass && (!locked || !isReadPath(path))) leaveQuranWhileLocked();
  }, [quranPass, locked, path]);
  // أول فتح ناجح يركّب التطبيق ويبقيه مركَّباً بعدها (إعادة القفل تغطيه ولا تهدمه).
  if (!locked && !opened) setOpened(true);

  const showLock = locked && snap.status !== "loading" && !reading;
  const layer = useLockLayer(showLock);

  return (
    <>
      {(opened || reading) && (
        <HoldErrorsWhileLocked locked={locked}>{children}</HoldErrorsWhileLocked>
      )}
      {reading && (
        <Suspense fallback={null}>
          <QuranWhileLockedBar />
        </Suspense>
      )}
      {showLock &&
        layer &&
        createPortal(
          <Suspense fallback={<div className="fixed inset-0 z-[2147483647] bg-background" />}>
            <LockScreen snap={snap} />
          </Suspense>,
          layer,
        )}
    </>
  );
}

/**
 * طبقة مستقلة في body لشاشة القفل، وكل ما سواها في body يصير inert وaria-hidden ما دام القفل ظاهراً
 * (ومنه ما يُضاف لاحقاً، كنوافذ Radix). عند الفتح يُعاد فقط ما غيّرناه نحن.
 */
function useLockLayer(active: boolean): HTMLElement | null {
  const [layer] = useState<HTMLElement | null>(() => {
    if (typeof document === "undefined") return null;
    const el = document.createElement("div");
    el.id = "zen-lock-layer";
    return el;
  });
  useEffect(() => {
    if (!active || !layer) return;
    const el = layer;
    document.body.appendChild(el);
    // العنصر ← قيمة aria-hidden الأصلية، لتعود كما كانت.
    const touched = new Map<HTMLElement, string | null>();
    const hide = (n: Node) => {
      if (!(n instanceof HTMLElement) || n === el || n.tagName === "SCRIPT") return;
      if (!n.inert) {
        touched.set(n, n.getAttribute("aria-hidden"));
        n.inert = true;
        n.setAttribute("aria-hidden", "true");
      }
    };
    Array.from(document.body.children).forEach(hide);
    const mo = new MutationObserver((list) => {
      for (const m of list) m.addedNodes.forEach(hide);
    });
    mo.observe(document.body, { childList: true });
    // التركيز لا يبقى على عنصر خلف القفل.
    if (document.activeElement instanceof HTMLElement && !el.contains(document.activeElement)) {
      document.activeElement.blur();
    }
    return () => {
      mo.disconnect();
      touched.forEach((prev, n) => {
        n.inert = false;
        if (prev === null) n.removeAttribute("aria-hidden");
        else n.setAttribute("aria-hidden", prev);
      });
      el.remove();
    };
  }, [active, layer]);
  return layer;
}

/**
 * عطل في المحتوى والتطبيق مقفل لا يصعد إلى صفحة الخطأ العامة (التي تحلّ محل الشجرة كلها ومعها شاشة القفل):
 * يُحجب المحتوى وتبقى شاشة القفل، ثم يصعد الخطأ نفسه بعد الفتح فيُعرض ويُبلَّغ كما كان.
 */
class HoldErrorsWhileLocked extends Component<
  { locked: boolean; children: ReactNode },
  { error: unknown; failed: boolean }
> {
  state = { error: null as unknown, failed: false };

  static getDerivedStateFromError(error: unknown) {
    return { error, failed: true };
  }

  render() {
    if (this.state.failed) {
      if (!this.props.locked) throw this.state.error;
      return null;
    }
    return this.props.children;
  }
}
