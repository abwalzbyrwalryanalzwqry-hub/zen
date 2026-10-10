import type { BrowserContext, Route } from "@playwright/test";

/**
 * خادم Supabase وهمي داخل المتصفح لاختبارات E2E: يعترض كل طلبات REST وRPC والمصادقة والتخزين
 * نحو المضيف الوهمي، فتعمل الاختبارات في CI بلا مشروع ولا أسرار ولا بيانات حقيقية.
 * لكل اختبار أن يضيف جداول وردود RPC خاصة، ويقرأ ما كُتب في `calls`.
 */

export const FAKE_SUPABASE_URL = "http://sb.e2e.test";

export type FakeUser = { id: string; email: string; name: string };

export const STUDENT: FakeUser = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "student@e2e.test",
  name: "سالم الطالب",
};
export const TEACHER: FakeUser = {
  id: "33333333-3333-4333-8333-333333333333",
  email: "teacher@e2e.test",
  name: "الأستاذ يحيى",
};

type Json = unknown;
export type Call = { method: string; path: string; query: string; body: Json };

export type FakeOptions = {
  user: FakeUser | null;
  /** صفوف لكل جدول (تُعاد لكل SELECT عليه). */
  tables?: Record<string, Json[]>;
  /** ردود دوال RPC بالاسم. تقبل دالة تُعطى جسم الطلب. */
  rpc?: Record<string, Json | ((body: Json) => Json)>;
  /** ردود دوال Edge بالاسم (`/functions/v1/<name>`). تقبل دالة تُعطى جسم الطلب. */
  functions?: Record<string, Json | ((body: Json) => Json)>;
  /** رفض الدخول بكلمة المرور. */
  rejectLogin?: boolean;
  /** جداول ودوال تُرجع خطأ خادم 500 (لاختبار حالات الفشل). */
  fail?: { tables?: string[]; rpc?: string[] };
};

function b64url(s: string) {
  return Buffer.from(s).toString("base64url");
}

export function fakeJwt(user: FakeUser) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: user.id,
    email: user.email,
    role: "authenticated",
    aud: "authenticated",
    iat: now,
    exp: now + 3600,
    session_id: "e2e-session",
  };
  return `${b64url('{"alg":"HS256","typ":"JWT"}')}.${b64url(JSON.stringify(payload))}.e2e`;
}

export function authUser(user: FakeUser) {
  return {
    id: user.id,
    aud: "authenticated",
    role: "authenticated",
    email: user.email,
    email_confirmed_at: new Date().toISOString(),
    user_metadata: { name: user.name },
    app_metadata: { provider: "email" },
    created_at: new Date().toISOString(),
  };
}

export function session(user: FakeUser) {
  return {
    access_token: fakeJwt(user),
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: "e2e-refresh",
    user: authUser(user),
  };
}

/** مفتاح الجلسة الذي يستخدمه supabase-js لهذا المضيف. */
export const STORAGE_KEY = "sb-sb-auth-token";

