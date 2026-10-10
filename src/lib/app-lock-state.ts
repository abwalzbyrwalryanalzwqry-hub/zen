/**
 * حالة قفل التطبيق في الواجهة (الحزمة الأولى): تسجيل جسر `ZenLock`، ومخزن الحالة، والإقلاع. أفعال القفل
 * (PIN، والمصادقة، والإعداد، والاستعادة) في `app-lock.ts` وتُحمَّل مع شاشة القفل أو صفحة إعداداته فقط.
 * الطبقة الأصلية وحدها تقرّر «مقفل/مفتوح»؛ هنا انعكاس لحالتها، وأي فشل يُبقي التطبيق محجوباً.
 */
import { Capacitor, registerPlugin } from "@capacitor/core";
import { useSyncExternalStore } from "react";
import { setLockProbe } from "./app-lock-probe";

export type LockMethod = "pin" | "device";

export type LockState = {
  enabled: boolean;
  method: LockMethod | null;
  locked: boolean;
  graceMs: number;
  biometricWithPin: boolean;
  hideInRecents: boolean;
  pinLength: number;
  failures: number;
  lockoutMs: number;
  authorized: boolean;
  /** 1.29.0: القفل بعد الخمول داخل التطبيق (0 = معطّل). */
  idleMs: number;
  /** 1.29.0: القفل فور إطفاء الشاشة، بلا فترة سماح. */
  lockOnScreenOff: boolean;
  /** 1.29.0 (M6): نص الإشعارات مخفي على شاشة قفل الجهاز. */
  privateNotifications: boolean;
  /** 1.29.0: قراءة المصحف دون فتح القفل (راحة، لا حدّ أمان). */
  quranWhileLocked: boolean;
  /** 1.29.0 (M2): «نسيت الرمز؟» بقفل الجهاز مسموح. */
  deviceRecovery: boolean;
  /** 1.29.0 (H1): القفل مربوط بحساب، فالاستعادة بكلمة مروره ممكنة. */
  recoveryAccount: boolean;
  accountEmail: string | null;
  ownerId: string | null;
  /** 1.29.0: محاولات خاطئة منذ آخر مرة رآها المستخدم (تُعرض بعد الفتح). */
  failedSinceUnlock: number;
  lastFailedAt: number;
  recoveryLockoutMs: number;
};

export const DISABLED_STATE: LockState = {
  enabled: false,
  method: null,
  locked: false,
  graceMs: 0,
  biometricWithPin: false,
  hideInRecents: true,
  pinLength: 0,
  failures: 0,
  lockoutMs: 0,
  authorized: false,
  idleMs: 0,
  lockOnScreenOff: true,
  privateNotifications: true,
  quranWhileLocked: false,
  deviceRecovery: false,
  recoveryAccount: false,
  accountEmail: null,
  ownerId: null,
  failedSinceUnlock: 0,
  lastFailedAt: 0,
  recoveryLockoutMs: 0,
};

/** فترات إعادة القفل (مطابقة لـ AppLockPolicy.GRACE_OPTIONS_MS). الافتراضي: فور المغادرة. */
export const GRACE_OPTIONS = [0, 30_000, 60_000, 300_000] as const;
export const DEFAULT_GRACE = 0;
/** القفل بعد الخمول (مطابقة لـ AppLockPolicy.IDLE_OPTIONS_MS). الافتراضي: معطّل. */
export const IDLE_OPTIONS = [0, 300_000, 600_000, 900_000] as const;

/** يقبل حالة الجسر بأمان: أي حقل ناقص أو غريب يعود إلى قيمة آمنة. */
export function normalizeState(raw: unknown): LockState {
  const r = (raw ?? {}) as Partial<Record<keyof LockState, unknown>>;
  const enabled = r.enabled === true;
  const method = r.method === "pin" || r.method === "device" ? r.method : null;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);
  return {
    enabled,
    method: enabled ? method : null,
    // مفعّل بلا قيمة صريحة = مقفل (الأسلم).
    locked: enabled ? r.locked !== false : false,
    graceMs: (GRACE_OPTIONS as readonly number[]).includes(num(r.graceMs)) ? num(r.graceMs) : 0,
    biometricWithPin: enabled && r.biometricWithPin === true,
    hideInRecents: r.hideInRecents !== false,
    pinLength: num(r.pinLength),
    failures: num(r.failures),
    lockoutMs: num(r.lockoutMs),
    authorized: r.authorized === true,
    idleMs: (IDLE_OPTIONS as readonly number[]).includes(num(r.idleMs)) ? num(r.idleMs) : 0,
    lockOnScreenOff: r.lockOnScreenOff !== false,
    privateNotifications: r.privateNotifications !== false,
    quranWhileLocked: enabled && r.quranWhileLocked === true,
    deviceRecovery: enabled && r.deviceRecovery === true,
    recoveryAccount: enabled && r.recoveryAccount === true,
    accountEmail: enabled && typeof r.accountEmail === "string" ? r.accountEmail : null,
    ownerId: enabled && typeof r.ownerId === "string" ? r.ownerId : null,
    failedSinceUnlock: enabled ? num(r.failedSinceUnlock) : 0,
    lastFailedAt: enabled ? num(r.lastFailedAt) : 0,
    recoveryLockoutMs: num(r.recoveryLockoutMs),
  };
}

export type PromptText = { title?: string; subtitle?: string; negative?: string };

