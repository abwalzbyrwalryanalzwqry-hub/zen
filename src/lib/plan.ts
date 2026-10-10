import { supabase } from "@/integrations/supabase/client";
import { rpc } from "@/integrations/supabase/rpc";
import { findSurah } from "./quran-meta";
import type { ReviewCard } from "./zen-lms";

/**
 * خطة الحفظ الأسبوعية: تُبنى آلياً من بطاقات SM-2 (ما استحقّ مراجعته وما ضعف) ومن مقطع جديد
 * يختاره الطالب، ولا تُطبَّق إلا بعد اعتماد المعلّم. العناصر نطاقات آيات، لا نصّ فيها.
 */

export type PlanItem = {
  day: number; // 1..7 من بداية الأسبوع
  kind: "new" | "review";
  surah_name: string;
  from_ayah: number;
  to_ayah: number;
};

export type PlanStatus = "proposed" | "approved" | "rejected" | "superseded";

export type MemorizationPlan = {
  id: string;
  student_id: string;
  proposed_by: string | null;
  teacher_id: string | null;
  status: PlanStatus;
  week_start: string;
  items: PlanItem[];
  rationale: string | null;
  teacher_note: string | null;
  decided_at: string | null;
  created_at: string;
};

export const PLAN_STATUS_LABEL: Record<PlanStatus, string> = {
  proposed: "بانتظار اعتماد المعلّم",
  approved: "معتمدة",
  rejected: "لم تُعتمد",
  superseded: "استُبدلت",
};

export const DAY_NAMES = [
  "",
  "اليوم 1",
  "اليوم 2",
  "اليوم 3",
  "اليوم 4",
  "اليوم 5",
  "اليوم 6",
  "اليوم 7",
];

export type DraftOptions = {
  today: string; // YYYY-MM-DD
  /** المقطع الجديد إن أراد الطالب حفظ جديد هذا الأسبوع. */
  newPortion?: { surah_name: string; from_ayah: number; to_ayah: number } | null;
  /** أيام الحفظ الجديد (الباقي مراجعة وتثبيت). */
  newDays?: number;
  reviewsPerDay?: number;
};

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  // حساب أيام صرف بـ UTC على يوم مجرّد (T00:00:00Z) — لا إزاحة منطقة.
  // eslint-disable-next-line no-restricted-syntax
  return d.toISOString().slice(0, 10);
}

/** أولوية المراجعة: الأقدم استحقاقاً، ثم الأكثر تعثّراً، ثم الأصعب (ease أقل). */
export function reviewPriority(cards: ReviewCard[]): ReviewCard[] {
  return [...cards].sort(
    (a, b) =>
      a.due_date.localeCompare(b.due_date) ||
      b.lapses - a.lapses ||
      Number(a.ease) - Number(b.ease),
  );
}

/** يوزّع مقطعاً على n أيام بأقسام متقاربة. */
export function splitRange(from: number, to: number, parts: number): [number, number][] {
  const total = to - from + 1;
  const n = Math.max(1, Math.min(parts, total));
  const out: [number, number][] = [];
  let start = from;
  for (let i = 0; i < n; i++) {
    const size = Math.floor(total / n) + (i < total % n ? 1 : 0);
    out.push([start, start + size - 1]);
    start += size;
  }
  return out;
}

export function buildPlanDraft(cards: ReviewCard[], opts: DraftOptions): PlanItem[] {
  const items: PlanItem[] = [];
  const perDay = opts.reviewsPerDay ?? 2;
  const weekEnd = addDays(opts.today, 6);
  // كل بطاقة تستحق خلال الأسبوع تُوضع في يوم استحقاقها (أو اليوم الأول إن فات)، بحدّ يومي.
  const due = reviewPriority(cards).filter((c) => c.due_date <= weekEnd);
  const load = new Array(8).fill(0);
  for (const c of due) {
    const target =
      c.due_date <= opts.today
        ? 1
        : Math.round((Date.parse(c.due_date) - Date.parse(opts.today)) / 86_400_000) + 1;
    let day = Math.max(1, Math.min(7, target));
    while (day <= 7 && load[day] >= perDay) day++;
    if (day > 7) continue;
    load[day]++;
    items.push({
      day,
      kind: "review",
      surah_name: c.surah_name,
      from_ayah: c.from_ayah,
      to_ayah: c.to_ayah,
    });
  }
  const np = opts.newPortion;
  const meta = np ? findSurah(np.surah_name) : undefined;
  if (np && meta) {
    const from = Math.max(1, Math.min(np.from_ayah, meta.ayahs));
    const to = Math.max(from, Math.min(np.to_ayah, meta.ayahs));
    const days = Math.max(1, Math.min(opts.newDays ?? 5, 7));
    splitRange(from, to, days).forEach(([a, b], i) =>
      items.push({ day: i + 1, kind: "new", surah_name: meta.name, from_ayah: a, to_ayah: b }),
    );
    // يوم للتثبيت: مراجعة المقطع الجديد كاملاً بعد آخر أيام الحفظ.
    const fix = Math.min(7, Math.min(days, to - from + 1) + 1);
    items.push({ day: fix, kind: "review", surah_name: meta.name, from_ayah: from, to_ayah: to });
  }
  return items
    .sort((a, b) => a.day - b.day || (a.kind === b.kind ? 0 : a.kind === "new" ? -1 : 1))
    .slice(0, 40);
}

