import { useEffect, useState } from "react";
import { useLatest } from "@/hooks/use-latest";
import { Bell, BellOff } from "lucide-react";
import {
  fireReminder,
  isDue,
  loadReminder,
  notificationsSupported,
  requestNotificationPermission,
  saveReminder,
  todayKey,
  type ReminderSettings,
} from "@/lib/reminders";

/** Glass card: daily reminder to log memorization. Runs a lightweight local scheduler. */
export function DailyReminder({ loggedToday }: { loggedToday: boolean }) {
  // الإعداد محلي ومتزامن، فيُقرأ عند أول عرض بدل أثر يضبطه بعده.
  const [s, setS] = useState<ReminderSettings>(loadReminder);
  const [msg, setMsg] = useState<string | null>(null);
  const loggedRef = useLatest(loggedToday);

  // local scheduler: checks every minute while the app is open
  useEffect(() => {
    if (!s.enabled) return;
    const tick = () => {
      const cur = loadReminder();
      if (loggedRef.current) return;
      if (!isDue(cur)) return;
      fireReminder();
      const next = { ...cur, lastFired: todayKey() };
      saveReminder(next);
      setS(next);
    };
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [s.enabled, s.time, loggedRef]);

  const update = (patch: Partial<ReminderSettings>) => {
    const next = { ...s, ...patch };
    setS(next);
    saveReminder(next);
  };

  const toggle = async () => {
    if (s.enabled) {
      update({ enabled: false });
      setMsg(null);
      return;
    }
    if (!notificationsSupported()) {
      setMsg("متصفحك لا يدعم الإشعارات.");
      return;
    }
    const perm = await requestNotificationPermission();
    if (perm !== "granted") {
      setMsg("لم يتم السماح بالإشعارات. فعّلها من إعدادات المتصفح.");
      return;
    }
    setMsg(null);
    update({ enabled: true, lastFired: null });
  };

  return (
    <div className="mx-5 mt-3 glass rounded-3xl p-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-2xl bg-gold/15 flex items-center justify-center">
          {s.enabled ? (
            <Bell className="w-4 h-4 text-gold" />
          ) : (
            <BellOff className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">تذكير يومي بالحفظ</p>
          <p className="text-[0.625rem] text-muted-foreground">
            {s.enabled ? `سيصلك تذكير كل يوم عند ${s.time}` : "فعّله لتحافظ على وردك اليومي"}
          </p>
        </div>
        <button
          onClick={toggle}
          role="switch"
          aria-checked={s.enabled}
          aria-label="تفعيل التذكير اليومي"
          className={`w-11 h-6 rounded-full transition-colors relative ${s.enabled ? "bg-primary" : "bg-muted"}`}
        >
          <span
            className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${s.enabled ? "start-0.5" : "end-0.5"}`}
          />
        </button>
      </div>

      {s.enabled && (
        <div className="mt-3 flex items-center gap-2">
          <label className="text-[0.6875rem] text-muted-foreground">وقت التذكير</label>
          <input
            type="time"
            value={s.time}
            onChange={(e) => update({ time: e.target.value, lastFired: null })}
            dir="ltr"
            className="glass rounded-xl px-3 py-1.5 text-xs outline-none"
          />
          {loggedToday && (
            <span className="text-[0.625rem] text-primary">تم تسجيل ورد اليوم ✓</span>
          )}
        </div>
      )}

      {msg && <p className="text-[0.625rem] text-destructive mt-2">{msg}</p>}
    </div>
  );
}
