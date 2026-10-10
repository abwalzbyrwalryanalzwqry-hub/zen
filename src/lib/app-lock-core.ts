/**
 * قفل التطبيق — منطق نقي بلا جسر ولا واجهة (يُختبر في app-lock-core.test.ts).
 * القواعد نفسها مفروضة في الطبقة الأصلية (AppLockPolicy.java)؛ هنا لتوجيه المستخدم قبل الإرسال
 * ولعرض الحالة، لا للحماية.
 */

// الحالة وتطبيعها في app-lock-state (الحزمة الأولى)؛ تُعاد هنا ليبقى للمنطق النقي مدخل واحد.
export {
  DEFAULT_GRACE,
  DISABLED_STATE,
  GRACE_OPTIONS,
  IDLE_OPTIONS,
  normalizeState,
  type LockMethod,
  type LockState,
} from "./app-lock-state";

/** weak_only (1.29.0، M1): بصمة/وجه ضعيف فقط (Class 2)، لا يكفي لفتح رمز PIN. */
export type BiometricStatus =
  "available" | "weak_only" | "none_enrolled" | "no_hardware" | "unavailable";

export type LockCaps = {
  biometric: BiometricStatus;
  deviceSecure: boolean;
  pinSupported: boolean;
  sdk: number;
  /** preview: Android 13+ يخفي المعاينة وحدها. secure: FLAG_SECURE يمنع لقطات الشاشة أيضاً. */
  recentsMode: "preview" | "secure";
};

/** نتائج مصادقة النظام كما يعيدها ZenLockPlugin.authenticate. */
export type AuthCode =
  | "canceled"
  | "lockout"
  | "lockout_permanent"
  | "no_biometrics"
  | "no_credential"
  | "no_hardware"
  | "timeout"
  | "unavailable"
  | "busy"
  /** 1.29.0 (M1): أُضيفت بصمة جديدة منذ التفعيل، فأُطفئت البصمة حتى يُعاد تفعيلها بعد الرمز. */
  | "bio_changed";

export type AuthResult = { ok: true } | { ok: false; code: AuthCode };

export type PinResult =
  { ok: true } | { ok: false; failures: number; lockoutMs: number; attemptsLeft: number };

export const NO_CAPS: LockCaps = {
  biometric: "no_hardware",
  deviceSecure: false,
  pinSupported: false,
  sdk: 0,
  recentsMode: "secure",
};

export const PIN_MIN = 4;
export const PIN_MAX = 6;

/**
 * أشهر الرموز التي لا تلتقطها القواعد العامة؛ نسخة طبق الأصل من AppLockPolicy.COMMON_PINS
 * (app-lock-core.test.ts يقارن القائمتين حرفياً).
 */
export const COMMON_PINS: readonly string[] = [
  "1122",
  "2580",
  "0852",
  "1004",
  "6969",
  "5683",
  "2468",
  "1357",
  "7777",
  "1123",
  "1987",
  "0007",
  "1001",
  "2001",
  "1110",
  "0911",
  "1100",
  "8520",
  "1470",
  "3690",
  "0123",
  "112233",
  "111222",
  "000111",
  "159753",
  "147258",
  "258369",
  "789456",
  "456789",
  "520520",
  "147852",
  "963852",
  "753951",
  "102030",
  "101010",
  "112211",
  "123321",
  "100200",
];

function periodic(pin: string, p: number): boolean {
  const n = pin.length;
  if (n % p !== 0 || n / p < 2) return false;
  for (let i = p; i < n; i++) if (pin[i] !== pin[i - p]) return false;
  return true;
}

/** null إن كان الرمز مقبولاً، وإلا السبب (مثل AppLockPolicy.pinProblem تماماً). */
export function pinProblem(pin: string): "length" | "digits" | "weak" | null {
  if (pin.length < PIN_MIN || pin.length > PIN_MAX) return "length";
  if (!/^[0-9]+$/.test(pin)) return "digits";
  const d = [...pin].map(Number);
  let same = true;
  let up = true;
  let down = true;
  for (let i = 1; i < d.length; i++) {
    if (d[i] !== d[i - 1]) same = false;
    if (d[i] !== (d[i - 1] + 1) % 10) up = false;
    if (d[i] !== (d[i - 1] + 9) % 10) down = false;
  }
  if (same || up || down) return "weak";
  if (periodic(pin, 2) || periodic(pin, 3)) return "weak";
  if (pin.length === 4) {
    const year = Number(pin);
    if (year >= 1950 && year <= 2030) return "weak";
  }
  return COMMON_PINS.includes(pin) ? "weak" : null;
}

/**
 * تلميح قوة الرمز أثناء الكتابة (1.29.0): null قبل 4 أرقام؛ weak = سيُرفض؛ fair = 4–5 أرقام مقبولة؛
 * strong = 6 أرقام مقبولة. للتوجيه فقط، والحسم في pinProblem والطبقة الأصلية.
 */
export function pinStrength(pin: string): "weak" | "fair" | "strong" | null {
  if (pin.length < PIN_MIN) return null;
  if (pinProblem(pin)) return "weak";
  return pin.length >= PIN_MAX ? "strong" : "fair";
}

