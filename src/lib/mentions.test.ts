import { describe, expect, it } from "vitest";
import {
  activeMentionQuery,
  encodeMentions,
  filterCandidates,
  insertMention,
  parseMentions,
  stripMentions,
} from "./mentions";

const A = "10310310-0000-0000-0000-00000000000a";
const B = "10310310-0000-0000-0000-00000000000b";
const ahmad = { user_id: A, name: "أحمد علي", mod: false };
const bilal = { user_id: B, name: "بلال", mod: false };

describe("الإشارات (9.6)", () => {
  it("التحليل والإزالة", () => {
    const t = `مرحباً @[أحمد علي](${A})، راجع الملك`;
    expect(parseMentions(t)).toEqual([
      { kind: "text", text: "مرحباً " },
      { kind: "mention", name: "أحمد علي", id: A },
      { kind: "text", text: "، راجع الملك" },
    ]);
    expect(stripMentions(t)).toBe("مرحباً @أحمد علي، راجع الملك");
    expect(parseMentions("@[x](not-a-uuid)")).toEqual([{ kind: "text", text: "@[x](not-a-uuid)" }]);
  });
  it("الكلمة الجارية بعد @", () => {
    expect(activeMentionQuery("السلام @بل", 10)).toEqual({ start: 7, query: "بل" });
    expect(activeMentionQuery("بريد a@b", 8)).toBeNull();
    expect(activeMentionQuery("@", 1)).toEqual({ start: 0, query: "" });
  });
  it("الإدراج والترشيح", () => {
    expect(insertMention("شكراً @بل", 9, bilal)).toEqual({ text: "شكراً @بلال ", caret: 12 });
    expect(filterCandidates([ahmad, bilal], "احمد")).toEqual([ahmad]);
    expect(filterCandidates([ahmad, bilal], "")).toHaveLength(2);
  });
  it("الترميز عند الإرسال: المختارون فقط وحتى 5", () => {
    expect(encodeMentions("@أحمد علي و @بلال و @خالد", [ahmad, bilal])).toBe(
      `@[أحمد علي](${A}) و @[بلال](${B}) و @خالد`,
    );
    expect(encodeMentions("@بلالي", [bilal])).toBe("@بلالي");
    const six = Array(6).fill("@بلال").join(" ");
    expect((encodeMentions(six, [bilal]).match(/\]\(/g) ?? []).length).toBe(5);
  });
});
