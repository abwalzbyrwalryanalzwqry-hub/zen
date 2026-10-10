// ============================================================
// Zen — إبقاء الشاشة مضاءة أثناء القراءة والتلاوة
// ------------------------------------------------------------
// أندرويد: إضافة @capacitor-community/keep-awake (FLAG_KEEP_SCREEN_ON).
// الويب: الإضافة نفسها تستعمل Screen Wake Lock API إن توفّر.
// عدّاد مشترك: تبقى الشاشة مضاءة ما دام مستعمل واحد على الأقل نشطاً.
// ============================================================

import { useEffect } from "react";

let holders = 0;

/** مهلة خمول جلسات الأذكار والوِرد: ٣ دقائق بلا لمس. */
export const KEEP_AWAKE_IDLE_MS = 3 * 60 * 1000;

async function apply(): Promise<void> {
  try {
    // لا تُعاد الإضافة من دالة async مباشرة: وكيل Capacitor يُعامَل كـ thenable.
    const { KeepAwake: k } = await import("@capacitor-community/keep-awake");
    const { isSupported } = await k.isSupported();
    if (!isSupported) return;
    if (holders > 0) await k.keepAwake();
    else await k.allowSleep();
  } catch {
    /* اختياري: لا يُعطّل القراءة إن لم يتوفّر */
  }
}

// قفل الويب يُحرَّر تلقائياً عند إخفاء الصفحة، فيُطلب من جديد عند العودة.
function onVisible() {
  if (document.visibilityState === "visible" && holders > 0) void apply();
}

export interface KeepAwakeOptions {
  /**
   * مهلة خمول: إن لم يلمس المستخدم الشاشة خلالها تُترك لتنطفئ كالمعتاد، ويعود
   * الإبقاء مع أول لمسة. الإضاءة الدائمة والهاتف متروك على الطاولة كانت تستهلك
   * البطارية وترفع الحرارة أثناء الأذكار بلا فائدة.
   */
  idleMs?: number;
}

/** يبقي الشاشة مضاءة ما دام `active` صحيحاً والمكوّن معروضاً. */
export function useKeepAwake(active: boolean, options: KeepAwakeOptions = {}): void {
  const { idleMs } = options;
  useEffect(() => {
    if (!active || typeof window === "undefined") return;
    let holding = false;
    let idle: ReturnType<typeof setTimeout> | undefined;

    const acquire = () => {
      if (holding) return;
      holding = true;
      holders += 1;
      if (holders === 1) document.addEventListener("visibilitychange", onVisible);
      void apply();
    };
    const release = () => {
      if (!holding) return;
      holding = false;
      holders = Math.max(0, holders - 1);
      if (holders === 0) document.removeEventListener("visibilitychange", onVisible);
      void apply();
    };
    const armIdle = () => {
      if (!idleMs) return;
      clearTimeout(idle);
      idle = setTimeout(release, idleMs);
    };
    const onInteract = () => {
      acquire();
      armIdle();
    };

    acquire();
    armIdle();
    const opts = { passive: true, capture: true } as const;
    if (idleMs) {
      window.addEventListener("pointerdown", onInteract, opts);
      window.addEventListener("keydown", onInteract, opts);
    }
    return () => {
      clearTimeout(idle);
      if (idleMs) {
        window.removeEventListener("pointerdown", onInteract, opts);
        window.removeEventListener("keydown", onInteract, opts);
      }
      release();
    };
  }, [active, idleMs]);
}