export async function installFakeSupabase(context: BrowserContext, opts: FakeOptions) {
  const calls: Call[] = [];
  // افتراضيات الإنتاج المغلقة (N-04): المساعد والرسوم والتسميع عن بُعد وتحليل التلاوة مطفأة بلا صف. الاختبارات
  // تفترض أن صاحب التطبيق فعّلها، وموافقة الذكاء النصّي قائمة؛ ومن يختبر غير ذلك يمرّر قيمه.
  const tables: Record<string, Json[]> = {
    feature_flags: ["assistant", "fees", "remote", "recite_ai"].map((key) => ({
      key,
      enabled: true,
      rollout: 100,
      note: null,
    })),
    ...(opts.tables ?? {}),
  };
  const rpc: Record<string, Json | ((body: Json) => Json)> = {
    my_ai_consent: { text_ai: true, text_ai_effective: true },
    ...(opts.rpc ?? {}),
  };
  let user = opts.user;

  const json = (route: Route, body: Json, status = 200, headers: Record<string, string> = {}) =>
    route.fulfill({
      status,
      contentType: "application/json",
      headers: {
        "access-control-allow-origin": "*",
        "access-control-expose-headers": "content-range",
        ...headers,
      },
      body: JSON.stringify(body),
    });

  await context.route(`${FAKE_SUPABASE_URL}/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    if (method === "OPTIONS") {
      return route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "*",
          "access-control-allow-methods": "GET,POST,PATCH,DELETE,PUT,HEAD",
        },
      });
    }
    let body: Json;
    try {
      body = req.postDataJSON();
    } catch {
      body = req.postData();
    }
    const path = url.pathname;
    calls.push({ method, path, query: url.search, body });

    // ─── المصادقة ───
    if (path === "/auth/v1/token") {
      if (opts.rejectLogin || !user) {
        return json(
          route,
          {
            error: "invalid_grant",
            error_description: "Invalid login credentials",
            msg: "Invalid login credentials",
          },
          400,
        );
      }
      return json(route, session(user));
    }
    if (path === "/auth/v1/user") return user ? json(route, authUser(user)) : json(route, {}, 401);
    if (path === "/auth/v1/logout") {
      user = null;
      return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } });
    }
    if (path.startsWith("/auth/v1/")) return json(route, {});

    // ─── RPC ───
    if (path.startsWith("/rest/v1/rpc/")) {
      const name = path.slice("/rest/v1/rpc/".length);
      if (opts.fail?.rpc?.includes(name))
        return json(route, { code: "XX000", message: "e2e failure" }, 500);
      const r = rpc[name];
      const out = typeof r === "function" ? (r as (b: Json) => Json)(body) : (r ?? null);
      return json(route, out);
    }

    // ─── الجداول ───
    if (path.startsWith("/rest/v1/")) {
      const table = path.slice("/rest/v1/".length);
      const single = (req.headers()["accept"] ?? "").includes("vnd.pgrst.object");
      if (opts.fail?.tables?.includes(table))
        return json(route, { code: "XX000", message: "e2e failure" }, 500);
      if (method === "GET" || method === "HEAD") {
        const rows = tables[table] ?? [];
        if (single)
          return rows[0]
            ? json(route, rows[0])
            : json(route, { code: "PGRST116", message: "no rows" }, 406);
        return json(route, rows, 200, {
          "content-range": `0-${Math.max(rows.length - 1, 0)}/${rows.length}`,
        });
      }
      // كتابة: نعيد ما أُرسل مع معرّف، ليجد العميل صفاً إن طلب representation.
      const rows = (Array.isArray(body) ? body : [body]).map((r, i) => ({
        id: `e2e-${table}-${calls.length}-${i}`,
        created_at: new Date().toISOString(),
        ...(r as object),
      }));
      return json(route, single ? rows[0] : rows, 201);
    }

    // ─── دوال Edge ───
    if (path.startsWith("/functions/v1/")) {
      const f = opts.functions?.[path.slice("/functions/v1/".length)];
      if (f === undefined) return json(route, { error: "دالة غير معرّفة في الاختبار." }, 404);
      return json(route, typeof f === "function" ? (f as (b: Json) => Json)(body) : f);
    }

    // ─── التخزين ───
    if (path.startsWith("/storage/v1/"))
      return json(route, { Key: path, path: path.split("/").slice(-1)[0] });

    return json(route, {});
  });

  // لا Realtime في الاختبارات.
  await context.routeWebSocket(/sb\.e2e\.test/, (ws) => ws.close());

  return { calls };
}

/** يزرع جلسة مسجَّلة قبل تحميل الصفحة (لاختبار المسارات المحمية دون المرور بشاشة الدخول). */
export async function seedSession(context: BrowserContext, user: FakeUser) {
  const s = session(user);
  await context.addInitScript(
    ([key, value]) => {
      localStorage.setItem(key, value);
      localStorage.setItem("zen-onboarded", "1");
    },
    [STORAGE_KEY, JSON.stringify(s)] as const,
  );
}

/** ينتظر اكتمال ترطيب React (بعد SSR) قبل التفاعل، وإلا ضاعت الكتابة في الحقول. */
export async function gotoReady(page: import("@playwright/test").Page, url: string) {
  await page.goto(url);
  await page.waitForFunction(() => {
    const el = document.querySelector("button, a, input");
    return !!el && Object.keys(el).some((k) => k.startsWith("__reactFiber"));
  });
}
