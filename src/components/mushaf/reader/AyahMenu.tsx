import { useState } from "react";
import { Icon } from "@/components/zen/quran/shell";
import { icons } from "@/components/zen/quran/shell-icons";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toArabicDigits } from "@/lib/quran";
import {
  BOOKMARK_TAGS,
  isBookmarked,
  toggleBookmark,
  updateBookmark,
  useBookmarks,
  type BookmarkTag,
} from "@/lib/quran/bookmarks";
import { isSajdah } from "@/lib/quran/page-math";
import { buildShareText, copyText } from "@/lib/quran/share-io";
import type { AyahText } from "@/lib/quran/text-types";
import { useT } from "@/lib/i18n";
import { toast } from "@/lib/toast";
import { Sep } from "@/components/mushaf/reader/Sep";
import { ensureMushafDict } from "@/lib/quran/mushaf-i18n";

// قاموس القارئ الكسول: يُضاف متزامناً قبل أول رسم.
void ensureMushafDict();

/**
 * قائمة أوامر الآية — من شاشة القارئ.
 * «نسخ» ينسخ إلى الحافظة فعلاً (كان يفتح مربع المشاركة)، و«علامة» بألوانها الخمسة،
 * و«ابدأ الحفظ من هنا» لوضع الاستظهار.
 */
export function AyahActionSheet({
  surah,
  surahNameAr,
  ayah,
  onClose,
  onPlay,
  onRepeat,
  onTafsir,
  onShare,
  onMemorize,
}: {
  surah: number;
  surahNameAr: string;
  ayah: AyahText | null;
  onClose: () => void;
  onPlay: (surah: number, ayah: number) => void;
  onRepeat: (surah: number, ayah: number) => void;
  onTafsir: (surah: number, ayah: number) => void;
  onShare: (surah: number, ayah: number) => void;
  onMemorize: (surah: number, ayah: number) => void;
}) {
  const t = useT();
  const { items } = useBookmarks(); // re-render when the bookmark set changes
  // «نُسخت» تخصّ الآية التي نُسخت فقط؛ فتح آية أخرى يعيدها دون أثر يصفّرها.
  const ayahKey = `${surah}:${ayah?.n ?? 0}`;
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const copied = copiedKey === ayahKey;
  const saved = ayah ? isBookmarked(surah, ayah.n) : false;
  const tag: BookmarkTag | undefined = ayah
    ? items.find((b) => b.surah === surah && b.ayah === ayah.n)?.tag
    : undefined;
  const sajdah = ayah ? isSajdah(surah, ayah.n) : false;

  const copy = async () => {
    if (!ayah) return;
    const ok = await copyText(
      buildShareText({ text: ayah.t, surahNameAr, ayahFrom: ayah.n, ayahTo: ayah.n }),
    );
    if (ok) {
      setCopiedKey(ayahKey);
      toast.success(t("mushafReader.sheet.copied"));
    } else {
      toast.error(t("mushafReader.sheet.copyFailed"));
    }
  };

  return (
    <Dialog open={!!ayah} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-md rounded-3xl border-border/60 bg-card/95 backdrop-blur-2xl sm:rounded-3xl"
        dir="rtl"
      >
        <DialogHeader className="text-right">
          <DialogTitle className="font-display text-lg">
            {t("mushafReader.sheet.title", {
              surah: surahNameAr,
              ayah: toArabicDigits(ayah?.n ?? 1),
            })}
          </DialogTitle>
        </DialogHeader>

        {ayah && (
          <>
            <p className="max-h-40 overflow-y-auto rounded-2xl border border-gold/20 bg-background/60 p-3 text-center font-quran text-[1.0625rem] leading-[2.1]">
              {ayah.t}
            </p>

            <div className="grid grid-cols-5 gap-2">
              <SheetAction
                icon={icons.bookmark}
                label={saved ? t("mushafReader.mark.marked") : t("mushafReader.mark.mark")}
                active={saved}
                onClick={() =>
                  toggleBookmark({
                    surah,
                    ayah: ayah.n,
                    page: ayah.p,
                    juz: ayah.j,
                    text: ayah.t,
                    tag: "tadabbur",
                  })
                }
              />
              <SheetAction
                icon={icons.info}
                label={t("mushafReader.bar.tafsir")}
                onClick={() => onTafsir(surah, ayah.n)}
              />
              <SheetAction
                icon={icons.share}
                label={t("mushafReader.sheet.share")}
                onClick={() => onShare(surah, ayah.n)}
              />
              <SheetAction
                icon={icons.play}
                label={t("mushafReader.bar.listen")}
                onClick={() => onPlay(surah, ayah.n)}
              />
              <SheetAction
                icon={icons.repeat}
                label={t("mushafReader.sheet.repeat")}
                onClick={() => onRepeat(surah, ayah.n)}
              />
            </div>

            {saved && (
              <div
                className="flex flex-wrap items-center justify-center gap-1.5"
                role="radiogroup"
                aria-label={t("mushafReader.mark.tagLabel")}
              >
                {BOOKMARK_TAGS.map((tg) => (
                  <button
                    key={tg.key}
                    type="button"
                    role="radio"
                    aria-checked={tag === tg.key}
                    onClick={() => updateBookmark(surah, ayah.n, { tag: tg.key })}
                    className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.625rem] font-medium transition active:scale-95 ${
                      tag === tg.key ? tg.chip : "border-border/60 bg-background/60"
                    }`}
                  >
                    <span className={`h-2 w-2 rounded-full ${tg.dot}`} />
                    {tg.label}
                  </button>
                ))}
              </div>
            )}

            <button
              onClick={() => void copy()}
              className="flex items-center justify-center gap-1.5 rounded-2xl border border-border/60 bg-background/70 py-2.5 text-[0.75rem] font-medium transition active:scale-[0.98]"
            >
              <Icon d={copied ? icons.check : icons.copy} size={14} />
              {copied ? t("mushafReader.sheet.copied") : t("mushafReader.sheet.copy")}
            </button>
            <button
              onClick={() => onMemorize(surah, ayah.n)}
              className="rounded-2xl gradient-primary py-2.5 text-[0.75rem] font-medium text-primary-foreground transition active:scale-[0.98]"
            >
              {t("mushafReader.sheet.memorize")}
            </button>

            <div className="flex items-center justify-center text-[0.625rem] text-muted-foreground tabular-nums">
              {t("mushafReader.meta.page", { n: toArabicDigits(ayah.p) })}
              <Sep />
              {t("mushafReader.meta.juz", { n: toArabicDigits(ayah.j) })}
              {sajdah && (
                <>
                  <Sep />
                  <span className="text-gold">{t("mushafReader.meta.sajdah")}</span>
                </>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function SheetAction({
  icon,
  label,
  onClick,
  active,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`flex flex-col items-center gap-1.5 rounded-2xl border p-3 transition active:scale-95 ${
        active
          ? "border-gold/50 bg-gold/15 text-gold"
          : "border-border/50 bg-background/60 text-foreground/85 hover:shadow-soft"
      }`}
    >
      <Icon d={icon} size={18} />
      <span className="text-[0.625rem] font-medium">{label}</span>
    </button>
  );
}
