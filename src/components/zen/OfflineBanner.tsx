import { useEffect, useState } from "react";
import { History, WifiOff } from "lucide-react";
import { isOnline } from "@/lib/network";
import { onStaleChange, staleSince } from "@/lib/offline/cache-policy";
import { agoText } from "@/lib/relative-time";
import { useT } from "@/lib/i18n";

/**
 * شريط صغير للمسجَّل: يظهر حين ينقطع الاتصال، أو حين تُعرض نسخة محفوظة بعد فشل الشبكة، ويذكر عمر
 * أقدم بيانات معروضة («آخر تحديث منذ…»، 3.9). يختفي بأول قراءة حيّة ناجحة.
 */
export function OfflineBanner() {
  const t = useT();
  const [offline, setOffline] = useState(false);
  const [since, setSince] = useState<number | null>(null);
  const [, tick] = useState(0);

  useEffect(() => {
    const update = () => setOffline(!isOnline());
    const stale = () => setSince(staleSince());
    update();
    stale();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    const off = onStaleChange(stale);
    // يحدّث «منذ…» كل دقيقة.
    const timer = setInterval(() => tick((n) => n + 1), 60_000);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      off();
      clearInterval(timer);
    };
  }, []);

  if (!offline && since === null) return null;
  const text =
    since === null
      ? t("offline.banner")
      : t(offline ? "offline.stale" : "offline.staleOnline", { ago: agoText(since) });
  const Icon = offline ? WifiOff : History;
  return (
    <div
      role="status"
      className="fixed top-3 inset-x-0 z-50 flex justify-center pointer-events-none"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <span className="glass rounded-full px-3 py-1.5 text-[0.6875rem] text-foreground flex items-center gap-1.5 shadow-lg">
        <Icon className="w-3.5 h-3.5 text-gold" aria-hidden="true" />
        {text}
      </span>
    </div>
  );
}
