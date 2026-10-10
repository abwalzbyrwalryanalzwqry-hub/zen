/**
 * إرسال إشعارات Firebase Cloud Messaging (HTTP v1) لتطبيق أندرويد/iOS المغلَّف.
 *
 * لا مكتبة firebase-admin (لا تعمل على Cloudflare Workers): نوقّع JWT حساب الخدمة بـ RS256 عبر
 * WebCrypto، ونستبدله برمز وصول OAuth صالح لساعة، ثم نرسل رسالة لكل رمز جهاز.
 *
 * FCM_SERVICE_ACCOUNT سرّ خادم فقط (JSON حساب الخدمة كاملاً) — لا يبدأ بـ VITE_ أبداً (قاعدة 30).
 */

export type FcmServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri?: string;
};

export type FcmMessage = {
  title: string;
  body: string | null;
  url: string;
  tag: string;
  /** قفل التطبيق 1.29.0 (M6): خصوصية PRIVATE على شاشة قفل الجهاز (العنوان والنص عامّان أصلاً). */
  private?: boolean;
};

/** نص الإشعار العام لجهاز فعّل «إخفاء نص الإشعارات» مع قفل زِن. */
export const PRIVATE_PUSH = { title: "زِن", body: "لديك إشعار جديد" } as const;

/** نتيجة إرسال لرمز واحد؛ gone تعني أن الرمز لم يعد صالحاً فيُحذف. */
export type FcmResult = { token: string; ok: boolean; gone: boolean; status: number };

const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const DEFAULT_TOKEN_URI = "https://oauth2.googleapis.com/token";

/** يقرأ حساب الخدمة من السرّ؛ null إن لم يُهيَّأ (فتُتخطّى الأجهزة الأصلية بصمت). */
export function parseServiceAccount(raw: string | undefined | null): FcmServiceAccount | null {
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as Partial<FcmServiceAccount>;
    if (
      typeof j.project_id === "string" &&
      typeof j.client_email === "string" &&
      typeof j.private_key === "string" &&
      j.private_key.includes("PRIVATE KEY")
    ) {
      return {
        project_id: j.project_id,
        client_email: j.client_email,
        private_key: j.private_key,
        token_uri: j.token_uri,
      };
    }
  } catch {
    // يسقط إلى null
  }
  return null;
}

function b64url(bytes: Uint8Array | string): string {
  const raw = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  const bin = Array.from(raw, (b) => String.fromCharCode(b)).join("");
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const body = pem
    .replace(/\\n/g, "\n")
    .replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const bin = atob(body);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

/** JWT موقَّع لتبادل رمز الوصول (مصدَّر للاختبار). */
export async function signServiceJwt(sa: FcmServiceAccount, nowSec: number): Promise<string> {
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: SCOPE,
      aud: sa.token_uri ?? DEFAULT_TOKEN_URI,
      iat: nowSec,
      exp: nowSec + 3600,
    }),
  );
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const input = `${header}.${claims}`;
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(input));
  return `${input}.${b64url(new Uint8Array(sig))}`;
}

let cached: { email: string; token: string; exp: number } | null = null;

async function accessToken(sa: FcmServiceAccount, fetchImpl: typeof fetch): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.email === sa.client_email && cached.exp - 60 > now) return cached.token;
  const assertion = await signServiceJwt(sa, now);
  const res = await fetchImpl(sa.token_uri ?? DEFAULT_TOKEN_URI, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }).toString(),
  });
  if (!res.ok) throw new Error(`FCM oauth ${res.status}`);
  const j = (await res.json()) as { access_token: string; expires_in?: number };
  cached = { email: sa.client_email, token: j.access_token, exp: now + (j.expires_in ?? 3600) };
  return j.access_token;
}

/** للاختبارات: يُسقط رمز الوصول المخزَّن. */
export function resetFcmTokenCache() {
  cached = null;
}

/**
 * جسم رسالة HTTP v1. الرابط داخلي فقط (يُفتح داخل التطبيق عند النقر).
 *
 * 1.16.1: قناة `zen-default` الوحيدة بصوت الجوال واهتزازه الافتراضيين وأولوية عالية (منبثق على الشاشة)،
 * وظاهرة على شاشة القفل. بلا `tag` على Android: كان الوسم هو الفئة فيحلّ كل واجب جديد محلّ سابقه في الشريط.
 * 1.29.0: رسالة `private` (جهاز زِن فيه مقفل بخيار إخفاء النص) تُرسل بخصوصية PRIVATE.
 */
export function fcmPayload(token: string, msg: FcmMessage) {
  return {
    message: {
      token,
      notification: { title: msg.title, body: msg.body ?? "" },
      data: { url: msg.url, tag: msg.tag },
      android: {
        priority: "high",
        notification: {
          channel_id: "zen-default",
          sound: "default",
          default_sound: true,
          default_vibrate_timings: true,
          notification_priority: "PRIORITY_HIGH",
          visibility: msg.private ? "PRIVATE" : "PUBLIC",
        },
      },
      apns: { payload: { aps: { "thread-id": msg.tag } } },
    },
  };
}

/** رمز منتهٍ أو غير مسجّل: 404، أو 400 بخطأ UNREGISTERED/INVALID_ARGUMENT على الرمز. */
export function isGoneResponse(status: number, body: string): boolean {
  if (status === 404) return true;
  if (status === 400 || status === 403) {
    return /UNREGISTERED|registration-token-not-registered|invalid registration token/i.test(body);
  }
  return false;
}

export async function sendFcm(
  tokens: string[],
  msg: FcmMessage,
  sa: FcmServiceAccount,
  fetchImpl: typeof fetch = fetch,
): Promise<FcmResult[]> {
  if (tokens.length === 0) return [];
  const bearer = await accessToken(sa, fetchImpl);
  const url = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(sa.project_id)}/messages:send`;
  return Promise.all(
    tokens.map(async (token) => {
      try {
        const res = await fetchImpl(url, {
          method: "POST",
          headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json" },
          body: JSON.stringify(fcmPayload(token, msg)),
        });
        const text = res.ok ? "" : await res.text();
        return {
          token,
          ok: res.ok,
          gone: !res.ok && isGoneResponse(res.status, text),
          status: res.status,
        };
      } catch {
        return { token, ok: false, gone: false, status: 0 };
      }
    }),
  );
}
