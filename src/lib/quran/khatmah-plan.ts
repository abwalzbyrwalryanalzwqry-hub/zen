// ============================================================
// Zen — الختمة المخطّطة
// ------------------------------------------------------------
// يحدّد المستخدم مدة الختمة (٧ أيام، شهر، …) وصفحة البداية، فيوزّع زِن
// صفحات المصحف المدني (٦٠٤) على الأيام توزيعاً ثابتاً: ورد كل يوم معروف
// مسبقاً، ولا يتغيّر إن قرأ المستخدم جزءاً منه. إن تأخّر، يضاف المتأخّر إلى
// ورد اليوم ويظهر عدد صفحاته؛ وإعادة التوزيع تبدأ خطة جديدة من موضعه الحالي
// بالتاريخ الختامي نفسه.
//
// التقدّم يُسجَّل بطريقتين: زرّ «أتممت ورد اليوم»، وتقليب صفحات المصحف في
// وضع الصفحات (الانتقال من الصفحة التالية مباشرة إلى ما بعدها يعني أنها قُرئت).
//
// المنطق كله دوال نقية تأخذ مفتاح اليوم `YYYY-MM-DD` صراحةً لتُختبر بلا ساعة.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { dayKey, shiftDayKey } from "@/lib/quran/activity";
import { SURAH_META } from "./metadata";
import { JUZ_META } from "./juz-metadata";

export const MUSHAF_PAGES = 604;
export const KHATMAH_PRESETS = [7, 10, 15, 30, 60] as const;
export const MIN_DAYS = 1;
export const MAX_DAYS = 365;

const KEY = "zen.khatmah.v1";
const EVENT = "zen:khatmah";

export interface KhatmahPlan {
  /** يوم البداية بالتوقيت المحلي. */
  startKey: string;
  /** مدة الخطة بالأيام (شاملة يوم البداية). */
  days: number;
  /** أول صفحة في الخطة (١ لختمة من الفاتحة). */
  startPage: number;
  /** آخر صفحة أُتمّت قراءتها؛ `startPage - 1` قبل البدء. */
  reached: number;
  createdAt: number;
}

export interface KhatmahRecord {
  startKey: string;
  endKey: string;
  days: number;
}

export interface KhatmahStore {
  plan: KhatmahPlan | null;
  /** الختمات المكتملة، الأحدث أولاً. */
  completed: KhatmahRecord[];
}

const EMPTY: KhatmahStore = { plan: null, completed: [] };

