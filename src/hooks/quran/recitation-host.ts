import {
  createContext,
  createElement,
  lazy,
  Suspense,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { RecitationPlayer } from "@/hooks/quran/use-recitation-player";

/**
 * مضيف مشغّل التلاوة في الجذر (M1: الحزمة الأولى). كان المحرّك كاملاً (عنصر الصوت ومنطق التنقّل
 * وتسجيلات الجهاز ومزامنة إشعار التشغيل) في الحزمة الأولى لكل مستخدم، ومعظمهم لا يفتح التلاوة.
 * الآن السياق وحده هنا، والمحرّك يُحمَّل كسولاً أول مرة يُطلب فيها المشغّل ثم يبقى مركّباً، فتستمر
 * التلاوة بين الشاشات كما كانت.
 */
const PlayerContext = createContext<RecitationPlayer | null>(null);

const Engine = lazy(() =>
  import("@/hooks/quran/use-recitation-player").then((m) => ({
    default: m.RecitationPlayerEngine,
  })),
);

let wanted = false;
const listeners = new Set<() => void>();
let resolveReady: () => void = () => {};
const ready = new Promise<void>((r) => {
  resolveReady = r;
});

/** يطلب تحميل المحرّك (يُستدعى أثناء رسم مكوّن آخر، فالإشعار مؤجَّل). */
export function requestRecitationPlayer() {
  if (wanted) return;
  wanted = true;
  queueMicrotask(() => listeners.forEach((l) => l()));
}

export function RecitationPlayerProvider({ children }: { children: ReactNode }) {
  const [need, setNeed] = useState(wanted);
  const [player, setPlayer] = useState<RecitationPlayer | null>(null);
  useEffect(() => {
    const l = () => setNeed(true);
    listeners.add(l);
    if (wanted) l();
    return () => {
      listeners.delete(l);
    };
  }, []);
  useEffect(() => {
    if (player) resolveReady();
  }, [player]);
  // شاشات التلاوة تنتظر المحرّك أول مرة فقط (لحظة تحميل القطعة)، فالأبناء داخل Suspense.
  return createElement(
    PlayerContext.Provider,
    { value: player },
    need &&
      createElement(Suspense, { fallback: null }, createElement(Engine, { onReady: setPlayer })),
    createElement(Suspense, { fallback: null }, children),
  );
}

/** المشغّل إن كان محمَّلاً (لا يرمي ولا يطلب التحميل) — لشريط التلاوة العائم. */
export function useOptionalRecitationPlayer(): RecitationPlayer | null {
  return useContext(PlayerContext);
}

/** مشغّل التلاوة المشترك: أول استعمال يحمّل المحرّك وينتظره (Suspense). */
export function useRecitationPlayer(): RecitationPlayer {
  const ctx = useContext(PlayerContext);
  if (ctx) return ctx;
  requestRecitationPlayer();
  throw ready;
}
