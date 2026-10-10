import { beforeEach, describe, expect, it, vi } from "vitest";

// عميل Supabase وهمي يسجّل الطلبات، حتى نتحقق من شكل المزامنة دون شبكة.
const calls: { table: string; op: string; payload?: unknown; opts?: unknown }[] = [];
vi.mock("@/integrations/supabase/client", () => {
  const builder = (table: string) => {
    const b: Record<string, unknown> = {};
    const chain = () => b;
    Object.assign(b, {
      select: chain,
      eq: chain,
      gte: chain,
      lte: chain,
      order: chain,
      maybeSingle: async () => ({ data: null, error: null }),
      single: async () => ({
        data: {
          day: "2026-09-22",
          prayers: { fajr: "on_time" },
          updated_at: "2026-09-22T10:00:00Z",
        },
        error: null,
      }),
      upsert: (payload: unknown, opts: unknown) => {
        calls.push({ table, op: "upsert", payload, opts });
        return b;
      },
      then: (r: (v: { data: unknown[]; error: null }) => unknown) => r({ data: [], error: null }),
    });
    return b;
  };
  return { supabase: { from: (t: string) => builder(t) } };
});

import {
  emptyState,
  loadLocal,
  mergeRemote,
  pushDay,
  rowToDay,
  saveLocal,
  type LocalState,
} from "./storage";
import { mergeQuranActivity } from "./quran";
import { emptyDay, type Habit } from "./types";
import { setPrayer } from "./logic";

// localStorage بسيط في الذاكرة لبيئة node.
const mem = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  },
  configurable: true,
});

const UID = "00000000-0000-0000-0000-000000000001";

beforeEach(() => {
  mem.clear();
  calls.length = 0;
});

const habit = (id: string, title = id): Habit => ({
  id,
  title,
  preset_key: null,
  days: null,
  position: 0,
  paused: false,
  archived_at: null,
  created_at: "2026-09-01T00:00:00Z",
});

