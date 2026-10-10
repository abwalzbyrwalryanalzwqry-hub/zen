import { createFileRoute, Link } from "@tanstack/react-router";
import { track } from "@/lib/usage";
import { useEffect } from "react";
import { Arabesque, Icon, Screen, ScreenHeader, SectionLabel } from "@/components/zen/quran/shell";
import { icons } from "@/components/zen/quran/shell-icons";
import { toArabicDigits, useBookmarks, useReadingHistory } from "@/lib/quran";
import { SURAH_META } from "@/lib/quran/metadata";
import { useKhatmah } from "@/lib/quran/khatmah-plan";
import { useSession } from "@/hooks/useSession";
import { RelativeTime } from "@/components/mushaf/reader/widgets";

export const Route = createFileRoute("/_authed/mushaf/")({
  head: () => ({
    meta: [
      { title: "القرآن الكريم — Zen" },
      {
        name: "description",
        content: "المصحف، التلاوات، التفسير، العلامات والبحث في القرآن الكريم.",
      },
    ],
  }),
  component: QuranHub,
});

type Card = {
  to: string;
  title: string;
  hint: string;
  iconKey: keyof typeof icons;
  accent: "primary" | "gold" | "night";
};

const CARDS: Card[] = [
  {
    to: "/mushaf/read",
    title: "المصحف",
    hint: "١١٤ سورة بخط عثماني",
    iconKey: "quran",
    accent: "primary",
  },
  {
    to: "/mushaf/recitations",
    title: "التلاوات",
    hint: "١٨ قارئًا، آية آية",
    iconKey: "play",
    accent: "gold",
  },
  {
    to: "/mushaf/tafsir",
    title: "التفسير",
    hint: "الميسّر والمختصر",
    iconKey: "info",
    accent: "night",
  },
  {
    to: "/mushaf/bookmarks",
    title: "العلامات",
    hint: "آياتك وملاحظاتك",
    iconKey: "bookmark",
    accent: "gold",
  },
  {
    to: "/mushaf/search",
    title: "البحث",
    hint: "في ٦٢٣٦ آية",
    iconKey: "search",
    accent: "primary",
  },
  {
    to: "/mushaf/share",
    title: "مشاركة آية",
    hint: "بطاقات فاخرة",
    iconKey: "share",
    accent: "night",
  },
];

