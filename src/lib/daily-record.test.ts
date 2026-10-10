import { CACHE_MAX, cacheSheet, cachedSheet } from "@/lib/daily-record-cache";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { SURAHS } from "@/lib/quran-meta";
import {
  gradeFromMistakes,
  stepStudentId,
  suggestAmount,
  directionOf,
  inRangePos,
  nextPos,
  rangeDirection,
  canTransition,
  dailyErrorCode,
  daySummary,
  filterStudents,
  finishCheck,
  inEditWindow,
  isWritable,
  nextStudentId,
  normalizeName,
  shiftDay,
  toPageEnd,
  wholeSurah,
  rangeOfLast,
  orderPick,
  pageOf,
  rangePages,
  rangeToSegments,
  scoreToGrade,
  segmentsToRange,
  suggestStart,
  validateRange,
  type DayStudent,
} from "@/lib/daily-record";
import { flushDailyOutbox, queueDaily, readDailyOutbox } from "@/lib/daily-record-api";

const student = (p: Partial<DayStudent> = {}): DayStudent => ({
  student_id: "s1",
  name: "أحمد",
  avatar: null,
  status: null,
  reason: null,
  version: 0,
  note: null,
  evaluation: null,
  memorize: null,
  review: null,
  last_memorize: null,
  last_review: null,
  absences_30d: 0,
  ...p,
});

