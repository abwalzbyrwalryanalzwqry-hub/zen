import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useKeepAwake } from "@/hooks/quran/use-keep-awake";
import { useImmersive } from "@/hooks/quran/use-immersive";
import { useRecitationPlayer } from "@/hooks/quran/recitation-host";
import { RecitationBar } from "@/components/zen/quran/recitation-bar";
import { paperClass, useReadingPrefs } from "@/lib/quran/reading-prefs";
import { clampPage, surahIdsOnPage } from "@/lib/quran/page-service";
import { Arabesque, Icon } from "@/components/zen/quran/shell";
import { icons } from "@/components/zen/quran/shell-icons";
import { PhoneFrame } from "@/components/zen/PhoneFrame";
import { useSession } from "@/hooks/useSession";
import { quranRepository } from "@/lib/quran";
import { useReaderState } from "@/lib/quran/reader-state";
import { useBookmarks } from "@/lib/quran/bookmarks";
import { pageStart } from "@/lib/quran/reading-tracker";
import { SURAH_META } from "@/lib/quran/metadata";
import type { AyahText } from "@/lib/quran/text-types";
import { ReaderToolbar, SurahProgress } from "@/components/mushaf/reader/Toolbar";
import { SurahAbout } from "@/components/mushaf/reader/SurahCard";
import { ReaderBottomBar } from "@/components/mushaf/reader/BottomBar";
import { SurahPicker, JuzPicker } from "@/components/mushaf/reader/Pickers";
import { RangeDialog } from "@/components/mushaf/reader/RangeDialog";
import { AyahActionSheet } from "@/components/mushaf/reader/AyahMenu";
import { MushafReadingArea } from "@/components/mushaf/reader/ReadingArea";
import { MushafPagesMode } from "@/components/mushaf/reader/PagesMode";
import { TafsirSheet } from "@/components/mushaf/reader/TafsirSheet";
import { useT } from "@/lib/i18n";
import {
  useFollowPlayback,
  useReaderDeepLink,
  useRestoreAyahOnImmersive,
} from "@/hooks/mushaf/use-reader";
import { useMushafDict } from "@/lib/quran/mushaf-i18n";

/** روابط مباشرة: /mushaf/read?surah=2&ayah=255 أو ?page=300&mode=mushaf */
export const Route = createFileRoute("/_authed/mushaf/read")({
  head: () => ({ meta: [{ title: "المصحف — Zen" }] }),
  validateSearch: (
    search: Record<string, unknown>,
  ): { surah?: number; ayah?: number; page?: number; mode?: "surah" | "mushaf" } => {
    const num = (v: unknown) => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
    };
    const mode =
      search.mode === "mushaf" ? "mushaf" : search.mode === "surah" ? "surah" : undefined;
    return {
      surah: num(search.surah),
      ayah: num(search.ayah),
      page: num(search.page),
      mode,
    };
  },
  component: MushafReader,
});

