// ============================================================
// Zen — Quran Module
// Full-text search across the bundled Uthmani dataset
// ------------------------------------------------------------
// The index is built once, lazily, from the same local JSON files
// the reader uses (`/data/quran/uthmani/{id}.json`) — no network,
// no second copy of the text on disk.
// ============================================================

import { SURAH_META } from "./metadata";
import { quranTextService } from "./text-service";
import {
  containsAllTokens,
  matchedWordIndices,
  normalizeArabic,
  quranSkeleton,
  splitWords,
  tokenizeArabic,
  wordMatchesToken,
} from "./normalize";
import type { SurahText } from "./text-types";

export type SearchScope = "all" | "surah" | "juz";

export interface SearchOptions {
  scope?: SearchScope;
  surah?: number;
  juz?: number;
  limit?: number;
}

export interface AyahHit {
  surah: number;
  nameAr: string;
  ayah: number;
  page: number;
  juz: number;
  /** Original, fully vocalized text. */
  text: string;
  /** Original words — so the UI can highlight without re-splitting. */
  words: string[];
  /** Indices inside `words` that matched the query. */
  matches: number[];
  score: number;
}

interface Entry {
  s: number;
  n: number;
  p: number;
  j: number;
  t: string;
  /** Skeleton, space-joined text. */
  hay: string;
  /** Skeleton without spaces — phrase matching across fused words («يَٰٓأَيُّهَا»). */
  flat: string;
  words: string[];
  norm: string[];
  light: string[];
}

export interface SearchResult {
  hits: AyahHit[];
  /** All matching ayahs, ignoring the display limit. */
  total: number;
}

export type BuildProgress = (loaded: number, total: number) => void;

const RECENT_KEY = "zen.quran.search.recent.v1";
const RECENT_MAX = 8;

function toEntries(surah: SurahText): Entry[] {
  return surah.ayahs.map((a) => {
    const { words, norm, light } = splitWords(a.t);
    const hay = norm.join(" ");
    return {
      s: surah.id,
      n: a.n,
      p: a.p,
      j: a.j,
      t: a.t,
      hay,
      flat: hay.replace(/ /g, ""),
      words,
      norm,
      light,
    };
  });
}

class QuranSearchService {
  private entries: Entry[] = [];
  private building: Promise<void> | null = null;
  private listeners = new Set<BuildProgress>();
  private loaded = 0;

  get ready(): boolean {
    return this.entries.length > 0 && !this.building;
  }

  get progress(): { loaded: number; total: number } {
    return { loaded: this.loaded, total: SURAH_META.length };
  }

