/**
 * الحساب دون اتصال (1.16.0): رمز الدخول المنتهي لا يُجدَّد دون شبكة فيعيد Supabase جلسة null مع
 * إبقائها في التخزين. يبقى الحساب مفتوحاً بجلسة الجهاز، ويُستبدل بها الرمز المجدَّد عند عودة الاتصال،
 * والخروج الحقيقي (حذف التخزين) يغلقه.
 */
import { describe, expect, it, vi } from "vitest";

type Cb = (event: string, s: unknown) => void;
const cbs: Cb[] = [];
const onAuthStateChange = vi.fn((cb: Cb) => {
  cbs.push(cb);
  return { data: { subscription: { unsubscribe: vi.fn() } } };
});
let next: unknown = null;
const getSession = vi.fn(async () => ({ data: { session: next } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { onAuthStateChange, getSession } },
}));
vi.mock("@/lib/offline/offline-fetch", () => ({ clearOfflineCache: async () => undefined }));
vi.mock("@/lib/offline/guest", () => ({
  GUEST_ID: "guest",
  isGuest: () => false,
  onGuestChange: () => () => undefined,
  setGuest: vi.fn(),
}));
let online = false;
vi.mock("@/lib/network", () => ({ isOnline: () => online }));

const KEY = `sb-${new URL(import.meta.env.VITE_SUPABASE_URL).hostname.split(".")[0]}-auth-token`;
const stored = {
  access_token: "a.b.c",
  refresh_token: "r1",
  expires_at: Math.floor(Date.now() / 1000) - 3600,
  user: { id: "teacher-1" },
};
const mem = new Map<string, string>([[KEY, JSON.stringify(stored)]]);
globalThis.localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
} as unknown as Storage;
const handlers = new Map<string, () => void>();
globalThis.window = {
  addEventListener: (t: string, f: () => void) => void handlers.set(t, f),
} as unknown as Window & typeof globalThis;

const { currentSession, subscribeSession } = await import("./useSession");
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("الحساب دون اتصال", () => {
  it("يفتح فوراً بجلسة الجهاز ولا يغلقه null من getSession دون اتصال", async () => {
    subscribeSession(() => {});
    expect(currentSession()?.user.id).toBe("teacher-1");
    await flush();
    cbs[0]("INITIAL_SESSION", null);
    expect(currentSession()?.user.id).toBe("teacher-1");
  });

  it("عودة الاتصال تجدّد الجلسة وتستبدلها", async () => {
    online = true;
    next = { ...stored, access_token: "fresh", expires_at: Date.now() / 1000 + 3600 };
    handlers.get("online")?.();
    await flush();
    expect(currentSession()?.access_token).toBe("fresh");
  });

  it("الخروج الحقيقي يغلق الحساب حتى مع بقاء أثر في الذاكرة", () => {
    cbs[0]("SIGNED_OUT", null);
    expect(currentSession()).toBeNull();
  });

  it("رفض التجديد (حذف التخزين) لا يُبقي جلسة جهاز", () => {
    mem.delete(KEY);
    cbs[0]("INITIAL_SESSION", null);
    expect(currentSession()).toBeNull();
  });
});
