import { describe, expect, it } from "vitest";
import {
  activeHabits,
  careDays,
  closeDay,
  dailyMessage,
  daySummary,
  dayState,
  growthStage,
  habitsForDay,
  hasEntry,
  isScheduled,
  moveHabit,
  periodStats,
  quranDone,
  quranItems,
  rateGoal,
  reminderDue,
  reopenDay,
  setGoal,
  setMood,
  setNote,
  setPrayer,
  suggestedPledge,
  toggleFocus,
  toggleHabit,
  toggleQuranSelf,
  trend,
  trendText,
  weeklyReview,
  welcomeState,
  yesterdayPledge,
} from "./logic";
import { addDays, daysBetween, hijriDate, weekStart, weekday } from "./dates";
import {
  CLOSING_DUAS,
  DAILY_MESSAGES,
  FOCUS_OPTIONS,
  GOAL_RESULT_ECHO,
  MOOD_ECHO,
  emptyDay,
  type Habit,
  type MuhasabaDay,
} from "./types";
import { REMINDER_MESSAGES } from "./logic";

const REMINDER_TEXTS_FOR_TEST = REMINDER_MESSAGES.flatMap((m) => [m.title, m.body]);

const NOW = new Date("2026-09-22T18:00:00Z");

function habit(p: Partial<Habit> & { id: string }): Habit {
  return {
    title: p.id,
    preset_key: null,
    days: null,
    position: 0,
    paused: false,
    archived_at: null,
    created_at: "2026-01-01T00:00:00Z",
    ...p,
  };
}

function day(d: string, patch: Partial<MuhasabaDay> = {}): MuhasabaDay {
  return { ...emptyDay(d), ...patch };
}

describe("الصلوات", () => {
  it("يسجّل صلاة بنقرة ويغيّر حالتها ويلغيها بالنقر على الحالة نفسها", () => {
    let d = day("2026-09-22");
    d = setPrayer(d, "fajr", "on_time", NOW);
    expect(d.prayers.fajr).toBe("on_time");
    d = setPrayer(d, "fajr", "late", NOW);
    expect(d.prayers.fajr).toBe("late");
    d = setPrayer(d, "fajr", "late", NOW);
    expect(d.prayers.fajr).toBeUndefined();
    expect(d.updated_at).toBe(NOW.toISOString());
  });

  it("لا يفترض أن صلاة فاتت لأنها لم تُسجَّل", () => {
    const d = setPrayer(day("2026-09-22"), "dhuhr", "on_time");
    const s = daySummary(d, [], undefined);
    expect(s.prayers).toEqual({ logged: 1, onTime: 1, total: 5 });
    expect(d.prayers.fajr).toBeUndefined();
    // غير المسجّلة لا تُحسب «متعثّرة» في مراجعة الأسبوع.
    const st = periodStats({
      from: "2026-09-22",
      to: "2026-09-22",
      days: [d],
      habits: [],
      quran: {},
    });
    expect(Object.values(st.prayerStruggle).every((n) => n === 0)).toBe(true);
  });

  it("لا يغيّر الكائن الأصلي (تحديث متفائل آمن)", () => {
    const d = day("2026-09-22");
    setPrayer(d, "asr", "missed");
    expect(d.prayers).toEqual({});
  });
});

describe("العادات", () => {
  const sat = "2026-09-19"; // السبت
  const mon = "2026-09-21"; // الإثنين

  it("يسجّل عادة ويلغيها", () => {
    let d = toggleHabit(day(mon), "h1");
    expect(d.habits_done).toEqual(["h1"]);
    d = toggleHabit(d, "h1");
    expect(d.habits_done).toEqual([]);
  });

  it("يجدول العادة في أيام محدّدة فقط", () => {
    expect(weekday(mon)).toBe(1);
    const h = habit({ id: "fast", days: [1, 4] });
    expect(isScheduled(h, mon)).toBe(true);
    expect(isScheduled(h, sat)).toBe(false);
  });

  it("لا تظهر العادة الموقوفة ولا المحذوفة ولا التي أُنشئت بعد اليوم", () => {
    const list = [
      habit({ id: "a", position: 1 }),
      habit({ id: "b", paused: true }),
      habit({ id: "c", archived_at: "2026-09-20T10:00:00Z" }),
      habit({ id: "d", created_at: "2026-09-25T00:00:00Z" }),
      habit({ id: "e", position: 0 }),
    ];
    expect(habitsForDay(list, mon).map((h) => h.id)).toEqual(["e", "a"]);
    // المحذوفة تبقى في السجل القديم قبل حذفها.
    expect(isScheduled(list[2], "2026-09-19")).toBe(true);
  });

  it("يعيد الترتيب لأعلى ولأسفل ولا يخرج عن الحدود", () => {
    const list = [
      habit({ id: "a", position: 0 }),
      habit({ id: "b", position: 1 }),
      habit({ id: "c", position: 2 }),
    ];
    expect(moveHabit(list, "c", -1).map((h) => h.id)).toEqual(["a", "c", "b"]);
    expect(moveHabit(list, "a", -1).map((h) => h.id)).toEqual(["a", "b", "c"]);
    expect(moveHabit(list, "a", 1).map((h) => [h.id, h.position])).toEqual([
      ["b", 0],
      ["a", 1],
      ["c", 2],
    ]);
  });

  it("activeHabits يستبعد المحذوف ويرتّب", () => {
    const list = [
      habit({ id: "x", position: 2 }),
      habit({ id: "y", position: 1, archived_at: "2026-01-02" }),
    ];
    expect(activeHabits(list).map((h) => h.id)).toEqual(["x"]);
  });
});

