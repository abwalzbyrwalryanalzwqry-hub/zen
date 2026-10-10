/**
 * تسجيل الجهاز للإشعارات الفورية (1.16.1) — مصدر واحد للتطبيق كله.
 *
 * كان الجهاز لا يُسجَّل إلا إن فتح المستخدم «الإعدادات ← التنبيهات» وفعّل المفتاح بنفسه، فلم يُسجَّل أي جهاز
 * على الإنتاج (0 رموز)، فبقيت الإشعارات في قائمة التطبيق ولا تصل إلى الهاتف أبداً. الآن:
 *
 *  - بعد الدخول يُطلب الإذن مرة واحدة (Android 13+) ويُسجَّل الجهاز تلقائياً، ثم يُتحقق منه عند كل تشغيل
 *    (الرمز يتغيّر، أو دخل حساب آخر على الجهاز) دون أن يُسأل المستخدم مرة أخرى.
 *  - مستمع دائم لـ `registration`: كل رمز جديد من FCM يُحفظ على الخادم فوراً.
 *  - قناة واحدة `zen-default` بأهمية عالية وصوت الجوال الافتراضي واهتزاز، تُنشأ عند التشغيل قبل وصول أي إشعار.
 *  - إيقاف المستخدم للإشعارات من الإعدادات يُحفظ على الجهاز فلا يعيد التشغيل التلقائي تفعيلها.
 */
import { Capacitor } from "@capacitor/core";
import { lazyRpc as rpc } from "@/integrations/supabase/lazy";
import { isOnline } from "@/lib/network";

export const ANDROID_CHANNEL = "zen-default";
export const NATIVE_TOKEN_KEY = "zen-native-push-token";
const TOKEN_USER_KEY = "zen.push.user";
const OPT_OUT_KEY = "zen.push.optout";
const ASKED_KEY = "zen.push.asked";

export type PushPermission = "granted" | "denied" | "prompt";
export type DeviceState = "unsupported" | "on" | "off" | "denied" | "blocked";

const ls = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string | null) => {
    try {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch {
      /* التخزين غير متاح */
    }
  },
};

export function pushPlatform(): "android" | "ios" | null {
  try {
    if (!Capacitor.isNativePlatform()) return null;
    const p = Capacitor.getPlatform();
    return p === "android" || p === "ios" ? p : null;
  } catch {
    return null;
  }
}

async function plugin() {
  const { PushNotifications } = await import("@capacitor/push-notifications");
  return PushNotifications;
}

export const savedToken = () => ls.get(NATIVE_TOKEN_KEY);
export const optedOut = () => ls.get(OPT_OUT_KEY) === "1";

export async function pushPermission(): Promise<PushPermission> {
  if (!pushPlatform()) return "denied";
  const p = (await (await plugin()).checkPermissions()).receive;
  return p === "granted" ? "granted" : p === "denied" ? "denied" : "prompt";
}

/** القناة الوحيدة: أهمية عالية (منبثق وصوت)، وصوت الجوال الافتراضي (بلا `sound`)، واهتزاز وضوء. */
export async function ensureChannel(): Promise<void> {
  if (pushPlatform() !== "android") return;
  await (
    await plugin()
  )
    .createChannel({
      id: ANDROID_CHANNEL,
      name: "تنبيهات زِن",
      description: "الواجبات والتقييم والحضور والرسائل والتذكيرات",
      importance: 4,
      visibility: 1,
      vibration: true,
      lights: true,
    })
    .catch(() => undefined);
}

/** قناة أطفأها المستخدم من إعدادات الجوال (أهمية 0). */
export async function channelBlocked(): Promise<boolean> {
  if (pushPlatform() !== "android") return false;
  try {
    const { channels } = await (await plugin()).listChannels();
    const c = channels.find((x) => x.id === ANDROID_CHANNEL);
    return !!c && c.importance === 0;
  } catch {
    return false;
  }
}

/* ─────────── الرمز ─────────── */

let currentUser: string | null = null;
let listening: Promise<void> | null = null;
let waiting: { resolve: (t: string) => void; reject: (e: Error) => void } | null = null;

async function saveToken(token: string): Promise<boolean> {
  const platform = pushPlatform();
  if (!platform || !currentUser) return false;
  const { error } = await rpc("save_native_push_token", { _token: token, _platform: platform });
  if (error) return false;
  ls.set(NATIVE_TOKEN_KEY, token);
  ls.set(TOKEN_USER_KEY, currentUser);
  // قفل التطبيق 1.29.0 (M6): الرمز الجديد يبدأ عاماً على الخادم؛ يُرسل خيار «إخفاء نص الإشعارات» له.
  void import("@/lib/app-lock-push").then((m) => m.syncLockPushPrivacy()).catch(() => undefined);
  return true;
}

