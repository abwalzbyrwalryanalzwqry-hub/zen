import { rpc } from "@/integrations/supabase/rpc";
import { supabase } from "@/integrations/supabase/client";
import { cleanDbError } from "./account";
import { enableNativePush, isNativeApp } from "./native";
import { deviceState, unregisterDevice, type DeviceState } from "./notify/device";

/** فئات الإشعارات كما في push_category() وset_notification_prefs(). */
export const PUSH_CATEGORIES = [
  { key: "assignments", label: "واجب جديد", hint: "حين يسند إليك المعلّم واجباً" },
  { key: "grades", label: "تقييم التسميع", hint: "حين يقيّم المعلّم تسميعك" },
  { key: "family", label: "أبنائي", hint: "غياب الابن وتقييمه والتقرير الأسبوعي والشهري" },
  { key: "rooms", label: "غرف الحلقة", hint: "إعلانات المعلّم والنقاش" },
  { key: "achievements", label: "الإنجازات", hint: "الأوسمة والشهادات والتحديات" },
  { key: "general", label: "عام", hint: "الدعوات والمراكز وغيرها" },
  { key: "wird", label: "تذكير الورد", hint: "مرة في اليوم في الوقت الذي تختاره" },
  { key: "muhasaba", label: "تذكير المحاسبة", hint: "مرة في اليوم في الوقت الذي تختاره" },
] as const;
export type PushCategory = (typeof PUSH_CATEGORIES)[number]["key"];

export type NotificationPrefs = {
  push_enabled: boolean;
  categories: Partial<Record<PushCategory, boolean>>;
  quiet_start: string | null;
  quiet_end: string | null;
  timezone: string;
  wird_time: string | null;
  muhasaba_time: string | null;
};

export function localTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Aden";
  } catch {
    return "Asia/Aden";
  }
}

export const DEFAULT_PREFS: NotificationPrefs = {
  push_enabled: true,
  categories: {},
  quiet_start: null,
  quiet_end: null,
  timezone: "Asia/Aden",
  wird_time: null,
  muhasaba_time: null,
};

/** "20:00:00" ⇐⇒ "20:00" (حقل input type=time). */
export function hhmm(t: string | null | undefined): string {
  return t ? t.slice(0, 5) : "";
}

export function categoryOn(p: NotificationPrefs, key: PushCategory): boolean {
  return p.categories[key] ?? true;
}

/** يحفظ فقط ما خالف الافتراضي (المفعّل)، فتبقى الفئات الجديدة مفعّلة لمن لم يلمسها. */
export function toggleCategory(
  p: NotificationPrefs,
  key: PushCategory,
  on: boolean,
): NotificationPrefs {
  const categories = { ...p.categories };
  if (on) delete categories[key];
  else categories[key] = false;
  return { ...p, categories };
}

/**
 * الإشعارات الفورية عبر FCM في تطبيق Android وحده (زِن بلا ويب منذ 6.10). في أي بيئة أخرى (مثل
 * اختبارات E2E في المتصفح) تبقى غير متاحة بهدوء، والإشعار محفوظ داخل التطبيق على أي حال.
 */
export function pushSupported(): boolean {
  return isNativeApp();
}

/** هل هذا الجهاز مسجَّل الآن؟ */
export async function isPushSubscribed(): Promise<boolean> {
  return (await pushDeviceState()) === "on";
}

/** حالة الجهاز: مفعّل، أو موقوف، أو رفض الإذن، أو أطفأ قناة زِن من إعدادات الجوال. */
export async function pushDeviceState(): Promise<DeviceState> {
  return isNativeApp() ? deviceState().catch(() => "off" as const) : "unsupported";
}

/** يطلب الإذن ويسجّل رمز FCM. يعيد رسالة خطأ عربية أو null. */
export async function enablePush(): Promise<string | null> {
  if (!isNativeApp()) return "الإشعارات الفورية تعمل في تطبيق زِن على Android.";
  return enableNativePush();
}

/** إيقاف من الإعدادات: يُحفظ فلا يعيد التسجيل التلقائي تفعيله. */
export async function disablePush(): Promise<void> {
  if (isNativeApp()) await unregisterDevice({ remember: true });
}

/**
 * إشعار تجريبي عبر السلسلة كاملة (الخادم ← FCM ← الجهاز) بصوت الجوال الافتراضي. يعيد رمز خطأ أو null.
 * `send_test_push` تتجاوز ساعات الهدوء، وحدّها إشعار كل 30 ثانية.
 */
export async function sendTestPush(title: string, body: string): Promise<string | null> {
  const { error } = await rpc("send_test_push", { _title: title, _body: body });
  if (error) return /NO_DEVICE|RATE_LIMITED|AUTH_REQUIRED/.exec(error.message)?.[0] ?? "FAILED";
  await kickPushSoon();
  return null;
}

/**
 * إعدادات التنبيهات المحفوظة. عند الفشل يرمي (SEC-03): كانت تعيد الافتراضية فتُعرض كأنها إعدادات
 * المستخدم، ثم يكتبها «حفظ» فوق قيمه الحقيقية على الخادم.
 */
export async function fetchPrefs(userId: string): Promise<NotificationPrefs> {
  const { data, error } = await supabase
    .from("notification_prefs")
    .select("push_enabled, categories, quiet_start, quiet_end, timezone, wird_time, muhasaba_time")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(pushError(error.message));
  if (!data) return { ...DEFAULT_PREFS, timezone: localTimezone() };
  return { ...data, categories: (data.categories ?? {}) as NotificationPrefs["categories"] };
}

export async function savePrefs(p: NotificationPrefs): Promise<void> {
  const t = (v: string | null) => (v ? hhmm(v) : null);
  const { error } = await rpc("set_notification_prefs", {
    _push_enabled: p.push_enabled,
    _categories: p.categories,
    _quiet_start: t(p.quiet_start),
    _quiet_end: t(p.quiet_end),
    _timezone: p.timezone,
    _wird_time: t(p.wird_time),
    _muhasaba_time: t(p.muhasaba_time),
  });
  if (error) throw new Error(pushError(error.message));
}

const PUSH_ERRORS: Record<string, string> = {
  INVALID_TIMEZONE: "المنطقة الزمنية غير معروفة.",
  INVALID_QUIET_HOURS: "حدّد بداية ساعات الهدوء ونهايتها معاً.",
  INVALID_CATEGORIES: "نوع إشعار غير معروف.",
  SUBSCRIPTION_CONFLICT: "هذا الجهاز مسجّل لحساب آخر. أعد تفعيل الإشعارات.",
  AUTH_REQUIRED: "سجّل الدخول أولاً.",
};

export function pushError(message: string): string {
  const code = Object.keys(PUSH_ERRORS).find((k) => message.includes(k));
  return code ? PUSH_ERRORS[code] : cleanDbError(message);
}

/**
 * يطلب من دالة Edge «zen-push-dispatch» إرسال المستحق الآن. لا يفشل أبداً: الإشعار
 * محفوظ في التطبيق على أي حال، والمجدول يرسله خلال دقيقة.
 */
export async function kickPushSoon(): Promise<void> {
  try {
    const { callEdge } = await import("./server-call");
    await callEdge("zen-push-dispatch", {});
  } catch {
    // لا شيء: المجدول يرسله لاحقاً.
  }
}
