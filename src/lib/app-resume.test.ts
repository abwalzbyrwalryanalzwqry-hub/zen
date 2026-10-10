import { afterEach, describe, expect, it, vi } from "vitest";
import { RESUME_EVENT, __resetResume, emitResume } from "./app-resume";

// بيئة node: نافذة دنيا تكفي لبثّ الحدث.
vi.stubGlobal("window", new EventTarget());

describe("العودة إلى التطبيق", () => {
  afterEach(() => __resetResume());
  it("حدثان متقاربان = عودة واحدة، وبعد مهلة عودة جديدة", () => {
    const h = vi.fn();
    window.addEventListener(RESUME_EVENT, h);
    expect(emitResume(10_000)).toBe(true);
    expect(emitResume(10_500)).toBe(false);
    expect(emitResume(12_000)).toBe(true);
    expect(h).toHaveBeenCalledTimes(2);
    window.removeEventListener(RESUME_EVENT, h);
  });
});
