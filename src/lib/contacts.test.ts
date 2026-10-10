import { describe, expect, it } from "vitest";
import { groupContacts, type Contact } from "./contacts";

const c = (id: string, name: string, relation: Contact["relation"], via: string | null = null) =>
  ({ id, name, avatar: null, relation, via }) as Contact;

describe("تجميع جهات «محادثة جديدة»", () => {
  const list = [
    c("1", "أحمد", "my_student"),
    c("2", "أبو أحمد", "student_guardian", "أحمد"),
    c("3", "سالم", "my_student"),
    c("4", "يحيى", "colleague"),
  ];
  it("بترتيب الصلات وبلا مجموعة فارغة", () => {
    expect(groupContacts(list).map((g) => [g.relation, g.items.length])).toEqual([
      ["my_student", 2],
      ["student_guardian", 1],
      ["colleague", 1],
    ]);
  });
  it("البحث باسم الابن يجد وليّ الأمر، ويتجاهل الهمزات", () => {
    const g = groupContacts(list, "احمد");
    expect(g.flatMap((x) => x.items.map((i) => i.id))).toEqual(["1", "2"]);
  });
});
