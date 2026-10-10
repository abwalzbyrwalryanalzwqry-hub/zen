/**
 * التكريم والإنصاف (1.26.0، فحص الاستوديو المرحلة 5 — الأفكار 3 و11): من استحق شهادة بمحطة في الفترة ولم ينلها،
 * ومن لم يُكرَّم أصلاً، وتوزيع الشهادات على طلاب الحلقة. حساب صافٍ بلا شبكة (يُختبر وحده).
 */
import type { CertDetail, HonorRow } from "./api";
import type { AchievementRef } from "./eligibility";
import type { Milestone } from "@/lib/reports/achieve";

export interface Deserved {
  student_id: string;
  name: string;
  type: string;
  ref: AchievementRef;
  date: string;
}

/** المحطات التي تقابلها شهادة نظام: سورة طويلة، جزء، ختم. */
export function milestoneType(m: Milestone): { type: string; ref: AchievementRef } | null {
  if (m.kind === "khatm") return { type: "quran_complete", ref: null };
  if (m.kind === "juz") return { type: "juz_complete", ref: { kind: "juz", juz: m.juz } };
  if (m.kind === "surah") return { type: "surah_complete", ref: { kind: "surah", surah: m.surah } };
  return null;
}

const sameRef = (a: AchievementRef, b: HonorRow["items"][number]["ref"]) => {
  if (!a) return true;
  if (!b || b.kind !== a.kind) return false;
  if (a.kind === "juz") return b.juz === a.juz;
  if (a.kind === "surah") return b.surah === a.surah;
  return true;
};

/** من بلغ محطة في الفترة ولم تصدر له شهادتها (بالنوع والمرجع نفسيهما). */
export function deservedList(
  rows: HonorRow[],
  milestonesOf: (studentId: string) => Milestone[],
  from: string,
  to: string,
): Deserved[] {
  const out: Deserved[] = [];
  for (const r of rows) {
    for (const m of milestonesOf(r.student_id)) {
      if (m.date < from || m.date > to) continue;
      const mt = milestoneType(m);
      if (!mt) continue;
      // السجل الأحدث يكفي: شهادة الختم بعد الأجزاء لا تُلغي استحقاق الجزء، لكن الشهادة نفسها لا تتكرر.
      if (r.items.some((i) => i.type_key === mt.type && sameRef(mt.ref, i.ref))) continue;
      if (
        out.some(
          (d) =>
            d.student_id === r.student_id && d.type === mt.type && sameRef(d.ref, mt.ref as never),
        )
      )
        continue;
      out.push({
        student_id: r.student_id,
        name: r.name,
        type: mt.type,
        ref: mt.ref,
        date: m.date,
      });
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name, "ar"));
}

export interface Fairness {
  students: number;
  honored: number;
  /** نسبة من نال شهادة واحدة على الأقل (0..100). */
  honoredPct: number;
  /** عدد الطلاب بلا شهادة، وبواحدة، وباثنتين، وبثلاث فأكثر. */
  dist: [number, number, number, number];
  total: number;
  manual: number;
  /** نسبة الشهادات اليدوية (بتجاوز الشروط) من كل الشهادات (0..100). */
  manualPct: number;
  /** أكثر طالب تكريماً إلى متوسط الحلقة — مؤشر تركّز التكريم في قلّة. */
  topShare: number;
}

export function fairness(rows: HonorRow[]): Fairness {
  const dist: [number, number, number, number] = [0, 0, 0, 0];
  let total = 0;
  let manual = 0;
  let top = 0;
  for (const r of rows) {
    dist[Math.min(3, r.count)]++;
    total += r.count;
    manual += r.manual;
    top = Math.max(top, r.count);
  }
  const n = rows.length;
  const honored = n - dist[0];
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
  return {
    students: n,
    honored,
    honoredPct: pct(honored, n),
    dist,
    total,
    manual,
    manualPct: pct(manual, total),
    topShare: total ? Math.round((top / (total / n)) * 10) / 10 : 0,
  };
}

/** رابط المعالج لطلاب كثيرين بنوع واحد (ومرجع إن وُجد). */
export function issueSearch(
  halaqa: string,
  type: string,
  students: string[],
  ref: AchievementRef = null,
): Record<string, string | number> {
  const s: Record<string, string | number> = { halaqa, type, students: students.join(",") };
  if (ref?.kind === "juz") s.juz = ref.juz;
  if (ref?.kind === "surah") s.surah = ref.surah;
  return s;
}

/** يجمع المستحقين حسب النوع والمرجع ليُصدر لكل مجموعة دفعة واحدة. */
export function groupDeserved(
  list: Deserved[],
): { type: string; ref: AchievementRef; items: Deserved[] }[] {
  const groups = new Map<string, { type: string; ref: AchievementRef; items: Deserved[] }>();
  for (const d of list) {
    const k = `${d.type}:${JSON.stringify(d.ref)}`;
    const g = groups.get(k) ?? { type: d.type, ref: d.ref, items: [] };
    g.items.push(d);
    groups.set(k, g);
  }
  return [...groups.values()];
}

/** ترتيب الحفل والطباعة: الحلقة ثم اسم الطالب (الفكرة 6). */
export function ceremonyOrder<T extends Pick<CertDetail, "halaqa_name" | "student_name">>(
  list: T[],
): T[] {
  return [...list].sort(
    (a, b) =>
      (a.halaqa_name ?? "").localeCompare(b.halaqa_name ?? "", "ar") ||
      a.student_name.localeCompare(b.student_name, "ar"),
  );
}
