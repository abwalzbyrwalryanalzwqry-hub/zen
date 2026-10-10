import { Link, useRouterState } from "@tanstack/react-router";
import {
  MessageCircle,
  BookOpen,
  BookOpenCheck,
  CalendarCheck,
  ClipboardCheck,
  GraduationCap,
  Sprout,
  HeartHandshake,
  LayoutGrid,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { subscribeLive } from "@/lib/realtime-hub";
import { useSession } from "@/hooks/useSession";
import { unreadTotal } from "@/lib/chat-extras";
import { activeNavKey, guestNavItems, navItemsFor, type NavKey } from "@/lib/home";
import { useHomeContext } from "@/hooks/useHomeContext";
import { useT } from "@/lib/i18n";

const ICONS: Record<NavKey, LucideIcon> = {
  today: CalendarCheck,
  quran: BookOpen,
  mushaf: BookOpenCheck,
  chats: MessageCircle,
  teacher: GraduationCap,
  family: HeartHandshake,
  exams: ClipboardCheck,
  muhasaba: Sprout,
  more: LayoutGrid,
};

/** الشريط السفلي حسب الدور (المرحلة 9): أربعة أو خمسة عناصر، والباقي في «المزيد». */
export function BottomNav() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { mode, guest } = useHomeContext();
  const t = useT(); // يعيد الرسم عند تغيير اللغة (13.1)
  const items = guest ? guestNavItems() : navItemsFor(mode);
  const activeKey = activeNavKey(path, items);
  const [unread, setUnread] = useState(0);

  const { userId } = useSession();

  // شارة الرسائل غير المقروءة: تُحمَّل عند تغيّر المسار، وتُحدَّث لحظياً من المحور المشترك (M6)
  // باشتراك واحد للمستخدم لا يُعاد بناؤه مع كل تنقّل.
  useEffect(() => {
    if (guest || !userId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const load = () => {
      unreadTotal()
        .then((n) => {
          if (!cancelled) setUnread(n);
        })
        .catch(() => {
          /* بلا جلسة أو بلا شبكة: أخفِ الشارة بهدوء */
        });
    };
    // تجميع الأحداث المتتالية في نداء واحد بدل نداء لكل رسالة
    const refresh = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        load();
      }, 400);
    };
    const off = subscribeLive(userId, (e) => {
      if (e.kind === "message") refresh();
    });
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      off();
    };
  }, [guest, userId]);

  useEffect(() => {
    if (guest || !userId) return;
    let cancelled = false;
    unreadTotal()
      .then((n) => !cancelled && setUnread(n))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [path, guest, userId]);
  return (
    <nav
      aria-label={t("nav.aria")}
      className="glass-strong mx-3 mb-3 rounded-3xl px-1.5 py-2 flex items-center justify-around"
    >
      {items.map(({ key, to, label }) => {
        const Icon = ICONS[key];
        const active = activeKey === key;
        return (
          <Link
            key={key}
            to={to}
            aria-current={active ? "page" : undefined}
            className={`flex-1 flex flex-col items-center gap-1 py-2 px-0.5 rounded-2xl transition-all ${
              active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <span className="relative">
              <Icon
                aria-hidden="true"
                className={`w-5 h-5 ${active ? "drop-shadow-[0_0_8px_var(--primary-glow)]" : ""}`}
              />
              {to === "/chats" && unread > 0 && (
                <span
                  className="absolute -top-1.5 -left-2 min-w-4 h-4 px-1 rounded-full bg-primary text-primary-foreground text-[0.625rem] font-bold flex items-center justify-center"
                  aria-label={t("nav.unread", { n: unread })}
                >
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </span>
            <span className="text-[0.6875rem] font-medium">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