describe("مدى الآيات الموحَّد", () => {
  it("يتحقق من الاكتمال وحدود السورة والترتيب", () => {
    expect(validateRange({ fromSurah: 67 })).toBe("incomplete");
    expect(validateRange({ fromSurah: 67, fromAyah: 1, toSurah: 67, toAyah: 31 })).toBe(
      "ayahOutOfSurah",
    );
    // 1.14.0: عبر السور في الاتجاهين (من الناس صعوداً)، والآيات داخل السورة تصاعدياً دائماً.
    expect(validateRange({ fromSurah: 68, fromAyah: 1, toSurah: 67, toAyah: 5 })).toBeNull();
    expect(validateRange({ fromSurah: 67, fromAyah: 9, toSurah: 67, toAyah: 3 })).toBe(
      "endBeforeStart",
    );
    expect(validateRange({ fromSurah: 2, fromAyah: 1, toSurah: 70, toAyah: 1 })).toBe("tooLong");
    expect(validateRange({ fromSurah: 114, fromAyah: 1, toSurah: 78, toAyah: 40 })).toBeNull();
    expect(validateRange({ fromSurah: 67, fromAyah: 1, toSurah: 67, toAyah: 30 })).toBeNull();
  });

  it("المدى عبر السور يُقسَّم مقاطع سورة سورة ثم يعود كما كان", () => {
    const r = { fromSurah: 67, fromAyah: 25, toSurah: 69, toAyah: 4 };
    const segs = rangeToSegments(r);
    expect(segs).toEqual([
      { surah_name: "الملك", from_ayah: 25, to_ayah: 30 },
      { surah_name: "القلم", from_ayah: 1, to_ayah: 52 },
      { surah_name: "الحاقة", from_ayah: 1, to_ayah: 4 },
    ]);
    expect(segmentsToRange([...segs].reverse())).toEqual(r);
    expect(rangeToSegments({ fromSurah: 67, fromAyah: 5, toSurah: 67, toAyah: 1 })).toEqual([]);
    expect(segmentsToRange([])).toBeNull();
  });

  it("الصفحات من مصحف المدينة", () => {
    expect(pageOf(1, 1)).toBe(1);
    expect(pageOf(2, 1)).toBe(2);
    expect(pageOf(67, 1)).toBe(562);
    expect(pageOf(114, 6)).toBe(604);
    expect(rangePages({ fromSurah: 67, fromAyah: 1, toSurah: 67, toAyah: 30 })).toBe(3);
  });

  it("البداية المقترحة بعد آخر حفظ، والسورة التالية عند تمامها", () => {
    expect(suggestStart({ surah_name: "الملك", from_ayah: 1, to_ayah: 10 })).toEqual({
      fromSurah: 67,
      fromAyah: 11,
      toSurah: 67,
    });
    expect(suggestStart({ surah_name: "الملك", from_ayah: 20, to_ayah: 30 })).toEqual({
      fromSurah: 68,
      fromAyah: 1,
      toSurah: 68,
    });
    expect(suggestStart(null)).toEqual({});
  });

  it("اختيار المصحف بأي ترتيب للمستين", () => {
    expect(orderPick([68, 3], [67, 20])).toEqual({
      fromSurah: 67,
      fromAyah: 20,
      toSurah: 68,
      toAyah: 3,
    });
  });

  it("أسماء السور وعدد آياتها في الترحيل تطابق quran-meta", () => {
    const sql = readFileSync("supabase/migrations/20261117100000_halaqa_daily_records.sql", "utf8");
    const block = sql.match(/unnest\(ARRAY\[([\s\S]*?)\]\)/)?.[1] ?? "";
    const names = [...block.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(names).toEqual(SURAHS.map((s) => s.name));
    const ayahs = sql
      .match(/SELECT \(ARRAY\[([\s\S]*?)\]\)/)?.[1]
      .match(/\d+/g)
      ?.map(Number);
    expect(ayahs).toEqual(SURAHS.map((s) => s.ayahs));
  });
});

describe("حالة السجل والانتقالات", () => {
  it("open ← completed ← locked، وإعادة الفتح من المكتمل فقط", () => {
    expect(canTransition(null, "open")).toBe(true);
    expect(canTransition("open", "completed")).toBe(true);
    expect(canTransition("open", "locked")).toBe(false);
    expect(canTransition("completed", "open")).toBe(true);
    expect(canTransition("completed", "locked")).toBe(true);
    expect(canTransition("locked", "open")).toBe(false);
  });
  it("الكتابة لمن يملكها وفي السجل المفتوح فقط", () => {
    const rec = (status: "open" | "completed" | "locked") => ({
      id: "r",
      status,
      version: 1,
      notes: null,
      completed_at: null,
      locked_at: null,
      completed_by_name: null,
    });
    expect(isWritable({ can_edit: true, record: rec("open") })).toBe(true);
    expect(isWritable({ can_edit: false, record: rec("open") })).toBe(false);
    expect(isWritable({ can_edit: true, record: rec("locked") })).toBe(false);
    // DR-06: لا سجل بعد ⇒ يُفتح ضمناً عند أول لمسة لمن يحرّره.
    expect(isWritable({ can_edit: true, record: null })).toBe(true);
    expect(isWritable({ can_edit: false, record: null })).toBe(false);
  });
  it("الدرجة 1..5 عكس grade_to_score", () => {
    expect([35, 55, 70, 85, 95].map(scoreToGrade)).toEqual([1, 2, 3, 4, 5]);
    expect(scoreToGrade(null)).toBeNull();
  });
});

describe("الملخص والتنبيهات محسوبة من البيانات", () => {
  const work = (score: number | null) => ({
    segments: [{ surah_name: "الملك", from_ayah: 1, to_ayah: 30 }],
    score,
    error_type: null,
    notes: null,
  });
  const list = [
    student({ student_id: "a", name: "أ", status: "present", memorize: work(95) }),
    student({ student_id: "b", name: "ب", status: "late" }),
    student({ student_id: "c", name: "ج", status: "absent" }),
    student({ student_id: "d", name: "د", status: "excused", evaluation: { behavior: 4 } }),
    student({ student_id: "e", name: "هـ", review: work(null) }),
  ];
  it("ملخص اليوم", () => {
    expect(daySummary(list)).toEqual({
      total: 5,
      present: 1,
      late: 1,
      absent: 1,
      excused: 1,
      unmarked: 1,
      memorized: 1,
      reviewed: 1,
      evaluated: 1,
      pages: 3,
    });
  });
  it("تنبيهات الإنهاء لا تمنع، والمنع لعدم أي حضور فقط", () => {
    const c = finishCheck(list);
    expect(c.blocking).toBeNull();
    expect(c.warnings).toMatchObject([
      { kind: "unmarked", names: ["هـ"] },
      { kind: "presentWithoutWork", names: ["ب"] },
      { kind: "workWithoutGrade", names: ["هـ"] },
    ]);
    expect(c.warnings.every((w) => w.ids.length === w.names.length)).toBe(true);
    expect(finishCheck([student()]).blocking).toBe("noAttendance");
  });
  it("رموز أخطاء الخادم", () => {
    expect(dailyErrorCode({ message: "VERSION_CONFLICT" })).toBe("VERSION_CONFLICT");
    expect(dailyErrorCode(new Error("TypeError: Failed to fetch"))).toBe("NETWORK");
    expect(dailyErrorCode(new Error("x"), false)).toBe("NETWORK");
    expect(dailyErrorCode(new Error("boom"))).toBe("UNKNOWN");
  });
});

describe("صندوق الإرسال بلا اتصال", () => {
  const mem = () => {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    };
  };
  const base = { record: "r", student: "s1", halaqa: "h", date: "2026-10-01" };

  it("يدمج تعديلات الطالب الواحد ويحتفظ بنسخة أول تعديل", () => {
    const s = mem();
    queueDaily({ ...base, version: 2, attendance: { status: "late", reason: null } }, s);
    queueDaily({ ...base, version: 2, entry: { note: "x" } }, s);
    queueDaily({ ...base, version: 5, entry: { evaluation: { overall: 4 } } }, s);
    const all = readDailyOutbox(s);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({
      version: 2,
      attendance: { status: "late" },
      entry: { note: "x", evaluation: { overall: 4 } },
    });
  });

  it("يرسل الحضور ثم الإنجاز بالنسخة الجديدة؛ الشبكة تُبقي، والرفض يُعاد", async () => {
    const s = mem();
    queueDaily(
      {
        ...base,
        version: 1,
        attendance: { status: "present", reason: null },
        entry: { note: "n" },
      },
      s,
    );
    queueDaily({ ...base, student: "s2", version: 0, entry: { note: "m" } }, s);
    queueDaily({ ...base, student: "s3", version: 0, entry: { note: "k" } }, s);
    const calls: string[] = [];
    const r = await flushDailyOutbox(
      (e) => String((e as Error).message) === "offline",
      {
        setDailyAttendance: async (_r, st, _s, _x, v) => {
          calls.push(`att ${st} v${v}`);
          return student({ student_id: st, version: v + 1 });
        },
        saveDailyEntry: async (_r, st, _p, v) => {
          calls.push(`entry ${st} v${v}`);
          if (st === "s2") throw new Error("offline");
          if (st === "s3") throw new Error("VERSION_CONFLICT");
          return student({ student_id: st, version: v + 1 });
        },
      },
      s,
    );
    expect(calls).toEqual(["att s1 v1", "entry s1 v2", "entry s2 v0", "entry s3 v0"]);
    expect(r.sent).toBe(1);
    expect(r.rejected.map((x) => x.item.student)).toEqual(["s3"]);
    expect(readDailyOutbox(s).map((x) => x.student)).toEqual(["s2"]);
  });
});

