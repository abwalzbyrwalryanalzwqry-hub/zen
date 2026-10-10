import { useEffect, useState } from "react";
import { loadPrayerSettings, type PrayerSettings } from "@/lib/prayer";

/** إعداد المواقيت من الجهاز، ويتحدّث حين يُحفظ من صفحة الإعدادات. */
export function usePrayerSettings(): PrayerSettings | null {
  const [s, setS] = useState<PrayerSettings | null>(null);
  useEffect(() => {
    const read = () => setS(loadPrayerSettings());
    read();
    window.addEventListener("zen-prayer", read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener("zen-prayer", read);
      window.removeEventListener("storage", read);
    };
  }, []);
  return s;
}

/** الوقت الحالي يتجدّد كل دقيقة. */
export function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}
