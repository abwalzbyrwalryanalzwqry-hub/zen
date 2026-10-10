import { afterEach, describe, expect, it, vi } from "vitest";
import { __resetNetworkForTest, applyNativeStatus, isOnline, onNetworkChange } from "./network";

afterEach(() => {
  __resetNetworkForTest();
  vi.unstubAllGlobals();
});

describe("حالة الاتصال (M7)", () => {
  it("خارج التطبيق: navigator.onLine هو المصدر", () => {
    vi.stubGlobal("navigator", { onLine: false });
    expect(isOnline()).toBe(false);
    vi.stubGlobal("navigator", { onLine: true });
    expect(isOnline()).toBe(true);
  });

  it("حالة النظام مقدَّمة على navigator.onLine، وتُطلق online/offline على window عند التغيّر فقط", () => {
    const events: string[] = [];
    vi.stubGlobal("navigator", { onLine: true });
    vi.stubGlobal("window", { dispatchEvent: (e: Event) => events.push(e.type) });
    const seen: boolean[] = [];
    const off = onNetworkChange((o) => seen.push(o));

    applyNativeStatus(false); // WebView يظن الاتصال قائماً، والنظام يقول لا
    expect(isOnline()).toBe(false);
    applyNativeStatus(false); // بلا تغيير: لا حدث
    applyNativeStatus(true);
    off();
    applyNativeStatus(false);

    expect(events).toEqual(["offline", "online", "offline"]);
    expect(seen).toEqual([false, true]);
  });
});
