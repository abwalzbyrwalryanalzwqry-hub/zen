import { beforeEach, describe, expect, it, vi } from "vitest";

/* جسر قفل التطبيق: الواجهة تعكس حالة الطبقة الأصلية فقط، وأي فشل يُبقي التطبيق محجوباً. */

const plugin = {
  getState: vi.fn(),
  getCapabilities: vi.fn(),
  verifyPin: vi.fn(),
  authenticate: vi.fn(),
  setupPin: vi.fn(),
  disable: vi.fn(),
  grantAccountRecovery: vi.fn(),
  bindAccount: vi.fn(),
  lockNow: vi.fn(),
  ackFailures: vi.fn(),
  enableDevice: vi.fn(),
  addListener: vi.fn(async () => ({ remove: async () => undefined })),
};

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => "android" },
  registerPlugin: () => plugin,
}));

const signIn = vi.fn();
vi.mock("@/lib/auth", () => ({ signInWithUsername: (...a: unknown[]) => signIn(...a) }));
const U1 = "4f1c2a9e-0b7d-4e36-9a51-2c8f6d3b7e10";
const U2 = "9a8b7c6d-0000-4e36-9a51-2c8f6d3b7e10";
vi.mock("@/hooks/useSession", () => ({
  currentSession: () => ({
    user: { id: "4f1c2a9e-0b7d-4e36-9a51-2c8f6d3b7e10", email: "a@zen.app" },
  }),
}));
vi.mock("@/lib/offline/stored-session", () => ({ readStoredSession: () => null }));
vi.mock("@/lib/offline/guest", () => ({ isGuest: () => false }));

const lock = await import("./app-lock");

beforeEach(() => {
  for (const f of Object.values(plugin)) f.mockReset?.();
  plugin.addListener.mockImplementation(async () => ({ remove: async () => undefined }));
});

describe("app-lock store", () => {
  it("يبدأ محجوباً قبل وصول الحالة", () => {
    expect(lock.lockSnapshot().status).toBe("loading");
    expect(lock.isAppLocked()).toBe(true);
  });

  it("المفعّل المقفل يبقى محجوباً، والمفتوح لا", async () => {
    plugin.getState.mockResolvedValue({ enabled: true, method: "pin", locked: true, pinLength: 4 });
    await lock.refreshLock();
    expect(lock.isAppLocked()).toBe(true);
    plugin.getState.mockResolvedValue({ enabled: true, method: "pin", locked: false });
    await lock.refreshLock();
    expect(lock.isAppLocked()).toBe(false);
  });

  it("فشل الجسر لا يفتح القفل", async () => {
    plugin.getState.mockRejectedValue(new Error("boom"));
    await expect(lock.refreshLock()).rejects.toThrow();
    expect(lock.lockSnapshot().status).toBe("error");
    expect(lock.isAppLocked()).toBe(true);
  });

  it("إضافة غير موجودة (نسخة قديمة) = قفل غير مفعّل", async () => {
    plugin.getState.mockRejectedValue({ code: "UNIMPLEMENTED" });
    await lock.refreshLock();
    expect(lock.isAppLocked()).toBe(false);
  });

  it("PIN خاطئ يعيد المحاولات المتبقية ولا يفتح", async () => {
    plugin.verifyPin.mockResolvedValue({ ok: false, failures: 2, lockoutMs: 0, attemptsLeft: 3 });
    plugin.getState.mockResolvedValue({ enabled: true, method: "pin", locked: true });
    const r = await lock.verifyPin("3719", "unlock");
    expect(r).toEqual({ ok: false, failures: 2, lockoutMs: 0, attemptsLeft: 3 });
    expect(lock.isAppLocked()).toBe(true);
  });

  it("المصادقة لا تنجح إلا بـ ok صريح، والرموز الغريبة = غير متاح", async () => {
    plugin.getState.mockResolvedValue({ enabled: true, method: "device", locked: true });
    plugin.authenticate.mockResolvedValue({ ok: "yes" });
    expect(await lock.authenticate("device", "unlock", {})).toEqual({
      ok: false,
      code: "unavailable",
    });
    plugin.authenticate.mockResolvedValue({ ok: false, code: "canceled" });
    expect(await lock.authenticate("device", "unlock", {})).toEqual({
      ok: false,
      code: "canceled",
    });
    plugin.authenticate.mockRejectedValue(new Error("x"));
    expect((await lock.authenticate("biometric", "unlock", {})).ok).toBe(false);
  });

  it("H1: الاستعادة بالحساب تسلّم كلمة المرور للطبقة الأصلية ولا تتحقق في الواجهة", async () => {
    plugin.grantAccountRecovery.mockResolvedValue({ enabled: true, method: "pin", locked: true });
    await lock.recoverWithAccount("pw");
    expect(plugin.grantAccountRecovery).toHaveBeenCalledWith({ password: "pw" });
    // لا تسجيل دخول من الواجهة: لا جلسة جديدة ولا طريق لادّعاء النجاح.
    expect(signIn).not.toHaveBeenCalled();

    plugin.grantAccountRecovery.mockRejectedValue({ code: "BAD_CREDENTIALS" });
    await expect(lock.recoverWithAccount("x")).rejects.toMatchObject({ code: "BAD_CREDENTIALS" });
  });

  it("الإعداد يربط القفل بالحساب الحالي", async () => {
    plugin.setupPin.mockResolvedValue({ enabled: true, method: "pin", locked: false });
    await lock.setupPin("3719", false);
    expect(plugin.setupPin).toHaveBeenCalledWith({
      pin: "3719",
      biometric: false,
      account: { userId: U1, email: "a@zen.app" },
    });
  });

  it("ربط الحساب: يربط قفلاً بلا مالك، ولا ينقله إلى حساب آخر بلا تأكيد", async () => {
    plugin.getState.mockResolvedValue({ enabled: true, method: "pin", locked: false });
    await lock.refreshLock();
    plugin.bindAccount.mockResolvedValue({
      enabled: true,
      method: "pin",
      locked: false,
      recoveryAccount: true,
      ownerId: U1,
      accountEmail: "a@zen.app",
    });
    expect(await lock.bindRecoveryAccount()).toBe("bound");
    expect(plugin.bindAccount).toHaveBeenCalledWith({ userId: U1, email: "a@zen.app" });

    plugin.bindAccount.mockClear();
    expect(await lock.bindRecoveryAccount()).toBe("bound");
    expect(plugin.bindAccount).not.toHaveBeenCalled();

    plugin.getState.mockResolvedValue({
      enabled: true,
      method: "pin",
      locked: false,
      ownerId: U2,
      accountEmail: "b@zen.app",
      recoveryAccount: true,
    });
    await lock.refreshLock();
    expect(await lock.bindRecoveryAccount()).toBe("mismatch");
    expect(plugin.bindAccount).not.toHaveBeenCalled();
    plugin.bindAccount.mockRejectedValue({ code: "AUTH_REQUIRED" });
    expect(await lock.bindRecoveryAccount(true)).toBe("mismatch");
  });

  it("L1: UNAVAILABLE عطل مؤقت لا «قفل غير مدعوم»", async () => {
    plugin.getState.mockRejectedValue({ code: "UNAVAILABLE" });
    await expect(lock.refreshLock()).rejects.toBeTruthy();
    expect(lock.lockSnapshot().status).toBe("error");
    expect(lock.isAppLocked()).toBe(true);
  });

  it("الحساب الحالي للاستعادة", async () => {
    expect(await lock.currentAccount()).toEqual({ userId: U1, email: "a@zen.app" });
  });
});
