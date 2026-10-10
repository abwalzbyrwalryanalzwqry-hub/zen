/**
 * محرّك الإنجاز (Achievement Engine): يفسّر رحلة الطالب من مقاطع الحفظ المعتمدة في السجل اليومي، بلا أي
 * إدخال يدوي ولا تخزين. خريطة السور (لم يبدأ / جارٍ / مكتمل) والأجزاء والمحطات تُحسب من تغطية الآيات.
 *
 * الأجزاء من بدايات أرباع الأحزاب في structure-data (8 أرباع لكل جزء)، والسور من quran-meta.
 */
import { SURAHS } from "@/lib/quran-meta";
import { HIZB_QUARTER_STARTS } from "@/lib/quran/structure-data";
import { surahNo } from "@/lib/daily-record";
import type { HistorySegment } from "./types";
import type { StudentStats } from "./calc";

export const TOTAL_AYAHS = SURAHS.reduce((n, s) => n + s.ayahs, 0);

/** تغطية الآيات: لكل سورة مصفوفة 0/1 بطول آياتها. */
export class Coverage {
  readonly bits: Uint8Array[] = SURAHS.map((s) => new Uint8Array(s.ayahs + 1));
  readonly counts: number[] = SURAHS.map(() => 0);

  /** يضيف مقطعاً ويعيد أرقام السور التي اكتملت به. */
  add(surah: number, from: number, to: number): number[] {
    const b = this.bits[surah - 1];
    if (!b) return [];
    const meta = SURAHS[surah - 1];
    const lo = Math.max(1, Math.min(from, to));
    const hi = Math.min(meta.ayahs, Math.max(from, to));
    const before = this.counts[surah - 1];
    for (let a = lo; a <= hi; a++)
      if (!b[a]) {
        b[a] = 1;
        this.counts[surah - 1]++;
      }
    return before < meta.ayahs && this.counts[surah - 1] === meta.ayahs ? [surah] : [];
  }

  has(surah: number, ayah: number): boolean {
    return !!this.bits[surah - 1]?.[ayah];
  }

  get ayahs(): number {
    return this.counts.reduce((a, b) => a + b, 0);
  }
}

export type SurahState = "none" | "partial" | "done";
export interface SurahProgress {
  n: number;
  name: string;
  ayahs: number;
  done: number;
  state: SurahState;
}

export function surahMap(c: Coverage): SurahProgress[] {
  return SURAHS.map((s, i) => {
    const done = c.counts[i];
    return {
      n: s.n,
      name: s.name,
      ayahs: s.ayahs,
      done,
      state: done === 0 ? "none" : done === s.ayahs ? "done" : "partial",
    };
  });
}

/* ─────────── الأجزاء ─────────── */

type Pos = readonly [number, number];
let juzCache: { start: Pos; end: Pos }[] | null = null;

/** حدود الأجزاء الثلاثين [بداية، نهاية] بالسورة والآية. */
export function juzBounds(): { start: Pos; end: Pos }[] {
  if (juzCache) return juzCache;
  const starts: Pos[] = [];
  for (let i = 0; i < HIZB_QUARTER_STARTS.length; i += 8)
    starts.push([HIZB_QUARTER_STARTS[i][0], HIZB_QUARTER_STARTS[i][1]]);
  juzCache = starts.map((st, i) => {
    const next = starts[i + 1];
    let end: Pos;
    if (!next) end = [114, SURAHS[113].ayahs];
    else if (next[1] > 1) end = [next[0], next[1] - 1];
    else end = [next[0] - 1, SURAHS[next[0] - 2].ayahs];
    return { start: st, end };
  });
  return juzCache;
}

/** نسبة ما حُفظ من الجزء (0..1). */
export function juzProgress(c: Coverage, juz: number): { done: number; total: number } {
  const b = juzBounds()[juz - 1];
  let done = 0;
  let total = 0;
  for (let s = b.start[0]; s <= b.end[0]; s++) {
    const lo = s === b.start[0] ? b.start[1] : 1;
    const hi = s === b.end[0] ? b.end[1] : SURAHS[s - 1].ayahs;
    for (let a = lo; a <= hi; a++) {
      total++;
      if (c.has(s, a)) done++;
    }
  }
  return { done, total };
}

