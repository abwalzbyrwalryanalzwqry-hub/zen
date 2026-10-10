import { Link, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  BookOpenCheck,
  ClipboardCheck,
  LogIn,
  Lock,
  WifiOff,
  ChevronLeft,
  type LucideIcon,
} from "lucide-react";
import { PhoneFrame } from "@/components/zen/PhoneFrame";
import { BottomNav } from "@/components/zen/BottomNav";
import { ZenLogo } from "@/components/zen/ZenLogo";
import { PrayerTimesCard } from "@/components/zen/PrayerTimesCard";
import { MUSHAF_EMBEDDED } from "@/lib/offline/native-shim";
import { MuhasabaEntryCard } from "@/components/muhasaba/EntryCard";
import { GUEST_ID, setGuest } from "@/lib/offline/guest";
import { hijriDate, isoDay } from "@/lib/muhasaba/dates";

const TOOLS: { to: string; title: string; hint: string; icon: LucideIcon }[] = [
  {
    to: "/mushaf",
    title: "المصحف",
    hint: MUSHAF_EMBEDDED
      ? "604 صفحة مضمَّنة في التطبيق، تُقرأ دون اتصال"
      : "نزّله كاملاً من الإعدادات (نحو 2.5 ميغابايت) ليُقرأ دون اتصال",
    icon: BookOpenCheck,
  },
  {
    to: "/exams",
    title: "اختبارات الحفظ",
    hint: "اختبر حفظك بنطاق تحدّده، من المتن العثماني على جهازك",
    icon: ClipboardCheck,
  },
];

function greeting(d = new Date()): string {
  const h = d.getHours();
  if (h < 5) return "طابت ليلتك";
  if (h < 12) return "صباح الخير";
  if (h < 17) return "طاب يومك";
  return "مساء الخير";
}

/** الرئيسية في وضع الضيف: كل ما يعمل على الجهاز وحده، ودعوة هادئة لتسجيل الدخول. */
export function GuestHome() {
  const hijri = useMemo(() => {
    try {
      return hijriDate(isoDay());
    } catch {
      return "";
    }
  }, []);

  return (
    <PhoneFrame>
      <div className="flex-1 flex flex-col">
        <header className="px-5 pt-12 pb-3 flex items-center gap-3">
          <ZenLogo size={44} glow={false} />
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-black text-foreground">{greeting()}</h1>
            <p className="text-[0.6875rem] text-muted-foreground truncate">
              {hijri || "رفيقك في حفظ القرآن الكريم"}
            </p>
          </div>
          <span
            className="glass rounded-full px-3 py-1.5 text-[0.6875rem] font-bold text-primary flex items-center gap-1.5"
            title="يعمل هذا الوضع دون إنترنت"
          >
            <WifiOff className="w-3.5 h-3.5" aria-hidden="true" />
            على جهازك
          </span>
        </header>

        <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-3">
          <PrayerTimesCard />

          <section aria-labelledby="guest-tools" className="space-y-2">
            <h2 id="guest-tools" className="text-xs font-bold text-muted-foreground px-2 pt-1">
              أدواتك دون اتصال
            </h2>
            {TOOLS.map(({ to, title, hint, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                className="glass rounded-3xl p-4 flex items-center gap-3 hover:bg-primary/5 transition-colors"
              >
                <span className="w-11 h-11 rounded-2xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5" aria-hidden="true" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-bold text-foreground">{title}</span>
                  <span className="block text-[0.6875rem] text-muted-foreground">{hint}</span>
                </span>
                <ChevronLeft className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
              </Link>
            ))}
          </section>

          <MuhasabaEntryCard userId={GUEST_ID} />

          <GuestAccountCard />
        </div>
        <BottomNav />
      </div>
    </PhoneFrame>
  );
}

/** بطاقة الدعوة لتسجيل الدخول (الحلقة والمعلّم والتسميع وولي الأمر). */
export function GuestAccountCard() {
  const navigate = useNavigate();
  return (
    <div className="glass-strong rounded-3xl p-4 border border-gold/25 space-y-3">
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-2xl bg-gold/15 text-gold flex items-center justify-center shrink-0">
          <LogIn className="w-5 h-5" aria-hidden="true" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-foreground">انضمّ إلى حلقتك</p>
          <p className="text-[0.6875rem] text-muted-foreground leading-relaxed">
            بحسابك تصل إلى معلّمك وواجباتك والتسميع والمحادثات ومتابعة وليّ الأمر، ويبقى ما سبق
            تحميله متاحاً دون اتصال.
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => {
          setGuest(false);
          navigate({ to: "/auth/login" });
        }}
        className="w-full h-11 rounded-2xl bg-primary text-primary-foreground text-sm font-bold"
      >
        تسجيل الدخول
      </button>
    </div>
  );
}

/** ما يحتاج حساباً وخادماً: شاشة لطيفة بدل خطأ. */
export function GuestLocked() {
  const navigate = useNavigate();
  return (
    <PhoneFrame>
      <div className="flex-1 flex flex-col">
        <div className="flex-1 flex flex-col items-center justify-center gap-5 px-8 text-center">
          <span className="w-16 h-16 rounded-3xl glass flex items-center justify-center">
            <Lock className="w-7 h-7 text-gold" aria-hidden="true" />
          </span>
          <div className="space-y-2">
            <h1 className="text-lg font-black text-foreground">هذه الميزة تحتاج حساباً</h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              الحلقات والمعلّم والتسميع والمحادثات تعمل بحسابك وتتزامن مع الخادم. المصحف والاختبارات
              ومحاسبتي متاحة لك الآن دون حساب.
            </p>
          </div>
          <div className="w-full space-y-2">
            <button
              type="button"
              onClick={() => {
                setGuest(false);
                navigate({ to: "/auth/login" });
              }}
              className="w-full h-12 rounded-2xl bg-primary text-primary-foreground text-sm font-bold"
            >
              تسجيل الدخول
            </button>
            <Link
              to="/today"
              className="w-full h-12 rounded-2xl glass text-sm font-bold text-foreground flex items-center justify-center"
            >
              العودة إلى الرئيسية
            </Link>
          </div>
        </div>
        <BottomNav />
      </div>
    </PhoneFrame>
  );
}
