import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();
globalThis.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  length: 0,
} as Storage;

const rpc = vi.fn(async (..._a: unknown[]) => ({ error: null as { message: string } | null }));
const listeners: Record<string, (x: { value?: string; error?: string }) => void> = {};
let perm = "prompt";
const Push = {
  checkPermissions: vi.fn(async () => ({ receive: perm })),
  requestPermissions: vi.fn(async () => {
    perm = "granted";
    return { receive: perm };
  }),
  createChannel: vi.fn(async (..._a: unknown[]) => undefined),
  listChannels: vi.fn(async () => ({ channels: [{ id: "zen-default", importance: 4 }] })),
  addListener: vi.fn(async (ev: string, cb: (x: { value?: string }) => void) => {
    listeners[ev] = cb;
    return { remove: async () => undefined };
  }),
  register: vi.fn(async () => {
    queueMicrotask(() => listeners.registration?.({ value: "tok-1" }));
  }),
  unregister: vi.fn(async () => undefined),
  removeAllDeliveredNotifications: vi.fn(async () => undefined),
  // كإضافة Capacitor الحقيقية (Proxy): لها «then» لا تستدعي resolve أبداً، فأي `await` للإضافة نفسها
  // يعلّق الاختبار كما كان يعلّق التطبيق على الجوال.
  then: () => undefined,
};

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => "android" },
}));
vi.mock("@capacitor/push-notifications", () => ({ PushNotifications: Push }));
vi.mock("@/integrations/supabase/lazy", () => ({ lazyRpc: (...a: unknown[]) => rpc(...a) }));
vi.mock("@/lib/network", () => ({ isOnline: () => true }));
const lockPush = { forgetLockPushSync: vi.fn(), syncLockPushPrivacy: vi.fn(async () => "skipped") };
vi.mock("@/lib/app-lock-push", () => lockPush);

const device = await import("./device");

describe("notify/device", () => {
  beforeEach(() => {
    localStorage.clear();
    perm = "prompt";
    vi.clearAllMocks();
  });

  it("بعد الدخول: قناة بصوت الجوال الافتراضي، وإذن مرة واحدة، وحفظ الرمز", async () => {
    expect(await device.autoRegister("u1")).toBe("on");
    const ch = Push.createChannel.mock.calls[0][0] as Record<string, unknown>;
    expect(ch).toMatchObject({ id: "zen-default", importance: 4, vibration: true });
    expect(ch).not.toHaveProperty("sound");
    expect(Push.requestPermissions).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("save_native_push_token", {
      _token: "tok-1",
      _platform: "android",
    });
    expect(await device.deviceState()).toBe("on");
    // التشغيل التالي: لا سؤال ولا حفظ مكرر للرمز نفسه.
    rpc.mockClear();
    expect(await device.autoRegister("u1")).toBe("on");
    expect(Push.requestPermissions).toHaveBeenCalledTimes(1);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("من رفض الإذن لا يُسأل في كل تشغيل", async () => {
    Push.requestPermissions.mockImplementationOnce(async () => {
      perm = "denied";
      return { receive: perm };
    });
    expect(await device.autoRegister("u1")).toBe("denied");
    perm = "prompt";
    expect(await device.autoRegister("u1")).toBe("denied");
    expect(Push.requestPermissions).toHaveBeenCalledTimes(1);
  });

  it("إيقاف المستخدم يُحفظ، والخروج لا يوقفها للحساب التالي", async () => {
    perm = "granted";
    await device.autoRegister("u1");
    await device.unregisterDevice({ remember: true });
    expect(rpc).toHaveBeenCalledWith("remove_native_push_token", { _token: "tok-1" });
    expect(await device.autoRegister("u1")).toBe("skipped");
    expect(await device.turnOnDevice("u1")).toBe("on");
    await device.unregisterDevice({ remember: false });
    expect(await device.autoRegister("u2")).toBe("on");
  });

  it("رمز جديد من FCM يُحفظ فوراً، وحساب آخر على الجهاز يأخذ الرمز", async () => {
    perm = "granted";
    await device.autoRegister("u1");
    rpc.mockClear();
    listeners.registration({ value: "tok-2" });
    await Promise.resolve();
    expect(rpc).toHaveBeenCalledWith("save_native_push_token", {
      _token: "tok-2",
      _platform: "android",
    });
  });

  it("طلبا تسجيل متزامنان لا يضيع ردّ أحدهما", async () => {
    perm = "granted";
    const [a, b] = await Promise.all([device.autoRegister("u1"), device.turnOnDevice("u1")]);
    expect(a).toBe("on");
    expect(b).toBe("on");
  });

  it("قناة مطفأة في الجوال تظهر في الحالة", async () => {
    perm = "granted";
    Push.listChannels.mockResolvedValueOnce({ channels: [{ id: "zen-default", importance: 0 }] });
    expect(await device.deviceState()).toBe("blocked");
  });

  it("تشغيل جديد يعيد حفظ الرمز نفسه مرة (الخادم ربما حذفه بعد رد FCM)", async () => {
    perm = "granted";
    await device.autoRegister("u1");
    vi.resetModules();
    const fresh = await import("./device");
    rpc.mockClear();
    expect(await fresh.autoRegister("u1")).toBe("on");
    expect(rpc).toHaveBeenCalledWith("save_native_push_token", {
      _token: "tok-1",
      _platform: "android",
    });
    // وفي التشغيل نفسه لا يتكرّر الحفظ، إلا بإعادة تسجيل صريحة (NO_DEVICE من الخادم).
    rpc.mockClear();
    await fresh.autoRegister("u1");
    expect(rpc).not.toHaveBeenCalledWith("save_native_push_token", expect.anything());
    expect(await fresh.resyncDevice("u1")).toBe("on");
    expect(rpc).toHaveBeenCalledWith("save_native_push_token", {
      _token: "tok-1",
      _platform: "android",
    });
  });
});
