/**
 * أفعال قفل التطبيق عبر جسر `ZenLock` (android/app/src/main/java/app/zen/quran/ZenLockPlugin.java).
 * الحالة والإقلاع في `app-lock-state.ts` (الحزمة الأولى)؛ هذه الوحدة تُحمَّل مع شاشة القفل والإعدادات فقط.
 *
 * نقطة التحكّم هي الطبقة الأصلية: هي وحدها تقرّر «مقفل/مفتوح»، وتتحقق من PIN، وتعرض BiometricPrompt،
 * وتحسب فترة السماح بساعة رتيبة. الواجهة تعكس تلك الحالة فقط (AppLockGate) ولا تملك طريقاً لفتح القفل
 * بنفسها. خارج تطبيق Android (اختبارات المتصفح) القفل غير متاح ولا يغيّر شيئاً.
 *
 * لا يمرّ رمز PIN إلا في وسيط استدعاء الجسر: لا يُحفظ في الواجهة ولا يُسجَّل ولا يُرسل إلى أي خدمة.
 */
import {
  NO_CAPS,
  normalizeCaps,
  normalizeState,
  type AuthCode,
  type AuthResult,
  type LockCaps,
  type LockState,
  type PinResult,
} from "@/lib/app-lock-core";
import {
  ZenLock,
  appLockAvailable,
  lockSnapshot,
  publishLock,
  refreshLock,
  type LockAccount,
  type LockOptions,
  type PromptText,
} from "./app-lock-state";

export {
  __setLockSnapshot,
  appLockAvailable,
  installAppLock,
  isAppLocked,
  lockSnapshot,
  refreshLock,
  useAppLock,
  type LockSnapshot,
} from "./app-lock-state";
export type {
  AuthCode,
  AuthResult,
  LockCaps,
  LockMethod,
  LockState,
  PinResult,
} from "@/lib/app-lock-core";

export async function lockCapabilities(): Promise<LockCaps> {
  if (!appLockAvailable()) return NO_CAPS;
  try {
    return normalizeCaps(await ZenLock.getCapabilities());
  } catch {
    return NO_CAPS;
  }
}

export async function hideNativeCover(): Promise<void> {
  if (!appLockAvailable()) return;
  await ZenLock.hideCover().catch(() => undefined);
}

function toPinResult(raw: unknown): PinResult {
  const r = (raw ?? {}) as Record<string, unknown>;
  if (r.ok === true) return { ok: true };
  const n = (v: unknown) => (typeof v === "number" && v >= 0 ? v : 0);
  return {
    ok: false,
    failures: n(r.failures),
    lockoutMs: n(r.lockoutMs),
    attemptsLeft: n(r.attemptsLeft),
  };
}

export async function verifyPin(pin: string, purpose: "unlock" | "confirm"): Promise<PinResult> {
  const r = toPinResult(await ZenLock.verifyPin({ pin, purpose }));
  await refreshLock().catch(() => undefined);
  return r;
}

const AUTH_CODES: readonly AuthCode[] = [
  "canceled",
  "lockout",
  "lockout_permanent",
  "no_biometrics",
  "no_credential",
  "no_hardware",
  "timeout",
  "unavailable",
  "busy",
  "bio_changed",
];

/** نافذة المصادقة الرسمية. النجاح فقط حين تؤكده المنصة (onAuthenticationSucceeded). */
export async function authenticate(
  mode: "biometric" | "device",
  purpose: "unlock" | "confirm" | "recover" | "enroll",
  text: PromptText,
): Promise<AuthResult> {
  if (!appLockAvailable()) return { ok: false, code: "unavailable" };
  try {
    const r = (await ZenLock.authenticate({ mode, purpose, ...text })) as {
      ok?: unknown;
      code?: unknown;
    };
    await refreshLock().catch(() => undefined);
    if (r?.ok === true) return { ok: true };
    const code = AUTH_CODES.includes(r?.code as AuthCode) ? (r.code as AuthCode) : "unavailable";
    return { ok: false, code };
  } catch {
    return { ok: false, code: "unavailable" };
  }
}

async function apply(p: Promise<unknown>): Promise<LockState> {
  const state = normalizeState(await p);
  publishLock(state);
  return state;
}

