import { describe, expect, it, vi } from "vitest";

type Cb = (event: string, s: unknown) => void;
const cbs: Cb[] = [];
const onAuthStateChange = vi.fn((cb: Cb) => {
  cbs.push(cb);
  return { data: { subscription: { unsubscribe: vi.fn() } } };
});
const getSession = vi.fn(async () => ({ data: { session: null } }));
const clearOfflineCache = vi.fn(async () => undefined);
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { onAuthStateChange, getSession } },
}));
vi.mock("@/lib/offline/offline-fetch", () => ({ clearOfflineCache: () => clearOfflineCache() }));
vi.mock("@/lib/offline/guest", () => ({
  GUEST_ID: "guest",
  isGuest: () => false,
  onGuestChange: () => () => undefined,
  setGuest: vi.fn(),
}));
globalThis.localStorage = { removeItem: vi.fn() } as unknown as Storage;

const { currentSession, subscribeSession } = await import("./useSession");

describe("مخزن الجلسة الواحد (تحليل «المزيد» SEC-06)", () => {
  it("اشتراك واحد في المصادقة مهما تعدّد المستمعون", async () => {
    const off = [
      subscribeSession(() => {}),
      subscribeSession(() => {}),
      subscribeSession(() => {}),
    ];
    // العميل كسول (1.16.0): الاشتراك بعد تحميله.
    await vi.waitFor(() => expect(getSession).toHaveBeenCalledTimes(1));
    expect(onAuthStateChange).toHaveBeenCalledTimes(1);
    off.forEach((f) => f());
  });

  it("التغيّر يصل كل المستمعين، والخروج يمسح الذاكرة مرة واحدة", async () => {
    const a = vi.fn();
    const b = vi.fn();
    subscribeSession(a);
    subscribeSession(b);
    await vi.waitFor(() => expect(cbs).toHaveLength(1));
    const s = { user: { id: "u1" } };
    cbs[0]("SIGNED_IN", s);
    expect(currentSession()).toBe(s);
    expect(a).toHaveBeenCalled();
    expect(b).toHaveBeenCalled();
    cbs[0]("SIGNED_OUT", null);
    expect(currentSession()).toBeNull();
    expect(clearOfflineCache).toHaveBeenCalledTimes(1);
  });
});
