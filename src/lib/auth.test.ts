import { beforeEach, describe, expect, it, vi } from "vitest";

const signInWithPassword = vi.fn();
const rpcMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { signInWithPassword: (...a: unknown[]) => signInWithPassword(...a) },
  },
}));
vi.mock("@/integrations/supabase/rpc", () => ({
  rpc: (...a: unknown[]) => rpcMock(...a),
}));

import {
  LOGIN_LOCK_KEY,
  PWNED_PASSWORD_MESSAGE,
  arabicAuthError,
  changeMyPassword,
  generateTempPassword,
  lockDurationMs,
  loginLockSeconds,
  passwordRuleError,
  resetWithRecoveryCode,
  signInWithUsername,
  signUpWithUsername,
  teacherCreateStudent,
  teacherSetStudentPassword,
} from "./auth";
import { usernameToEmail } from "./username";

beforeEach(() => {
  // فحص التسريبات (3.1): لا نداء شبكة حقيقي في الاختبارات.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("")),
  );
  signInWithPassword.mockReset();
  rpcMock.mockReset();
  signInWithPassword.mockResolvedValue({ error: null });
});

describe("الدخول باسم المستخدم", () => {
  it("يدخل بالبريد الداخلي المشتق من الاسم الموحَّد", async () => {
    await signInWithUsername(" Ahmad_1 ", "secret-pass");
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: "e0f254fd64d099e6e86ff329a55e3867@users.zen.invalid",
      password: "secret-pass",
    });
  });

  it("يقبل البريد لحساب قديم", async () => {
    await signInWithUsername("Old@Example.com", "secret-pass");
    expect(signInWithPassword.mock.calls[0][0].email).toBe("old@example.com");
  });

  it("اسم غير صالح لا يصل إلى الخادم، والخطأ عام", async () => {
    await expect(signInWithUsername("1x", "secret-pass")).rejects.toThrow("غير صحيحة");
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("يعرض خطأ الدخول بالعربية دون كشف وجود الحساب", async () => {
    signInWithPassword.mockResolvedValue({ error: { message: "Invalid login credentials" } });
    await expect(signInWithUsername("ahmad_1", "wrongpass")).rejects.toThrow(
      "اسم المستخدم أو كلمة المرور غير صحيحة",
    );
  });

  it("التسجيل ينشئ الحساب في قاعدة البيانات ثم يدخل، ولا يرسل دوراً", async () => {
    rpcMock.mockResolvedValue({
      data: { username: "احمد", recovery_code: "ABCD-EFGH-JKMN-PQRS" },
      error: null,
    });
    const r = await signUpWithUsername("أحمد", "secret-pass1", " أحمد علي ");
    expect(rpcMock).toHaveBeenCalledWith("register_username_account", {
      _username: "احمد",
      _password: "secret-pass1",
      _name: "أحمد علي",
    });
    expect(r).toEqual({ username: "احمد", recoveryCode: "ABCD-EFGH-JKMN-PQRS" });
    expect(signInWithPassword.mock.calls[0][0].email).toBe(await usernameToEmail("احمد"));
  });

  it("الاسم المستخدم من قبل برسالة عربية", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "username_taken: اسم المستخدم مستخدم من قبل، اختر غيره." },
    });
    await expect(signUpWithUsername("ahmad_1", "secret-pass1", "")).rejects.toThrow(
      "مستخدم من قبل",
    );
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("كلمة مرور قصيرة تُرفض قبل الخادم", async () => {
    await expect(signUpWithUsername("ahmad_1", "1234567", "")).rejects.toThrow("8 أحرف");
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("الاسترداد: رمز خاطئ برسالة عامة، والصحيح يدخل ويعيد رمزاً جديداً", async () => {
    rpcMock.mockResolvedValueOnce({ data: { ok: false }, error: null });
    await expect(resetWithRecoveryCode("ahmad_1", "AAAA", "new-pass-1")).rejects.toThrow(
      "رمز الاسترداد غير صحيح",
    );
    rpcMock.mockResolvedValueOnce({
      data: { ok: true, username: "ahmad_1", recovery_code: "NEWC-ODE2-3456-789A" },
      error: null,
    });
    const r = await resetWithRecoveryCode("ahmad_1", "abcd-efgh", "new-pass-1");
    expect(r.recoveryCode).toBe("NEWC-ODE2-3456-789A");
    expect(signInWithPassword).toHaveBeenCalledTimes(1);
  });

  it("تغيير كلمة المرور يعيد الدخول بالجديدة (الخادم يُنهي الجلسات)", async () => {
    rpcMock.mockResolvedValue({ data: true, error: null });
    await changeMyPassword("ahmad_1", "old-pass-1", "new-pass-1");
    expect(rpcMock).toHaveBeenCalledWith("change_my_password", {
      _current: "old-pass-1",
      _new_password: "new-pass-1",
    });
    expect(signInWithPassword.mock.calls[0][0].password).toBe("new-pass-1");
  });

  it("المعلّم: رفض الخادم برسالة واضحة", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "not_allowed: ..." } });
    await expect(teacherSetStudentPassword("s1", "temp-pass-1")).rejects.toThrow("معلّم حلقة");
  });

  it("كلمة المرور المؤقتة بلا محارف ملتبسة", () => {
    const p = generateTempPassword();
    expect(p).toHaveLength(10);
    expect(p).toMatch(/^[a-hj-km-np-z2-9]+$/);
  });

  it("كلمة مرور جديدة بلا رقم أو بلا حرف تُرفض قبل الخادم (C4)", async () => {
    await expect(signUpWithUsername("ahmad_1", "onlyletters", "")).rejects.toThrow("حرف ورقم");
    await expect(signUpWithUsername("ahmad_1", "12345678", "")).rejects.toThrow("حرف ورقم");
    expect(passwordRuleError("كلمةسر123")).toBeNull();
    expect(passwordRuleError("rawda2024x")).toBeNull();
    expect(passwordRuleError("abc12345")).toContain("شائعة");
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("كلمة المرور المؤقتة تحقق القاعدة دائماً", () => {
    for (let i = 0; i < 200; i++) expect(passwordRuleError(generateTempPassword())).toBeNull();
  });

  it("رموز أخطاء Supabase Auth مقدَّمة على نص الرسالة (M10)", () => {
    expect(arabicAuthError({ code: "invalid_credentials", message: "anything" })).toContain(
      "غير صحيحة",
    );
    expect(arabicAuthError({ code: "over_request_rate_limit", message: "" })).toContain(
      "محاولات كثيرة",
    );
    expect(arabicAuthError({ code: "same_password", message: "x" })).toContain("تختلف");
    expect(arabicAuthError({ status: 429, message: "x" })).toContain("محاولات كثيرة");
    expect(arabicAuthError({ code: "weak_password", message: "x", reasons: ["pwned"] })).toBe(
      PWNED_PASSWORD_MESSAGE,
    );
    expect(arabicAuthError({ code: "weak_password", message: "x" })).toContain("حرف ورقم");
    // رمز مجهول: يرجع إلى مطابقة النص (استثناءات دوال قاعدة البيانات).
    expect(arabicAuthError({ code: "P0001", message: "username_taken: ..." })).toContain(
      "مستخدم من قبل",
    );
  });

  it("قفل مؤقت بعد 5 محاولات دخول خاطئة، يتضاعف ويُمسح بالنجاح (C4)", async () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
    try {
      expect(lockDurationMs(4)).toBe(0);
      expect(lockDurationMs(5)).toBe(30_000);
      expect(lockDurationMs(6)).toBe(60_000);
      expect(lockDurationMs(50)).toBe(15 * 60_000);

      signInWithPassword.mockResolvedValue({
        error: { code: "invalid_credentials", message: "Invalid login credentials" },
      });
      for (let i = 0; i < 5; i++) {
        await expect(signInWithUsername("ahmad_1", "wrongpass")).rejects.toThrow("غير صحيحة");
      }
      expect(loginLockSeconds()).toBeGreaterThan(0);
      await expect(signInWithUsername("ahmad_1", "secret-pass")).rejects.toThrow("حاول بعد");
      expect(signInWithPassword).toHaveBeenCalledTimes(5);

      // انتهاء القفل ثم دخول صحيح يمسح العدّاد.
      store.set(LOGIN_LOCK_KEY, JSON.stringify({ fails: 5, until: 0 }));
      signInWithPassword.mockResolvedValue({ error: null });
      await signInWithUsername("ahmad_1", "secret-pass");
      expect(store.has(LOGIN_LOCK_KEY)).toBe(false);

      // فشل الشبكة لا يُحتسب.
      signInWithPassword.mockResolvedValue({ error: { message: "Failed to fetch" } });
      await expect(signInWithUsername("ahmad_1", "secret-pass")).rejects.toThrow("الإنترنت");
      expect(store.has(LOGIN_LOCK_KEY)).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("يترجم الأخطاء الشائعة", () => {
    expect(arabicAuthError("rate_limited: ...")).toContain("محاولات كثيرة");
    expect(arabicAuthError("wrong_password: ...")).toContain("غير صحيحة");
    expect(arabicAuthError("Failed to fetch")).toContain("الإنترنت");
  });
});

describe("المعلّم ينشئ حساب طالب (المرحلة 6.1)", () => {
  const HALAQA = "dddd0000-0000-0000-0000-00000000077a";

  it("يرسل الاسم الموحَّد ولا يدخل بحساب الطالب", async () => {
    rpcMock.mockResolvedValue({
      data: {
        student_id: "s1",
        username: "احمد_علي",
        name: "أحمد علي",
        recovery_code: "ABCD-EFGH-JKLM-NPQR",
      },
      error: null,
    });
    const out = await teacherCreateStudent({
      halaqaId: HALAQA,
      username: " أحمد_علي ",
      password: "temp-pass-1",
      name: "  أحمد علي ",
    });
    expect(rpcMock).toHaveBeenCalledWith("teacher_create_student", {
      _halaqa: HALAQA,
      _username: "احمد_علي",
      _password: "temp-pass-1",
      _name: "أحمد علي",
    });
    expect(out).toEqual({
      studentId: "s1",
      username: "احمد_علي",
      name: "أحمد علي",
      recoveryCode: "ABCD-EFGH-JKLM-NPQR",
    });
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("يرفض المدخلات الخاطئة قبل الشبكة", async () => {
    const base = { halaqaId: HALAQA, username: "ahmad_1", password: "temp-pass-1", name: "أحمد" };
    await expect(teacherCreateStudent({ ...base, name: " ا " })).rejects.toThrow("اسم الطالب");
    await expect(teacherCreateStudent({ ...base, username: "1bad" })).rejects.toThrow();
    await expect(teacherCreateStudent({ ...base, password: "short" })).rejects.toThrow();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("رسائل الخادم بالعربية", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "not_allowed: لا يمكنك إضافة طلاب إلى حلقة ليست حلقتك." },
    });
    await expect(
      teacherCreateStudent({
        halaqaId: HALAQA,
        username: "ahmad_1",
        password: "temp-pass-1",
        name: "أحمد",
      }),
    ).rejects.toThrow("ليست حلقتك");
    expect(arabicAuthError("username_taken: ...")).toContain("مستخدم من قبل");
    expect(arabicAuthError("invalid_name: ...")).toContain("اسم الطالب");
  });
});