/** مستمعان دائمان مرة واحدة: كل رمز (أول مرة أو بعد تجديده من FCM) يُحفظ. */
function listen(): Promise<void> {
  return (listening ??= (async () => {
    const Push = await plugin();
    await Push.addListener("registration", (t) => {
      const w = waiting;
      waiting = null;
      // طلب صريح ينتظر الرمز: هو يحفظه. غير ذلك تجديد من FCM يُحفظ هنا.
      if (w) return w.resolve(t.value);
      if (currentUser && !optedOut() && t.value !== savedToken()) void saveToken(t.value);
    });
    await Push.addListener("registrationError", (e) => {
      waiting?.reject(new Error(e?.error || "registration"));
      waiting = null;
    });
  })());
}

function requestToken(Push: Awaited<ReturnType<typeof plugin>>): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), 20_000);
    waiting = {
      resolve: (t) => {
        clearTimeout(timer);
        resolve(t);
      },
      reject: (e) => {
        clearTimeout(timer);
        reject(e);
      },
    };
    void Push.register().catch((e: unknown) => waiting?.reject(e as Error));
  });
}

export type RegisterResult = "on" | "denied" | "offline" | "failed" | "unsupported";

/**
 * يسجّل الجهاز ويحفظ رمزه للمستخدم. `prompt`: يُعرض طلب الإذن إن لم يُحسم بعد.
 * يعيد الحالة بدل الرمي، فالمستدعي يعرض الرسالة المناسبة.
 */
export async function registerDevice(
  user: string,
  { prompt }: { prompt: boolean },
): Promise<RegisterResult> {
  const platform = pushPlatform();
  if (!platform) return "unsupported";
  currentUser = user;
  const Push = await plugin();
  let perm = await pushPermission();
  if (perm === "prompt" && prompt) {
    ls.set(ASKED_KEY, "1");
    const r = (await Push.requestPermissions()).receive;
    perm = r === "granted" ? "granted" : r === "denied" ? "denied" : "prompt";
  }
  if (perm !== "granted") return "denied";
  await ensureChannel();
  await listen();
  if (!isOnline()) return "offline";
  let token: string;
  try {
    token = await requestToken(Push);
  } catch {
    return isOnline() ? "failed" : "offline";
  }
  if (token === savedToken() && ls.get(TOKEN_USER_KEY) === user) return "on";
  return (await saveToken(token)) ? "on" : isOnline() ? "failed" : "offline";
}

/**
 * عند كل تشغيل بعد الدخول: يُنشئ القناة، ويسجّل الجهاز إن لم يوقفه المستخدم. يُطلب الإذن مرة واحدة فقط
 * في عمر التثبيت؛ ومن رفض يفعّلها من الإعدادات. دون اتصال يُعاد عند عودته.
 */
export async function autoRegister(user: string): Promise<RegisterResult | "skipped"> {
  if (!pushPlatform()) return "unsupported";
  await ensureChannel();
  if (optedOut()) return "skipped";
  const r = await registerDevice(user, { prompt: ls.get(ASKED_KEY) !== "1" });
  if (r === "offline" && typeof window !== "undefined") {
    const retry = () => {
      window.removeEventListener("online", retry);
      void registerDevice(user, { prompt: false }).catch(() => undefined);
    };
    window.addEventListener("online", retry);
  }
  return r;
}

/** تفعيل صريح من الإعدادات: يلغي الإيقاف ويطلب الإذن إن أمكن. */
export async function turnOnDevice(user: string): Promise<RegisterResult> {
  ls.set(OPT_OUT_KEY, null);
  return registerDevice(user, { prompt: true });
}

/** يحذف رمز الجهاز من الخادم ويلغي تسجيله. `remember`: إيقاف المستخدم (لا الخروج) يُحفظ. */
export async function unregisterDevice({ remember }: { remember: boolean }): Promise<void> {
  if (remember) ls.set(OPT_OUT_KEY, "1");
  const token = savedToken();
  if (token) await rpc("remove_native_push_token", { _token: token });
  ls.set(NATIVE_TOKEN_KEY, null);
  ls.set(TOKEN_USER_KEY, null);
  currentUser = null;
  if (pushPlatform()) await (await plugin()).unregister().catch(() => undefined);
}

/** حالة الجهاز للإعدادات. */
export async function deviceState(): Promise<DeviceState> {
  if (!pushPlatform()) return "unsupported";
  const perm = await pushPermission().catch(() => "denied" as const);
  if (perm === "denied") return "denied";
  if (await channelBlocked()) return "blocked";
  return savedToken() && !optedOut() && perm === "granted" ? "on" : "off";
}
