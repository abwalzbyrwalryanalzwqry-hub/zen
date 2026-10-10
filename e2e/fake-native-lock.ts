import type { BrowserContext, Page } from "@playwright/test";

/**
 * جسر Android وهمي لاختبار قفل التطبيق في المتصفح: `window.androidBridge` يجعل Capacitor يعدّ المنصة
 * Android، و`PluginHeaders` + `nativePromise`/`nativeCallback` يوجّهان استدعاءات `ZenLock` و`App` إلى محاكاة
 * في الصفحة تتبع قواعد ZenLockPlugin.java (الحالة في «الطبقة الأصلية»، والسماح بساعة رتيبة وهمية،
 * والتأخير المتصاعد، وشرط التحقق قبل الإيقاف والتغيير). الحالة الدائمة في localStorage («SharedPreferences»)،
 * والحالة المفتوحة في الذاكرة فقط، فإعادة تحميل الصفحة = إقلاع بارد.
 *
 * هذه محاكاة للواجهة والتكامل؛ سلوك BiometricPrompt وKeystore وFLAG_SECURE الحقيقي يُختبر على جهاز فقط.
 */
export type FakeCaps = {
  biometric?: "available" | "none_enrolled" | "no_hardware" | "unavailable" | "weak_only";
  deviceSecure?: boolean;
  pinSupported?: boolean;
};