function QuranHub() {
  const { guest } = useSession();
  useEffect(() => track("mushaf_open"), []);
  const { last, streak, progress } = useReadingHistory();
  const { items: bookmarks } = useBookmarks();
  const khatmah = useKhatmah();
  const percent = Math.round(progress * 100);
  const k = khatmah.status;
  const khatmahHint = !k
    ? "حدّد مدة ختمتك ويوزّع زِن الصفحات على الأيام."
    : k.phase === "finished"
      ? "تمّت ختمتك — ابدأ ختمة جديدة."
      : k.portion
        ? `ورد اليوم: الصفحات ${toArabicDigits(k.portion.from.page)} إلى ${toArabicDigits(k.portion.to.page)}`
        : "أتممت ورد اليوم — نلتقي غداً.";

  return (
    <Screen>
      <ScreenHeader title="المصحف" subtitle="١١٤ سورة، ٣٠ جزءًا، ٦٢٣٦ آية" />

      {/* Hero — resume reading */}
      <div className="px-5 animate-fade-up">
        <div className="gradient-night relative overflow-hidden rounded-[32px] p-6 text-white shadow-elegant">
          <Arabesque className="pointer-events-none absolute -left-14 -bottom-14 h-64 w-64 text-gold/25" />
          <Arabesque className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 text-white/10" />
          <div className="grain-overlay absolute inset-0" />

          <div className="relative flex items-center justify-between">
            <div className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[0.625rem] uppercase tracking-[0.3em] backdrop-blur">
              كتاب الله
            </div>
            {streak > 0 && (
              <span className="flex items-center gap-1 text-[0.625rem] text-white/70">
                <Icon d={icons.flame} size={12} />
                {toArabicDigits(streak)} يوم متتابع
              </span>
            )}
          </div>

          <div className="relative mt-6">
            {last ? (
              <>
                <div className="text-[0.625rem] uppercase tracking-[0.25em] text-white/75">
                  تابع من حيث توقفت
                </div>
                <div className="mt-1 font-display text-3xl font-medium leading-snug">
                  سورة {SURAH_META[last.surah - 1].nameAr}
                </div>
                <p className="mt-1.5 text-xs font-light text-white/70 tabular-nums">
                  الآية {toArabicDigits(last.ayah)}، صفحة {toArabicDigits(last.page)}،{" "}
                  <RelativeTime at={last.at} />
                </p>
              </>
            ) : (
              <>
                <div className="font-display text-3xl font-medium leading-snug">
                  اقرأ. تدبّر. ارتقِ.
                </div>
                <p className="mt-2 max-w-[16rem] text-xs font-light leading-relaxed text-white/70">
                  مساحتك القرآنية داخل زِن — مصحف كامل وتفسير بدون إنترنت، وتلاوات قابلة للتنزيل.
                </p>
              </>
            )}
          </div>

          <Link
            to="/mushaf/read"
            search={
              // الاستئناف بالوضع الذي كان يقرأ به: صفحة المصحف أو آية السورة.
              last?.mode === "mushaf"
                ? { page: last.page, mode: "mushaf" as const }
                : last
                  ? { surah: last.surah, ayah: last.ayah, mode: "surah" as const }
                  : { surah: 1, mode: "surah" as const }
            }
            className="relative mt-5 flex items-center justify-center gap-2 rounded-2xl bg-white/15 py-3 text-[0.8125rem] font-medium backdrop-blur transition active:scale-[0.98]"
          >
            <Icon d={icons.quran} size={16} />
            {last ? "متابعة القراءة" : "ابدأ من الفاتحة"}
          </Link>

          <div className="relative mt-5 flex items-center gap-3">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
              <div
                className="gradient-gold h-full transition-all duration-700"
                style={{ width: `${Math.max(2, percent)}%` }}
              />
            </div>
            <span className="text-[0.625rem] tabular-nums text-white/70">
              {toArabicDigits(percent)}٪ من المصحف
            </span>
          </div>
        </div>
      </div>

      {/* Live stats */}
      <div className="mt-4 grid grid-cols-3 gap-2.5 px-5">
        <StatPill
          label="العلامات"
          value={toArabicDigits(bookmarks.length)}
          to="/mushaf/bookmarks"
        />
        <StatPill label="سلسلة الأيام" value={toArabicDigits(streak)} to="/mushaf/last-read" />
        <StatPill
          label="الختمة"
          value={`${toArabicDigits(k ? Math.round(k.progress * 100) : percent)}٪`}
          to="/mushaf/khatmah"
        />
      </div>

      <SectionLabel hint="٦ أقسام">أقسام القرآن</SectionLabel>

      <div className="grid grid-cols-2 gap-3 px-5 stagger">
        {CARDS.map((c) => (
          <QuranCard key={c.to} {...c} />
        ))}
      </div>

      <div className="mt-8 space-y-3 px-5">
        <Link
          to="/mushaf/khatmah"
          className="glass flex items-center gap-3 rounded-2xl border border-border/60 p-4 text-right"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Icon d={icons.target} size={18} />
          </span>
          <div className="flex-1">
            <div className="text-sm font-medium">
              {k ? `الختمة المخطّطة — اليوم ${toArabicDigits(k.day)}` : "الختمة المخطّطة"}
            </div>
            <p className="mt-0.5 text-[0.6875rem] leading-relaxed text-muted-foreground tabular-nums">
              {khatmahHint}
            </p>
          </div>
          <span className="rotate-180 text-muted-foreground">
            <Icon d={icons.chevron} size={14} />
          </span>
        </Link>
        <Link
          to="/mushaf/last-read"
          className="glass flex items-center gap-3 rounded-2xl border border-border/60 p-4 text-right"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gold/15 text-gold">
            <Icon d={icons.sparkle} size={18} />
          </span>
          <div className="flex-1">
            <div className="text-sm font-medium">وِردك اليومي</div>
            <p className="mt-0.5 text-[0.6875rem] leading-relaxed text-muted-foreground">
              تابع سلسلة أيامك وتقدّمك في الختمة.
            </p>
          </div>
          <span className="rotate-180 text-muted-foreground">
            <Icon d={icons.chevron} size={14} />
          </span>
        </Link>
        {!guest && (
          <HubLink
            to="/mushaf/records"
            iconKey="book"
            tone="primary"
            title="سجل الحفظ والمراجعة"
            hint="تسجيل المعلّم لحفظ كل صفحة ومراجعتها وتقييمها."
          />
        )}
        <HubLink
          to="/mushaf/reader-settings"
          iconKey="settings"
          tone="gold"
          title="إعدادات القراءة"
          hint="الخط والحجم والتباعد ولون الورق."
        />
        <HubLink
          to="/mushaf/sources"
          iconKey="info"
          tone="primary"
          title="المصادر والتراخيص"
          hint="نص القرآن والتفسير والتلاوات."
        />
      </div>
    </Screen>
  );
}

