import { describe, expect, it } from "vitest";
import type { DayStudent } from "@/lib/daily-record";
import { readSort, sortStudents, writeSort } from "@/lib/daily-record-assist";

const s = (id: string, name: string, p: Partial<DayStudent> = {}) =>
  ({ student_id: id, name, status: null, absences_30d: 0, ...p }) as DayStudent;

describe("ترتيب القائمة المحفوظ لكل حلقة", () => {
  const list = [
    s("1", "يوسف", { status: "present", absences_30d: 1 }),
    s("2", "أحمد", { absences_30d: 4 }),
    s("3", "بلال", { status: "absent", absences_30d: 4 }),
    s("4", "تميم"),
  ];
  const ids = (l: DayStudent[]) => l.map((x) => x.student_id).join("");
  it("الأوضاع الأربعة، والتساوي يحفظ ترتيب الحلقة", () => {
    expect(ids(sortStudents(list, "list"))).toBe("1234");
    expect(ids(sortStudents(list, "name"))).toBe("2341");
    expect(ids(sortStudents(list, "unmarked"))).toBe("2413");
    expect(ids(sortStudents(list, "absences"))).toBe("2314");
  });
  it("يُحفظ لكل حلقة وحدها، والقيمة الغريبة تعود إلى ترتيب الحلقة", () => {
    const m = new Map<string, string>();
    const store = {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
    };
    writeSort("h1", "name", store);
    expect(readSort("h1", store)).toBe("name");
    expect(readSort("h2", store)).toBe("list");
    m.set("zen.dailyRecord.sort.h3", "evil");
    expect(readSort("h3", store)).toBe("list");
    expect(readSort("h1", null)).toBe("list");
  });
});
