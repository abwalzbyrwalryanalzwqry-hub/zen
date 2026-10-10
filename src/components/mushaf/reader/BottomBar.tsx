import { icons } from "@/components/zen/quran/shell-icons";
import { toArabicDigits } from "@/lib/quran";
import { isBookmarked, toggleBookmark } from "@/lib/quran/bookmarks";
import { SURAH_META } from "@/lib/quran/metadata";
import type { AyahText } from "@/lib/quran/text-types";
import { useT } from "@/lib/i18n";
import { ReaderAction, ToolCard } from "@/components/mushaf/reader/widgets";
import { ensureMushafDict } from "@/lib/quran/mushaf-i18n";

// قاموس القارئ الكسول: يُضاف متزامناً قبل أول رسم.
void ensureMushafDict();

/**
 * شريط الأدوات الثابت أسفل وضع السورة وبطاقات الأدوات.
 * التفسير والبحث يعملان على الموضع الحالي (كانا يفتحان الفاتحة دائماً)، و«علامة» تضع
 * علامة على الآية الظاهرة — اسمها لا يلتبس بـ«الحفظ» (الاستظهار).
 */
export function ReaderBottomBar({
  surahId,
  here,
  playing,
  hasTrack,
  onAudio,
  onTafsir,
}: {
  surahId: number;
  here: AyahText | null;
  playing: boolean;
  hasTrack: boolean;
  onAudio: () => void;
  /** يفتح التفسير داخل القارئ على الآية الظاهرة. */
  onTafsir?: (surah: number, ayah: number) => void;
}) {
  const t = useT();
  const savedHere = here ? isBookmarked(surahId, here.n) : false;
  const surahName = SURAH_META[surahId - 1]?.nameAr ?? "";
  const ayahNo = toArabicDigits(here?.n ?? 1);
  return (
    <>
      {/* شريط الأدوات ثابت أسفل الشاشة: في المتناول أينما كان القارئ في السورة */}
      <div className="fixed inset-x-0 bottom-3 z-30 mx-auto max-w-md px-4">
        <div className="glass-strong grid grid-cols-5 gap-1 rounded-3xl p-1.5">
          <ReaderAction
            icon={icons.history}
            label={t("mushafReader.bar.lastRead")}
            to="/mushaf/last-read"
          />
          {onTafsir ? (
            <ReaderAction
              icon={icons.info}
              label={t("mushafReader.bar.tafsir")}
              ariaLabel={t("mushafReader.bar.tafsirAria", { surah: surahName, ayah: ayahNo })}
              onClick={() => onTafsir(surahId, here?.n ?? 1)}
            />
          ) : (
            <ReaderAction
              icon={icons.info}
              label={t("mushafReader.bar.tafsir")}
              to="/mushaf/tafsir"
              search={{ surah: surahId, ayah: here?.n ?? 1 }}
              ariaLabel={t("mushafReader.bar.tafsirAria", { surah: surahName, ayah: ayahNo })}
            />
          )}
          <ReaderAction
            icon={playing ? icons.pause : icons.play}
            label={playing ? t("mushafReader.bar.pause") : t("mushafReader.bar.listen")}
            active={hasTrack}
            ariaLabel={
              playing
                ? t("mushafReader.audio.pause")
                : hasTrack
                  ? t("mushafReader.audio.resume")
                  : t("mushafReader.audio.fromAyah", { ayah: ayahNo })
            }
            onClick={onAudio}
          />
          <ReaderAction
            icon={icons.search}
            label={t("mushafReader.bar.search")}
            to="/mushaf/search"
            search={{ scope: "surah", surah: surahId }}
            ariaLabel={t("mushafReader.bar.searchAria", { surah: surahName })}
          />
          <ReaderAction
            icon={icons.bookmark}
            label={savedHere ? t("mushafReader.mark.marked") : t("mushafReader.mark.mark")}
            active={savedHere}
            disabled={!here}
            ariaLabel={
              here
                ? savedHere
                  ? t("mushafReader.mark.removeAria", { surah: surahName, ayah: ayahNo })
                  : t("mushafReader.mark.addAria", { surah: surahName, ayah: ayahNo })
                : t("mushafReader.mark.visible")
            }
            onClick={() => {
              if (!here) return;
              toggleBookmark({
                surah: surahId,
                ayah: here.n,
                page: here.p,
                juz: here.j,
                text: here.t,
                tag: "tadabbur",
              });
            }}
          />
        </div>
      </div>

      {/* Secondary tools */}
      <div className="mt-4 grid grid-cols-2 gap-3 px-4 stagger">
        <ToolCard
          iconKey="settings"
          title={t("mushafReader.tools.settings")}
          hint={t("mushafReader.tools.settingsHint")}
          to="/mushaf/reader-settings"
        />
        <ToolCard
          iconKey="bookmark"
          title={t("mushafReader.tools.bookmarks")}
          hint={t("mushafReader.tools.bookmarksHint")}
          to="/mushaf/bookmarks"
        />
      </div>

      <p className="mt-6 px-6 text-center text-[0.6875rem] leading-relaxed text-muted-foreground">
        {t("mushafReader.tools.hint")}
      </p>
    </>
  );
}
