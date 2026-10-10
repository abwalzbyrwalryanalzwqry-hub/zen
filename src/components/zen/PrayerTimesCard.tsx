import { Link } from "@tanstack/react-router";
import { MapPin, Moon } from "lucide-react";
import { useMinuteClock, usePrayerSettings } from "@/hooks/usePrayerSettings";
import {
  formatCountdown,
  formatTime,
  nextPrayer,
  PRAYER_KEYS,
  PRAYER_NAMES,
  prayerTimes,
} from "@/lib/prayer";

/** مواقيت اليوم والصلاة القادمة. بلا إعداد: دعوة لضبطها. */
export function PrayerTimesCard() {
  const settings = usePrayerSettings();
  const now = useMinuteClock();
  if (!settings) {
    return (
      <Link to="/settings/prayer" className="glass rounded-3xl p-4 flex items-center gap-3">
        <Moon className="w-5 h-5 text-gold shrink-0" aria-hidden="true" />
        <span className="flex-1">
          <span className="block text-sm font-bold text-foreground">مواقيت الصلاة</span>
          <span className="block text-[0.6875rem] text-muted-foreground">
            اختر مدينتك أو موقعك مرة واحدة. يُحسب على جهازك ولا يُرسَل.
          </span>
        </span>
      </Link>
    );
  }
  const times = prayerTimes(settings, now);
  const next = nextPrayer(settings, now);
  return (
    <section aria-label="مواقيت الصلاة" className="glass rounded-3xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Moon className="w-4 h-4 text-gold" aria-hidden="true" />
        <p className="flex-1 text-sm font-bold text-foreground">
          {PRAYER_NAMES[next.name]} {formatCountdown(next.at.getTime() - now.getTime())}
        </p>
        <Link
          to="/settings/prayer"
          className="flex items-center gap-1 text-[0.625rem] text-muted-foreground"
          aria-label={`تغيير الموقع (${settings.place || "موقعي"})`}
        >
          <MapPin className="w-3 h-3" aria-hidden="true" />
          {settings.place || "موقعي"}
        </Link>
      </div>
      <ol className="grid grid-cols-5 gap-1 text-center">
        {PRAYER_KEYS.map((k) => {
          const isNext = k === next.name && next.at.toDateString() === now.toDateString();
          return (
            <li
              key={k}
              aria-current={isNext ? "time" : undefined}
              className={`rounded-2xl py-2 ${isNext ? "bg-primary text-primary-foreground" : "bg-muted/50"}`}
            >
              <span className="block text-[0.625rem] opacity-80">{PRAYER_NAMES[k]}</span>
              <span className="block text-xs font-bold">{formatTime(times[k])}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