  onProgress(fn: BuildProgress): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    for (const fn of this.listeners) fn(this.loaded, SURAH_META.length);
  }

  /** Build (or await) the in-memory index. Safe to call repeatedly. */
  async build(): Promise<void> {
    if (this.ready) return;
    if (this.building) return this.building;

    this.building = (async () => {
      const next: Entry[] = [];
      this.loaded = 0;
      this.emit();

      // Load in small batches to keep the UI responsive on mid-range phones.
      const BATCH = 6;
      for (let start = 1; start <= SURAH_META.length; start += BATCH) {
        const ids: number[] = [];
        for (let id = start; id < start + BATCH && id <= SURAH_META.length; id++) ids.push(id);
        const surahs = await Promise.all(ids.map((id) => quranTextService.loadSurah(id)));
        for (const surah of surahs) {
          next.push(...toEntries(surah));
          this.loaded++;
        }
        this.emit();
        // Yield to the event loop between batches.
        await new Promise<void>((r) => setTimeout(r, 0));
      }
      this.entries = next;
    })();

    try {
      await this.building;
    } finally {
      this.building = null;
      this.emit();
    }
  }

  /** Index already-loaded surahs synchronously (tests, warm caches). */
  indexSurahs(surahs: SurahText[]): void {
    this.entries = surahs.flatMap(toEntries);
    this.loaded = surahs.length;
  }

  /** Total indexed ayahs. */
  get size(): number {
    return this.entries.length;
  }

  /** Matching ayahs (ranked, limited) plus the total count, in one pass. */
  query(query: string, opts: SearchOptions = {}): SearchResult {
    const tokens = tokenizeArabic(query);
    if (!tokens.length || !this.entries.length) return { hits: [], total: 0 };

    const phrase = quranSkeleton(query).replace(/ /g, "");
    const lightTokens = normalizeArabic(query).split(" ").filter(Boolean);
    const limit = opts.limit ?? 120;
    const scope = opts.scope ?? "all";
    const hits: AyahHit[] = [];
    const phraseHits: AyahHit[] = [];

    for (const e of this.entries) {
      if (scope === "surah" && opts.surah && e.s !== opts.surah) continue;
      if (scope === "juz" && opts.juz && e.j !== opts.juz) continue;
      if (!containsAllTokens(e.hay, tokens)) continue;

      const matches = matchedWordIndices(e.norm, tokens);
      // العبارة المتصلة تُقبل ولو اندمجت كلماتها في الرسم («يَٰٓأَيُّهَا» = «يا أيها»).
      const isPhrase = tokens.length > 1 && e.flat.includes(phrase);
      // وإلا فكل كلمة من البحث يجب أن تطابق كلمة كاملة (مع سوابقها) لا جزءاً من كلمة.
      if (!isPhrase && !tokens.every((t) => matches.some((i) => wordMatchesToken(e.norm[i], t)))) {
        continue;
      }

      // لكل كلمة من البحث أفضل مطابقة لها في الآية (لا تتراكم بتكرارها في الآيات الطويلة):
      // الإملاء المطابق تماماً («هؤلاء» لا «أهل») ثم الهيكل المطابق ثم الكلمة بسوابقها.
      let score = isPhrase ? 200 : 0;
      for (const t of tokens) {
        let best = 0;
        for (const i of matches) {
          if (!wordMatchesToken(e.norm[i], t)) continue;
          const w = lightTokens.includes(e.light[i]) ? 40 : e.norm[i] === t ? 20 : 8;
          if (w > best) best = w;
        }
        score += best;
      }
      // Shorter ayahs with the same match are more likely to be the target.
      score += Math.max(0, 40 - e.norm.length) / 10;

      (isPhrase ? phraseHits : hits).push({
        surah: e.s,
        nameAr: SURAH_META[e.s - 1].nameAr,
        ayah: e.n,
        page: e.p,
        juz: e.j,
        text: e.t,
        words: e.words,
        matches,
        score,
      });
    }

    // العبارة المتصلة إن وُجدت هي المقصودة: «لا إله إلا الله» لا كل آية فيها «له» و«الله».
    const pool = phraseHits.length ? phraseHits : hits;
    pool.sort((a, b) => b.score - a.score || a.surah - b.surah || a.ayah - b.ayah);
    return { hits: pool.slice(0, limit), total: pool.length };
  }

  search(query: string, opts: SearchOptions = {}): AyahHit[] {
    return this.query(query, opts).hits;
  }

  /** How many ayahs match, ignoring the display limit. */
  count(query: string, opts: SearchOptions = {}): number {
    return this.query(query, { ...opts, limit: 0 }).total;
  }
}

export const quranSearchService = new QuranSearchService();

/* ---------- Surah-name lookup (instant, needs no index) ---------- */

/**
 * أسماء السور المشهورة غير أسمائها في المصحف، كما يكتبها الناس في البحث.
 * «تبارك» للملك، و«عمّ» للنبأ، و«بني إسرائيل» للإسراء، و«براءة» للتوبة…
 */
export const SURAH_ALIASES: Readonly<Record<number, readonly string[]>> = {
  1: ["أم الكتاب", "أم القرآن", "السبع المثاني", "الحمد"],
  9: ["براءة"],
  17: ["بني إسرائيل", "سبحان"],
  40: ["المؤمن", "الطول"],
  41: ["حم السجدة", "السجدة حم"],
  47: ["القتال"],
  67: ["تبارك", "تبارك الذي بيده الملك"],
  68: ["ن", "نون", "ن والقلم"],
  76: ["الدهر", "هل أتى", "الأبرار"],
  78: ["عم", "عم يتساءلون"],
  94: ["الانشراح", "ألم نشرح"],
  96: ["اقرأ"],
  98: ["لم يكن"],
  111: ["تبت", "اللهب"],
  112: ["التوحيد", "قل هو الله أحد"],
};

const ALIAS_INDEX: { id: number; alias: string }[] = Object.entries(SURAH_ALIASES).flatMap(
  ([id, names]) => names.map((n) => ({ id: Number(id), alias: normalizeArabic(n) })),
);

type SurahRow = (typeof SURAH_META)[number];

