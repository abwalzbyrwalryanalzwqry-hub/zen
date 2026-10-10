/**
 * تخزين «محاسبتي»: محلي أولاً ثم مزامنة آمنة مع Supabase.
 *
 *  - كل نقرة تُحفظ في localStorage فوراً (واجهة متفائلة، وتعمل بلا اتصال).
 *  - ما لم يُرفع بعد يوضع في قائمة «معلّق» ويُرفع عند عودة الاتصال.
 *  - عند الدمج مع السحابة: التعديل المحلي المعلّق يغلب (هو آخر ما فعله المستخدم
 *    على هذا الجهاز)، وإلا فنسخة السحابة هي المرجع — وبها تتزامن الأجهزة.
 *  - الصف فريد لكل (مستخدم، يوم) في قاعدة البيانات، فلا تتكرر الأيام أبداً.
 */

import { supabase } from "@/integrations/supabase/client";
import {
  DEFAULT_SETTINGS,
  emptyDay,
  type Habit,
  type MuhasabaDay,
  type MuhasabaSettings,
} from "./types";

const db = supabase;

export type LocalState = {
  settings: MuhasabaSettings;
  habits: Habit[];
  days: Record<string, MuhasabaDay>;
  pending: { days: string[]; habits: string[]; settings: boolean };
};

const KEEP_DAYS = 120;
const key = (uid: string) => `zen.muhasaba.v1.${uid}`;

export function emptyState(): LocalState {
  return {
    settings: { ...DEFAULT_SETTINGS },
    habits: [],
    days: {},
    pending: { days: [], habits: [], settings: false },
  };
}

export function loadLocal(uid: string): LocalState {
  if (typeof localStorage === "undefined") return emptyState();
  try {
    const raw = localStorage.getItem(key(uid));
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<LocalState>;
    const base = emptyState();
    return {
      settings: { ...base.settings, ...(parsed.settings ?? {}) },
      habits: Array.isArray(parsed.habits) ? parsed.habits : [],
      days: parsed.days && typeof parsed.days === "object" ? parsed.days : {},
      pending: { ...base.pending, ...(parsed.pending ?? {}) },
    };
  } catch {
    return emptyState();
  }
}

export function saveLocal(uid: string, s: LocalState): void {
  if (typeof localStorage === "undefined") return;
  // نُبقي آخر 120 يوماً فقط، ولا نحذف يوماً معلّقاً لم يُرفع.
  const keys = Object.keys(s.days).sort();
  const drop = keys.slice(0, Math.max(0, keys.length - KEEP_DAYS));
  const days = { ...s.days };
  for (const d of drop) if (!s.pending.days.includes(d)) delete days[d];
  try {
    localStorage.setItem(key(uid), JSON.stringify({ ...s, days }));
  } catch {
    // المساحة ممتلئة: الحفظ السحابي يبقى يعمل.
  }
}

export function clearLocal(uid: string): void {
  if (typeof localStorage !== "undefined") localStorage.removeItem(key(uid));
}

// ─────────────────────── تحويل الصفوف ───────────────────────

type DayRow = MuhasabaDay & { user_id?: string };

export function rowToDay(r: Partial<DayRow> & { day: string }): MuhasabaDay {
  const base = emptyDay(r.day);
  return {
    day: r.day,
    prayers: (r.prayers as MuhasabaDay["prayers"]) ?? base.prayers,
    habits_done: r.habits_done ?? [],
    quran_self: (r.quran_self as MuhasabaDay["quran_self"]) ?? {},
    mood: r.mood ?? null,
    focus: r.focus ?? [],
    note: r.note ?? null,
    goal_key: r.goal_key ?? null,
    goal_text: r.goal_text ?? null,
    goal_result: r.goal_result ?? null,
    closed_at: r.closed_at ?? null,
    updated_at: r.updated_at ?? base.updated_at,
  };
}

function dayToRow(uid: string, d: MuhasabaDay) {
  return {
    user_id: uid,
    day: d.day,
    prayers: d.prayers,
    habits_done: d.habits_done,
    quran_self: d.quran_self,
    mood: d.mood,
    focus: d.focus,
    note: d.note,
    goal_key: d.goal_key,
    goal_text: d.goal_text,
    goal_result: d.goal_result,
    closed_at: d.closed_at,
  };
}

function rowToHabit(r: Record<string, unknown>): Habit {
  return {
    id: String(r.id),
    title: String(r.title ?? ""),
    preset_key: (r.preset_key as string | null) ?? null,
    days: (r.days as number[] | null) ?? null,
    position: Number(r.position ?? 0),
    paused: !!r.paused,
    archived_at: (r.archived_at as string | null) ?? null,
    created_at: String(r.created_at ?? new Date().toISOString()),
  };
}

