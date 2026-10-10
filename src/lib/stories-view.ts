// عرض آيات القصة ومصادرها: مراجع AyahCard بمقطع محدود (النص الكامل في المصحف)، وروابط Quran.com لكل مقطع.
import type { AyahRef } from "./chat-format";
import { findSurah, SURAHS } from "./quran-meta";
import type { Story, StorySource } from "./zen-stories";

/** أقصى عدد آيات يُعرض نصّها داخل القصة؛ ما زاد يُقرأ في المصحف. */
export const MAX_SHOWN_AYAT = 7;

export type StoryAyahView = {
  /** المقطع المعروض (null إن تعذّر تحديد السورة أو كان المدى خاطئاً). */
  shown: AyahRef | null;
  full: { name: string; from: number; to: number };
};

export function storyAyahRefs(story: Pick<Story, "ayat">): StoryAyahView[] {
  return (story.ayat ?? []).map((a) => {
    const meta = (a.n ? SURAHS.find((s) => s.n === a.n) : undefined) ?? findSurah(a.surah);
    const full = { name: a.surah, from: a.from, to: a.to };
    if (!meta || a.from < 1 || a.to < a.from || a.to > meta.ayahs) return { shown: null, full };
    return {
      shown: {
        surah: meta.n,
        name: meta.name,
        from: a.from,
        to: Math.min(a.to, a.from + MAX_SHOWN_AYAT - 1),
      },
      full,
    };
  });
}

/** مصادر القصة المسجّلة، ثم رابط Quran.com لكل مقطع من آياتها، بلا تكرار. */
export function storySources(
  story: Pick<Story, "ayat" | "sources">,
  t: (key: string, vars: Record<string, string | number>) => string,
): StorySource[] {
  const out: StorySource[] = [];
  const seen = new Set<string>();
  const add = (s: StorySource) => {
    if (!s?.url || !/^https?:\/\//.test(s.url) || seen.has(s.url)) return;
    seen.add(s.url);
    out.push(s);
  };
  (story.sources ?? []).forEach(add);
  for (const { shown, full } of storyAyahRefs(story)) {
    if (!shown) continue;
    add({
      title: t("storiesPage.quranComSource", { surah: shown.name, from: full.from, to: full.to }),
      url: `https://quran.com/${shown.surah}/${full.from}-${full.to}`,
    });
  }
  return out;
}