describe("التصفية والأيام (المرحلة 1)", () => {
  const list = [
    student({ student_id: "a", name: "أحمد", status: null }),
    student({ student_id: "b", name: "بلال", status: "present" }),
    student({
      student_id: "c",
      name: "إسلام",
      status: "late",
      memorize: { segments: [], score: 90, error_type: null, notes: null } as never,
    }),
    student({ student_id: "d", name: "دعاء", status: "excused" }),
  ];
  it("البحث يتجاهل الهمزات والتشكيل", () => {
    expect(normalizeName("أَحْمَد")).toBe(normalizeName("احمد"));
    expect(filterStudents(list, "all", "اسلام").map((s) => s.student_id)).toEqual(["c"]);
  });
  it("رقائق التصفية", () => {
    expect(filterStudents(list, "unmarked").map((s) => s.student_id)).toEqual(["a"]);
    expect(filterStudents(list, "idle").map((s) => s.student_id)).toEqual(["b"]);
    expect(filterStudents(list, "away").map((s) => s.student_id)).toEqual(["d"]);
  });
  it("الطالب التالي في القائمة المعروضة", () => {
    expect(nextStudentId(list, "a")).toBe("b");
    expect(nextStudentId(list, "d")).toBeNull();
    expect(nextStudentId(list, "x")).toBeNull();
  });
  it("الأيام ونافذة التحرير بلا منطقة زمنية", () => {
    expect(shiftDay("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftDay("2026-12-31", 1)).toBe("2027-01-01");
    expect(inEditWindow("2026-10-05", "2026-10-05")).toBe(true);
    expect(inEditWindow("2026-09-21", "2026-10-05")).toBe(true);
    expect(inEditWindow("2026-09-20", "2026-10-05")).toBe(true);
    expect(inEditWindow("2024-01-01", "2026-10-05")).toBe(true);
    expect(inEditWindow("bad", "2026-10-05")).toBe(false);
    expect(inEditWindow("2026-10-06", "2026-10-05")).toBe(false);
  });
  it("صندوق الإرسال: مسح الحضور يُرسل بدالة المسح", async () => {
    const mem = new Map<string, string>();
    const s = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
    };
    queueDaily(
      {
        record: "r",
        student: "s1",
        halaqa: "h",
        date: "2026-10-05",
        version: 3,
        attendance: { status: null, reason: null },
      },
      s,
    );
    const calls: string[] = [];
    const r = await flushDailyOutbox(
      () => false,
      {
        setDailyAttendance: async () => {
          throw new Error("unexpected");
        },
        saveDailyEntry: async () => {
          throw new Error("unexpected");
        },
        clearDailyAttendance: async (_r, st, v) => {
          calls.push(`clear ${st} v${v}`);
          return student({ version: v + 1 });
        },
      },
      s,
    );
    expect(calls).toEqual(["clear s1 v3"]);
    expect(r.sent).toBe(1);
  });
});

describe("اختصارات المدى (المرحلة 2)", () => {
  it("السورة كاملة", () => {
    expect(wholeSurah(67)).toEqual({ fromSurah: 67, fromAyah: 1, toSurah: 67, toAyah: 30 });
    expect(wholeSurah(115)).toBeNull();
  });
  it("إلى آخر الصفحة", () => {
    // البقرة 1–5 في الصفحة 2، والصفحة 3 تبدأ بالآية 6.
    expect(toPageEnd(2, 1)).toEqual({ fromSurah: 2, fromAyah: 1, toSurah: 2, toAyah: 5 });
    // الفاتحة صفحة كاملة، والتالية تبدأ بالبقرة 1 ⇒ النهاية آخر الفاتحة.
    expect(toPageEnd(1, 3)).toEqual({ fromSurah: 1, fromAyah: 3, toSurah: 1, toAyah: 7 });
    // آخر صفحة.
    expect(toPageEnd(114, 1)).toEqual({ fromSurah: 114, fromAyah: 1, toSurah: 114, toAyah: 6 });
    expect(toPageEnd(1, 9)).toBeNull();
  });
  it("مثل آخر تسميع", () => {
    expect(
      rangeOfLast({
        surah_name: "الملك",
        from_ayah: 1,
        to_ayah: 10,
        session_date: "2026-10-01",
      } as never),
    ).toEqual({ fromSurah: 67, fromAyah: 1, toSurah: 67, toAyah: 10 });
    expect(rangeOfLast(null)).toBeNull();
  });
});

describe("الموثوقية (المرحلة 4)", () => {
  const mem = () => {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    };
  };
  const sheet = (date: string) => ({
    halaqa: { id: "h", name: "ح", teacher_name: null },
    date,
    today: date,
    can_edit: true,
    can_lock: false,
    record: null,
    students: [student()],
  });
  it("نسخة الجهاز: آخر CACHE_MAX ورقة، والأحدث يحلّ محلّ القديم لليوم نفسه", () => {
    const s = mem();
    const day = (n: number) => new Date(Date.UTC(2026, 8, n)).toISOString().slice(0, 10);
    const total = CACHE_MAX + 2;
    for (let d = 1; d <= total; d++)
      cacheSheet("h", day(d), sheet(day(d)), s, new Date(2026, 8, d));
    expect(cachedSheet("h", day(1), s)).toBeNull();
    expect(cachedSheet("h", day(2), s)).toBeNull();
    expect(cachedSheet("h", day(3), s)?.date).toBe(day(3));
    expect(cachedSheet("h", day(total), s)?.cached_at).toBeTruthy();
    cacheSheet("h", day(total), { ...sheet(day(total)), students: [] }, s);
    expect(cachedSheet("h", day(total), s)?.students).toEqual([]);
    expect(cachedSheet("x", day(total), s)).toBeNull();
  });
  it("من انتقل لا يُعدّ في «بلا حضور» ولا في الملخص إن لم يكن له أثر", () => {
    const list = [student({ student_id: "a" }), student({ student_id: "b", member: false })];
    expect(finishCheck(list).warnings[0]).toMatchObject({ kind: "unmarked", names: ["أحمد"] });
    expect(daySummary(list).total).toBe(1);
    expect(filterStudents(list, "unmarked")).toHaveLength(1);
  });
});