/** تعليل آلي مختصر يُعرض حين لا يتوفّر المساعد. */
export function ruleRationale(cards: ReviewCard[], items: PlanItem[], today: string): string {
  const overdue = cards.filter((c) => c.due_date < today).length;
  const weak = cards.filter((c) => c.lapses > 0 || Number(c.ease) < 2.3).length;
  const reviews = items.filter((i) => i.kind === "review").length;
  const news = items.filter((i) => i.kind === "new");
  const parts = [`${reviews} مراجعة موزّعة على الأسبوع حسب مواعيد التكرار المتباعد.`];
  if (overdue > 0) parts.push(`${overdue} مقطعاً فات موعد مراجعته فقُدّم في أول الأسبوع.`);
  if (weak > 0) parts.push(`${weak} مقطعاً تعثّر فيه سابقاً فله أولوية.`);
  if (news.length > 0) parts.push(`حفظ جديد على ${news.length} أيام ثم يوم تثبيت.`);
  return parts.join(" ");
}

export function itemLabel(i: PlanItem): string {
  return `${i.surah_name} ${i.from_ayah === i.to_ayah ? i.from_ayah : `${i.from_ayah}–${i.to_ayah}`}`;
}

/** رقم يوم الخطة لتاريخ ما (1..7)، أو null خارج أسبوعها. */
export function planDayFor(plan: Pick<MemorizationPlan, "week_start">, day: string): number | null {
  const n =
    Math.round(
      (Date.parse(`${day}T00:00:00Z`) - Date.parse(`${plan.week_start}T00:00:00Z`)) / 86_400_000,
    ) + 1;
  return n >= 1 && n <= 7 ? n : null;
}

// ─────────── قاعدة البيانات ───────────

export async function listPlans(studentId: string, limit = 5): Promise<MemorizationPlan[]> {
  const { data } = await supabase
    .from("memorization_plans")
    .select("*")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((r) => ({
    ...r,
    items: r.items as PlanItem[],
    status: r.status as PlanStatus,
  }));
}

const PLAN_ERRORS: Record<string, string> = {
  NOT_YOUR_STUDENT: "هذه الخطة ليست لطالب من طلابك.",
  INVALID_PLAN: "في الخطة نطاق غير صالح.",
  PLAN_NOT_PENDING: "حُسمت هذه الخطة من قبل.",
  AUTH_REQUIRED: "سجّل الدخول أولاً.",
};

export function planError(message: string): string {
  const code = Object.keys(PLAN_ERRORS).find((k) => message.includes(k));
  return code ? PLAN_ERRORS[code] : "تعذّرت العملية.";
}

export async function proposePlan(
  studentId: string,
  items: PlanItem[],
  rationale: string,
  weekStart: string,
) {
  const { data, error } = await rpc("propose_memorization_plan", {
    _student: studentId,
    _items: items,
    _rationale: rationale,
    _week_start: weekStart,
  });
  if (error) throw new Error(planError(error.message));
  return data;
}

export async function decidePlan(
  planId: string,
  approve: boolean,
  note: string,
  items?: PlanItem[],
) {
  const { error } = await rpc("decide_memorization_plan", {
    _plan: planId,
    _approve: approve,
    _note: note,
    _items: items,
  });
  if (error) throw new Error(planError(error.message));
}
