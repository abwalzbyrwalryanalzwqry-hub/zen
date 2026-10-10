import { useEffect } from "react";
import { LockKeyhole } from "lucide-react";
import { useT } from "@/lib/i18n";
import { RESUME_EVENT } from "@/lib/app-resume";
import { hideNativeCover } from "@/lib/app-lock";
import { leaveQuranWhileLocked } from "@/lib/app-lock-quran";

/**
 * شريط «قراءة المصحف دون فتح القفل» (1.29.0): يذكّر بأن زِن ما زال مقفلاً ويعيد إلى شاشة القفل بنقرة.
 * الطبقة الأصلية مقفلة طوال الوقت، فيُزال غطاؤها الأصلي هنا كما تفعل شاشة القفل.
 */
export default function QuranWhileLockedBar() {
  const t = useT();
  useEffect(() => {
    const hide = () => requestAnimationFrame(() => void hideNativeCover());
    hide();
    window.addEventListener(RESUME_EVENT, hide);
    return () => window.removeEventListener(RESUME_EVENT, hide);
  }, []);
  return (
    <div
      className="fixed top-0 inset-x-0 z-[2147483646] flex justify-center pointer-events-none zen-safe"
      data-testid="quran-while-locked"
    >
      <button
        type="button"
        onClick={leaveQuranWhileLocked}
        className="pointer-events-auto mt-2 min-h-11 px-4 rounded-full glass-strong text-xs font-bold flex items-center gap-2 shadow-lg"
        data-testid="quran-back-to-lock"
      >
        <LockKeyhole className="size-4" aria-hidden="true" />
        {t("appLock.quran.back")}
      </button>
    </div>
  );
}