/** الأجزاء التي يمسّها مقطع (لفحص اكتمالها بعده فقط). */
function juzOf(surah: number, ayah: number): number {
  const all = juzBounds();
  for (let i = all.length - 1; i >= 0; i--) {
    const [s, a] = all[i].start;
    if (s < surah || (s === surah && a <= ayah)) return i + 1;
  }
  return 1;
}

/* ─────────── المحطات (Timeline) ─────────── */

export type Milestone =
  | { kind: "surah"; date: string; surah: number }
  | { kind: "juz"; date: string; juz: number }
  | { kind: "juzCount"; date: string; count: number }
  | { kind: "half"; date: string }
  | { kind: "khatm"; date: string }
  | { kind: "regular"; date: string; pct: number }
  | { kind: "improved"; date: string; from: number; to: number };

/** سورة تُعدّ محطة إن كانت 50 آية فأكثر (القصار تظهر ضمن «إتمام جزء» بدل عشرات الأسطر). */
export const MILESTONE_SURAH_MIN_AYAHS = 50;
const JUZ_COUNTS = [5, 10, 20, 25];

export interface Journey {
  coverage: Coverage;
  milestones: Milestone[];
  /** آخر مقطع حفظ معتمد (للسورة الحالية وآخر نقطة). */
  last: HistorySegment | null;
  first: HistorySegment | null;
  completedJuz: number[];
  completedSurahs: number;
  pct: number;
}

/** رحلة الطالب من مقاطع حفظه المعتمدة مرتّبة زمنياً. */
export function journeyOf(history: readonly HistorySegment[]): Journey {
  const c = new Coverage();
  const milestones: Milestone[] = [];
  const doneJuz = new Set<number>();
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  for (const h of sorted) {
    const n = surahNo(h.surah_name);
    if (!n) continue;
    for (const s of c.add(n, h.from_ayah, h.to_ayah))
      if (SURAHS[s - 1].ayahs >= MILESTONE_SURAH_MIN_AYAHS)
        milestones.push({ kind: "surah", date: h.date, surah: s });
    const touched = new Set([juzOf(n, h.from_ayah), juzOf(n, h.to_ayah)]);
    for (let j = Math.min(...touched); j <= Math.max(...touched); j++) {
      if (doneJuz.has(j)) continue;
      const p = juzProgress(c, j);
      if (p.done === p.total) {
        doneJuz.add(j);
        milestones.push({ kind: "juz", date: h.date, juz: j });
        if (JUZ_COUNTS.includes(doneJuz.size))
          milestones.push({ kind: "juzCount", date: h.date, count: doneJuz.size });
        if (doneJuz.size === 15) milestones.push({ kind: "half", date: h.date });
      }
    }
    if (c.ayahs === TOTAL_AYAHS && !milestones.some((m) => m.kind === "khatm"))
      milestones.push({ kind: "khatm", date: h.date });
  }
  const map = surahMap(c);
  return {
    coverage: c,
    milestones,
    last: sorted[sorted.length - 1] ?? null,
    first: sorted[0] ?? null,
    completedJuz: [...doneJuz].sort((a, b) => a - b),
    completedSurahs: map.filter((m) => m.state === "done").length,
    pct: Math.round((c.ayahs * 1000) / TOTAL_AYAHS) / 10,
  };
}

/** محطات الفترة: ما اكتمل داخل النطاق، مع إنجازات المواظبة وتحسّن التقييم المحسوبة من الإحصاء. */
export function periodMilestones(
  j: Journey,
  s: StudentStats,
  from: string,
  to: string,
  prev: StudentStats | null,
): Milestone[] {
  const out = j.milestones.filter((m) => m.date >= from && m.date <= to);
  const a = s.attendance;
  if (a.rate != null && a.rate >= 95 && a.marked >= 10)
    out.push({ kind: "regular", date: to, pct: a.rate });
  if (prev?.avgGrade != null && s.avgGrade != null && s.avgGrade - prev.avgGrade >= 0.5)
    out.push({ kind: "improved", date: to, from: prev.avgGrade, to: s.avgGrade });
  return out.sort((x, y) => y.date.localeCompare(x.date));
}