describe("التخزين المحلي", () => {
  it("يحفظ ويقرأ، ويعود لحالة فارغة إن تلف المخزون", () => {
    const s = emptyState();
    s.days["2026-09-22"] = setPrayer(emptyDay("2026-09-22"), "fajr", "on_time");
    saveLocal(UID, s);
    expect(loadLocal(UID).days["2026-09-22"].prayers.fajr).toBe("on_time");
    mem.set(`zen.muhasaba.v1.${UID}`, "{not json");
    expect(loadLocal(UID)).toEqual(emptyState());
  });

  it("يحتفظ بآخر 120 يوماً فقط، ولا يحذف يوماً معلّقاً لم يُرفع", () => {
    const s = emptyState();
    for (let i = 0; i < 130; i++) {
      const d = new Date(2026, 0, 1 + i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      s.days[key] = emptyDay(key);
    }
    s.pending.days = ["2026-01-01"];
    saveLocal(UID, s);
    const back = loadLocal(UID);
    expect(Object.keys(back.days).length).toBe(121);
    expect(back.days["2026-01-01"]).toBeDefined();
    expect(back.days["2026-01-02"]).toBeUndefined();
  });
});

describe("الدمج مع السحابة (مزامنة الأجهزة)", () => {
  const base = (): LocalState => {
    const s = emptyState();
    s.days["2026-09-21"] = setPrayer(emptyDay("2026-09-21"), "fajr", "late");
    s.days["2026-09-22"] = setPrayer(emptyDay("2026-09-22"), "fajr", "on_time");
    s.habits = [habit("a"), habit("b", "محلي")];
    return s;
  };

  it("نسخة السحابة تغلب ما لم يكن هناك تعديل محلي معلّق", () => {
    const local = base();
    const remoteDay = setPrayer(emptyDay("2026-09-21"), "fajr", "on_time");
    const next = mergeRemote(local, {
      settings: null,
      habits: [habit("a", "من جهاز آخر")],
      days: [remoteDay],
    });
    expect(next.days["2026-09-21"].prayers.fajr).toBe("on_time");
    expect(next.habits.map((h) => h.title)).toEqual(["من جهاز آخر"]);
  });

  it("التعديل المحلي المعلّق يغلب (آخر ما فعله المستخدم هنا)", () => {
    const local = base();
    local.pending.days = ["2026-09-22"];
    local.pending.habits = ["b"];
    local.pending.settings = true;
    local.settings.reminder_enabled = true;
    const remoteDay = setPrayer(emptyDay("2026-09-22"), "fajr", "missed");
    const next = mergeRemote(local, {
      settings: { ...local.settings, reminder_enabled: false },
      habits: [habit("a")],
      days: [remoteDay],
    });
    expect(next.days["2026-09-22"].prayers.fajr).toBe("on_time");
    expect(next.habits.map((h) => h.id).sort()).toEqual(["a", "b"]);
    expect(next.settings.reminder_enabled).toBe(true);
  });

  it("فشل جزء من السحابة (null) لا يمسح البيانات المحلية", () => {
    const local = base();
    const next = mergeRemote(local, { settings: null, habits: null, days: null });
    expect(next.days).toEqual(local.days);
    expect(next.habits).toEqual(local.habits);
  });
});

describe("الرفع", () => {
  it("يرفع اليوم بـ upsert على (user_id, day) فلا يتكرر اليوم أبداً", async () => {
    const d = setPrayer(emptyDay("2026-09-22"), "fajr", "on_time");
    const saved = await pushDay(UID, d);
    expect(calls[0]).toMatchObject({
      table: "muhasaba_days",
      op: "upsert",
      opts: { onConflict: "user_id,day" },
    });
    expect((calls[0].payload as { user_id: string }).user_id).toBe(UID);
    // لا يُرسل updated_at من العميل؛ الخادم هو من يضبطه.
    expect(calls[0].payload).not.toHaveProperty("updated_at");
    expect(saved.prayers.fajr).toBe("on_time");
  });

  it("rowToDay يملأ القيم الناقصة بأمان", () => {
    const d = rowToDay({ day: "2026-09-22" });
    expect(d).toMatchObject({
      prayers: {},
      habits_done: [],
      focus: [],
      mood: null,
      goal_text: null,
    });
  });
});

describe("علاقتي بالقرآن — من السجلات القائمة", () => {
  it("يصنّف الحفظ والمراجعة والتسميع من مصادر التطبيق", () => {
    const q = mergeQuranActivity({
      progress: [
        { created_at: "2026-09-22T08:00:00", memorization_type: "new" },
        { created_at: "2026-09-21T08:00:00", memorization_type: "revision" },
      ],
      sessions: [
        { created_at: "2026-09-22T09:00:00", session_date: "2026-09-22", kind: "memorize" },
      ],
      mushaf: [
        { session_date: "2026-09-20", created_at: "2026-09-20T09:00:00", kind: "consolidate" },
      ],
      cards: [{ last_reviewed_at: "2026-09-19T12:00:00" }, { last_reviewed_at: null }],
      exams: [{ created_at: "2026-09-18T12:00:00" }],
    });
    expect(q["2026-09-22"]).toEqual({ memorize: true, review: false, recite: true });
    expect(q["2026-09-21"]).toEqual({ memorize: false, review: true, recite: false });
    expect(q["2026-09-20"].review).toBe(true);
    expect(q["2026-09-19"].review).toBe(true);
    expect(q["2026-09-18"].review).toBe(true);
  });

  it("تسميع مراجعة يُحتسب مراجعة وتسميعاً", () => {
    const q = mergeQuranActivity({
      progress: [],
      sessions: [{ created_at: "2026-09-22T09:00:00", session_date: "2026-09-22", kind: "review" }],
      mushaf: [],
      cards: [],
      exams: [],
    });
    expect(q["2026-09-22"]).toEqual({ memorize: false, review: true, recite: true });
  });
});
