import { beforeEach, describe, expect, it } from "vitest";
import {
  fcmErrorCode,
  fcmPayload,
  isGoneResponse,
  parseServiceAccount,
  resetFcmTokenCache,
  sendFcm,
  signServiceJwt,
  type FcmServiceAccount,
} from "./fcm.server";
import { dispatchPush, type ClaimedPush, type PushStore } from "./push-core";

async function makeAccount(): Promise<{ sa: FcmServiceAccount; publicKey: CryptoKey }> {
  const kp = (await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const der = new Uint8Array(await crypto.subtle.exportKey("pkcs8", kp.privateKey));
  const b64 = btoa(Array.from(der, (b) => String.fromCharCode(b)).join(""));
  const pem = `-----BEGIN PRIVATE KEY-----\n${b64.match(/.{1,64}/g)!.join("\n")}\n-----END PRIVATE KEY-----\n`;
  return {
    sa: {
      project_id: "zen-test",
      client_email: "push@zen-test.iam.gserviceaccount.com",
      private_key: pem,
    },
    publicKey: kp.publicKey,
  };
}

const fromB64url = (s: string) => {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

describe("fcm.server", () => {
  beforeEach(() => resetFcmTokenCache());

  it("يقرأ حساب الخدمة ويرفض الناقص أو التالف", () => {
    expect(parseServiceAccount(undefined)).toBeNull();
    expect(parseServiceAccount("{not json")).toBeNull();
    expect(parseServiceAccount(JSON.stringify({ project_id: "p", client_email: "e" }))).toBeNull();
    const ok = parseServiceAccount(
      JSON.stringify({
        project_id: "p",
        client_email: "e@x",
        private_key: "-----BEGIN PRIVATE KEY-----\\nAA\\n-----END PRIVATE KEY-----",
        extra: "يُهمل",
      }),
    );
    expect(ok).toMatchObject({ project_id: "p", client_email: "e@x" });
    expect(ok).not.toHaveProperty("extra");
  });

  it("يوقّع JWT حساب الخدمة بـ RS256 توقيعاً يتحقّق بالمفتاح العام", async () => {
    const { sa, publicKey } = await makeAccount();
    const jwt = await signServiceJwt(sa, 1_000_000);
    const [h, c, sig] = jwt.split(".");
    expect(JSON.parse(new TextDecoder().decode(fromB64url(h)))).toEqual({
      alg: "RS256",
      typ: "JWT",
    });
    expect(JSON.parse(new TextDecoder().decode(fromB64url(c)))).toEqual({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: 1_000_000,
      exp: 1_003_600,
    });
    const valid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      publicKey,
      fromB64url(sig),
      new TextEncoder().encode(`${h}.${c}`),
    );
    expect(valid).toBe(true);
  });

  it("يميّز الرمز المنتهي عن الخطأ العابر", () => {
    expect(isGoneResponse(404, "")).toBe(true);
    expect(isGoneResponse(400, '{"error":{"details":[{"errorCode":"UNREGISTERED"}]}}')).toBe(true);
    expect(
      isGoneResponse(400, '{"error":{"status":"INVALID_ARGUMENT","message":"bad title"}}'),
    ).toBe(false);
    expect(
      isGoneResponse(
        400,
        '{"error":{"status":"INVALID_ARGUMENT","message":"The registration token is not a valid FCM registration token"}}',
      ),
    ).toBe(true);
    expect(
      fcmErrorCode('{"error":{"status":"NOT_FOUND","details":[{"errorCode":"UNREGISTERED"}]}}'),
    ).toBe("UNREGISTERED");
    expect(fcmErrorCode('{"error":{"status":"QUOTA_EXCEEDED"}}')).toBe("QUOTA_EXCEEDED");
    expect(fcmErrorCode("unavailable")).toBeUndefined();
    expect(isGoneResponse(500, "UNREGISTERED")).toBe(false);
    expect(isGoneResponse(429, "")).toBe(false);
  });

  it("الحمولة تحمل رابطاً داخلياً ووسماً، ولا نص فارغاً null", () => {
    const p = fcmPayload("tok", { title: "واجب", body: null, url: "/today", tag: "assignments" });
    expect(p.message.token).toBe("tok");
    expect(p.message.notification).toEqual({ title: "واجب", body: "" });
    expect(p.message.data).toEqual({ url: "/today", tag: "assignments" });
    // صوت الجوال واهتزازه الافتراضيان على القناة الوحيدة، ولا وسم يستبدل الإشعار السابق.
    expect(p.message.android.notification).toMatchObject({
      channel_id: "zen-default",
      sound: "default",
      default_sound: true,
      default_vibrate_timings: true,
      notification_priority: "PRIORITY_HIGH",
    });
    expect(p.message.android.notification).not.toHaveProperty("tag");
    expect(p.message.android.notification.visibility).toBe("PUBLIC");
    // قفل التطبيق 1.29.0 (M6): الرسالة الخاصة مخفية على شاشة قفل الجهاز.
    const q = fcmPayload("tok", { title: "زِن", body: "x", url: "/", tag: "t", private: true });
    expect(q.message.android.notification.visibility).toBe("PRIVATE");
    // لا يعيش الإشعار في FCM أكثر من يوم، ومعرّف التنبيه (إن وُجد) يُحمل ليُعلَّم مقروءاً عند النقر.
    expect(p.message.android.ttl).toBe("86400s");
    const r = fcmPayload("tok", { title: "x", body: "y", url: "/today", tag: "t", nid: "n-1" });
    expect(r.message.data).toEqual({ url: "/today", tag: "t", nid: "n-1" });
  });

  it("يطلب رمز الوصول مرة واحدة ثم يرسل لكل جهاز ويعلّم المنتهي", async () => {
    const { sa } = await makeAccount();
    const seen: { url: string; auth?: string; body?: string }[] = [];
    const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      seen.push({ url, auth: headers.get("authorization") ?? undefined, body: String(init?.body) });
      if (url.includes("oauth2"))
        return Response.json({ access_token: "ya29.test", expires_in: 3600 });
      const token = (JSON.parse(String(init?.body)) as { message: { token: string } }).message
        .token;
      if (token === "dead")
        return new Response('{"error":{"status":"NOT_FOUND"}}', { status: 404 });
      if (token === "flaky") return new Response("unavailable", { status: 503 });
      return Response.json({ name: "projects/zen-test/messages/1" });
    }) as typeof fetch;

    const msg = {
      title: "وردك",
      body: "حان وقت الورد",
      url: "/quran",
      tag: "zen-daily-memorization",
    };
    const r1 = await sendFcm(["live", "dead", "flaky"], msg, sa, fakeFetch);
    const r2 = await sendFcm(["live"], msg, sa, fakeFetch);
    expect(r1.map((r) => [r.token, r.ok, r.gone])).toEqual([
      ["live", true, false],
      ["dead", false, true],
      ["flaky", false, false],
    ]);
    expect(r2[0].ok).toBe(true);
    expect(seen.filter((s) => s.url.includes("oauth2"))).toHaveLength(1);
    const send = seen.find((s) => s.url.includes("fcm.googleapis.com"))!;
    expect(send.url).toBe("https://fcm.googleapis.com/v1/projects/zen-test/messages:send");
    expect(send.auth).toBe("Bearer ya29.test");
    expect(seen.find((s) => s.url.includes("oauth2"))!.body).toContain("grant_type=urn");
  });
});