describe("ملخص اليوم للمشاركة (المرحلة 5)", () => {
  it("الحلقة واليوم والأعداد وسطر لكل طالب، ومن انتقل بلا أثر لا يظهر", async () => {
    const { daySummaryText } = await import("@/lib/daily-record-text");
    const text = daySummaryText(
      {
        halaqa: { id: "h", name: "حلقة الفجر", teacher_name: null },
        date: "2026-10-04",
        today: "2026-10-04",
        can_edit: true,
        can_lock: false,
        record: null,
        students: [
          student({
            student_id: "a",
            status: "present",
            memorize: {
              segments: [{ surah_name: "الملك", from_ayah: 1, to_ayah: 10 }],
              score: 90,
              error_type: null,
              notes: null,
            } as never,
          }),
          student({ student_id: "b", name: "بلال", status: "absent" }),
          student({ student_id: "c", name: "منقول", member: false }),
        ],
      },
      "4 أكتوبر",
    );
    expect(text).toContain("حلقة الفجر");
    expect(text).toContain("4 أكتوبر");
    expect(text).toContain("حاضر 1");
    expect(text).toContain("أحمد: حاضر، حفظ اليوم: الملك 1–10");
    expect(text).toContain("بلال: غائب");
    expect(text).not.toContain("منقول");
  });
});