export const setupPin = async (pin: string, biometric: boolean) => {
  const account = await currentAccount();
  return apply(ZenLock.setupPin({ pin, biometric, ...(account ? { account } : {}) }));
};
export const enableDeviceLock = async () => {
  const account = await currentAccount();
  return apply(ZenLock.enableDevice(account ? { account } : {}));
};
export const setBiometricWithPin = (enabled: boolean) => apply(ZenLock.setBiometric({ enabled }));
export const setLockOptions = (o: LockOptions) => apply(ZenLock.setOptions(o));
export const disableAppLock = () => apply(ZenLock.disable());
/** «اقفل الآن»: يقفل فوراً (الطبقة الأصلية تعرض الغطاء وترسل lockChanged). */
export const lockAppNow = () => apply(ZenLock.lockNow());
/** المستخدم رأى إشعار المحاولات الخاطئة. */
export const ackLockFailures = () => apply(ZenLock.ackFailures());

export async function openSecuritySettings(): Promise<boolean> {
  try {
    await ZenLock.openSecuritySettings();
    return true;
  } catch {
    return false;
  }
}

/** رمز خطأ الجسر (مثل AUTH_REQUIRED أو PIN_WEAK)، أو null. */
export function bridgeErrorCode(e: unknown): string | null {
  const c = (e as { code?: unknown } | null)?.code;
  return typeof c === "string" ? c : null;
}

/** الحساب المسجّل على الجهاز ببريد (لا الضيف)، لربط القفل به للاستعادة بكلمة المرور. */
export async function currentAccount(): Promise<LockAccount | null> {
  try {
    const { isGuest } = await import("@/lib/offline/guest");
    if (isGuest()) return null;
    const session = await deviceSession();
    const email = session?.user.email;
    const userId = session?.user.id;
    return email && userId ? { userId, email } : null;
  } catch {
    return null;
  }
}

/** الجلسة الحالية، أو المحفوظة على الجهاز إن لم يبدأ مخزن الجلسة بعد (شاشة القفل تسبق كل الصفحات). */
async function deviceSession() {
  const [{ currentSession }, { readStoredSession }] = await Promise.all([
    import("@/hooks/useSession"),
    import("@/lib/offline/stored-session"),
  ]);
  return currentSession() ?? readStoredSession();
}

/**
 * يربط القفل بالحساب الحالي (H1): للترقية من 1.28.0 (قفل بلا مالك محفوظ) ولما بعد الإعداد. لا يغيّر
 * حساباً مربوطاً آخر بلا تحقق (الطبقة الأصلية ترفض بـ AUTH_REQUIRED)، فيعيد "mismatch" لتعرض الإعدادات
 * زر «اربط بهذا الحساب» بعد تأكيد الهوية. يعيد "bound" أو "none" (لا حساب أو قفل معطّل أو مقفل).
 */
export async function bindRecoveryAccount(force = false): Promise<"bound" | "none" | "mismatch"> {
  const s = lockSnapshot().state;
  if (!appLockAvailable() || !s.enabled || s.locked) return "none";
  const account = await currentAccount();
  if (!account) return "none";
  if (s.ownerId === account.userId && s.accountEmail === account.email) return "bound";
  if (s.ownerId && s.ownerId !== account.userId && !force) return "mismatch";
  try {
    await apply(ZenLock.bindAccount(account));
    return "bound";
  } catch (e) {
    return bridgeErrorCode(e) === "AUTH_REQUIRED" ? "mismatch" : "none";
  }
}

/**
 * نسيت الرمز (H1، 1.29.0): كلمة المرور تُسلَّم إلى الطبقة الأصلية، وهي التي تسأل Supabase Auth وتقارن
 * المعرّف بمالك القفل المحفوظ عندها، ثم تفتح نافذة إعداد وسيلة جديدة. الواجهة لا تملك منح الاستعادة.
 * يرمي خطأً برمز الجسر (BAD_CREDENTIALS، MISMATCH، NETWORK، RATE_LIMITED، LOCKED_OUT، NO_ACCOUNT…).
 */
export async function recoverWithAccount(password: string): Promise<void> {
  await apply(ZenLock.grantAccountRecovery({ password }));
}
