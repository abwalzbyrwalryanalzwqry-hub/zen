import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CACHE_MAX_AGE_MS,
  CACHE_MAX_BYTES,
  CACHE_MAX_ENTRIES,
  MEDIA_MAX_BYTES,
  evictionPlan,
  isExpired,
  noteFreshRead,
  noteServedFromCache,
  shouldCache,
  staleSince,
  type CacheIndex,
} from "./cache-policy";
import { createOfflineFetch } from "./offline-fetch";

const DAY = 24 * 60 * 60 * 1000;

describe("سياسة حافظة دون اتصال (H7)", () => {
  it("لا تُخزَّن الملفات الصوتية ولا الكبيرة ولا مجهولة الحجم من Storage", () => {
    expect(shouldCache("/rest/v1/chats", "application/json", null)).toBe(true);
    expect(shouldCache("/storage/v1/object/chat-media/a.webm", "audio/webm", 1000)).toBe(false);
    expect(shouldCache("/storage/v1/object/chat-media/a.jpg", "image/jpeg", 100_000)).toBe(true);
    expect(shouldCache("/storage/v1/object/x.jpg", "image/jpeg", MEDIA_MAX_BYTES + 1)).toBe(false);
    expect(shouldCache("/storage/v1/object/x.jpg", "image/jpeg", null)).toBe(false);
  });

  it("الصلاحية 30 يوماً", () => {
    const now = 100 * DAY;
    expect(isExpired({ savedAt: now - 29 * DAY, usedAt: now, size: 1 }, now)).toBe(false);
    expect(isExpired({ savedAt: now - CACHE_MAX_AGE_MS - 1, usedAt: now, size: 1 }, now)).toBe(
      true,
    );
    expect(isExpired(undefined, now)).toBe(true);
  });

  it("يحذف المنتهي ثم الأقدم استعمالاً حتى العدد والحجم", () => {
    const now = 100 * DAY;
    const index: CacheIndex = { old: { savedAt: now - 40 * DAY, usedAt: now, size: 1 } };
    for (let i = 0; i < CACHE_MAX_ENTRIES + 3; i++) {
      index[`k${i}`] = { savedAt: now, usedAt: now - (CACHE_MAX_ENTRIES + 3 - i), size: 10 };
    }
    const plan = evictionPlan(index, now);
    expect(plan).toContain("old");
    expect(plan).toEqual(expect.arrayContaining(["k0", "k1", "k2"]));
    expect(plan).toHaveLength(4);

    const big: CacheIndex = {
      a: { savedAt: now, usedAt: 1, size: CACHE_MAX_BYTES },
      b: { savedAt: now, usedAt: 2, size: 1024 },
    };
    expect(evictionPlan(big, now)).toEqual(["a"]);
  });

  it("«آخر تحديث منذ» يحفظ أقدم نسخة معروضة ويُمسح بقراءة حيّة", () => {
    noteFreshRead();
    noteServedFromCache(2000);
    noteServedFromCache(1000);
    noteServedFromCache(3000);
    expect(staleSince()).toBe(1000);
    noteFreshRead();
    expect(staleSince()).toBeNull();
  });
});

describe("الحافظة تطبّق السياسة", () => {
  const API = "https://proj.supabase.co";
  let store: Map<string, Response>;
  let online = true;
  beforeEach(() => {
    store = new Map();
    online = true;
    const ls = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => ls.get(k) ?? null,
      setItem: (k: string, v: string) => void ls.set(k, v),
      removeItem: (k: string) => void ls.delete(k),
    });
    vi.stubGlobal("window", new EventTarget());
    vi.stubGlobal("navigator", {
      get onLine() {
        return online;
      },
    });
    vi.stubGlobal("caches", {
      open: async () => ({
        match: async (k: string) => store.get(k)?.clone(),
        put: async (k: string, r: Response) => void store.set(k, r.clone()),
        delete: async (k: string) => store.delete(k),
      }),
      delete: async () => true,
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it("لا يعرض نسخة أقدم من 30 يوماً، ويعرض الأحدث مع وقت حفظها", async () => {
    const base = vi.fn(async () => new Response('[{"id":1}]', { status: 200 }));
    const f = createOfflineFetch(base as unknown as typeof fetch);
    await f(`${API}/rest/v1/chats?select=*`);
    await flush();
    online = false;
    const hit = await f(`${API}/rest/v1/chats?select=*`);
    expect(hit.headers.get("x-zen-offline")).toBe("1");
    expect(hit.headers.get("x-zen-cached-at")).toBeTruthy();
    expect(staleSince()).not.toBeNull();

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 31 * DAY);
    await expect(f(`${API}/rest/v1/chats?select=*`)).rejects.toThrow();
  });

  it("لا تُخزَّن رسالة صوتية من Storage", async () => {
    const base = vi.fn(
      async () =>
        new Response("x", {
          status: 200,
          headers: { "content-type": "audio/webm", "content-length": "1" },
        }),
    );
    const f = createOfflineFetch(base as unknown as typeof fetch);
    await f(`${API}/storage/v1/object/chat-media/u/a.webm`);
    await flush();
    expect(store.size).toBe(0);
  });
});