// ─────────────────────── الدمج (خالص ومختبَر) ───────────────────────

/** يدمج نسخة السحابة مع المحلية: المعلّق محلياً يغلب، وإلا فالسحابة. */
export function mergeRemote(
  local: LocalState,
  remote: {
    settings: MuhasabaSettings | null;
    habits: Habit[] | null;
    days: MuhasabaDay[] | null;
  },
): LocalState {
  const next: LocalState = { ...local, days: { ...local.days } };
  if (remote.settings && !local.pending.settings) next.settings = remote.settings;
  if (remote.habits) {
    const pendingIds = new Set(local.pending.habits);
    const localPending = local.habits.filter((h) => pendingIds.has(h.id));
    next.habits = [...remote.habits.filter((h) => !pendingIds.has(h.id)), ...localPending];
  }
  if (remote.days) {
    const pendingDays = new Set(local.pending.days);
    for (const d of remote.days) {
      if (pendingDays.has(d.day)) continue;
      next.days[d.day] = d;
    }
  }
  return next;
}

// ─────────────────────── السحابة ───────────────────────

export async function pullRemote(uid: string, from: string, to: string) {
  const [s, h, d] = await Promise.all([
    db.from("muhasaba_settings").select("*").eq("user_id", uid).maybeSingle(),
    db.from("muhasaba_habits").select("*").eq("user_id", uid).order("position"),
    db
      .from("muhasaba_days")
      .select("*")
      .eq("user_id", uid)
      .gte("day", from)
      .lte("day", to)
      .order("day"),
  ]);
  if (s.error && h.error && d.error) throw new Error(d.error.message);
  const settings: MuhasabaSettings | null = s.data
    ? {
        onboarded_at: s.data.onboarded_at ?? null,
        track_prayers: s.data.track_prayers ?? true,
        track_quran: s.data.track_quran ?? true,
        reminder_enabled: !!s.data.reminder_enabled,
        reminder_time: String(s.data.reminder_time ?? "21:30").slice(0, 5),
      }
    : null;
  return {
    settings,
    habits: h.error ? null : ((h.data ?? []) as Record<string, unknown>[]).map(rowToHabit),
    days: d.error ? null : ((d.data ?? []) as DayRow[]).map(rowToDay),
  };
}

export async function pushDay(uid: string, d: MuhasabaDay): Promise<MuhasabaDay> {
  const { data, error } = await db
    .from("muhasaba_days")
    .upsert(dayToRow(uid, d), { onConflict: "user_id,day" })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return rowToDay(data as DayRow);
}

export async function pushSettings(uid: string, s: MuhasabaSettings): Promise<void> {
  const { error } = await db
    .from("muhasaba_settings")
    .upsert({ user_id: uid, ...s }, { onConflict: "user_id" });
  if (error) throw new Error(error.message);
}

export async function pushHabit(uid: string, h: Habit): Promise<void> {
  const { error } = await db.from("muhasaba_habits").upsert(
    {
      id: h.id,
      user_id: uid,
      title: h.title,
      preset_key: h.preset_key,
      days: h.days,
      position: h.position,
      paused: h.paused,
      archived_at: h.archived_at,
    },
    { onConflict: "id" },
  );
  if (error) {
    // عادة جاهزة أُنشئت من جهاز آخر في الوقت نفسه: لا نكرّرها.
    if (String(error.code) === "23505") return;
    throw new Error(error.message);
  }
}

// ─────────────────────── هدف الأسبوع ───────────────────────

export async function loadWeekGoal(uid: string, weekStart: string) {
  const { data } = await db
    .from("muhasaba_week_goals")
    .select("goal_key, goal_text")
    .eq("user_id", uid)
    .eq("week_start", weekStart)
    .maybeSingle();
  return (data ?? null) as { goal_key: string | null; goal_text: string } | null;
}

export async function saveWeekGoal(
  uid: string,
  weekStart: string,
  goal: { key: string | null; text: string },
): Promise<void> {
  const text = goal.text.trim().slice(0, 120);
  if (!text) {
    await db.from("muhasaba_week_goals").delete().eq("user_id", uid).eq("week_start", weekStart);
    return;
  }
  const { error } = await db
    .from("muhasaba_week_goals")
    .upsert(
      { user_id: uid, week_start: weekStart, goal_key: goal.key, goal_text: text },
      { onConflict: "user_id,week_start" },
    );
  if (error) throw new Error(error.message);
}

export function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    // معرّف UUID v4 احتياطي للمتصفحات القديمة.
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
  }
}
