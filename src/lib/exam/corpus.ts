/**
 * المتن القرآني المرجعي وفهارسه.
 *
 * مصدر واحد للنص: ملفات السور المضمَّنة `public/data/quran/uthmani/{n}.json` التي يقرؤها القارئ،
 * يُعاد منها بناء المتن المرجعي (`corpus-source.ts`) ويُتحقَّق ببصمة SHA-256 في
 * `quran-integrity.json` من مطابقته للملف المرجعي `src/data/quran-uthmani.json` (M2). يعمل دون اتصال.
 * في اختبارات الوحدات (Node) يُقرأ الملف المرجعي نفسه.
 *
 * ثلاثة فهارس تُبنى مرة واحدة ثم تُخزَّن:
 *  - فهرس الآيات المسطّح للوصول السريع.
 *  - فهرس تواتر الكلمات في المصحف كله ⇒ منه تُشتق «الكلمات النادرة» فعلياً،
 *    لا بالتخمين.
 *  - عناقيد المتشابهات: آيات تتشابه بداياتها المطبَّعة ⇒ أساس أسئلة المتشابهات.
 */

import { setJuzStarts, surahAyahCount, surahName } from "./scope";
import { corpusFromSurahFiles, fetchSurahFiles, type RawCorpus } from "./corpus-source";
import manifestJson from "@/data/quran-integrity.json";
import { normalizeArabic, normalizedWords, similarity } from "./text";

export type AyahRef = { surah: number; ayah: number };

export type Ayah = AyahRef & {
  /** النص كما ورد في ملف البيانات حرفياً — هذا ما يُعرض. */
  text: string;
  /** نص مطبَّع للمقارنة فقط. */
  normalized: string;
  surahName: string;
};

export type QuranCorpus = {
  edition: string;
  sha256: string;
  totalAyahs: number;
  ayahs: readonly Ayah[];
  /** آيات سورة معيّنة (فهرس 0 = الآية 1). */
  surah: (surah: number) => readonly Ayah[];
  ayah: (surah: number, ayah: number) => Ayah | null;
  /** عدد مرات ورود كلمة مطبَّعة في المصحف كله. */
  wordFrequency: (word: string) => number;
  /** كل الكلمات المطبَّعة داخل آية. */
  wordsOf: (ref: AyahRef) => readonly string[];
  /** آيات تتشابه مع الآية المعطاة (مرتّبة تنازلياً بقوة التشابه). */
  similarTo: (ref: AyahRef, minScore?: number) => readonly { ref: AyahRef; score: number }[];
};

type RawData = RawCorpus;

const manifest = manifestJson as unknown as {
  sha256: string;
  edition: string;
  source: string;
  retrieved: string;
};

/**
 * المتن الخام. في البناء يُستبدل `import.meta.env.MODE` بـ "production" فيُحذف فرع الاختبار ومعه
 * استيراد الملف المرجعي، فلا تدخل نسخة ثانية من النص حزمة التطبيق.
 */
async function loadRawData(): Promise<RawData> {
  if (import.meta.env.MODE === "test") {
    const { default: raw } = await import("@/data/quran-uthmani.json");
    return raw as unknown as RawData;
  }
  return corpusFromSurahFiles(await fetchSurahFiles(), manifest, surahName);
}

let cache: QuranCorpus | null = null;
let loading: Promise<QuranCorpus> | null = null;

/** بصمة SHA-256 للنص المُسلسل — للتحقق من سلامة المتن. */
export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  }
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(bytes).digest("hex");
}

