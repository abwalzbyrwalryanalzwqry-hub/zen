/**
 * مصدر واحد لنص المصحف داخل التطبيق (M2).
 *
 * كان المتن المرجعي لمحرّك الاختبارات (`src/data/quran-uthmani.json`، 1.4 ميغابايت) يُستورد قطعةَ JS
 * مستقلة، مع أن النص نفسه مضمَّن ملفاتٍ لكل سورة في `public/data/quran/uthmani/{n}.json` يقرؤها القارئ
 * والبحث. هنا يُعاد بناء المتن المرجعي من ملفات السور بالقاعدتين نفسيهما في
 * `scripts/build-quran-data.mjs` (حذف BOM وتوحيد المسافات، ثم فصل البسملة عن الآية الأولى)، فيخرج
 * مطابقاً بايتاً ببايت للملف المرجعي، وتتحقق بصمة SHA-256 في `quran-integrity.json` من ذلك قبل أي
 * اختبار. لا يُعاد كتابة أي حرف قرآني.
 *
 * `src/data/quran-uthmani.json` يبقى المرجع للاختبارات والسكربتات (Node)، ولا يدخل حزمة التطبيق.
 */

export type RawCorpus = {
  edition: string;
  source: string;
  retrieved: string;
  totalAyahs: number;
  juzStarts: [number, number][];
  surahs: { n: number; name: string; ayahs: string[] }[];
};

/** ملف سورة كما في `public/data/quran/uthmani/{n}.json` (الحقول المستعملة فقط). */
export type SurahFile = { id: number; ayahs: { n: number; t: string; j: number }[] };

export type CorpusManifest = { edition: string; source: string; retrieved: string };

export const UTHMANI_BASE = "/data/quran/uthmani";

const DIACRITICS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;

/** تطبيع للمقارنة فقط (نسخة حرفية من build-quran-data.mjs) — لا يُكتب إلى النص. */
function normalizeForCompare(text: string): string {
  let t = text.replace(DIACRITICS, "");
  for (const [from, to] of [
    ["\u0671", "ا"],
    ["\u0622", "ا"],
    ["\u0623", "ا"],
    ["\u0625", "ا"],
    ["\u0649", "ي"],
    ["\u0629", "ه"],
  ] as const) {
    t = t.replaceAll(from, to);
  }
  return t.replace(/\s+/g, " ").trim();
}

const BASMALA = normalizeForCompare("بسم الله الرحمن الرحيم");
const BASMALA_WORDS = BASMALA.split(" ").length;

/**
 * يبني المتن المرجعي من ملفات السور الـ114. ترتيب المفاتيح مطابق للملف المرجعي لأن البصمة تُحسب على
 * `JSON.stringify` الناتج.
 */
export function corpusFromSurahFiles(
  files: readonly SurahFile[],
  manifest: CorpusManifest,
  surahName: (n: number) => string,
): RawCorpus {
  const sorted = [...files].sort((a, b) => a.id - b.id);
  const juz = new Map<number, [number, number]>();
  const surahs = sorted.map((f) => {
    const n = f.id;
    const ayahs = f.ayahs.map((a) => {
      let text = a.t
        .replace(/^\uFEFF/, "")
        .replace(/\s+/g, " ")
        .trim();
      if (a.n === 1 && n !== 1 && n !== 9 && normalizeForCompare(text).startsWith(BASMALA)) {
        text = text.split(" ").slice(BASMALA_WORDS).join(" ").trim();
      }
      if (!juz.has(a.j)) juz.set(a.j, [n, a.n]);
      return text;
    });
    return { n, name: surahName(n), ayahs };
  });
  return {
    edition: manifest.edition,
    source: manifest.source,
    retrieved: manifest.retrieved,
    totalAyahs: surahs.reduce((sum, s) => sum + s.ayahs.length, 0),
    juzStarts: Array.from({ length: 30 }, (_, i) => juz.get(i + 1) ?? [0, 0]),
    surahs,
  };
}

/** يقرأ ملفات السور المضمَّنة في التطبيق (تعمل دون اتصال). */
export async function fetchSurahFiles(fetcher: typeof fetch = fetch): Promise<SurahFile[]> {
  return Promise.all(
    Array.from({ length: 114 }, async (_, i) => {
      const res = await fetcher(`${UTHMANI_BASE}/${i + 1}.json`, { cache: "force-cache" });
      if (!res.ok) throw new Error(`تعذّر قراءة ملف السورة ${i + 1} من الملفات المحلية`);
      return (await res.json()) as SurahFile;
    }),
  );
}