/* ---------- أدوات ---------- */

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** عدد الأيام من `a` إلى `b` (موجب إن كان `b` بعد `a`). آمن مع التوقيت الصيفي. */
export function daysBetween(a: string, b: string): number {
  const [y1, m1, d1] = a.split("-").map(Number);
  const [y2, m2, d2] = b.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

/* ---------- الإنشاء والتحقق ---------- */

export function createPlan(days: number, startKey: string, startPage = 1, now = 0): KhatmahPlan {
  const page = clamp(Math.trunc(startPage) || 1, 1, MUSHAF_PAGES);
  return {
    startKey,
    days: clamp(Math.trunc(days) || 30, MIN_DAYS, MAX_DAYS),
    startPage: page,
    reached: page - 1,
    createdAt: now,
  };
}

function normalizePlan(raw: unknown): KhatmahPlan | null {
  const p = raw as Partial<KhatmahPlan> | null;
  if (!p || typeof p.startKey !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(p.startKey)) return null;
  const plan = createPlan(
    Number(p.days),
    p.startKey,
    Number(p.startPage),
    Number(p.createdAt) || 0,
  );
  const reached = Number(p.reached);
  if (Number.isFinite(reached))
    plan.reached = clamp(Math.trunc(reached), plan.startPage - 1, MUSHAF_PAGES);
  return plan;
}

export function normalizeStore(raw: unknown): KhatmahStore {
  const s = (raw ?? {}) as Partial<KhatmahStore>;
  return {
    plan: normalizePlan(s.plan),
    completed: Array.isArray(s.completed)
      ? s.completed
          .filter((r) => r && typeof r.startKey === "string" && typeof r.endKey === "string")
          .slice(0, 100)
      : [],
  };
}

/* ---------- الجدول ---------- */

export function totalPages(plan: KhatmahPlan): number {
  return MUSHAF_PAGES - plan.startPage + 1;
}

export function endKey(plan: KhatmahPlan): string {
  return shiftDayKey(plan.startKey, plan.days - 1);
}

/** رقم يوم الخطة (٠ = يوم البداية)، محصور في مدة الخطة. */
export function dayIndex(plan: KhatmahPlan, today: string): number {
  return clamp(daysBetween(plan.startKey, today), 0, plan.days - 1);
}

/** آخر صفحة يجب بلوغها بنهاية اليوم رقم `index` وفق التوزيع الثابت. */
export function scheduledThrough(plan: KhatmahPlan, index: number): number {
  const i = clamp(index, 0, plan.days - 1);
  return plan.startPage - 1 + Math.ceil((totalPages(plan) * (i + 1)) / plan.days);
}

export interface PageSpot {
  page: number;
  surah: number;
  surahName: string;
  juz: number;
}

/**
 * السورة والجزء لصفحة ما. `edge = "start"` يعطي أول سورة في الصفحة (لبداية
 * الورد)، و`"end"` آخر سورة فيها (لنهايته) — الصفحة ٦٠٤ تبدأ بالإخلاص وتنتهي بالناس.
 */
export function pageSpot(page: number, edge: "start" | "end" = "start"): PageSpot {
  const p = clamp(page, 1, MUSHAF_PAGES);
  const onPage = SURAH_META.filter((s) => s.pages.start <= p && s.pages.end >= p);
  const surah = (edge === "start" ? onPage[0] : onPage[onPage.length - 1]) ?? SURAH_META[0];
  let juz = 1;
  for (const j of JUZ_META) if (j.startPage <= p) juz = j.id;
  return { page: p, surah: surah.id, surahName: surah.nameAr, juz };
}

export type KhatmahPhase = "upcoming" | "active" | "overdue" | "finished";

export interface KhatmahStatus {
  phase: KhatmahPhase;
  /** رقم يوم الخطة (١-based) للعرض. */
  day: number;
  daysLeft: number;
  /** ورد اليوم: من الصفحة التالية لما بلغه المستخدم حتى هدف اليوم. */
  portion: { from: PageSpot; to: PageSpot; pages: number } | null;
  /** هل أتمّ المستخدم هدف اليوم. */
  todayDone: boolean;
  /** صفحات متأخّرة من الأيام السابقة (جزء من ورد اليوم). */
  behind: number;
  /** صفحات متقدّمة عن الجدول. */
  ahead: number;
  readPages: number;
  totalPages: number;
  progress: number;
  endKey: string;
  /** المعدّل اليومي المقترح لإنهاء الخطة في موعدها من الموضع الحالي. */
  paceToFinish: number;
}

export function planStatus(plan: KhatmahPlan, today: string): KhatmahStatus {
  const total = totalPages(plan);
  const read = plan.reached - plan.startPage + 1;
  const end = endKey(plan);
  const offset = daysBetween(plan.startKey, today);
  const idx = dayIndex(plan, today);
  const target = scheduledThrough(plan, idx);
  const expectedBeforeToday = idx === 0 ? plan.startPage - 1 : scheduledThrough(plan, idx - 1);
  const remainingPages = MUSHAF_PAGES - plan.reached;
  const remainingDays = Math.max(1, plan.days - idx);

  const phase: KhatmahPhase =
    plan.reached >= MUSHAF_PAGES
      ? "finished"
      : offset < 0
        ? "upcoming"
        : offset >= plan.days
          ? "overdue"
          : "active";

  const todayDone = plan.reached >= target;
  const portion =
    phase === "finished" || phase === "upcoming" || todayDone
      ? null
      : (() => {
          const from = plan.reached + 1;
          const to = phase === "overdue" ? MUSHAF_PAGES : target;
          return { from: pageSpot(from), to: pageSpot(to, "end"), pages: to - from + 1 };
        })();

  return {
    phase,
    day: idx + 1,
    daysLeft: phase === "upcoming" ? plan.days : Math.max(0, plan.days - idx - 1),
    portion,
    todayDone,
    behind: Math.max(0, expectedBeforeToday - plan.reached),
    ahead: Math.max(0, plan.reached - target),
    readPages: read,
    totalPages: total,
    progress: total ? read / total : 0,
    endKey: end,
    paceToFinish: Math.ceil(remainingPages / remainingDays),
  };
}

/* ---------- التقدّم ---------- */

/** يثبّت ما بلغه المستخدم (لا يرجع للخلف إلا صراحةً عبر `setReached`). */
export function markThrough(plan: KhatmahPlan, page: number): KhatmahPlan {
  const p = clamp(Math.trunc(page), plan.startPage - 1, MUSHAF_PAGES);
  return p > plan.reached ? { ...plan, reached: p } : plan;
}

/** تعديل يدوي لموضع المستخدم في الاتجاهين (تصحيح خطأ). */
export function setReached(plan: KhatmahPlan, page: number): KhatmahPlan {
  return { ...plan, reached: clamp(Math.trunc(page), plan.startPage - 1, MUSHAF_PAGES) };
}

/** «أتممت ورد اليوم». */
export function completeToday(plan: KhatmahPlan, today: string): KhatmahPlan {
  const status = planStatus(plan, today);
  if (!status.portion) return plan;
  return markThrough(plan, status.portion.to.page);
}

/**
 * تقليب الصفحات في المصحف: الانتقال من الصفحة التالية مباشرة (`reached + 1`) إلى
 * ما بعدها يعني أنها قُرئت. أي قفزة أخرى تنقّل لا قراءة فتُتجاهل.
 */
export function notePageTurn(plan: KhatmahPlan, from: number, to: number): KhatmahPlan {
  if (to !== from + 1) return plan;
  return notePageRead(plan, from);
}

/**
 * صفحة قُرئت فعلاً (بالتقليب أو بالتمرير في وضع السورة أو بالمكوث على الأخيرة).
 * تتقدّم الختمة فقط إن كانت الصفحة التالية لموضعها، حتى لا يقفز التنقّل الحر بها.
 */
export function notePageRead(plan: KhatmahPlan, page: number): KhatmahPlan {
  if (page === plan.reached + 1) return markThrough(plan, page);
  return plan;
}

/** خطة جديدة من الموضع الحالي تنتهي في التاريخ الختامي نفسه (أو بمدة جديدة). */
export function rebalance(plan: KhatmahPlan, today: string, days?: number, now = 0): KhatmahPlan {
  const remaining = days ?? Math.max(1, daysBetween(today, endKey(plan)) + 1);
  return createPlan(remaining, today, Math.min(MUSHAF_PAGES, plan.reached + 1), now);
}

/* ---------- التخزين ---------- */

export function readKhatmah(): KhatmahStore {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? normalizeStore(JSON.parse(raw)) : EMPTY;
  } catch {
    return EMPTY;
  }
}

