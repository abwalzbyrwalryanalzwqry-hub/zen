import { describe, expect, it } from "vitest";
import {
  draftFromSheet,
  flushRegisterOutbox,
  incompleteRows,
  nextStatus,
  queueRegister,
  readRegisterOutbox,
  rowsForSave,
  scoreToGrade,
  type SheetRow,
} from "./halaqa-register";

const mem = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
};

const base: SheetRow = { student_id: "s1", name: "أحمد", status: null, entry: null, last: null };

describe("سجل الحلقة (9.1)", () => {
  it("الحضور يدور باللمس", () => {
    expect(nextStatus("present")).toBe("late");
    expect(nextStatus("excused")).toBe("present");
  });

  it("اقتراح «من» من آخر تسميع، وقيد اليوم يُستعاد كما هو", () => {
    const d = draftFromSheet({
      ...base,
      last: { surah_name: "الملك", to_ayah: 10, kind: "memorize", session_date: "2026-09-28" },
    });
    expect(d).toMatchObject({
      status: "present",
      surah_name: "الملك",
      from_ayah: 11,
      to_ayah: null,
      grade: null,
    });
    const e = draftFromSheet({
      ...base,
      status: "late",
      entry: {
        surah_name: "الملك",
        from_ayah: 1,
        to_ayah: 12,
        kind: "memorize",
        score: 85,
        errors: [{ type: "tajweed" }],
        notes: null,
      },
    });
    expect(e).toMatchObject({ status: "late", to_ayah: 12, grade: 4, error_type: "tajweed" });
    expect([35, 55, 70, 85, 95].map(scoreToGrade)).toEqual([1, 2, 3, 4, 5]);
  });

  it("الإرسال: التسميع للحاضر المكتمل فقط، والغائب حضور فقط", () => {
    const rows = rowsForSave([
      { ...draftFromSheet(base), surah_name: "الملك", from_ayah: 1, grade: 5 },
      {
        ...draftFromSheet(base),
        student_id: "s2",
        status: "absent",
        surah_name: "الملك",
        from_ayah: 1,
        grade: 5,
      },
    ]);
    expect(rows[0]).toMatchObject({ surah_name: "الملك", from_ayah: 1, to_ayah: 1, grade: 5 });
    expect(rows[1]).toEqual({ student_id: "s2", status: "absent" });
  });

  it("الصف الناقص يُكشف قبل الحفظ", () => {
    expect(
      incompleteRows([{ ...draftFromSheet(base), surah_name: "الملك", from_ayah: 3, grade: null }]),
    ).toEqual(["s1"]);
    expect(
      incompleteRows([
        { ...draftFromSheet(base), surah_name: "الملك", from_ayah: 3, to_ayah: 2, grade: 4 },
      ]),
    ).toEqual(["s1"]);
    expect(incompleteRows([draftFromSheet(base)])).toEqual([]);
  });

  it("صندوق الإرسال: نسخة واحدة لكل حلقة ويوم، والشبكة تُبقي، والرفض يُعاد", async () => {
    const s = mem();
    const item = (date: string, n: number) => ({
      halaqa: "h",
      date,
      rows: [{ student_id: `s${n}`, status: "present" as const }],
      saved_at: "x",
    });
    queueRegister(item("2026-09-29", 1), s);
    queueRegister(item("2026-09-29", 2), s);
    queueRegister(item("2026-09-28", 3), s);
    expect(readRegisterOutbox(s)).toHaveLength(2);
    expect(readRegisterOutbox(s).find((x) => x.date === "2026-09-29")?.rows[0].student_id).toBe(
      "s2",
    );

    const r = await flushRegisterOutbox(async (i) => {
      if (i.date === "2026-09-28") throw new Error("Failed to fetch");
      throw new Error("NOT_YOUR_HALAQA");
    }, s);
    expect(r.sent).toBe(0);
    expect(r.rejected.map((x) => x.item.date)).toEqual(["2026-09-29"]);
    expect(readRegisterOutbox(s).map((x) => x.date)).toEqual(["2026-09-28"]);
    expect((await flushRegisterOutbox(async () => ({}), s)).sent).toBe(1);
    expect(readRegisterOutbox(s)).toEqual([]);
  });
});