describe("القرآن", () => {
  it("يأخذ ما سجّله التطبيق تلقائياً ولا يطلبه مرة ثانية", () => {
    const items = quranItems({ memorize: true, review: false, recite: true }, day("2026-09-22"));
    expect(items.find((i) => i.key === "memorize")).toMatchObject({ done: true, source: "auto" });
    expect(items.find((i) => i.key === "recite")).toMatchObject({ done: true, source: "auto" });
    expect(items.find((i) => i.key === "review")).toMatchObject({ done: false, source: null });
  });

  it("يسمح بتسجيل ورد التلاوة يدوياً، والتلقائي يغلب", () => {
    let d = toggleQuranSelf(day("2026-09-22"), "wird");
    d = toggleQuranSelf(d, "memorize");
    const items = quranItems({ memorize: true, review: false, recite: false }, d);
    expect(items.find((i) => i.key === "wird")).toMatchObject({ done: true, source: "self" });
    expect(items.find((i) => i.key === "memorize")?.source).toBe("auto");
    expect(quranDone(undefined, d)).toBe(true);
    d = toggleQuranSelf(d, "wird");
    expect(d.quran_self.wird).toBeUndefined();
  });
});

describe("الحال والإصلاح والعهد", () => {
  it("الحال اختيار واحد يُلغى بالنقر مرة ثانية، وله ردّ لطيف", () => {
    let d = setMood(day("2026-09-22"), "tired");
    expect(d.mood).toBe("tired");
    expect(MOOD_ECHO.tired).toContain("غداً فرصة جديدة");
    d = setMood(d, "tired");
    expect(d.mood).toBeNull();
  });

  it("جوانب الإصلاح متعددة والملاحظة الفارغة تُحذف", () => {
    let d = toggleFocus(day("2026-09-22"), "witr");
    d = toggleFocus(d, "sleep");
    expect(d.focus).toEqual(["witr", "sleep"]);
    d = setNote(d, "   ");
    expect(d.note).toBeNull();
    d = setNote(d, "x".repeat(900));
    expect(d.note?.length).toBe(500);
  });

  it("يقترح العهد من أول جانب اختاره", () => {
    const d = toggleFocus(toggleFocus(day("2026-09-22"), "other"), "witr");
    expect(suggestedPledge(d)?.key).toBe("witr");
    expect(suggestedPledge(day("2026-09-22"))).toBeNull();
  });

  it("عهد واحد فقط: التعيين يستبدل، والنص الفارغ يمسح", () => {
    let d = setGoal(day("2026-09-22"), "witr", "غداً سأصلّي الوتر");
    d = setGoal(d, "sleep", "غداً سأنام مبكراً");
    expect(d.goal_text).toBe("غداً سأنام مبكراً");
    expect(d.goal_key).toBe("sleep");
    d = setGoal(d, null, "   ");
    expect(d.goal_text).toBeNull();
  });

  it("تقييم العهد: نعم / جزئياً / لم أوفَّق — بلا لوم", () => {
    let d = setGoal(day("2026-09-21"), "witr", "الوتر");
    d = rateGoal(d, "not_yet");
    expect(d.goal_result).toBe("not_yet");
    expect(GOAL_RESULT_ECHO.not_yet).not.toMatch(/قصّرت|فشل/);
    d = rateGoal(d, "kept");
    expect(d.goal_result).toBe("kept");
    // تغيير نص العهد يسقط تقييمه القديم.
    expect(setGoal(d, "witr", "نص آخر").goal_result).toBeNull();
    // لا تقييم بلا عهد.
    expect(rateGoal(day("2026-09-21"), "kept").goal_result).toBeNull();
  });

  it("يجد عهد الأمس لليوم", () => {
    const y = setGoal(day("2026-09-21"), "witr", "الوتر");
    expect(yesterdayPledge([y], "2026-09-22")?.day).toBe("2026-09-21");
    expect(yesterdayPledge([y], "2026-09-23")).toBeNull();
  });

  it("كل اقتراحات العهد تبدأ بـ«غداً» ما عدا «أخرى»", () => {
    for (const f of FOCUS_OPTIONS) {
      if (f.key === "other") expect(f.pledge).toBe("");
      else expect(f.pledge.startsWith("غداً")).toBe(true);
    }
  });
});