/** وسائل القفل الممكنة فعلاً على هذا الجهاز. */
export function availableMethods(caps: LockCaps): { pin: boolean; device: boolean } {
  return { pin: caps.pinSupported, device: caps.deviceSecure };
}

/** هل يمكن عرض الفتح بالبصمة/الوجه مع PIN الآن؟ */
export function biometricReady(caps: LockCaps): boolean {
  return caps.biometric === "available";
}

/**
 * وسائل استعادة الوصول إن نُسي PIN (1.29.0): قفل الجهاز إن سمح به الخيار deviceRecovery (M2)، وكلمة مرور
 * الحساب المربوط بالقفل أصلياً (H1). لا شيء منها يتجاوز القفل بنقرة: كلها مصادقة حقيقية تتحقق منها Java.
 */
export function recoveryOptions(
  caps: LockCaps,
  state: { deviceRecovery: boolean; recoveryAccount: boolean },
): { device: boolean; account: boolean; any: boolean } {
  const device = caps.deviceSecure && state.deviceRecovery;
  const account = state.recoveryAccount;
  return { device, account, any: device || account };
}

/**
 * البريد المعروض لحساب الاستعادة: حساب «اسم المستخدم» بريده داخلي (…@users.zen.invalid) لا يعرفه صاحبه،
 * فلا يُعرض (null) وتُذكر «كلمة مرور حسابك» وحدها.
 */
export function accountLabel(email: string | null): string | null {
  if (!email) return null;
  return /@users\.zen\.invalid$/i.test(email) ? null : email;
}

/** مفتاح ترجمة لفشل الاستعادة بكلمة المرور (رموز grantAccountRecovery). */
export function recoverErrorKey(code: string | null): string {
  switch (code) {
    case "BAD_CREDENTIALS":
      return "appLock.recover.badPassword";
    case "MISMATCH":
      return "appLock.recover.mismatch";
    case "NETWORK":
      return "appLock.recover.offline";
    case "RATE_LIMITED":
      return "appLock.recover.rateLimited";
    case "LOCKED_OUT":
      return "appLock.recover.lockedOut";
    case "NO_ACCOUNT":
      return "appLock.recover.noAccount";
    default:
      return "appLock.recover.failed";
  }
}

/** مفتاح ترجمة لرسالة نتيجة مصادقة النظام (رسائل توضح الخطوة التالية بلا تفاصيل أمنية). */
export function authMessageKey(code: AuthCode): string {
  switch (code) {
    case "canceled":
      return "appLock.auth.canceled";
    case "lockout":
      return "appLock.auth.lockout";
    case "lockout_permanent":
      return "appLock.auth.lockoutPermanent";
    case "no_biometrics":
      return "appLock.auth.noBiometrics";
    case "no_credential":
      return "appLock.auth.noCredential";
    case "no_hardware":
      return "appLock.auth.noHardware";
    case "timeout":
      return "appLock.auth.timeout";
    case "busy":
      return "appLock.auth.busy";
    case "bio_changed":
      return "appLock.auth.bioChanged";
    default:
      return "appLock.auth.unavailable";
  }
}

/** مفتاح ترجمة لسبب رفض PIN. */
export function pinProblemKey(p: "length" | "digits" | "weak"): string {
  return `appLock.pin.problem.${p}`;
}

/** «30 ثانية» / «5 دقائق»: نص الانتظار بعد محاولات خاطئة (عدد صحيح للأعلى). */
export function waitParts(ms: number): { unit: "seconds" | "minutes"; n: number } {
  const s = Math.max(1, Math.ceil(ms / 1000));
  return s >= 60 ? { unit: "minutes", n: Math.ceil(s / 60) } : { unit: "seconds", n: s };
}

/** مفتاح ترجمة لمدة القفل بعد الخمول. */
export function idleKey(ms: number): string {
  switch (ms) {
    case 300_000:
      return "appLock.idle.m5";
    case 600_000:
      return "appLock.idle.m10";
    case 900_000:
      return "appLock.idle.m15";
    default:
      return "appLock.idle.off";
  }
}

/** مفتاح ترجمة لفترة السماح. */
export function graceKey(ms: number): string {
  switch (ms) {
    case 0:
      return "appLock.grace.immediate";
    case 30_000:
      return "appLock.grace.s30";
    case 60_000:
      return "appLock.grace.m1";
    case 300_000:
      return "appLock.grace.m5";
    default:
      return "appLock.grace.immediate";
  }
}

export function normalizeCaps(raw: unknown): LockCaps {
  const r = (raw ?? {}) as Partial<Record<keyof LockCaps, unknown>>;
  const bio: BiometricStatus[] = [
    "available",
    "weak_only",
    "none_enrolled",
    "no_hardware",
    "unavailable",
  ];
  return {
    biometric: bio.includes(r.biometric as BiometricStatus)
      ? (r.biometric as BiometricStatus)
      : "unavailable",
    deviceSecure: r.deviceSecure === true,
    pinSupported: r.pinSupported === true,
    sdk: typeof r.sdk === "number" ? r.sdk : 0,
    recentsMode: r.recentsMode === "preview" ? "preview" : "secure",
  };
}
