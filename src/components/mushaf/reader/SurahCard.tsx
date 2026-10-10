import { Arabesque, Icon } from "@/components/zen/quran/shell";
import { icons } from "@/components/zen/quran/shell-icons";
import { quranRepository, toArabicDigits, REVELATION_LABEL_AR, formatRangeAr } from "@/lib/quran";
import { MAQASID_SOURCE, surahMaqasid } from "@/lib/quran/surah-maqasid";
import { Chip, MetaStat } from "@/components/mushaf/reader/widgets";

type SurahInfo = NonNullable<ReturnType<typeof quranRepository.getSurah>>;

/** «عن سورة …»: بطاقة السورة ومقاصدها، مطوية بعد النص (المرحلة 7.5). */
export function SurahAbout({ activeSurah }: { activeSurah: SurahInfo }) {
  const revelationLabel = REVELATION_LABEL_AR[activeSurah.revelation];
  const maqasid = surahMaqasid(activeSurah.id);
  return (
    <details className="group mt-5 px-4">
      <summary className="flex cursor-pointer list-none items-center justify-between rounded-2xl border border-border/60 bg-card/70 px-4 py-3 text-[0.8125rem] font-medium shadow-soft backdrop-blur-xl [&::-webkit-details-marker]:hidden">
        <span>عن سورة {activeSurah.nameAr}</span>
        <span className="text-muted-foreground transition group-open:rotate-180">
          <Icon d={icons.chevron} size={16} />
        </span>
      </summary>
      <div className="-mx-4">
        {/* بطاقة السورة: مطوية بعد النص */}
        <section
          key={`meta-${activeSurah.id}`}
          className="mt-5 px-4 animate-fade-up"
          aria-label="بطاقة السورة"
        >
          <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-card/70 p-5 shadow-elegant backdrop-blur-2xl">
            <Arabesque className="pointer-events-none absolute -top-16 -left-16 h-48 w-48 text-primary/10" />
            <Arabesque className="pointer-events-none absolute -bottom-16 -right-16 h-48 w-48 text-gold/15" />

            <div className="relative flex items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-soft">
                <Icon d={icons.quran} size={22} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[0.625rem] uppercase tracking-[0.3em] text-muted-foreground">
                  {activeSurah.nameEn}، {activeSurah.meaningEn}
                </div>
                <h2 className="mt-0.5 font-display text-2xl font-medium leading-snug">
                  سورة {activeSurah.nameAr}
                </h2>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Chip
                    tone={activeSurah.revelation === "makki" ? "gold" : "primary"}
                    label={revelationLabel}
                  />
                  <Chip label={`ترتيبها ${toArabicDigits(activeSurah.id)}`} />
                  <Chip label={`نزولها ${toArabicDigits(activeSurah.revelationOrder)}`} />
                </div>
              </div>
            </div>

            <div className="relative mt-5 grid grid-cols-2 gap-2.5">
              <MetaStat label="عدد الآيات" value={toArabicDigits(activeSurah.ayatCount)} />
              <MetaStat
                label="الجزء"
                value={formatRangeAr(activeSurah.juz.start, activeSurah.juz.end)}
              />
              <MetaStat
                label="الحزب"
                value={formatRangeAr(activeSurah.hizb.start, activeSurah.hizb.end)}
              />
              <MetaStat
                label="الصفحات"
                value={formatRangeAr(activeSurah.pages.start, activeSurah.pages.end)}
              />
              <MetaStat label="تبدأ في صفحة" value={toArabicDigits(activeSurah.pages.start)} />
              <MetaStat label="تنتهي في صفحة" value={toArabicDigits(activeSurah.pages.end)} />
            </div>

            {maqasid && (
              <div className="relative mt-4 rounded-2xl border border-border/40 bg-background/50 p-3.5">
                <div className="text-[0.625rem] font-medium uppercase tracking-[0.25em] text-gold">
                  من مقاصد السورة
                </div>
                <p className="mt-1 text-[0.8125rem] leading-relaxed text-foreground/85">
                  {maqasid}
                </p>
                <a
                  href={MAQASID_SOURCE.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1.5 block text-[0.625rem] text-muted-foreground underline decoration-dotted"
                >
                  {MAQASID_SOURCE.nameAr} — {MAQASID_SOURCE.authorAr}
                </a>
              </div>
            )}
          </div>
        </section>
      </div>
    </details>
  );
}