describe("حالات اليوم", () => {
  it("فارغ ← جزئي ← مغلق، ويمكن إعادة فتحه", () => {
    let d = day("2026-09-22");
    expect(dayState(d)).toBe("empty");
    d = toggleHabit(d, "h");
    expect(dayState(d)).toBe("partial");
    d = closeDay(d, NOW);
    expect(dayState(d)).toBe("closed");
    const again = closeDay(d, new Date("2026-09-22T20:00:00Z"));
    expect(again.closed_at).toBe(NOW.toISOString()); // لا يتغيّر وقت الإغلاق الأول
    expect(dayState(reopenDay(d))).toBe("partial");
  });

  it("إغلاق يوم فارغ يُعدّ وقفة", () => {
    expect(hasEntry(closeDay(day("2026-09-22")))).toBe(true);
  });
});

describe("الاستمرارية بلا ضغط", () => {
  const t = "2026-09-22";
  const on = (d: string) => toggleHabit(day(d), "h");

  it("أول مرة / متابع / فاته أمس / عائد", () => {
    expect(welcomeState([], t)).toBe("first");
    expect(welcomeState([on(t)], t)).toBe("active");
    expect(welcomeState([on(addDays(t, -1))], t)).toBe("continuing");
    expect(welcomeState([on(addDays(t, -2))], t)).toBe("missed_yesterday");
    expect(welcomeState([on(addDays(t, -9))], t)).toBe("returning");
    // صفوف فارغة لا تُحسب.
    expect(welcomeState([day(addDays(t, -1))], t)).toBe("first");
  });

  it("«أيام اعتنيت فيها بنفسك» تعدّ الأيام لا التتابع، فلا سلسلة تنكسر", () => {
    const days = [on(t), on(addDays(t, -3)), on(addDays(t, -10)), on(addDays(t, -40))];
    expect(careDays(days, t, 30)).toEqual({ count: 3, total: 30 });
  });

  it("مراحل هادئة 🌱 🌿 🌳", () => {
    expect(growthStage(0).emoji).toBe("🌱");
    expect(growthStage(7).emoji).toBe("🌿");
    expect(growthStage(21).label).toBe("الثبات");
  });
});

describe("الرسائل", () => {
  it("تتبدّل يومياً ولا تتكرر في يومين متتاليين", () => {
    for (let i = 0; i < 40; i++) {
      const a = addDays("2026-01-01", i);
      expect(dailyMessage(a)).not.toBe(dailyMessage(addDays(a, 1)));
    }
    expect(DAILY_MESSAGES.length).toBeGreaterThan(5);
    expect(CLOSING_DUAS.length).toBeGreaterThan(2);
  });

  it("لا نصوص حُكمية ولا نسب دينية في أي نص للمستخدم", () => {
    const all = [
      ...DAILY_MESSAGES,
      ...CLOSING_DUAS,
      ...REMINDER_TEXTS_FOR_TEST,
      ...Object.values(MOOD_ECHO),
    ];
    for (const s of all) {
      expect(s).not.toMatch(/نسبة|درجة إيمان|رضا الله|لقد قصرت|لم تحاسب/);
      expect(s).not.toContain("!");
    }
  });
});

describe("التذكير", () => {
  const s = { reminder_enabled: true, reminder_time: "21:30" };
  const at = (h: number, m: number) => new Date(2026, 8, 22, h, m);

  it("يُطلق بعد الوقت المختار مرة واحدة في اليوم", () => {
    expect(reminderDue(s, at(21, 0), null, "2026-09-22", false)).toBe(false);
    expect(reminderDue(s, at(21, 31), null, "2026-09-22", false)).toBe(true);
    expect(reminderDue(s, at(22, 0), "2026-09-22", "2026-09-22", false)).toBe(false);
  });

  it("لا يُطلق إذا كان معطّلاً أو أغلق المستخدم يومه", () => {
    expect(
      reminderDue({ ...s, reminder_enabled: false }, at(23, 0), null, "2026-09-22", false),
    ).toBe(false);
    expect(reminderDue(s, at(23, 0), null, "2026-09-22", true)).toBe(false);
  });
});

