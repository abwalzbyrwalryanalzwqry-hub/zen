import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GUEST_ID, guestAllowed, isGuest, setGuest } from "./guest";
import {
  cacheKeyFor,
  clearOfflineCache,
  createOfflineFetch,
  SLOW_NETWORK_MS,
  userKeyFromAuth,
} from "./offline-fetch";

const API = "https://proj.supabase.co";

function jwt(sub: string): string {
  const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, "");
  return `Bearer ${b64({ alg: "HS256" })}.${b64({ sub })}.sig`;
}

class MemCache {
  store = new Map<string, Response>();
  async match(key: string) {
    const r = this.store.get(key);
    return r ? r.clone() : undefined;
  }
  async put(key: string, res: Response) {
    this.store.set(key, res.clone());
  }
}

let cache: MemCache;
let online = true;

beforeEach(() => {
  cache = new MemCache();
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
    open: async () => cache,
    delete: async () => {
      cache.store.clear();
      return true;
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("وضع الضيف", () => {
  it("يُفعَّل ويُلغى، ويسمح بمسارات الجهاز فقط", () => {
    expect(isGuest()).toBe(false);
    setGuest(true);
    expect(isGuest()).toBe(true);
    expect(guestAllowed("/mushaf")).toBe(true);
    expect(guestAllowed("/exams/run")).toBe(true);
    expect(guestAllowed("/chats")).toBe(false);
    expect(guestAllowed("/teacher")).toBe(false);
    setGuest(false);
    expect(isGuest()).toBe(false);
    expect(GUEST_ID).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("لا يخرج طلب بيانات من الجهاز، والمصادقة تمرّ", async () => {
    setGuest(true);
    const base = vi.fn(async () => new Response("{}"));
    const f = createOfflineFetch(base as unknown as typeof fetch);
    await expect(f(`${API}/rest/v1/profiles?select=*`)).rejects.toThrow();
    expect(base).not.toHaveBeenCalled();
    await f(`${API}/auth/v1/token?grant_type=password`, { method: "POST", body: "{}" });
    expect(base).toHaveBeenCalledTimes(1);
  });
});

describe("حافظة القراءة", () => {
  it("تعيد آخر نسخة عند انقطاع الاتصال، مفصولة لكل مستخدم", async () => {
    const base = vi.fn(async () => new Response('[{"id":1}]', { status: 200 }));
    const f = createOfflineFetch(base as unknown as typeof fetch);
    const url = `${API}/rest/v1/plans?select=*`;
    const headers = { authorization: jwt("user-a") };

    await f(url, { headers });
    await flush();
    expect(cache.store.size).toBe(1);

    online = false;
    const res = await f(url, { headers });
    expect(res.headers.get("x-zen-offline")).toBe("1");
    expect(await res.json()).toEqual([{ id: 1 }]);
    expect(base).toHaveBeenCalledTimes(1);

    // مستخدم آخر على الجهاز نفسه لا يرى بيانات الأول.
    await expect(f(url, { headers: { authorization: jwt("user-b") } })).rejects.toThrow();
  });

  it("تعود إلى الحافظة عند خطأ الخادم 5xx أو فشل الشبكة", async () => {
    let mode: "ok" | "500" | "fail" = "ok";
    const base = vi.fn(async () => {
      if (mode === "fail") throw new TypeError("Failed to fetch");
      return new Response(mode === "ok" ? '"fresh"' : "oops", {
        status: mode === "ok" ? 200 : 500,
      });
    });
    const f = createOfflineFetch(base as unknown as typeof fetch);
    const url = `${API}/rest/v1/rpc/my_home_context`;
    const init = { method: "POST", body: "{}", headers: { authorization: jwt("u") } };
    await f(url, init);
    await flush();
    mode = "500";
    expect(await (await f(url, init)).json()).toBe("fresh");
    mode = "fail";
    expect(await (await f(url, init)).json()).toBe("fresh");
  });

  it("شبكة بطيئة: النسخة فوراً والحيّ يحدّثها في الخلفية، وبلا نسخة يُنتظر الحيّ", async () => {
    let reply = '"v1"';
    let delay = 0;
    const base = vi.fn(
      () =>
        new Promise<Response>((r) =>
          setTimeout(() => r(new Response(reply, { status: 200 })), delay),
        ),
    );
    expect(SLOW_NETWORK_MS).toBeLessThanOrEqual(4_000);
    const f = createOfflineFetch(base as unknown as typeof fetch, { slowMs: 30 });
    const url = `${API}/rest/v1/rpc/my_home_context`;
    const init = { method: "POST", body: "{}", headers: { authorization: jwt("u") } };
    expect(await (await f(url, init)).json()).toBe("v1");
    await flush();

    reply = '"v2"';
    delay = 150;
    const r = await f(url, init);
    expect(r.headers.get("x-zen-offline")).toBe("1");
    expect(await r.json()).toBe("v1");
    // الحيّ يصل فيحدّث النسخة.
    await new Promise((x) => setTimeout(x, 250));
    online = false;
    expect(await (await f(url, init)).json()).toBe("v2");

    // بلا نسخة: ينتظر الحيّ حتى يصل.
    online = true;
    const n = await f(`${API}/rest/v1/rpc/teacher_home_kpis`, init);
    expect(n.headers.get("x-zen-offline")).toBeNull();
    expect(await n.json()).toBe("v2");
  });

  it("لا تخزّن الكتابة ولا دوال RPC المغيِّرة", async () => {
    const base = vi.fn(async () => new Response("{}", { status: 201 }));
    const f = createOfflineFetch(base as unknown as typeof fetch);
    await f(`${API}/rest/v1/plans`, { method: "POST", body: "{}" });
    await f(`${API}/rest/v1/rpc/send_exam_errors_to_review`, { method: "POST", body: "{}" });
    await flush();
    expect(cache.store.size).toBe(0);
  });

  it("تُمسح عند تسجيل الخروج", async () => {
    await cache.put("k", new Response("x"));
    await clearOfflineCache();
    expect(cache.store.size).toBe(0);
  });

  it("مفتاح الحافظة يتغيّر مع الجسم والمستخدم", async () => {
    const h = new Headers();
    const a = await cacheKeyFor("a", "POST", "u", h, "1");
    expect(await cacheKeyFor("a", "POST", "u", h, "2")).not.toBe(a);
    expect(await cacheKeyFor("b", "POST", "u", h, "1")).not.toBe(a);
    expect(userKeyFromAuth(jwt("abc"))).toBe("abc");
    expect(userKeyFromAuth(null)).toBe("anon");
  });
});

describe("جلسة الجهاز (رمز منتهٍ دون اتصال، 1.16.0)", () => {
  const KEY = `sb-${new URL(import.meta.env.VITE_SUPABASE_URL).hostname.split(".")[0]}-auth-token`;
  const ANON = `Bearer ${btoa(JSON.stringify({ alg: "HS256" }))}.${btoa(JSON.stringify({ role: "anon" }))}.sig`;
  const seedDevice = () =>
    localStorage.setItem(
      KEY,
      JSON.stringify({ access_token: "x", refresh_token: "r", user: { id: "t1" }, expires_at: 1 }),
    );

  it("القراءة بمفتاح عام تُعاد من نسخة صاحب الجلسة دون طلب، والكتابة خطأ شبكة", async () => {
    const base = vi.fn(async () => new Response("[1,2]", { status: 200 }));
    const f = createOfflineFetch(base as unknown as typeof fetch);
    const url = `${API}/rest/v1/rpc/teacher_home_kpis`;
    // قراءة حيّة بالحساب أولاً تُحفظ نسختها.
    await f(url, { method: "POST", headers: { authorization: jwt("t1") }, body: "{}" });
    await flush();
    seedDevice();
    base.mockClear();
    const res = await f(url, { method: "POST", headers: { authorization: ANON }, body: "{}" });
    expect(await res.text()).toBe("[1,2]");
    expect(res.headers.get("x-zen-offline")).toBe("1");
    expect(base).not.toHaveBeenCalled();
    await expect(
      f(`${API}/rest/v1/rpc/save_daily_entry`, {
        method: "POST",
        headers: { authorization: ANON },
        body: "{}",
      }),
    ).rejects.toThrow(/offline/);
    expect(base).not.toHaveBeenCalled();
  });

  it("بلا جلسة جهاز يمرّ المفتاح العام كما هو (شاشة الدخول)", async () => {
    const base = vi.fn(async () => new Response("{}", { status: 200 }));
    const f = createOfflineFetch(base as unknown as typeof fetch);
    await f(`${API}/rest/v1/rpc/claim_username`, {
      method: "POST",
      headers: { authorization: ANON },
      body: "{}",
    });
    expect(base).toHaveBeenCalledTimes(1);
  });
});
