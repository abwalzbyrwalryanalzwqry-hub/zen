import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Arabesque,
  EmptyState,
  Icon,
  RingProgress,
  Screen,
  ScreenHeader,
  SectionLabel,
} from "@/components/zen/quran/shell";
import { icons } from "@/components/zen/quran/shell-icons";
import { toArabicDigits, useReadingHistory, type ReadEntry } from "@/lib/quran";
import { SURAH_META } from "@/lib/quran/metadata";
import { RelativeTime } from "@/components/mushaf/reader/widgets";

export const Route = createFileRoute("/_authed/mushaf/last-read")({
  /* الأوقات والأيام تُنسَّق بتوقيت الجهاز، والخادم لا يعرف منطقة المستخدم
   * الزمنية، فرسمها على الخادم يعطي نصاً مختلفاً ويكسر الـHydration. */
  ssr: false,
  head: () => ({
    meta: [
      { title: "آخر قراءة — Zen" },
      {
        name: "description",
        content: "تابع من حيث توقفت، مع سلسلة أيام القراءة وتقدّمك في الختمة.",
      },
    ],
  }),
  component: LastReadScreen,
});

function LastReadScreen() {
  const { entries, last, streak, week, sessionsToday, progress, pagesRead, clear, remove } =
    useReadingHistory();

  const percent = Math.round(progress * 100);
  const maxWeek = Math.max(1, ...week.map((d) => d.count));

  return (
    <Screen>
      <ScreenHeader
        title="آخر قراءة"
        subtitle="تابع وِردك من حيث توقفت"
        backTo="/mushaf"
        action={
          entries.length ? (
            <button
              onClick={() => {
                if (window.confirm("تفريغ سجل القراءة كاملاً؟ لا يمكن التراجع.")) clear();
              }}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-soft"
              aria-label="تفريغ السجل"
            >
              <Icon d={icons.trash} size={17} />
            </button>
          ) : undefined
        }
      />

      {/* Resume card */}
      <div className="px-5 animate-fade-up">
        {last ? (
          <div className="gradient-night relative overflow-hidden rounded-[32px] p-6 text-white shadow-elegant">
            <Arabesque className="pointer-events-none absolute -left-14 -bottom-14 h-64 w-64 text-gold/25" />
            <div className="relative flex items-start justify-between">
              <div className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[0.625rem] uppercase tracking-[0.3em] backdrop-blur">
                تابع القراءة
              </div>
              <span className="text-[0.625rem] text-white/75">
                <RelativeTime at={last.at} />
              </span>
            </div>

            <div className="relative mt-5">
              <div className="font-display text-3xl font-medium leading-snug">
                سورة {SURAH_META[last.surah - 1].nameAr}
              </div>
              <p className="mt-1.5 text-xs font-light text-white/70 tabular-nums">
                الآية {toArabicDigits(last.ayah)}، صفحة {toArabicDigits(last.page)}، الجزء{" "}
                {toArabicDigits(last.juz)}
              </p>
            </div>

            <Link
              to="/mushaf/read"
              search={
                last.mode === "mushaf"
                  ? { page: last.page, mode: "mushaf" }
                  : { surah: last.surah, ayah: last.ayah, mode: "surah" }
              }
              className="relative mt-6 flex items-center justify-center gap-2 rounded-2xl bg-white/15 py-3 text-[0.8125rem] font-medium backdrop-blur transition active:scale-[0.98]"
            >
              <Icon d={icons.quran} size={16} />
              متابعة من هنا
            </Link>
          </div>
        ) : (
          <div className="rounded-[32px] border border-border/60 bg-card/70 p-6 text-center shadow-soft backdrop-blur-xl">
            <p className="font-display text-lg">لم تبدأ القراءة بعد</p>
            <p className="mt-1.5 text-[0.7188rem] leading-relaxed text-muted-foreground">
              افتح المصحف وسيتذكّر زِن موضعك تلقائيًا.
            </p>
            <Link
              to="/mushaf/read"
              search={{ surah: 1, mode: "surah" }}
              className="gradient-primary mt-4 inline-flex items-center gap-2 rounded-2xl px-5 py-2.5 text-[0.7812rem] font-medium text-primary-foreground shadow-glow"
            >
              <Icon d={icons.quran} size={15} />
              ابدأ من الفاتحة
            </Link>
          </div>
        )}
      </div>

      {/* Stats */}
      <SectionLabel hint={`${toArabicDigits(sessionsToday)} جلسة اليوم`}>تقدّمك</SectionLabel>

      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-4 px-5">
        <div className="rounded-3xl border border-border/60 bg-card/70 p-3 shadow-soft backdrop-blur-xl">
          <RingProgress value={progress} size={104} stroke={8} trackColor="rgba(148,163,184,0.2)">
            <div className="text-center">
              <div className="font-display text-xl font-medium tabular-nums">
                {toArabicDigits(percent)}٪
              </div>
              <div className="text-[0.5625rem] text-muted-foreground">الختمة</div>
            </div>
          </RingProgress>
        </div>

        <div className="grid gap-2.5">
          <StatBox
            icon={icons.flame}
            label="سلسلة القراءة"
            value={`${toArabicDigits(streak)} يوم`}
          />
          <StatBox
            icon={icons.target}
            label="الصفحات المقروءة"
            value={`${toArabicDigits(pagesRead)} من ٦٠٤`}
          />
        </div>
      </div>

      {/* 7-day chart */}
      <SectionLabel hint="آخر ٧ أيام">نشاطك الأسبوعي</SectionLabel>
      <div className="px-5">
        <div className="rounded-3xl border border-border/60 bg-card/70 p-4 shadow-soft backdrop-blur-xl">
          <div className="flex h-28 items-end justify-between gap-2">
            {week.map((d) => (
              <div key={d.key} className="flex flex-1 flex-col items-center gap-2">
                <div className="flex h-20 w-full items-end">
                  <div
                    className={`w-full rounded-t-lg transition-all duration-500 ${
                      d.count ? "gradient-gold" : "bg-muted"
                    }`}
                    style={{ height: `${Math.max(6, (d.count / maxWeek) * 100)}%` }}
                    title={`${d.count}`}
                  />
                </div>
                <span className="text-[0.5625rem] text-muted-foreground">{d.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* History list */}
      <SectionLabel hint={`${toArabicDigits(entries.length)} موضع`}>سجل القراءة</SectionLabel>
      <div className="space-y-2.5 px-5">
        {entries.map((e) => (
          <HistoryRow key={e.at} entry={e} onRemove={() => remove(e.at)} />
        ))}
        {!entries.length && (
          <EmptyState
            icon={icons.book}
            title="السجل فارغ"
            hint="يُسجّل زِن كل موضع تقرأ فيه تلقائيًا."
          />
        )}
      </div>
    </Screen>
  );
}

function StatBox({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card/70 p-3 shadow-soft backdrop-blur-xl">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gold/15 text-gold">
        <Icon d={icon} size={16} />
      </span>
      <div className="min-w-0">
        <div className="text-[0.625rem] uppercase tracking-[0.2em] text-muted-foreground">
          {label}
        </div>
        <div className="mt-0.5 font-display text-base font-medium tabular-nums">{value}</div>
      </div>
    </div>
  );
}

function HistoryRow({ entry, onRemove }: { entry: ReadEntry; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card/70 p-3 shadow-soft backdrop-blur-xl">
      <Link
        to="/mushaf/read"
        search={
          entry.mode === "mushaf"
            ? { page: entry.page, mode: "mushaf" }
            : { surah: entry.surah, ayah: entry.ayah, mode: "surah" }
        }
        className="min-w-0 flex-1 text-right"
      >
        <div className="truncate text-[0.8125rem] font-medium">
          سورة {SURAH_META[entry.surah - 1].nameAr}
          <span className="mx-1.5 text-muted-foreground">،</span>
          <span className="text-muted-foreground tabular-nums">
            آية {toArabicDigits(entry.ayah)}
          </span>
        </div>
        <div className="mt-0.5 text-[0.625rem] text-muted-foreground tabular-nums">
          صفحة {toArabicDigits(entry.page)}، الجزء {toArabicDigits(entry.juz)}،{" "}
          <RelativeTime at={entry.at} />
        </div>
      </Link>
      <button
        onClick={onRemove}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border/60 bg-background/70 text-muted-foreground"
        aria-label="حذف من السجل"
      >
        <Icon d={icons.close} size={14} />
      </button>
    </div>
  );
}