describe("المدى في الاتجاهين (1.14.0): الحفظ من الناس صعوداً", () => {
  const back = { fromSurah: 114, fromAyah: 1, toSurah: 112, toAyah: 4 };
  it("اتجاه المدى ومقاطعه بترتيبه", () => {
    expect(rangeDirection(back)).toBe("backward");
    expect(rangeDirection({ fromSurah: 1, fromAyah: 1, toSurah: 2, toAyah: 5 })).toBe("forward");
    expect(rangeToSegments(back)).toEqual([
      { surah_name: "الناس", from_ayah: 1, to_ayah: 6 },
      { surah_name: "الفلق", from_ayah: 1, to_ayah: 5 },
      { surah_name: "الإخلاص", from_ayah: 1, to_ayah: 4 },
    ]);
    // جزئي: من منتصف النبإ إلى أول المرسلات.
    expect(rangeToSegments({ fromSurah: 78, fromAyah: 31, toSurah: 77, toAyah: 10 })).toEqual([
      { surah_name: "النبإ", from_ayah: 31, to_ayah: 40 },
      { surah_name: "المرسلات", from_ayah: 1, to_ayah: 10 },
    ]);
  });
  it("المقاطع التنازلية تُقرأ كما سُجّلت، والقديمة بترتيب المصحف", () => {
    expect(segmentsToRange(rangeToSegments(back))).toEqual(back);
    expect(
      segmentsToRange([
        { surah_name: "الملك", from_ayah: 1, to_ayah: 30 },
        { surah_name: "القلم", from_ayah: 1, to_ayah: 5 },
      ]),
    ).toEqual({ fromSurah: 67, fromAyah: 1, toSurah: 68, toAyah: 5 });
  });
  it("الاقتراح والصفحات والتظليل والاختيار من المصحف في الاتجاه نفسه", () => {
    expect(suggestStart({ surah_name: "الناس", from_ayah: 1, to_ayah: 6 }, "backward")).toEqual({
      fromSurah: 113,
      fromAyah: 1,
      toSurah: 113,
    });
    expect(suggestStart(null, "backward")).toEqual({ fromSurah: 114, fromAyah: 1, toSurah: 114 });
    expect(rangePages(back)).toBe(1);
    expect(inRangePos(back, 113, 3)).toBe(true);
    expect(inRangePos(back, 112, 4)).toBe(true);
    expect(inRangePos(back, 111, 1)).toBe(false);
    expect(orderPick([112, 4], [114, 1], "backward")).toEqual(back);
    expect(orderPick([114, 5], [114, 2], "backward")).toEqual({
      fromSurah: 114,
      fromAyah: 2,
      toSurah: 114,
      toAyah: 5,
    });
    expect(nextPos([113, 5], "backward")).toEqual([112, 1]);
    expect(nextPos([113, 5])).toEqual([114, 1]);
    // «إلى آخر الصفحة» لا يقفز إلى السورة التالية في المصحف لمن يحفظ صعوداً.
    expect(toPageEnd(112, 1, "backward")?.toSurah).toBe(112);
    expect(directionOf({ memorize_dir: "backward" }, "memorize")).toBe("backward");
    expect(directionOf({}, "review")).toBe("forward");
  });
});