describe("dispatchPush مع الأجهزة الأصلية", () => {
  const row = (subs: unknown[]): ClaimedPush => ({
    id: "o1",
    user_id: "u",
    category: "assignments",
    title: "واجب",
    body: null,
    url: "/today",
    subscriptions: subs,
  });

  function storeWith(rows: ClaimedPush[]) {
    const finished: [string, string[], string[]][] = [];
    const store: PushStore = {
      enqueueReminders: async () => undefined,
      claim: async () => rows,
      finish: async (id, d, g) => void finished.push([id, d, g]),
    };
    return { store, finished };
  }

  const SA = { project_id: "p", client_email: "e", private_key: "k" };

  it("يرسل لرموز Android وiOS فقط ويختمها، ويتجاهل اشتراكات المتصفح والمنصّات غير المعروفة", async () => {
    const { store, finished } = storeWith([
      row([
        { endpoint: "https://push.example/a", p256dh: "k", auth: "s" },
        { token: "tok-live", platform: "android" },
        { token: "tok-dead", platform: "android" },
        { token: "tok-ios", platform: "ios" },
        { token: "tok-x", platform: "windows" },
      ]),
    ]);
    const nativeCalls: string[][] = [];
    const sum = await dispatchPush(store, SA, {
      sendNative: async (tokens) => {
        nativeCalls.push(tokens);
        return tokens.map((t) => ({
          token: t,
          ok: t !== "tok-dead",
          gone: t === "tok-dead",
          status: 200,
        }));
      },
    });
    expect(nativeCalls).toEqual([["tok-live", "tok-dead", "tok-ios"]]);
    expect(finished).toEqual([["o1", ["tok-live", "tok-ios"], ["tok-dead"]]]);
    expect(sum).toEqual({ claimed: 1, delivered: 2, gone: 1, failed: 0 });
  });

  it("صف بلا رموز أصلية يُختم دون نداء FCM", async () => {
    const { store, finished } = storeWith([
      row([{ endpoint: "https://push.example/a", p256dh: "k", auth: "s" }]),
    ]);
    let called = false;
    await dispatchPush(store, SA, {
      sendNative: async () => {
        called = true;
        return [];
      },
    });
    expect(called).toBe(false);
    expect(finished).toEqual([["o1", [], []]]);
  });
});
