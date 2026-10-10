import { beforeEach, describe, expect, it, vi } from "vitest";

// بيئة Node: تخزين بسيط في الذاكرة.
const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
});

const rpcMock = vi.fn(async (_fn: string, _args?: unknown) => ({ data: 1, error: null }));
vi.mock("@/integrations/supabase/rpc", () => ({ rpc: (f: string, a?: unknown) => rpcMock(f, a) }));
vi.mock("@/lib/native", () => ({ nativePlatform: () => "android" }));

const { markSent, totalsByEvent, track, utcDay } = await import("./usage");

describe("الإحصاءات المجمّعة (13.4)", () => {
  beforeEach(() => {
    localStorage.clear();
    rpcMock.mockClear();
    vi.useFakeTimers();
  });
  it("كل حدث مرة واحدة في اليوم، ويبدأ من جديد في يوم جديد", () => {
    const a = markSent(null, "app_open", "2026-10-01");
    expect(a).toEqual({ day: "2026-10-01", events: ["app_open"] });
    expect(markSent(a, "app_open", "2026-10-01")).toBeNull();
    expect(markSent(a, "mushaf_open", "2026-10-01")?.events).toEqual(["app_open", "mushaf_open"]);
    expect(markSent(a, "app_open", "2026-10-02")).toEqual({
      day: "2026-10-02",
      events: ["app_open"],
    });
    expect(utcDay(new Date("2026-10-01T23:30:00-03:00"))).toBe("2026-10-02");
  });
  it("بلا موافقة لا يُرسل شيء", async () => {
    track("app_open");
    await vi.runAllTimersAsync();
    expect(rpcMock).not.toHaveBeenCalled();
  });
  it("بموافقة: دفعة واحدة بلا تكرار", async () => {
    localStorage.setItem("zen-usage-consent", "true");
    track("app_open");
    track("app_open");
    track("mushaf_open");
    await vi.runAllTimersAsync();
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith("track_usage", {
      _events: ["app_open", "mushaf_open"],
      _platform: "android",
    });
    track("app_open");
    await vi.runAllTimersAsync();
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });
  it("مجاميع الأحداث مرتّبة", () => {
    expect(
      totalsByEvent([
        { day: "d1", event: "app_open", platform: "android", count: 3 },
        { day: "d2", event: "app_open", platform: "android", count: 2 },
        { day: "d1", event: "exam_done", platform: "android", count: 7 },
      ]),
    ).toEqual([
      { event: "exam_done", total: 7 },
      { event: "app_open", total: 5 },
    ]);
  });
});