export async function installFakeNativeLock(context: BrowserContext, caps: FakeCaps = {}) {
  await context.addInitScript((capsIn: FakeCaps) => {
    const KEY = "__fake_zen_lock";
    type Persist = {
      enabled: boolean;
      method: "pin" | "device" | null;
      pin: string | null;
      graceMs: number;
      bio: boolean;
      hide: boolean;
      failures: number;
      lockUntil: number;
      // 1.29.0
      idleMs: number;
      screenOff: boolean;
      privateNotif: boolean;
      quran: boolean;
      deviceRecovery: boolean;
      account: { userId: string; email: string } | null;
      recFailures: number;
      recLockUntil: number;
      failedSinceUnlock: number;
      lastFailedAt: number;
    };
    const blank: Persist = {
      enabled: false,
      method: null,
      pin: null,
      graceMs: 0,
      bio: false,
      hide: true,
      failures: 0,
      lockUntil: 0,
      idleMs: 0,
      screenOff: true,
      privateNotif: true,
      quran: false,
      deviceRecovery: true,
      account: null,
      recFailures: 0,
      recLockUntil: 0,
      failedSinceUnlock: 0,
      lastFailedAt: 0,
    };
    // مطابقة مختصرة لـ AppLockPolicy.java: تكرار، تسلسل، دوري، سنوات، وقائمة شائعة.
    const COMMON = ["1212", "2580", "0852", "1004", "2000", "6969", "1122", "1313", "4321", "0000"];
    const weakPin = (pin: string) => {
      if (/^(\d)\1+$/.test(pin)) return true;
      const d = [...pin].map(Number);
      const step = d[1] - d[0];
      if (Math.abs(step) === 1 && d.every((x, i) => i === 0 || x - d[i - 1] === step)) return true;
      if (pin.length === 4 && +pin >= 1950 && +pin <= 2030) return true;
      for (const n of [2, 3])
        if (
          pin.length % n === 0 &&
          pin.length > n &&
          pin === pin.slice(0, n).repeat(pin.length / n)
        )
          return true;
      return COMMON.includes(pin);
    };
    const load = (): Persist => {
      try {
        return { ...blank, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
      } catch {
        return { ...blank };
      }
    };
    const save = (p: Persist) => localStorage.setItem(KEY, JSON.stringify(p));
    const capsKey = "__fake_zen_caps";
    const caps = {
      biometric: "available",
      deviceSecure: true,
      pinSupported: true,
      sdk: 34,
      recentsMode: "preview",
      ...capsIn,
      ...JSON.parse(sessionStorage.getItem(capsKey) ?? "{}"),
    };

    // ساعة رتيبة وهمية (elapsedRealtime) يقدّمها الاختبار.
    let clock = 1_000_000;
    let unlocked = false;
    let authorizedUntil = 0;
    let proofUntil = 0;
    let bgAt = -1;
    const authQueue: string[] = [];
    const calls: { method: string; opts: unknown }[] = [];
    const listeners: Record<string, ((d: unknown) => void)[]> = {};
    let cbId = 0;

    const FREE = 5;
    const STEPS = [30_000, 60_000, 120_000, 300_000, 900_000, 1_800_000];
    const lockoutMs = (p: Persist) => Math.max(0, p.lockUntil - clock);
    const locked = (p: Persist) => p.enabled && !unlocked;
    const state = () => {
      const p = load();
      return {
        enabled: p.enabled,
        method: p.method,
        locked: locked(p),
        graceMs: p.graceMs,
        biometricWithPin: p.bio,
        hideInRecents: p.hide,
        pinLength: p.pin?.length ?? 0,
        failures: p.failures,
        lockoutMs: lockoutMs(p),
        authorized: authorizedUntil > clock,
        idleMs: p.idleMs,
        lockOnScreenOff: p.screenOff,
        privateNotifications: p.privateNotif,
        quranWhileLocked: p.quran,
        deviceRecovery: p.deviceRecovery,
        recoveryAccount: !!p.account,
        accountEmail: p.account?.email ?? null,
        ownerId: p.account?.userId ?? null,
        failedSinceUnlock: p.failedSinceUnlock,
        lastFailedAt: p.lastFailedAt,
        recoveryLockoutMs: Math.max(0, p.recLockUntil - clock),
      };
    };
    const emit = (plugin: string, event: string, data: unknown) =>
      (listeners[`${plugin}:${event}`] ?? []).forEach((f) => f(data));
    const fail = (code: string) => Object.assign(new Error(code), { code });
    const setUnlocked = (v: boolean) => {
      if (unlocked === v) return;
      unlocked = v;
      emit("ZenLock", "lockChanged", { locked: !v });
    };
    const needAuth = (p: Persist) => {
      if (p.enabled && authorizedUntil <= clock) throw fail("AUTH_REQUIRED");
    };

    const zenLock: Record<string, (o: Record<string, unknown>) => unknown> = {
      getState: () => state(),
      getCapabilities: () => caps,
      hideCover: () => ({}),
      openSecuritySettings: () => ({}),
      verifyPin: (o) => {
        const p = load();
        if (!p.enabled || p.method !== "pin" || !p.pin) throw fail("NOT_ENABLED");
        if (lockoutMs(p) > 0)
          return { ok: false, failures: p.failures, lockoutMs: lockoutMs(p), attemptsLeft: 0 };
        if (o.pin === p.pin) {
          p.failures = 0;
          p.lockUntil = 0;
          save(p);
          if (o.purpose === "confirm") authorizedUntil = clock + 120_000;
          setUnlocked(true);
          return { ok: true };
        }
        p.failures += 1;
        p.failedSinceUnlock += 1;
        p.lastFailedAt = Date.now();
        if (p.failures >= FREE)
          p.lockUntil = clock + STEPS[Math.min(p.failures - FREE, STEPS.length - 1)];
        save(p);
        return {
          ok: false,
          failures: p.failures,
          lockoutMs: lockoutMs(p),
          attemptsLeft: Math.max(0, FREE - p.failures),
        };
      },
      authenticate: (o) => {
        const p = load();
        const r = authQueue.shift() ?? "ok";
        if (o.purpose === "recover" && !p.deviceRecovery) throw fail("NOT_ALLOWED");
        if (o.mode === "biometric" && caps.biometric !== "available")
          return {
            ok: false,
            code: caps.biometric === "none_enrolled" ? "no_biometrics" : "no_hardware",
          };
        if (o.mode === "device" && !caps.deviceSecure) return { ok: false, code: "no_credential" };
        if (r !== "ok") return { ok: false, code: r };
        if (o.purpose === "unlock") setUnlocked(true);
        if (o.purpose === "confirm") authorizedUntil = clock + 120_000;
        if (o.purpose === "recover") authorizedUntil = clock + 300_000;
        if (o.purpose === "enroll") proofUntil = clock + 60_000;
        void p;
        return { ok: true };
      },
      setupPin: (o) => {
        const p = load();
        needAuth(p);
        const pin = String(o.pin ?? "");
        if (!/^[0-9]{4,6}$/.test(pin)) throw fail("PIN_LENGTH");
        if (weakPin(pin)) throw fail("PIN_WEAK");
        const first = !p.enabled;
        const account = (o.account as Persist["account"]) ?? null;
        if (first) Object.assign(p, { account, deviceRecovery: !account });
        Object.assign(p, {
          enabled: true,
          method: "pin",
          pin,
          bio: o.biometric === true,
          failures: 0,
          lockUntil: 0,
        });
        if (first) Object.assign(p, { graceMs: 0, hide: true });
        save(p);
        authorizedUntil = 0;
        setUnlocked(true);
        return state();
      },
      enableDevice: (o) => {
        const p = load();
        needAuth(p);
        if (proofUntil <= clock) throw fail("PROOF_REQUIRED");
        proofUntil = 0;
        const first = !p.enabled;
        if (first) {
          const account = (o.account as Persist["account"]) ?? null;
          Object.assign(p, { account, deviceRecovery: !account });
        }
        Object.assign(p, {
          enabled: true,
          method: "device",
          pin: null,
          bio: false,
          failures: 0,
          lockUntil: 0,
        });
        if (first) Object.assign(p, { graceMs: 0, hide: true });
        save(p);
        authorizedUntil = 0;
        setUnlocked(true);
        return state();
      },
      setBiometric: (o) => {
        const p = load();
        if (o.enabled === true && proofUntil <= clock) throw fail("PROOF_REQUIRED");
        proofUntil = 0;
        p.bio = o.enabled === true;
        save(p);
        return state();
      },
      setOptions: (o) => {
        const p = load();
        if (typeof o.graceMs === "number") p.graceMs = o.graceMs;
        if (typeof o.hideInRecents === "boolean") p.hide = o.hideInRecents;
        if (typeof o.idleMs === "number") {
          if (![0, 300_000, 600_000, 900_000].includes(o.idleMs)) throw fail("BAD_OPTION");
          p.idleMs = o.idleMs;
        }
        if (typeof o.lockOnScreenOff === "boolean") p.screenOff = o.lockOnScreenOff;
        if (typeof o.privateNotifications === "boolean") p.privateNotif = o.privateNotifications;
        if (typeof o.quranWhileLocked === "boolean") p.quran = o.quranWhileLocked;
        if (typeof o.deviceRecovery === "boolean") {
          // تفعيلها يُضعف الحماية: يتطلب تحققاً حديثاً كما في ZenLockPlugin.
          if (o.deviceRecovery && !p.deviceRecovery) needAuth(p);
          p.deviceRecovery = o.deviceRecovery;
        }
        save(p);
        return state();
      },
      disable: () => {
        const p = load();
        needAuth(p);
        save({ ...blank });
        authorizedUntil = 0;
        unlocked = false;
        emit("ZenLock", "lockChanged", { locked: false });
        return state();
      },
      grantAccountRecovery: async (o) => {
        const p = load();
        if (!locked(p)) throw fail("NOT_ALLOWED");
        if (!p.account) throw fail("NO_ACCOUNT");
        if (p.recLockUntil > clock)
          throw Object.assign(fail("LOCKED_OUT"), {
            data: { lockoutMs: p.recLockUntil - clock },
          });
        // كما في AccountVerifier.java: تحقق مباشر لدى خادم المصادقة ثم مقارنة صاحب الجلسة.
        let res: Response;
        try {
          res = await fetch("http://sb.e2e.test/auth/v1/token?grant_type=password", {
            method: "POST",
            headers: { "content-type": "application/json", apikey: "e2e" },
            body: JSON.stringify({ email: p.account.email, password: o.password }),
          });
        } catch {
          throw fail("NETWORK");
        }
        if (res.status === 400) {
          p.recFailures += 1;
          if (p.recFailures >= FREE)
            p.recLockUntil = clock + STEPS[Math.min(p.recFailures - FREE, STEPS.length - 1)];
          save(p);
          throw fail("BAD_CREDENTIALS");
        }
        if (!res.ok) throw fail("SERVER");
        const body = (await res.json()) as { user?: { id?: string } };
        if (body.user?.id !== p.account.userId) throw fail("MISMATCH");
        p.recFailures = 0;
        p.recLockUntil = 0;
        save(p);
        authorizedUntil = clock + 300_000;
        return state();
      },
      bindAccount: (o) => {
        const p = load();
        if (!p.enabled) throw fail("NOT_ENABLED");
        if (locked(p)) throw fail("NOT_ALLOWED");
        const a = { userId: String(o.userId), email: String(o.email) };
        if (p.account && p.account.userId !== a.userId) needAuth(p);
        p.account = a;
        save(p);
        return state();
      },
      lockNow: () => {
        const p = load();
        if (!p.enabled) throw fail("NOT_ENABLED");
        setUnlocked(false);
        return state();
      },
      ackFailures: () => {
        const p = load();
        if (locked(p)) throw fail("NOT_ALLOWED");
        p.failedSinceUnlock = 0;
        save(p);
        return state();
      },
    };
    const app: Record<string, (o: Record<string, unknown>) => unknown> = {
      getLaunchUrl: () => ({}),
      minimizeApp: () => ({}),
      exitApp: () => ({}),
      getInfo: () => ({ version: "1.29.0", build: "31", id: "app.zen.quran", name: "Zen" }),
      getState: () => ({ isActive: true }),
    };
    const impl: Record<string, typeof zenLock> = { ZenLock: zenLock, App: app };
    const header = (name: string, m: string[]) => ({
      name,
      methods: [
        ...m.map((n) => ({ name: n, rtype: "promise" })),
        { name: "addListener", rtype: "callback" },
        { name: "removeListener", rtype: "callback" },
      ],
    });

    (window as unknown as { androidBridge: object }).androidBridge = { postMessage() {} };
    (window as unknown as { Capacitor: object }).Capacitor = {
      PluginHeaders: [header("ZenLock", Object.keys(zenLock)), header("App", Object.keys(app))],
      nativePromise: async (plugin: string, method: string, opts: Record<string, unknown> = {}) => {
        calls.push({ method: `${plugin}.${method}`, opts });
        const f = impl[plugin]?.[method];
        if (!f) throw Object.assign(new Error("UNIMPLEMENTED"), { code: "UNIMPLEMENTED" });
        await new Promise((r) => setTimeout(r, 5));
        return f(opts);
      },
      nativeCallback: (
        plugin: string,
        method: string,
        opts: { eventName?: string },
        cb: (d: unknown) => void,
      ) => {
        if (method === "addListener" && opts?.eventName) {
          (listeners[`${plugin}:${opts.eventName}`] ??= []).push(cb);
        }
        return String(++cbId);
      },
    };

    // أدوات الاختبار: الخروج إلى الخلفية والعودة، ونتائج المصادقة، وسجلّ الاستدعاءات.
    (window as unknown as { __lock: object }).__lock = {
      calls,
      queueAuth: (...r: string[]) => authQueue.push(...r),
      setCaps: (c: Partial<typeof caps>) => {
        Object.assign(caps, c);
        sessionStorage.setItem(
          capsKey,
          JSON.stringify({ ...JSON.parse(sessionStorage.getItem(capsKey) ?? "{}"), ...c }),
        );
      },
      background: () => {
        const p = load();
        bgAt = clock;
        if (p.enabled && p.graceMs === 0) setUnlocked(false);
        emit("App", "appStateChange", { isActive: false });
      },
      advance: (ms: number) => {
        clock += ms;
      },
      foreground: () => {
        const p = load();
        if (p.enabled && bgAt >= 0 && clock - bgAt >= p.graceMs) setUnlocked(false);
        bgAt = -1;
        emit("App", "appStateChange", { isActive: true });
      },
      back: () => emit("App", "backButton", { canGoBack: true }),
      screenOff: () => {
        if (load().enabled && load().screenOff) setUnlocked(false);
      },
      persisted: () => load(),
    };
  }, caps);
}

type LockHandle = {
  calls: { method: string; opts: unknown }[];
  queueAuth: (...r: string[]) => void;
  setCaps: (c: FakeCaps) => void;
  background: () => void;
  advance: (ms: number) => void;
  foreground: () => void;
  back: () => void;
  screenOff: () => void;
  persisted: () => Record<string, unknown>;
};

/** ينفّذ أداة من أدوات الجسر الوهمي داخل الصفحة. */
export function lockTool<T>(page: Page, fn: (l: LockHandle) => T): Promise<T> {
  return page.evaluate(
    (src) =>
      new Function("l", `return (${src})(l)`)((window as unknown as { __lock: LockHandle }).__lock),
    fn.toString(),
  ) as Promise<T>;
}
