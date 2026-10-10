import { describe, expect, it, vi } from "vitest";

const calls: unknown[][] = [];
vi.mock("sonner", () => {
  const toast = Object.assign((...a: unknown[]) => calls.push(["base", ...a]), {
    success: (...a: unknown[]) => calls.push(["success", ...a]),
    error: (...a: unknown[]) => calls.push(["error", ...a]),
    info: (...a: unknown[]) => calls.push(["info", ...a]),
    warning: (...a: unknown[]) => calls.push(["warning", ...a]),
  });
  return { toast };
});

describe("toast كسول (M1)", () => {
  it("ينتظر تركيب Toaster ثم يمرّر الإشعارات بترتيبها", async () => {
    const { toast, markToasterReady } = await import("./toast");
    toast.success("تم");
    toast("رسالة", { duration: 2000 });
    await new Promise((r) => setTimeout(r, 10));
    expect(calls).toEqual([]);
    markToasterReady();
    await new Promise((r) => setTimeout(r, 10));
    expect(calls).toEqual([
      ["success", "تم"],
      ["base", "رسالة", { duration: 2000 }],
    ]);
    toast.error("خطأ");
    await new Promise((r) => setTimeout(r, 10));
    expect(calls.at(-1)).toEqual(["error", "خطأ"]);
  });
});
