import { useEffect, useRef } from "react";
import { clampPage } from "@/lib/quran/page-service";
import { readReaderState, type useReaderState } from "@/lib/quran/reader-state";
import { readHistory } from "@/lib/quran/reading-history";
import { pageOfAyah } from "@/lib/quran/reading-tracker";
import { useLatest } from "@/hooks/use-latest";

/** منطق شاشة القارئ غير المرئي (المرحلة 7.5): الروابط المباشرة، ومتابعة التلاوة، وحفظ الموضع عند ملء الشاشة. */

/** فارق زمني يُتجاهل بين حفظ حالة القارئ وسجل القراءة على الجهاز نفسه. */
const RESUME_SKEW_MS = 60_000;

type Update = ReturnType<typeof useReaderState>[1];
type Params = { surah?: number; ayah?: number; page?: number; mode?: "surah" | "mushaf" };

/** يطبّق معاملات الرابط المباشر مرة واحدة، أو يستأنف من آخر آية. */
export function useReaderDeepLink(
  params: Params,
  update: Update,
  setTargetAyah: (n: number | null) => void,
) {
  const appliedRef = useRef(false);
  // Apply incoming deep-link parameters once.
  useEffect(() => {
    if (appliedRef.current) return;
    appliedRef.current = true;
    const patch: Parameters<typeof update>[0] = {};
    if (params.surah && params.surah >= 1 && params.surah <= 114) {
      patch.surah = params.surah;
      patch.mode = params.mode ?? "surah";
    }
    if (params.page) {
      patch.page = clampPage(params.page);
      patch.mode = params.mode ?? "mushaf";
    }
    if (params.mode) patch.mode = params.mode;
    if (Object.keys(patch).length) update(patch);
    if (params.ayah) setTargetAyah(params.ayah);
    // بلا رابط مباشر: نستأنف من الآية التي وقف عندها القارئ.
    else if (!params.surah && !params.page) {
      const saved = readReaderState();
      // سجل القراءة يُزامَن مع الحساب؛ حالة القارئ محلية. إن كان آخر موضع في السجل أحدث
      // (قراءة على جهاز آخر) نستأنف منه، فيتابع القارئ حيث توقف على أي جهاز.
      const last = readHistory().entries[0];
      if (last && last.at > saved.updatedAt + RESUME_SKEW_MS) {
        const mode = last.mode === "mushaf" ? "mushaf" : "surah";
        update({ surah: last.surah, ayah: last.ayah, juz: last.juz, page: last.page, mode });
        if (mode === "surah" && last.ayah > 1) setTargetAyah(last.ayah);
      } else if (saved.mode !== "mushaf" && saved.ayah && saved.ayah > 1) {
        setTargetAyah(saved.ayah);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/** القارئ يتبع الآية المتلوّة: ينتقل إلى السورة أو الصفحة التالية مع التلاوة المتصلة. */
export function useFollowPlayback(
  track: { surah: number; ayah: number } | null,
  current: { isSurahMode: boolean; page: number; surah: number },
  update: Update,
) {
  const followRef = useLatest(current);
  useEffect(() => {
    if (!track) return;
    const f = followRef.current;
    if (f.isSurahMode) {
      // التلاوة المتصلة انتقلت إلى السورة التالية: ينتقل القارئ معها.
      if (track.surah !== f.surah) update({ surah: track.surah, ayah: track.ayah });
    } else {
      const p = pageOfAyah(track.surah, track.ayah);
      if (p !== f.page) update({ page: p });
    }
  }, [track, update, followRef]);
}

/** تبديل ملء الشاشة يزيح النص؛ نعيد الآية الظاهرة إلى أعلى الشاشة. */
export function useRestoreAyahOnImmersive(
  hereAyah: number | undefined,
  immersive: boolean,
  isSurahMode: boolean,
) {
  const hereRef = useLatest(hereAyah);
  const immersiveMounted = useRef(false);
  useEffect(() => {
    if (!immersiveMounted.current) {
      immersiveMounted.current = true;
      return;
    }
    const n = hereRef.current;
    if (!isSurahMode || !n) return;
    const raf = requestAnimationFrame(() =>
      document
        .querySelector(`[data-reading-area] [data-ayah="${n}"]`)
        ?.scrollIntoView({ block: "start" }),
    );
    return () => cancelAnimationFrame(raf);
  }, [immersive, isSurahMode, hereRef]);
}