/** الحساب الذي يُربط به القفل للاستعادة بكلمة المرور. */
export type LockAccount = { userId: string; email: string };

export type LockOptions = {
  graceMs?: number;
  hideInRecents?: boolean;
  idleMs?: number;
  lockOnScreenOff?: boolean;
  privateNotifications?: boolean;
  quranWhileLocked?: boolean;
  deviceRecovery?: boolean;
};

export type ZenLockPlugin = {
  getState(): Promise<unknown>;
  getCapabilities(): Promise<unknown>;
  hideCover(): Promise<void>;
  verifyPin(o: { pin: string; purpose: "unlock" | "confirm" }): Promise<unknown>;
  setupPin(o: { pin: string; biometric: boolean; account?: LockAccount }): Promise<unknown>;
  authenticate(
    o: {
      mode: "biometric" | "device";
      purpose: "unlock" | "confirm" | "recover" | "enroll";
    } & PromptText,
  ): Promise<unknown>;
  enableDevice(o: { account?: LockAccount }): Promise<unknown>;
  setBiometric(o: { enabled: boolean }): Promise<unknown>;
  setOptions(o: LockOptions): Promise<unknown>;
  disable(): Promise<unknown>;
  grantAccountRecovery(o: { password: string }): Promise<unknown>;
  bindAccount(o: LockAccount): Promise<unknown>;
  lockNow(): Promise<unknown>;
  ackFailures(): Promise<unknown>;
  openSecuritySettings(): Promise<void>;
  addListener(
    event: "lockChanged",
    cb: (e: { locked: boolean }) => void,
  ): Promise<{ remove: () => Promise<void> }>;
};

export const ZenLock = registerPlugin<ZenLockPlugin>("ZenLock");

export function appLockAvailable(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
  } catch {
    return false;
  }
}

/** loading: لم تصل الحالة بعد (لا يُعرض محتوى). error: تعذّر سؤال الطبقة الأصلية (يُعرض القفل). */
export type LockSnapshot = { status: "loading" | "ready" | "error"; state: LockState };

let snapshot: LockSnapshot = appLockAvailable()
  ? { status: "loading", state: DISABLED_STATE }
  : { status: "ready", state: DISABLED_STATE };
const listeners = new Set<() => void>();

function set(next: LockSnapshot) {
  snapshot = next;
  for (const l of listeners) l();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useAppLock(): LockSnapshot {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => snapshot,
  );
}

export function lockSnapshot(): LockSnapshot {
  return snapshot;
}

/** هل الواجهة محجوبة الآن؟ (زر الرجوع في أندرويد لا يتنقّل خلف شاشة القفل). */
export function isAppLocked(): boolean {
  const s = snapshot;
  return s.status !== "ready" || (s.state.enabled && s.state.locked);
}

setLockProbe(isAppLocked);

/**
 * L1 (1.29.0): «غير مدعوم» = الجسر غير موجود أصلاً (UNIMPLEMENTED: إصدار أصلي أقدم من القفل). أما
 * UNAVAILABLE وغيره فعطل مؤقت: يُعرض كخطأ مع «أعد المحاولة» ولا يُعامل كأن القفل معطّل.
 */
function isUnimplemented(e: unknown): boolean {
  return (e as { code?: unknown } | null)?.code === "UNIMPLEMENTED";
}

/** يسأل الطبقة الأصلية عن الحالة. الفشل لا يفتح القفل: يُعرض كخطأ مع «أعد المحاولة». */
export async function refreshLock(): Promise<LockState> {
  if (!appLockAvailable()) return DISABLED_STATE;
  try {
    const state = normalizeState(await ZenLock.getState());
    set({ status: "ready", state });
    return state;
  } catch (e) {
    if (isUnimplemented(e)) {
      set({ status: "ready", state: DISABLED_STATE });
      return DISABLED_STATE;
    }
    set({ status: "error", state: snapshot.state });
    throw e;
  }
}

let installed = false;

/** يُستدعى مرة عند الإقلاع: الحالة الأولى، وأحداث القفل، والعودة من الخلفية. */
export function installAppLock(): () => void {
  if (!appLockAvailable() || installed) return () => undefined;
  installed = true;
  const removers: (() => void)[] = [];
  void refreshLock().catch(() => undefined);
  void ZenLock.addListener("lockChanged", () => {
    void refreshLock().catch(() => undefined);
  }).then((h) => removers.push(() => void h.remove()));
  // احتياط: إن فات حدث (WebView متوقف في الخلفية) تُقرأ الحالة عند كل عودة.
  void import("@capacitor/app")
    .then(({ App }) =>
      App.addListener("appStateChange", ({ isActive }) => {
        if (isActive) void refreshLock().catch(() => undefined);
      }),
    )
    .then((h) => removers.push(() => void h.remove()))
    .catch(() => undefined);
  const onVisible = () => {
    if (document.visibilityState === "visible") void refreshLock().catch(() => undefined);
  };
  document.addEventListener("visibilitychange", onVisible);
  removers.push(() => document.removeEventListener("visibilitychange", onVisible));
  return () => {
    installed = false;
    for (const r of removers) r();
  };
}

/** يُستدعى من أفعال القفل بعد كل تغيير تؤكده الطبقة الأصلية. */
export function publishLock(state: LockState): void {
  set({ status: "ready", state });
}

/** للاختبارات فقط. */
export function __setLockSnapshot(s: LockSnapshot) {
  set(s);
}