describe("مراجعة الأسبوع", () => {
  const from = "2026-09-12"; // السبت
  const to = "2026-09-18";
  const habits = [
    habit({ id: "witr", title: "الوتر" }),
    habit({ id: "azkar", title: "الأذكار", position: 1 }),
  ];

  function week(start: string, fn: (d: string, i: number) => MuhasabaDay | null) {
    const out: MuhasabaDay[] = [];
    for (let i = 0; i < 7; i++) {
      const r = fn(addDays(start, i), i);
      if (r) out.push(r);
    }
    return out;
  }

  it("يحسب أيام الصلاة الكاملة والقرآن وأكثر العادات وأكثر جوانب الإصلاح", () => {
    const days = week(from, (d, i) => {
      let r = day(d);
      if (i < 3)
        for (const p of ["fajr", "dhuhr", "asr", "maghrib", "isha"] as const)
          r = setPrayer(r, p, "on_time");
      if (i % 2 === 0) r = toggleHabit(r, "witr");
      if (i === 1) r = toggleHabit(r, "azkar");
      if (i >= 4) r = toggleFocus(r, "sleep");
      if (i === 6) r = toggleQuranSelf(r, "wird");
      return r;
    });
    const quran = { [addDays(from, 2)]: { memorize: false, review: true, recite: true } };
    const st = periodStats({ from, to, days, habits, quran });
    expect(st.careDays).toBe(6); // اليوم الرابع بلا تسجيل
    expect(st.prayerFullDays).toBe(3);
    expect(st.onTimeTotal).toBe(15);
    expect(st.quranDays).toBe(2);
    expect(st.reviewDays).toBe(1);
    expect(st.topHabits.map((t) => [t.habit.id, t.count])).toEqual([
      ["witr", 4],
      ["azkar", 1],
    ]);
    expect(st.topFocus[0]).toEqual({ key: "sleep", count: 3 });
    const r = weeklyReview(st, null);
    expect(r.improved).toBeNull(); // لا أسبوع سابق للمقارنة
    expect(r.needsCare?.key).toBe("sleep");
    expect(r.suggestedGoal?.text.startsWith("هذا الأسبوع")).toBe(true);
  });

  it("يقترح العناية بالصلاة الأكثر تأخراً، ويكتشف التحسّن", () => {
    const prevDays = week(addDays(from, -7), (d) => day(d, {}));
    const days = week(from, (d, i) => {
      let r = day(d);
      r = setPrayer(r, "fajr", i < 3 ? "late" : "on_time");
      r = toggleQuranSelf(r, "review");
      return r;
    });
    const prev = periodStats({
      from: addDays(from, -7),
      to: addDays(from, -1),
      days: prevDays,
      habits,
      quran: {},
    });
    const cur = periodStats({ from, to, days, habits, quran: {} });
    const r = weeklyReview(cur, prev);
    expect(r.needsCare?.text).toContain("الفجر");
    expect(r.suggestedGoal?.text).toContain("الفجر");
    expect(r.improved).not.toBeNull();
  });

  it("أسبوع فارغ لا يولّد أحكاماً", () => {
    const st = periodStats({ from, to, days: [], habits, quran: {} });
    const r = weeklyReview(st, null);
    expect(st.careDays).toBe(0);
    expect(r.needsCare).toBeNull();
    expect(r.improved).toBeNull();
  });
});

describe("رحلتي", () => {
  it("اتجاه لطيف دون لوم عند النقص", () => {
    expect(trend(5, 3)).toBe("up");
    expect(trend(3, 5)).toBe("down");
    expect(trend(3, null)).toBe("new");
    expect(trendText("up", 2)).toBe("+2 عن الشهر السابق");
    expect(trendText("down", -2)).toContain("لا بأس");
  });
});

describe("التواريخ", () => {
  it("بداية الأسبوع السبت، والفرق بين الأيام", () => {
    expect(weekStart("2026-09-22")).toBe("2026-09-19");
    expect(weekStart("2026-09-19")).toBe("2026-09-19");
    expect(weekStart("2026-09-18")).toBe("2026-09-12");
    expect(daysBetween("2026-09-01", "2026-10-01")).toBe(30);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("التاريخ الهجري بتقويم أم القرى", () => {
    const h = hijriDate("2026-09-22");
    expect(h).toMatch(/\d/);
    expect(h).toMatch(/1448/);
  });
});