function writeKhatmah(store: KhatmahStore) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* التخزين ممتلئ أو معطّل — لا نكسر الواجهة. */
  }
  window.dispatchEvent(new Event(EVENT));
}

/** يطبّق تعديلاً على الخطة ويسجّل الختمة إن اكتملت بهذا التعديل. */
function patchPlan(fn: (plan: KhatmahPlan) => KhatmahPlan) {
  const store = readKhatmah();
  if (!store.plan) return;
  const before = store.plan;
  const after = fn(before);
  if (after === before) return;
  const finishedNow = before.reached < MUSHAF_PAGES && after.reached >= MUSHAF_PAGES;
  writeKhatmah({
    plan: after,
    completed: finishedNow
      ? [{ startKey: before.startKey, endKey: dayKey(), days: before.days }, ...store.completed]
      : store.completed,
  });
}

/** تُستدعى من المصحف عند كل تقليب صفحة. */
export function recordPageTurn(from: number, to: number) {
  patchPlan((p) => notePageTurn(p, from, to));
}

/** يسجّل صفحات مقروءة بالترتيب (قد تكون عدة صفحات عند التمرير السريع). */
export function recordPagesRead(pages: number[]) {
  const sorted = [...new Set(pages)].sort((a, b) => a - b);
  if (!sorted.length) return;
  patchPlan((p) => sorted.reduce((acc, page) => notePageRead(acc, page), p));
}

export function useKhatmah() {
  const [store, setStore] = useState<KhatmahStore>(EMPTY);
  const [today, setToday] = useState(() => dayKey());

  useEffect(() => {
    const sync = () => {
      setStore(readKhatmah());
      setToday(dayKey());
    };
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  const start = useCallback((days: number, startPage = 1) => {
    const s = readKhatmah();
    writeKhatmah({ ...s, plan: createPlan(days, dayKey(), startPage, Date.now()) });
  }, []);
  const cancel = useCallback(() => writeKhatmah({ ...readKhatmah(), plan: null }), []);
  const doneToday = useCallback(() => patchPlan((p) => completeToday(p, dayKey())), []);
  const adjustReached = useCallback((page: number) => patchPlan((p) => setReached(p, page)), []);
  const redistribute = useCallback(
    (days?: number) => patchPlan((p) => rebalance(p, dayKey(), days, Date.now())),
    [],
  );

  const status = store.plan ? planStatus(store.plan, today) : null;
  return {
    plan: store.plan,
    completed: store.completed,
    status,
    today,
    start,
    cancel,
    doneToday,
    adjustReached,
    redistribute,
  };
}
