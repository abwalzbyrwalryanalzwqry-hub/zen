import { SURAHS } from "@/lib/quran-meta";
import type { DayStudent, QuranRange, Segment } from "@/lib/daily-record";
import { ensureRegisterDict } from "@/lib/register-i18n";

ensureRegisterDict();

/* ─────────── لوحة الطالب السريعة (1.14.0) ─────────── */

/**
 * نهاية مقترحة بمقدار آخر حفظ: من بداية في سورة واحدة، بعدد آيات آخر مقطع نفسه، ولا تتجاوز السورة.
 * بلا آخر حفظ أو بداية ناقصة يعود المدى كما هو.
 */
export function suggestAmount(
  last: Segment | null | undefined,
  start: Partial<QuranRange>,
): Partial<QuranRange> {
  const { fromSurah, fromAyah } = start;
  if (!last || !fromSurah || !fromAyah || start.toAyah) return start;
  if (start.toSurah && start.toSurah !== fromSurah) return start;
  const n = Math.max(1, last.to_ayah - last.from_ayah + 1);
  const max = SURAHS[fromSurah - 1]?.ayahs ?? fromAyah;
  return { ...start, toSurah: fromSurah, toAyah: Math.min(fromAyah + n - 1, max) };
}

/** مستوى الأداء المقترح من عدد الأخطاء: 0 ممتاز، 1–2 جيد جداً، 3–4 جيد، 5–6 مقبول، 7+ ضعيف. */
export const gradeFromMistakes = (n: number): number =>
  n <= 0 ? 5 : n <= 2 ? 4 : n <= 4 ? 3 : n <= 6 ? 2 : 1;

/**
 * الطالب التالي (step=1) أو السابق (-1) في القائمة المعروضة. smart: يتخطّى الغائب والمستأذن ومن انتقل
 * (لا حفظ لهم)، فإن لم يبق غيرهم فالتالي مباشرة.
 */
export function stepStudentId(
  list: readonly DayStudent[],
  current: string,
  step: 1 | -1,
  smart = true,
): string | null {
  const i = list.findIndex((s) => s.student_id === current);
  if (i < 0) return null;
  const skip = (s: DayStudent) =>
    smart && (s.status === "absent" || s.status === "excused" || s.member === false);
  for (let j = i + step; j >= 0 && j < list.length; j += step)
    if (!skip(list[j])) return list[j].student_id;
  const k = i + step;
  return k >= 0 && k < list.length ? list[k].student_id : null;
}

/* ─────────── القائمة: الترتيب المحفوظ لكل حلقة (1.14.0) ─────────── */

export type StudentSort = "list" | "name" | "unmarked" | "absences";
export const STUDENT_SORTS: readonly StudentSort[] = ["list", "name", "unmarked", "absences"];
const SORT_KEY = "zen.dailyRecord.sort.";

/**
 * ترتيب القائمة: «list» ترتيب الحلقة كما هو، و«name» أبجدياً بالعربية، و«unmarked» من لم يُسجَّل حضوره أولاً،
 * و«absences» الأكثر غياباً في 30 يوماً أولاً. الترتيب ثابت (يحفظ ترتيب الحلقة عند التساوي).
 */
export function sortStudents(list: readonly DayStudent[], mode: StudentSort): DayStudent[] {
  const idx = new Map(list.map((s, i) => [s.student_id, i]));
  const tie = (a: DayStudent, b: DayStudent) => idx.get(a.student_id)! - idx.get(b.student_id)!;
  const out = [...list];
  if (mode === "name") out.sort((a, b) => a.name.localeCompare(b.name, "ar") || tie(a, b));
  else if (mode === "unmarked")
    out.sort((a, b) => Number(!!a.status) - Number(!!b.status) || tie(a, b));
  else if (mode === "absences") out.sort((a, b) => b.absences_30d - a.absences_30d || tie(a, b));
  return out;
}

type Store = Pick<Storage, "getItem" | "setItem">;
const local = (): Store | null => {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
};

export function readSort(halaqa: string, s: Store | null = local()): StudentSort {
  const v = s?.getItem(SORT_KEY + halaqa);
  return (STUDENT_SORTS as readonly string[]).includes(v ?? "") ? (v as StudentSort) : "list";
}

export function writeSort(halaqa: string, mode: StudentSort, s: Store | null = local()) {
  try {
    s?.setItem(SORT_KEY + halaqa, mode);
  } catch {
    /* تخزين ممتلئ أو معطَّل: الترتيب للجلسة فقط. */
  }
}

/** اهتزاز خفيف يؤكّد اللمسة (حيث يدعمه الجهاز)، ولا شيء عند تفضيل تقليل الحركة. */
export function haptic(ms = 12) {
  try {
    if (typeof window === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    navigator.vibrate?.(ms);
  } catch {
    /* غير مدعوم */
  }
}
