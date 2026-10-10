import { describe, expect, it } from "vitest";
import { formatMinutes, itemSurah, itemTitle, queueProgress, type TodayQueue } from "./today-queue";

const q: TodayQueue = {
  day: "2026-09-29",
  total_minutes: 30,
  done: 1,
  items: [
    {
      kind: "assignment",
      id: "a",
      surah_name: "الملك",
      from_ayah: 1,
      to_ayah: 5,
      done: false,
      minutes: 10,
    },
    {
      kind: "review",
      id: "r",
      surah_name: "النبأ",
      from_ayah: 1,
      to_ayah: 10,
      done: false,
      minutes: 5,
    },
    {
      kind: "exam_error",
      id: "e",
      surah_name: "يس",
      surah_number: 36,
      from_ayah: 3,
      to_ayah: 3,
      done: false,
      minutes: 2,
    },
    { kind: "wird", id: "wird", done: true, minutes: 15 },
  ],
};

describe("طابور اليوم (8.2)", () => {
  it("العناوين والسورة", () => {
    expect(itemTitle(q.items[0])).toBe("واجب: الملك 1–5");
    expect(itemTitle(q.items[2])).toBe("موضع خطأ: يس 3");
    expect(itemTitle(q.items[3])).toBe("ورد اليوم من المصحف");
    expect(itemSurah(q.items[0])).toBe(67);
    expect(itemSurah(q.items[2])).toBe(36);
    expect(itemSurah(q.items[3])).toBeNull();
    expect(itemSurah(q.items[1])).toBe(78); // «النبأ» كما يكتبها المعلّم = «النبإ»
    expect(itemSurah({ ...q.items[1], surah_name: "سورة الملك" })).toBe(67);
  });
  it("الإنجاز والوقت المتبقي لا يحسب المنجز", () => {
    expect(queueProgress(q)).toEqual({ done: 1, total: 4, minutesLeft: 17 });
    expect(formatMinutes(17)).toBe("17 دقيقة");
    expect(formatMinutes(90)).toBe("1 ساعة و30 دقيقة");
    expect(formatMinutes(120)).toBe("2 ساعة");
  });
});
