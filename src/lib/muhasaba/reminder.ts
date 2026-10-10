import { useEffect } from "react";
import { notificationState, showSystemNotification } from "@/lib/system-notify";
import { isoDay } from "./dates";
import { reminderDue, reminderMessage } from "./logic";
import { loadLocal } from "./storage";

// مفتاح مستقل عن حالة المحاسبة حتى لا تكتب إحداهما فوق الأخرى.
const lastKey = (uid: string) => `zen.muhasaba.reminded.${uid}`;

/**
 * تذكير «محاسبتي» اليومي الاختياري.
 *
 * يعمل بنمط «تذكير الورد» القائم نفسه (src/components/zen/DailyReminder.tsx):
 * جدولة محلية أثناء فتح التطبيق، وتنبيه عبر عامل الخدمة. وسم مستقل «muhasaba»
 * حتى لا يستبدل تنبيه الورد. لا يُطلق إذا أغلق المستخدم يومه، ولا أكثر من مرة في اليوم.
 */
export function checkMuhasabaReminder(userId: string, now = new Date()): boolean {
  const s = loadLocal(userId);
  const today = isoDay(now);
  const closed = !!s.days[today]?.closed_at;
  let last: string | null;
  try {
    last = localStorage.getItem(lastKey(userId));
  } catch {
    last = null;
  }
  if (!reminderDue(s.settings, now, last, today, closed)) return false;
  if (notificationState() !== "granted") return false;
  const msg = reminderMessage(today);
  void showSystemNotification({
    title: msg.title,
    body: msg.body,
    url: "/muhasaba",
    tag: "muhasaba",
    force: true,
  });
  try {
    localStorage.setItem(lastKey(userId), today);
  } catch {
    // لا شيء
  }
  return true;
}

export function useMuhasabaReminder(userId: string | null | undefined) {
  useEffect(() => {
    if (!userId) return;
    const tick = () => {
      try {
        checkMuhasabaReminder(userId);
      } catch {
        // التذكير ميزة ثانوية؛ لا يُسمح لها بتعطيل التطبيق.
      }
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [userId]);
}