function buildCorpus(raw: RawData, sha256: string): QuranCorpus {
  const ayahs: Ayah[] = [];
  const bySurah = new Map<number, Ayah[]>();

  for (const s of raw.surahs) {
    const list: Ayah[] = s.ayahs.map((text, i) => ({
      surah: s.n,
      ayah: i + 1,
      text,
      normalized: normalizeArabic(text),
      surahName: s.name,
    }));
    bySurah.set(s.n, list);
    ayahs.push(...list);
  }

  // تواتر الكلمات في المصحف كله (مطبَّعة).
  const frequency = new Map<string, number>();
  const wordsPerAyah = new Map<string, string[]>();
  for (const a of ayahs) {
    const ws = a.normalized ? a.normalized.split(" ") : [];
    wordsPerAyah.set(`${a.surah}:${a.ayah}`, ws);
    for (const w of ws) frequency.set(w, (frequency.get(w) ?? 0) + 1);
  }

  /**
   * عناقيد المتشابهات: تُجمَع الآيات بمفتاحين — أول كلمتين مطبَّعتين وآخر
   * كلمتين. الآيات المتشابهة تتشارك فعلياً بدايات متطابقة («وما أرسلنا…»)
   * أو نهايات متطابقة («…وهو العزيز الحكيم»)، فالمفتاحان يغطيان الحالتين،
   * ويجعلان البحث خطياً بدل مقارنة 6236² آية. درجة التشابه النهائية هي
   * الفيصل، فالمفتاح وسيلة تصفية لا حكم.
   */
  const clusters = new Map<string, AyahRef[]>();
  const clusterKeys = (ws: string[]): string[] =>
    ws.length < 3 ? [] : [`s:${ws.slice(0, 2).join(" ")}`, `e:${ws.slice(-2).join(" ")}`];

  for (const a of ayahs) {
    const ws = wordsPerAyah.get(`${a.surah}:${a.ayah}`) ?? [];
    for (const key of clusterKeys(ws)) {
      const bucket = clusters.get(key);
      if (bucket) bucket.push({ surah: a.surah, ayah: a.ayah });
      else clusters.set(key, [{ surah: a.surah, ayah: a.ayah }]);
    }
  }

  const ayahAt = (surah: number, ayah: number): Ayah | null =>
    bySurah.get(surah)?.[ayah - 1] ?? null;

  const similarTo = (ref: AyahRef, minScore = 0.55) => {
    const base = ayahAt(ref.surah, ref.ayah);
    if (!base) return [];
    const ws = wordsPerAyah.get(`${ref.surah}:${ref.ayah}`) ?? [];
    if (ws.length < 3) return [];
    const candidates = clusterKeys(ws).flatMap((key) => clusters.get(key) ?? []);
    const out: { ref: AyahRef; score: number }[] = [];
    const seen = new Set<string>();
    for (const cand of candidates) {
      if (cand.surah === ref.surah && cand.ayah === ref.ayah) continue;
      const key = `${cand.surah}:${cand.ayah}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const other = ayahAt(cand.surah, cand.ayah);
      if (!other) continue;
      const score = similarity(base.text, other.text);
      if (score >= minScore) out.push({ ref: cand, score });
    }
    return out.sort((a, b) => b.score - a.score);
  };

  return {
    edition: raw.edition,
    sha256,
    totalAyahs: raw.totalAyahs,
    ayahs,
    surah: (n) => bySurah.get(n) ?? [],
    ayah: ayahAt,
    wordFrequency: (word) => frequency.get(normalizeArabic(word)) ?? 0,
    wordsOf: (ref) => wordsPerAyah.get(`${ref.surah}:${ref.ayah}`) ?? [],
    similarTo,
  };
}

export type IntegrityReport = {
  ok: boolean;
  expected: string;
  actual: string;
  surahs: number;
  totalAyahs: number;
  problems: string[];
};

/**
 * يتحقق من أن المتن لم يُمسّ: البصمة، وعدد السور، وعدد الآيات الكلي، وعدد آيات
 * كل سورة مقابل بيانات المشروع. يُشغَّل في الاختبارات وقبل بناء أي اختبار.
 */
export async function verifyQuranIntegrity(): Promise<IntegrityReport> {
  const data = await loadRawData();
  const actual = await sha256Hex(JSON.stringify(data));
  const problems: string[] = [];

  if (data.surahs.length !== 114) problems.push(`عدد السور ${data.surahs.length} بدل 114`);
  const total = data.surahs.reduce((sum, s) => sum + s.ayahs.length, 0);
  if (total !== 6236) problems.push(`عدد الآيات ${total} بدل 6236`);
  for (const s of data.surahs) {
    const expectedCount = surahAyahCount(s.n);
    if (s.ayahs.length !== expectedCount) {
      problems.push(`سورة ${surahName(s.n)}: ${s.ayahs.length} آية بدل ${expectedCount}`);
    }
    if (s.name !== surahName(s.n)) {
      problems.push(`اسم السورة ${s.n} لا يطابق بيانات المشروع`);
    }
  }
  const expected = manifest.sha256;
  if (actual !== expected) problems.push("بصمة SHA-256 لا تطابق الملف المرجعي");

  return {
    ok: problems.length === 0,
    expected,
    actual,
    surahs: data.surahs.length,
    totalAyahs: total,
    problems,
  };
}

/** يحمّل المتن (مرة واحدة) ويرفض المتابعة إذا فشل تحقق السلامة. */
export async function loadQuranCorpus(): Promise<QuranCorpus> {
  if (cache) return cache;
  if (loading) return loading;

  loading = (async () => {
    const data = await loadRawData();
    const expected = manifest.sha256;
    const actual = await sha256Hex(JSON.stringify(data));
    if (actual !== expected) {
      throw new Error("تعذّر التحقق من سلامة نص المصحف (بصمة SHA-256 مختلفة). لن يُبنى أي اختبار.");
    }
    setJuzStarts(data.juzStarts);
    cache = buildCorpus(data, actual);
    return cache;
  })();

  try {
    return await loading;
  } finally {
    loading = null;
  }
}

/** كلمات نادرة داخل مراجع معيّنة: تواتر منخفض في المصحف كله وطول معقول. */
export function rareWordsIn(
  corpus: QuranCorpus,
  refs: readonly AyahRef[],
  maxFrequency = 3,
): { ref: AyahRef; word: string; frequency: number }[] {
  const out: { ref: AyahRef; word: string; frequency: number }[] = [];
  const seen = new Set<string>();
  for (const ref of refs) {
    for (const word of corpus.wordsOf(ref)) {
      if (word.length < 4 || seen.has(word)) continue;
      const freq = corpus.wordFrequency(word);
      if (freq >= 1 && freq <= maxFrequency) {
        seen.add(word);
        out.push({ ref, word, frequency: freq });
      }
    }
  }
  return out;
}

/** كلمات الآية بتشكيلها الأصلي (للعرض) مقابل الكلمة المطبَّعة (للمطابقة). */
export function originalWordFor(ayah: Ayah, normalizedWord: string): string | null {
  const original = ayah.text.split(" ");
  const normalized = normalizedWords(ayah.text);
  const index = normalized.indexOf(normalizedWord);
  return index === -1 ? null : (original[index] ?? null);
}