function HubLink({
  to,
  iconKey,
  tone,
  title,
  hint,
}: {
  to: string;
  iconKey: keyof typeof icons;
  tone: "primary" | "gold";
  title: string;
  hint: string;
}) {
  return (
    <Link to={to} className="glass flex items-center gap-3 rounded-2xl p-4 text-right">
      <span
        className={`flex h-10 w-10 items-center justify-center rounded-full ${
          tone === "gold" ? "bg-gold/15 text-gold" : "bg-primary/15 text-primary"
        }`}
      >
        <Icon d={icons[iconKey]} size={18} />
      </span>
      <div className="flex-1">
        <div className="text-sm font-medium">{title}</div>
        <p className="mt-0.5 text-[0.6875rem] leading-relaxed text-muted-foreground">{hint}</p>
      </div>
      <span className="rotate-180 text-muted-foreground">
        <Icon d={icons.chevron} size={14} />
      </span>
    </Link>
  );
}

function StatPill({ label, value, to }: { label: string; value: string; to: string }) {
  return (
    <Link
      to={to}
      className="rounded-2xl border border-border/60 bg-card/70 p-3 text-center shadow-soft backdrop-blur-xl transition hover:-translate-y-0.5"
    >
      <div className="font-display text-xl font-medium tabular-nums">{value}</div>
      <div className="mt-0.5 text-[0.625rem] text-muted-foreground">{label}</div>
    </Link>
  );
}

function QuranCard({ to, title, hint, iconKey, accent }: Card) {
  const accentClasses: Record<Card["accent"], string> = {
    primary: "from-primary/15 to-primary/0 text-primary",
    gold: "from-gold/20 to-gold/0 text-gold",
    night: "from-foreground/10 to-foreground/0 text-foreground",
  };
  return (
    <Link
      to={to}
      className="group relative flex h-36 flex-col justify-between overflow-hidden rounded-3xl border border-border/60 bg-card/70 p-4 text-right shadow-soft backdrop-blur-xl transition hover:-translate-y-0.5 hover:shadow-elegant"
    >
      <Arabesque className="pointer-events-none absolute -bottom-8 -left-8 h-32 w-32 text-primary/10 opacity-70" />
      <div
        className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${accentClasses[accent]}`}
      />

      <div className="relative flex items-start justify-between">
        <span
          className={`flex h-11 w-11 items-center justify-center rounded-2xl border border-border/60 bg-background/70 shadow-soft ${
            accent === "gold"
              ? "text-gold"
              : accent === "primary"
                ? "text-primary"
                : "text-foreground"
          }`}
        >
          <Icon d={icons[iconKey]} size={20} />
        </span>
        <span className="rotate-180 text-muted-foreground opacity-0 transition group-hover:opacity-100">
          <Icon d={icons.chevron} size={14} />
        </span>
      </div>

      <div className="relative">
        <div className="font-display text-lg font-medium leading-tight">{title}</div>
        <p className="mt-1 text-[0.6875rem] leading-relaxed text-muted-foreground">{hint}</p>
      </div>
    </Link>
  );
}
