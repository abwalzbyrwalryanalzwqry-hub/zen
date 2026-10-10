import { useMemo, useState } from "react";
import { Icon } from "@/components/zen/quran/shell";
import { icons } from "@/components/zen/quran/shell-icons";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { quranRepository, toArabicDigits, REVELATION_LABEL_AR } from "@/lib/quran";
import { searchSurahNames } from "@/lib/quran/search-service";
import { useT } from "@/lib/i18n";

const SURAH_LIST = quranRepository.listSurahs();
const JUZ_LIST_META = quranRepository.listJuz();

/**
 * اختيار السورة مع بحث مطبَّع (المرحلة 7.5). القائمة الموحَّدة في التطبيق: المصحف والسجل اليومي و«تسجيل
 * حفظ» — رقم السورة في بداية السطر، واسمها، وعدد آياتها في نهايته. minSurah يعطّل ما قبله (سورة النهاية).
 */
export function SurahPicker({
  open,
  onOpenChange,
  current,
  onPick,
  minSurah = 1,
  maxSurah = 114,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  current: number;
  onPick: (s: (typeof SURAH_LIST)[number]) => void;
  minSurah?: number;
  /** يعطّل ما بعده (سورة النهاية في المدى من الناس صعوداً). */
  maxSurah?: number;
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  const filteredSurahs = useMemo(() => {
    const q = query.trim();
    if (!q) return SURAH_LIST;
    // مطابقة مطبّعة: «الانعام» تجد «الأنعام»، و«٦» تجد السورة السادسة.
    const ids = new Set(searchSurahNames(q, 114).map((s) => s.id));
    return SURAH_LIST.filter((s) => ids.has(s.id));
  }, [query]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md rounded-3xl border-border/60 bg-card/95 p-0 backdrop-blur-2xl sm:rounded-3xl"
        dir="rtl"
      >
        <DialogHeader className="px-5 pt-5 text-right">
          <DialogTitle className="font-display text-xl">{t("surahPicker.title")}</DialogTitle>
          <p className="text-[0.6875rem] text-muted-foreground">{t("surahPicker.subtitle")}</p>
        </DialogHeader>

        <div className="px-4 pt-3">
          <div className="flex items-center gap-2 rounded-full border border-border/60 bg-background/70 px-3 py-2">
            <Icon d={icons.search} size={16} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("surahPicker.search")}
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              dir="rtl"
            />
          </div>
        </div>

        <div className="mt-3 max-h-[65vh] overflow-y-auto px-3 pb-4">
          <ul className="grid gap-1.5">
            {filteredSurahs.map((s) => {
              const active = s.id === current;
              const off = s.id < minSurah || s.id > maxSurah;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    disabled={off}
                    ref={active ? (el) => el?.scrollIntoView({ block: "center" }) : undefined}
                    aria-current={active ? "true" : undefined}
                    onClick={() => {
                      onPick(s);
                      setQuery("");
                    }}
                    className={`group flex w-full items-center gap-3 rounded-2xl border p-2.5 text-right transition active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none ${
                      active
                        ? "border-primary/50 bg-primary/10 shadow-soft"
                        : "border-border/50 bg-background/60 hover:border-border hover:shadow-soft"
                    }`}
                  >
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-[0.6875rem] font-medium tabular-nums ${
                        active
                          ? "border-primary/40 bg-primary text-primary-foreground"
                          : "border-gold/30 bg-gold/10 text-gold"
                      }`}
                    >
                      {toArabicDigits(s.id)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-display text-base font-medium">{s.nameAr}</div>
                      <div className="text-[0.625rem] text-muted-foreground">
                        {REVELATION_LABEL_AR[s.revelation]}
                      </div>
                    </div>
                    {active && (
                      <span className="text-primary">
                        <Icon d={icons.check} size={16} />
                      </span>
                    )}
                    <span
                      className={`flex min-w-12 shrink-0 flex-col items-center rounded-xl px-2 py-1 leading-tight ${
                        active ? "bg-primary/15 text-primary" : "bg-muted/60 text-foreground"
                      }`}
                      aria-label={t("surahPicker.ayahs", { n: s.ayatCount })}
                    >
                      <span className="text-sm font-bold tabular-nums">
                        {toArabicDigits(s.ayatCount)}
                      </span>
                      <span className="text-xs text-muted-foreground" aria-hidden="true">
                        {t("surahPicker.ayahUnit")}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
            {filteredSurahs.length === 0 && (
              <li className="py-10 text-center text-sm text-muted-foreground">
                {t("surahPicker.none")}
              </li>
            )}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** اختيار الجزء. */
export function JuzPicker({
  open,
  onOpenChange,
  current,
  onPick,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  current: number;
  onPick: (j: (typeof JUZ_LIST_META)[number]) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md rounded-3xl border-border/60 bg-card/95 p-0 backdrop-blur-2xl sm:rounded-3xl"
        dir="rtl"
      >
        <DialogHeader className="px-5 pt-5 text-right">
          <DialogTitle className="font-display text-xl">اختر الجزء</DialogTitle>
          <p className="text-[0.6875rem] text-muted-foreground">٣٠ جزءًا، القرآن الكريم</p>
        </DialogHeader>

        <div className="mt-3 max-h-[65vh] overflow-y-auto px-4 pb-5">
          <div className="grid grid-cols-3 gap-2">
            {JUZ_LIST_META.map((j) => {
              const active = j.id === current;
              const startSurah = SURAH_LIST[j.start.surah - 1];
              return (
                <button
                  key={j.id}
                  onClick={() => onPick(j)}
                  className={`flex flex-col items-center rounded-2xl border p-3 text-center transition active:scale-95 ${
                    active
                      ? "border-primary/50 bg-primary/10 shadow-soft"
                      : "border-border/50 bg-background/60 hover:-translate-y-0.5 hover:shadow-soft"
                  }`}
                >
                  <span className="text-[0.5625rem] uppercase tracking-[0.25em] text-muted-foreground">
                    الجزء
                  </span>
                  <span
                    className={`font-display text-2xl font-medium tabular-nums ${
                      active ? "text-primary" : "text-foreground"
                    }`}
                  >
                    {toArabicDigits(j.id)}
                  </span>
                  <span className="mt-1 line-clamp-1 text-[0.625rem] text-muted-foreground">
                    {startSurah.nameAr}، {toArabicDigits(j.start.ayah)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
