import { describe, expect, it, vi } from "vitest";
import type { DaySheet, DayStudent } from "@/lib/daily-record";
import {
  applyEntry,
  blankDayFrom,
  flushRecordOutbox,
  isLocalRecord,
  localHead,
  overlayOutbox,
  overlayRecord,
  queueRecord,
  readRecordOutbox,
} from "./daily-offline";
import { flushDailyOutbox, queueDaily, readDailyOutbox } from "./daily-record-api";

const mem = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
};
const st = (id: string, p: Partial<DayStudent> = {}): DayStudent => ({
  student_id: id,
  name: id,
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
const sheet = (
  date: string,
  students: DayStudent[],
  record: DaySheet["record"] = null,
): DaySheet => ({
  halaqa: { id: "h", name: "ح", teacher_name: null },
  date,
  today: date,
  can_edit: true,
  can_lock: false,
  record,
  students,
});
const seg = { surah_name: "الملك", from_ayah: 1, to_ayah: 10 };
const net = (e: unknown) => e instanceof TypeError;

describe("السجل اليومي دون اتصال (1.16.0)", () => {
  it("حمولة اللوحة تُطبَّق على السطر كما يعيده الخادم، والغائب لا يُمسّ", () => {
    const s = st("a", {
      note: "قديمة",
      review: { segments: [seg], score: 9, error_type: null, notes: null },
    });
    const out = applyEntry(s, {
      memorize: {
        segments: [seg],
        grade: 8,
        error_type: "tajweed",
        notes: null,
        direction: "backward",
      },
      evaluation: { behavior: 3 } as never,
    });
    expect(out.memorize).toEqual({ segments: [seg], score: 8, error_type: "tajweed", notes: null });
    expect(out.memorize_dir).toBe("backward");
    expect(out.review?.score).toBe(9);
    expect(out.note).toBe("قديمة");
    expect(applyEntry(out, { memorize: null, note: null }).memorize).toBeNull();
  });

  it("يوم جديد من أحدث نسخة: بلا حضور ولا تسميع، و«آخر حفظ» محدَّث، ومن انتقل لا يظهر", () => {
    const base = sheet("2026-10-04", [
      st("a", {
        status: "absent",
        memorize: { segments: [seg], score: 9, error_type: null, notes: null },
      }),
      st("b", { member: false }),
    ]);
    const d = blankDayFrom({ ...base, cached_at: "t" }, "2026-10-05");
    expect(d.local_day).toBe(true);
    expect(d.record).toBeNull();
    expect(d.students.map((s) => s.student_id)).toEqual(["a"]);
    expect(d.students[0]).toMatchObject({ status: null, memorize: null, absences_30d: 1 });
    expect(d.students[0].last_memorize).toEqual({ ...seg, session_date: "2026-10-04" });
  });

  it("ما في الصندوق يظهر على الورقة، والسجل المحلي رأساً لها", () => {
    const s = mem();
    const local = localHead("h", "2026-10-05").id;
    expect(isLocalRecord(local)).toBe(true);
    queueDaily(
      {
        record: local,
        student: "a",
        halaqa: "h",
        date: "2026-10-05",
        version: 0,
        attendance: { status: "late", reason: "x" },
      },
      s,
    );
    queueDaily(
      {
        record: local,
        student: "a",
        halaqa: "h",
        date: "2026-10-05",
        version: 0,
        entry: { note: "جيد" },
      },
      s,
    );
    const out = overlayOutbox(sheet("2026-10-05", [st("a"), st("b")]), readDailyOutbox(s));
    expect(out.record?.id).toBe(local);
    expect(out.students[0]).toMatchObject({ status: "late", reason: "x", note: "جيد" });
    expect(out.students[1].status).toBeNull();
  });

  it("الإرسال يفتح السجل المحلي مرة ثم يرسل الأسطر والملاحظات والإنهاء بالترتيب", async () => {
    const s = mem();
    const local = localHead("h", "2026-10-05").id;
    for (const student of ["a", "b"])
      queueDaily(
        {
          record: local,
          student,
          halaqa: "h",
          date: "2026-10-05",
          version: 0,
          attendance: { status: "present", reason: null },
        },
        s,
      );
    queueRecord(
      { record: local, halaqa: "h", date: "2026-10-05", version: 0, notes: "يوم طيب" },
      s,
    );
    queueRecord({ record: local, halaqa: "h", date: "2026-10-05", version: 0, complete: true }, s);
    expect(readRecordOutbox(s)).toHaveLength(1);
    expect(readRecordOutbox(s)[0]).toMatchObject({ notes: "يوم طيب", complete: true });

    const order: string[] = [];
    const open = vi.fn(async () => {
      order.push("open");
      return { id: "R1", status: "open" as const, version: 1 };
    });
    const resolved = new Map();
    const a = await flushDailyOutbox(
      net,
      {
        openDailyRecord: open,
        setDailyAttendance: vi.fn(async (r: string, st2: string) => {
          order.push(`att:${r}:${st2}`);
          return { version: 1 } as DayStudent;
        }),
        saveDailyEntry: vi.fn(),
      },
      s,
      resolved,
    );
    const b = await flushRecordOutbox(
      net,
      {
        open,
        notes: vi.fn(async (r: string, n: string | null, v: number) => {
          order.push(`notes:${r}:${n}:${v}`);
          return { id: r, status: "open" as const, version: v + 1 };
        }),
        complete: vi.fn(async (r: string, v: number) => {
          order.push(`complete:${r}:${v}`);
          return { id: r, status: "completed" as const, version: v + 1 };
        }),
      },
      resolved,
      s,
    );
    expect(a.sent + b.sent).toBe(3);
    expect(order).toEqual(["open", "att:R1:a", "att:R1:b", "notes:R1:يوم طيب:1", "complete:R1:2"]);
    expect(readDailyOutbox(s)).toEqual([]);
    expect(readRecordOutbox(s)).toEqual([]);
  });

  it("خطأ الشبكة يُبقي السجل في الصندوق، ورفض الخادم يُعاد بسببه", async () => {
    const s = mem();
    queueRecord({ record: "R1", halaqa: "h", date: "d", version: 3, complete: true }, s);
    const fail = (e: unknown) => async () => {
      throw e;
    };
    const api = {
      open: vi.fn(),
      notes: vi.fn(),
      complete: vi.fn(fail(new TypeError("Failed to fetch"))),
    };
    expect((await flushRecordOutbox(net, api, new Map(), s)).sent).toBe(0);
    expect(readRecordOutbox(s)).toHaveLength(1);
    api.complete = vi.fn(fail(new Error("VERSION_CONFLICT")));
    const r = await flushRecordOutbox(net, api, new Map(), s);
    expect(r.rejected).toHaveLength(1);
    expect(readRecordOutbox(s)).toEqual([]);
  });

  it("الإنهاء المعلّق يظهر مكتملاً، والملاحظات المعلّقة فوق رأس السجل", () => {
    const rec = {
      id: "R1",
      status: "open" as const,
      version: 1,
      notes: null,
      completed_at: null,
      locked_at: null,
      completed_by_name: null,
    };
    const out = overlayRecord(sheet("d", [], rec), [
      {
        record: "R1",
        halaqa: "h",
        date: "d",
        version: 1,
        notes: "ن",
        complete: true,
        queued_at: "q",
      },
    ]);
    expect(out.record).toMatchObject({ status: "completed", notes: "ن", completed_at: "q" });
  });

  it("لمسة أثناء الإرسال لا تضيع", async () => {
    const s = mem();
    queueDaily(
      {
        record: "R1",
        student: "a",
        halaqa: "h",
        date: "d",
        version: 0,
        attendance: { status: "late", reason: null },
      },
      s,
    );
    await flushDailyOutbox(
      net,
      {
        setDailyAttendance: vi.fn(async () => {
          queueDaily(
            {
              record: "R1",
              student: "b",
              halaqa: "h",
              date: "d",
              version: 0,
              entry: { note: "n" },
            },
            s,
          );
          throw new TypeError("Failed to fetch");
        }),
        saveDailyEntry: vi.fn(),
      },
      s,
    );
    expect(
      readDailyOutbox(s)
        .map((x) => x.student)
        .sort(),
    ).toEqual(["a", "b"]);
  });
});
