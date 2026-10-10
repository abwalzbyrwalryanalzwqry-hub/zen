import { describe, expect, it } from "vitest";
import ar from "@/locales/lock/ar.json";
import {
  GRACE_OPTIONS,
  NO_CAPS,
  authMessageKey,
  availableMethods,
  graceKey,
  normalizeCaps,
  normalizeState,
  COMMON_PINS,
  idleKey,
  pinProblem,
  pinStrength,
  recoverErrorKey,
  recoveryOptions,
  waitParts,
  type AuthCode,
} from "./app-lock-core";

/* منطق قفل التطبيق في الواجهة: يطابق AppLockPolicy.java، ويفشل نحو القفل لا نحو الفتح. */

const get = (o: unknown, key: string): unknown =>
  key.split(".").reduce<unknown>((v, k) => (v as Record<string, unknown> | undefined)?.[k], o);

describe("pinProblem", () => {
  it("يقبل 4 إلى 6 أرقام غير بديهية", () => {
    expect(pinProblem("3719")).toBeNull();
    expect(pinProblem("739164")).toBeNull();
  });
  it("يرفض الطول والحروف والرموز البديهية", () => {
    expect(pinProblem("123")).toBe("length");
    expect(pinProblem("1234567")).toBe("length");
    expect(pinProblem("12a4")).toBe("digits");
    expect(pinProblem("١٢٣٤")).toBe("digits");
    expect(pinProblem("0000")).toBe("weak");
    expect(pinProblem("123456")).toBe("weak");
    expect(pinProblem("654321")).toBe("weak");
    expect(pinProblem("8901")).toBe("weak");
  });
});

describe("normalizeState", () => {
  it("مفعّل بلا قيمة locked صريحة = مقفل", () => {
    expect(normalizeState({ enabled: true, method: "pin" }).locked).toBe(true);
    expect(normalizeState({ enabled: true, method: "pin", locked: "no" }).locked).toBe(true);
    expect(normalizeState({ enabled: true, method: "pin", locked: false }).locked).toBe(false);
  });
  it("قيم غريبة تعود إلى الآمن", () => {
    const s = normalizeState({ enabled: true, method: "x", graceMs: 12345, lockoutMs: -5 });
    expect(s.method).toBeNull();
    expect(s.graceMs).toBe(0);
    expect(s.lockoutMs).toBe(0);
    expect(normalizeState(null).enabled).toBe(false);
    expect(normalizeState(undefined).hideInRecents).toBe(true);
  });
  it("المعطّل لا يُعدّ مقفلاً", () => {
    expect(normalizeState({ enabled: false, locked: true }).locked).toBe(false);
  });
});

describe("caps", () => {
  it("لا يفترض دعم البصمة", () => {
    expect(normalizeCaps({}).biometric).toBe("unavailable");
    expect(normalizeCaps({ biometric: "available" }).biometric).toBe("available");
    expect(availableMethods(NO_CAPS)).toEqual({ pin: false, device: false });
  });
  it("الاستعادة: قفل الجهاز أو الحساب، وإلا لا شيء", () => {
    const st = (deviceRecovery: boolean, recoveryAccount: boolean) => ({
      deviceRecovery,
      recoveryAccount,
    });
    const secure = { ...NO_CAPS, deviceSecure: true };
    expect(recoveryOptions(secure, st(true, false)).any).toBe(true);
    // M2: قفل الجهاز لا يستعيد إن أُطفئ الخيار، ولو كان الجهاز آمناً.
    expect(recoveryOptions(secure, st(false, false))).toEqual({
      device: false,
      account: false,
      any: false,
    });
    expect(recoveryOptions(NO_CAPS, st(true, true))).toEqual({
      device: false,
      account: true,
      any: true,
    });
    expect(recoveryOptions(NO_CAPS, st(false, false)).any).toBe(false);
  });
});

describe("نصوص", () => {
  it("كل رسالة مصادقة وفترة سماح موجودة بالعربية والإنجليزية", () => {
    const codes: AuthCode[] = [
      "canceled",
      "lockout",
      "lockout_permanent",
      "no_biometrics",
      "no_credential",
      "no_hardware",
      "timeout",
      "unavailable",
      "busy",
    ];
    const keys = [...codes.map(authMessageKey), ...GRACE_OPTIONS.map(graceKey)];
    for (const k of keys) {
      expect(typeof get(ar, k), k).toBe("string");
    }
  });
  it("الانتظار بالثواني ثم الدقائق", () => {
    expect(waitParts(30_000)).toEqual({ unit: "seconds", n: 30 });
    expect(waitParts(29_100)).toEqual({ unit: "seconds", n: 30 });
    expect(waitParts(120_000)).toEqual({ unit: "minutes", n: 2 });
    expect(waitParts(0)).toEqual({ unit: "seconds", n: 1 });
  });
});

describe("1.29.0: قواعد الرمز الإضافية (L2) مطابقة لـ Java", () => {
  it("يرفض الأنماط الدورية والسنوات والرموز المسرَّبة", () => {
    for (const p of ["1212", "121212", "123123", "1950", "1999", "2030", "2580", "0852", "1122"])
      expect(pinProblem(p), p).toBe("weak");
    for (const p of ["1949", "2031", "124578", "1213", "3719", "8264"])
      expect(pinProblem(p), p).toBeNull();
  });

  it("القائمة نسخة حرفية من AppLockPolicy.COMMON_PINS", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const java = readFileSync(
      join(__dirname, "../../android/app/src/main/java/app/zen/quran/AppLockPolicy.java"),
      "utf8",
    );
    const block = java.slice(
      java.indexOf("COMMON_PINS = {"),
      java.indexOf("};", java.indexOf("COMMON_PINS = {")),
    );
    const fromJava = [...block.matchAll(/"(\d+)"/g)].map((m) => m[1]);
    expect(fromJava).toEqual([...COMMON_PINS]);
  });

  it("تلميح القوة", () => {
    expect(pinStrength("37")).toBeNull();
    expect(pinStrength("1234")).toBe("weak");
    expect(pinStrength("3719")).toBe("fair");
    expect(pinStrength("371964")).toBe("strong");
  });

  it("مفاتيح الخمول وأخطاء الاستعادة موجودة في القاموسين", () => {
    const keys = [
      ...[0, 300_000, 600_000, 900_000].map(idleKey),
      ...[
        "BAD_CREDENTIALS",
        "MISMATCH",
        "NETWORK",
        "RATE_LIMITED",
        "LOCKED_OUT",
        "NO_ACCOUNT",
        null,
      ].map(recoverErrorKey),
      authMessageKey("bio_changed"),
    ];
    for (const k of keys) {
      expect(typeof get(ar, k), `ar ${k}`).toBe("string");
    }
  });

  it("الحالة الجديدة تُطبَّع بأمان", () => {
    const s = normalizeState({
      enabled: true,
      idleMs: 123,
      failedSinceUnlock: -1,
      accountEmail: 5,
    });
    expect(s.idleMs).toBe(0);
    expect(s.failedSinceUnlock).toBe(0);
    expect(s.accountEmail).toBeNull();
    expect(s.lockOnScreenOff).toBe(true);
    expect(s.privateNotifications).toBe(true);
    expect(normalizeState({ enabled: false, deviceRecovery: true }).deviceRecovery).toBe(false);
    expect(normalizeState({ enabled: true, idleMs: 600_000 }).idleMs).toBe(600_000);
  });
});