describe("لوحة الطالب السريعة (1.14.0)", () => {
  it("نهاية مقترحة بمقدار آخر حفظ، لا تتجاوز السورة", () => {
    const last = { surah_name: "الملك", from_ayah: 1, to_ayah: 10 };
    expect(suggestAmount(last, { fromSurah: 67, fromAyah: 11, toSurah: 67 })).toEqual({
      fromSurah: 67,
      fromAyah: 11,
      toSurah: 67,
      toAyah: 20,
    });
    expect(suggestAmount(last, { fromSurah: 67, fromAyah: 25, toSurah: 67 }).toAyah).toBe(30);
    expect(suggestAmount(null, { fromSurah: 67, fromAyah: 11 })).toEqual({
      fromSurah: 67,
      fromAyah: 11,
    });
  });
  it("المستوى من عدد الأخطاء", () => {
    expect([0, 1, 2, 3, 5, 7, 12].map(gradeFromMistakes)).toEqual([5, 4, 4, 3, 2, 1, 1]);
  });
  it("التالي الذكي يتخطّى الغائب والمستأذن", () => {
    const list = [
      student({ student_id: "a" }),
      student({ student_id: "b", status: "absent" }),
      student({ student_id: "c", status: "excused" }),
      student({ student_id: "d", status: "present" }),
    ];
    expect(stepStudentId(list, "a", 1)).toBe("d");
    expect(stepStudentId(list, "d", -1)).toBe("a");
    expect(stepStudentId(list, "a", 1, false)).toBe("b");
    expect(stepStudentId(list, "d", 1)).toBeNull();
    expect(stepStudentId([list[0], list[1]], "a", 1)).toBe("b");
  });
});
