import { describe, expect, it } from "vitest";
import { STORY_H, STORY_W, storyName, wrapLines } from "./story";

describe("قالب القصة", () => {
  it("مقاس القصص 1080×1920", () => {
    expect([STORY_W, STORY_H]).toEqual([1080, 1920]);
  });
  it("إخفاء الاسم الكامل يبقي الاسم الأول، والمركّب يبقى مركّباً", () => {
    expect(storyName("محمد أحمد علي", true)).toBe("محمد");
    expect(storyName("عبد الله سالم", true)).toBe("عبد الله");
    expect(storyName("  محمد   أحمد ", false)).toBe("محمد أحمد");
    expect(storyName("سارة", true)).toBe("سارة");
  });
  it("الالتفاف بحدّ أقصى للأسطر", () => {
    const m = (s: string) => s.length * 10;
    expect(wrapLines(m, "أ ب ج د", 30)).toEqual(["أ ب", "ج د"]);
    const out = wrapLines(m, "كلمة كلمة كلمة كلمة كلمة كلمة", 100, 2);
    expect(out).toHaveLength(2);
    expect(out[1].endsWith("…")).toBe(true);
  });
});
