import data from "@/data/quran-divisions.json";
import { SURAHS } from "@/lib/quran-meta";

/**
 * حدود السور والأحزاب والأجزاء بصفحات مصحف المدينة (604 صفحة).
 *
 * المصدر: بيانات Tanzil الوصفية (CC BY 3.0) في `src/data/quran-divisions.json`،
 * وحدود الأجزاء فيها مطابقة لحدود المتن المحلي (يتحقق منها اختبار).
 * لا يُستعمل هنا أي نص قرآني، ولا يُولَّد شيء بالتخمين.
 */

export type UnitKind = "surah" | "hizb" | "juz";
export type QuranUnit = { kind: UnitKind; no: number; firstPage: number; lastPage: number };

type Ref = readonly [number, number];
const PAGE_STARTS = data.pageStarts as unknown as Ref[];
const HIZB_STARTS = data.hizbStarts as unknown as Ref[];

/** ترتيب مطلق للآية (سورة، آية) للمقارنة. */
function ord([s, a]: Ref): number {
  return s * 1000 + a;
}

/** رقم الصفحة التي تقع فيها الآية. */
export function pageOf(surah: number, ayah: number): number {
  const k = ord([surah, ayah]);
  let lo = 0;
  let hi = PAGE_STARTS.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ord(PAGE_STARTS[mid]) <= k) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

/** الآية السابقة لبداية معيّنة (نهاية الوحدة قبلها). */
function before([s, a]: Ref): Ref {
  if (a > 1) return [s, a - 1];
  return [s - 1, SURAHS[s - 2].ayahs];
}

function rangesFrom(kind: UnitKind, starts: Ref[]): QuranUnit[] {
  return starts.map((st, i) => {
    const end: Ref = i + 1 < starts.length ? before(starts[i + 1]) : [114, 6];
    return { kind, no: i + 1, firstPage: pageOf(st[0], st[1]), lastPage: pageOf(end[0], end[1]) };
  });
}

let cache: QuranUnit[] | null = null;

/** كل الوحدات: 114 سورة ثم 60 حزباً ثم 30 جزءاً. */
export function quranUnits(): QuranUnit[] {
  if (cache) return cache;
  const surahs: QuranUnit[] = SURAHS.map((s) => ({
    kind: "surah",
    no: s.n,
    firstPage: pageOf(s.n, 1),
    lastPage: pageOf(s.n, s.ayahs),
  }));
  const juzStarts = HIZB_STARTS.filter((_, i) => i % 2 === 0);
  cache = [...surahs, ...rangesFrom("hizb", HIZB_STARTS), ...rangesFrom("juz", juzStarts)];
  return cache;
}

/** بدايات الأجزاء كما تشتقّها بيانات الأحزاب (للتحقق من مطابقتها للمتن). */
export function juzStartsFromHizb(): Ref[] {
  return HIZB_STARTS.filter((_, i) => i % 2 === 0);
}

/** الوحدات التي اكتملت صفحاتها كلها في مجموعة الصفحات المحفوظة. */
export function completedUnits(pages: Iterable<number>): QuranUnit[] {
  const set = new Set(pages);
  return quranUnits().filter((u) => {
    for (let p = u.firstPage; p <= u.lastPage; p++) if (!set.has(p)) return false;
    return true;
  });
}

/** تقدّم وحدة: عدد صفحاتها المحفوظة من مجموعها. */
export function unitProgress(
  u: QuranUnit,
  pages: Iterable<number>,
): { done: number; total: number } {
  const set = new Set(pages);
  let done = 0;
  for (let p = u.firstPage; p <= u.lastPage; p++) if (set.has(p)) done++;
  return { done, total: u.lastPage - u.firstPage + 1 };
}