/** ترتيب السور حسب قرب الاسم: الرقم أو الاسم أو الاسم المشهور كاملاً، ثم البداية، ثم الاحتواء. */
function rankSurahNames(query: string): { s: SurahRow; score: number }[] {
  // «سورة البقرة» تُعامل كـ«البقرة».
  const q = normalizeArabic(query)
    .replace(/^سوره\s+/, "")
    .trim();
  if (!q) return [];
  const digits = q.replace(/\D/g, "");
  const scored: { s: SurahRow; score: number }[] = [];
  for (const s of SURAH_META) {
    const nameAr = normalizeArabic(s.nameAr);
    const bare = nameAr.replace(/^ال/, "");
    const aliases = ALIAS_INDEX.filter((a) => a.id === s.id).map((a) => a.alias);
    let score = 0;
    if (digits.length > 0 && digits === q && String(s.id) === digits) score = 100;
    else if (nameAr === q || bare === q || aliases.includes(q)) score = 90;
    else if (nameAr.startsWith(q) || bare.startsWith(q)) score = 60;
    else if (aliases.some((a) => a.startsWith(q))) score = 55;
    else if (nameAr.includes(q)) score = 30;
    else if (q.length >= 3 && s.nameEn.toLowerCase().includes(query.trim().toLowerCase()))
      score = 20;
    if (score) scored.push({ s, score });
  }
  scored.sort((a, b) => b.score - a.score || a.s.id - b.s.id);
  return scored;
}

export function searchSurahNames(query: string, limit = 8): SurahRow[] {
  return rankSurahNames(query)
    .slice(0, limit)
    .map((x) => x.s);
}

/* ---------- Ayah references («2:255»، «البقرة 255»، «آية الكرسي») ---------- */

export interface AyahRefHit {
  surah: number;
  ayah: number;
  /** الاسم المشهور إن جاء المرجع منه («آية الكرسي»). */
  label?: string;
}

/** آيات مشهورة بأسمائها. */
export const FAMOUS_AYAHS: readonly { names: readonly string[]; surah: number; ayah: number }[] = [
  { names: ["آية الكرسي"], surah: 2, ayah: 255 },
  { names: ["خواتيم البقرة", "آمن الرسول"], surah: 2, ayah: 285 },
  { names: ["آية الدين"], surah: 2, ayah: 282 },
  { names: ["آية النور"], surah: 24, ayah: 35 },
  { names: ["آية الحجاب"], surah: 33, ayah: 53 },
  { names: ["آية السيف"], surah: 9, ayah: 5 },
  { names: ["آية المباهلة"], surah: 3, ayah: 61 },
];

const toLatinDigits = (v: string) =>
  v
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0));

/**
 * يفهم المرجع المكتوب بصيغه الشائعة ويتحقق من صحته:
 * «2:255»، «٢:٢٥٥»، «2/255»، «2 255»، «البقرة 255»، «البقرة:255»، «سورة البقرة آية 255»، «آية الكرسي».
 */
export function parseAyahRef(query: string): AyahRefHit | null {
  const raw = toLatinDigits(query).trim();
  if (!raw) return null;
  const norm = normalizeArabic(raw);
  for (const f of FAMOUS_AYAHS) {
    if (f.names.some((n) => normalizeArabic(n) === norm)) {
      return { surah: f.surah, ayah: f.ayah, label: f.names[0] };
    }
  }
  const valid = (surah: number, ayah: number): AyahRefHit | null =>
    surah >= 1 && surah <= 114 && ayah >= 1 && ayah <= SURAH_META[surah - 1].ayatCount
      ? { surah, ayah }
      : null;
  const numeric = raw.match(/^(\d{1,3})\s*[:：/\-. ]\s*(\d{1,3})$/);
  if (numeric) return valid(Number(numeric[1]), Number(numeric[2]));
  const named = norm.match(/^(.+?)\s*[: ]\s*(?:(?:الايه|ايه)\s*)?(\d{1,3})$/);
  if (named) {
    const name = named[1].replace(/\s+(?:الايه|ايه)$/, "").trim();
    const best = rankSurahNames(name)[0];
    // اسم السورة كاملاً أو بدايته الواضحة فقط، لا مجرد احتوائه.
    if (best && best.score >= 55) return valid(best.s.id, Number(named[2]));
  }
  return null;
}

/* ---------- Recent queries ---------- */

export function readRecentSearches(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed.filter((v) => typeof v === "string") as string[]) : [];
  } catch {
    return [];
  }
}

export function pushRecentSearch(query: string): string[] {
  const q = query.trim();
  if (q.length < 2) return readRecentSearches();
  const next = [q, ...readRecentSearches().filter((v) => v !== q)].slice(0, RECENT_MAX);
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota / privacy errors */
  }
  return next;
}

export function clearRecentSearches(): void {
  try {
    window.localStorage.removeItem(RECENT_KEY);
  } catch {
    /* ignore */
  }
}
