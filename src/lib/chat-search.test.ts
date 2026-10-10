import { describe, expect, it } from "vitest";
import { matchesQuery, normalizeForSearch, splitMatches } from "./chat-search";

describe("chat search", () => {
  it("ignores diacritics, tatweel and hamza forms", () => {
    expect(normalizeForSearch("أَحْمَـد")).toBe("احمد");
    expect(matchesQuery("جزاكَ اللهُ خيراً", "الله")).toBe(true);
    expect(matchesQuery("سورة البقرة", "بقره")).toBe(true);
    expect(matchesQuery("abc", "  ")).toBe(false);
  });
  it("splits on the original text keeping diacritics", () => {
    const parts = splitMatches("قرأتُ البَقَرة اليوم", "البقرة");
    expect(parts).toEqual([
      { text: "قرأتُ ", hit: false },
      { text: "البَقَرة", hit: true },
      { text: " اليوم", hit: false },
    ]);
    expect(splitMatches("Hello hello", "hello").filter((p) => p.hit)).toHaveLength(2);
    expect(splitMatches("text", "")).toEqual([{ text: "text", hit: false }]);
  });
});
