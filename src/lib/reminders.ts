const KEY = "zen.reminder";

export type ReminderSettings = {
  enabled: boolean;
  /** "HH:MM" 24h local time */
  time: string;
  /** ISO date "YYYY-MM-DD" of the last fired reminder */
  lastFired: string | null;
};

export const DEFAULT_REMINDER: ReminderSettings = {
  enabled: false,
  time: "20:00",
  lastFired: null,
};

export function loadReminder(): ReminderSettings {
  if (typeof window === "undefined") return DEFAULT_REMINDER;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_REMINDER;
    return { ...DEFAULT_REMINDER, ...(JSON.parse(raw) as Partial<ReminderSettings>) };
  } catch {
    return DEFAULT_REMINDER;
  }
}

export function saveReminder(s: ReminderSettings) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(s));
}

export function todayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function notificationsSupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!notificationsSupported()) return "denied";
  if (Notification.permission === "granted") return "granted";
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}

export function fireReminder() {
  if (!notificationsSupported() || Notification.permission !== "granted") return;
  try {
    new Notification("Zen · تذكير الحفظ 🌿", {
      body: "لا تنسَ تسجيل وردك اليومي من القرآن الكريم.",
      tag: "zen-daily-memorization",
      dir: "rtl",
      lang: "ar",
    });
  } catch {
    /* ignore */
  }
}

/** True when now is at/after the scheduled time today and it hasn't fired yet today. */
export function isDue(s: ReminderSettings, now = new Date()) {
  if (!s.enabled) return false;
  if (s.lastFired === todayKey(now)) return false;
  const [h, m] = s.time.split(":").map(Number);
  const due = new Date(now);
  due.setHours(h ?? 20, m ?? 0, 0, 0);
  return now.getTime() >= due.getTime();
}