function MushafReader() {
  useMushafDict();
  const t = useT();
  const navigate = useNavigate();
  const params = Route.useSearch();
  const { guest } = useSession();
  const [state, update] = useReaderState();
  const [targetAyah, setTargetAyah] = useState<number | null>(params.ayah ?? null);
  const [sheet, setSheet] = useState<{ surah: number; ayah: AyahText } | null>(null);
  /** الآية الظاهرة الآن في وضع السورة (تتبع التمرير). */
  const [position, setPosition] = useState<{ surah: number; ayah: AyahText } | null>(null);
  useBookmarks(); // يعيد العرض عند تغيّر العلامات (زر الحفظ)
  const { prefs: readingPrefs, update: updatePrefs } = useReadingPrefs();
  useKeepAwake(readingPrefs.keepAwake);
  const {
    immersive,
    enter: enterImmersive,
    exit: exitImmersive,
    toggle: toggleImmersive,
  } = useImmersive();
  const player = useRecitationPlayer();
  const [tafsirFor, setTafsirFor] = useState<{ surah: number; ayah: number } | null>(null);
  /** آية مستهدفة في وضع المصحف (من «الانتقال إلى»): تُميَّز لحظات ثم يخبو تمييزها. */
  const [pageTarget, setPageTarget] = useState<string | null>(null);
  useEffect(() => {
    if (!pageTarget) return;
    const id = window.setTimeout(() => setPageTarget(null), 2600);
    return () => window.clearTimeout(id);
  }, [pageTarget]);
  const [rangeFor, setRangeFor] = useState<{ surah: number; from: number } | null>(null);

  useReaderDeepLink(params, update, setTargetAyah);
  const [surahOpen, setSurahOpen] = useState(false);
  const [juzOpen, setJuzOpen] = useState(false);

  // Default to Al-Fatihah if no valid selection.
  useEffect(() => {
    if (!state.surah || state.surah < 1 || state.surah > 114) {
      update({ surah: 1 });
    }
  }, [state.surah, update]);

  const activeSurah = quranRepository.getSurah(state.surah) ?? quranRepository.getSurah(1)!;
  const activeJuz = quranRepository.getJuz(state.juz) ?? quranRepository.getJuz(1)!;

  // In Mushaf mode the header follows the page being read, like a printed Mushaf.
  const headerSurah = useMemo(() => {
    if (state.mode !== "mushaf") return activeSurah;
    const p = state.page ?? 1;
    // أول سورة في الصفحة كترويسة المطبوع (كانت الأخيرة فاختلف الشريط عن ترويسة الصفحة).
    const ids = surahIdsOnPage(p);
    return quranRepository.getSurah(ids[0]) ?? activeSurah;
  }, [state.mode, state.page, activeSurah]);

  const isSurahMode = state.mode !== "mushaf";
  const pageNumber = clampPage(state.page || 1);
  // الموضع الحقيقي داخل السورة (لا رقم الجزء ÷ ٣٠).
  const here = position?.surah === activeSurah.id ? position.ayah : null;
  const hereAyah = here?.n ?? 1;
  const hereJuz = quranRepository.getJuz(here?.j ?? activeJuz.id) ?? activeJuz;
  const progressPercent = Math.round((hereAyah / activeSurah.ayatCount) * 100);

  /** تبديل الوضع مع الحفاظ على الموضع: الصفحة ↔ السورة والآية. */
  const switchMode = (m: "surah" | "mushaf") => {
    if (m === state.mode) return;
    if (m === "mushaf") {
      update({ mode: m, page: here?.p ?? activeSurah.pages.start });
    } else {
      const start = pageStart(pageNumber);
      update({ mode: m, surah: start.surah, ayah: start.ayah });
      setTargetAyah(start.ayah);
    }
  };

  useRestoreAyahOnImmersive(here?.n, immersive, isSurahMode);

  const onPosition = useCallback(
    (a: AyahText) => setPosition({ surah: activeSurah.id, ayah: a }),
    [activeSurah.id],
  );
  const onSettled = useCallback(
    (a: AyahText) => {
      update({ ayah: a.n, juz: a.j });
    },
    [update],
  );

  // ---- التلاوة داخل القارئ: القارئ يتبع الآية المتلوّة ----
  const track = player.track;
  const playingAyah = track && track.surah === activeSurah.id ? track.ayah : null;
  const playingKey = track ? `${track.surah}:${track.ayah}` : undefined;
  useFollowPlayback(track, { isSurahMode, page: pageNumber, surah: activeSurah.id }, update);

  /** زر «الصوت»: يتلو من الآية الظاهرة، أو يوقف/يستأنف التلاوة الجارية. */
  const onAudio = () => {
    if (track) player.toggle();
    else if (isSurahMode) player.play(activeSurah.id, here?.n ?? 1);
    else {
      const start = pageStart(pageNumber);
      player.play(start.surah, start.ayah);
    }
  };

  const paper = paperClass(readingPrefs.paper);
  // النوافذ المنبثقة (قائمة الآية، الانتقال، التفسير، التكرار) تُرسم خارج شجرة القارئ، فيُعطى
  // الجسم لون الورق ما دام القارئ مفتوحاً حتى لا تظهر بيضاء فوق الورق الليلي أو الأسود.
  useEffect(() => {
    if (!paper) return;
    document.body.classList.add(paper);
    return () => document.body.classList.remove(paper);
  }, [paper]);
  return (
    <PhoneFrame pattern={!paper}>
      <div
        dir="rtl"
        className={`zq-screen relative flex-1 flex flex-col text-foreground ${paper}`}
        data-immersive={immersive || undefined}
      >
        {/* خلفية زخرفية هادئة بروح زِن */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <Arabesque className="absolute -top-24 -right-24 h-[420px] w-[420px] text-primary/10" />
          <Arabesque className="absolute -bottom-24 -left-24 h-[420px] w-[420px] text-gold/15" />
        </div>

        <div
          data-quran-scroll
          className={`relative flex-1 overflow-y-auto overflow-x-hidden overscroll-contain ${
            track
              ? isSurahMode && !immersive
                ? "pb-44"
                : "pb-28"
              : isSurahMode && !immersive
                ? "pb-28"
                : "pb-10"
          }`}
        >
          <div className="mx-auto w-full max-w-md">
            {/* ملء الشاشة: زر خروج صغير فقط، والنص وحده */}
            {immersive && (
              <button
                onClick={exitImmersive}
                className={`fixed left-4 z-40 flex h-9 ${track ? "top-4" : "bottom-4"} items-center gap-1.5 rounded-full border border-border/60 bg-card/70 px-3 text-[0.6875rem] font-medium text-muted-foreground shadow-soft backdrop-blur-xl transition active:scale-95`}
                aria-label={t("mushafReader.immersive.exitAria")}
              >
                <Icon d={icons.exitFullscreen} size={14} />
                {t("mushafReader.immersive.exit")}
              </button>
            )}

            {!immersive && (
              <ReaderToolbar
                headerSurah={headerSurah}
                guest={guest}
                mode={state.mode === "mushaf" ? "mushaf" : "surah"}
                paper={readingPrefs.paper}
                recordsPage={isSurahMode ? (here?.p ?? activeSurah.pages.start) : pageNumber}
                onOpenSurah={() => setSurahOpen(true)}
                onEnterImmersive={enterImmersive}
                onPaper={(paper) => updatePrefs({ paper })}
                onSwitchMode={switchMode}
              />
            )}

            {isSurahMode && (
              <>
                {!immersive && (
                  <SurahProgress
                    surahNameAr={activeSurah.nameAr}
                    ayatCount={activeSurah.ayatCount}
                    juzId={hereJuz.id}
                    hereAyah={hereAyah}
                    herePage={here?.p ?? null}
                    updatedAt={state.updatedAt}
                    progressPercent={progressPercent}
                    onOpenSurah={() => setSurahOpen(true)}
                    onOpenJuz={() => setJuzOpen(true)}
                  />
                )}

                {/* Scrollable reading container — authentic Uthmani text */}
                <MushafReadingArea
                  surahId={activeSurah.id}
                  surahNameAr={activeSurah.nameAr}
                  activeAyah={targetAyah}
                  playingAyah={playingAyah}
                  onAyahTap={(a) => setSheet({ surah: activeSurah.id, ayah: a })}
                  onPosition={onPosition}
                  onSettled={onSettled}
                  immersive={immersive}
                />
                {!immersive && (
                  <SurahAbout activeSurah={activeSurah} key={`about-${activeSurah.id}`} />
                )}
              </>
            )}

            {!isSurahMode && (
              <MushafPagesMode
                page={pageNumber}
                onChange={(p) => update({ page: clampPage(p) })}
                onAyahTap={(surah, ayah) => setSheet({ surah, ayah })}
                onGoAyah={(surah, ayah) => setPageTarget(`${surah}:${ayah}`)}
                selectedKey={
                  sheet ? `${sheet.surah}:${sheet.ayah.n}` : (playingKey ?? pageTarget ?? undefined)
                }
                immersive={immersive}
                audioState={track ? player.status : "idle"}
                onAudio={onAudio}
                onToggleChrome={toggleImmersive}
              />
            )}
            {isSurahMode && !immersive && (
              <ReaderBottomBar
                surahId={activeSurah.id}
                here={here}
                playing={player.status === "playing"}
                hasTrack={Boolean(track)}
                onAudio={onAudio}
                onTafsir={(surah, ayah) => setTafsirFor({ surah, ayah })}
              />
            )}
          </div>
        </div>

        <SurahPicker
          open={surahOpen}
          onOpenChange={setSurahOpen}
          current={state.surah}
          onPick={(s) => {
            // في وضع المصحف ننتقل إلى صفحة بداية السورة.
            update(
              isSurahMode
                ? { surah: s.id, ayah: 1, juz: s.juz.start }
                : { surah: s.id, page: s.pages.start },
            );
            setTargetAyah(null);
            setSurahOpen(false);
          }}
        />
        <JuzPicker
          open={juzOpen}
          onOpenChange={setJuzOpen}
          current={hereJuz.id}
          onPick={(j) => {
            // ينقل فعلاً إلى بداية الجزء.
            update({ juz: j.id, surah: j.start.surah, ayah: j.start.ayah });
            setTargetAyah(j.start.ayah);
            setJuzOpen(false);
          }}
        />

        {/* -------- التلاوة داخل القارئ -------- */}
        {track && (
          <div
            className={`fixed inset-x-0 z-30 mx-auto max-w-md px-4 ${
              isSurahMode && !immersive ? "bottom-[4.6rem]" : "bottom-3"
            }`}
          >
            <RecitationBar
              variant="reader"
              onRange={() =>
                player.range
                  ? player.clearRange()
                  : setRangeFor({ surah: track.surah, from: track.ayah })
              }
            />
          </div>
        )}
        <RangeDialog
          target={rangeFor}
          onClose={() => setRangeFor(null)}
          onStart={(surah, from, to, times, extra) => {
            setRangeFor(null);
            player.playRange(surah, from, to, times, extra);
          }}
        />

        <TafsirSheet target={tafsirFor} onClose={() => setTafsirFor(null)} />

        {/* -------- Per-ayah actions -------- */}
        <AyahActionSheet
          surah={sheet?.surah ?? activeSurah.id}
          surahNameAr={SURAH_META[(sheet?.surah ?? activeSurah.id) - 1].nameAr}
          ayah={sheet?.ayah ?? null}
          onClose={() => setSheet(null)}
          onPlay={(surah, ayah) => {
            setSheet(null);
            player.play(surah, ayah);
          }}
          onRepeat={(surah, ayah) => {
            setSheet(null);
            setRangeFor({ surah, from: ayah });
          }}
          onTafsir={(surah, ayah) => {
            setSheet(null);
            setTafsirFor({ surah, ayah });
          }}
          onShare={(surah, ayah) => {
            setSheet(null);
            navigate({ to: "/mushaf/share", search: { surah, ayah } });
          }}
          onMemorize={(surah, from) => {
            setSheet(null);
            navigate({ to: "/mushaf/memorize", search: { surah, from } });
          }}
        />
      </div>
    </PhoneFrame>
  );
}
