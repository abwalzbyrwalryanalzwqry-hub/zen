import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
let authCb: ((event: string) => void) | null = null;
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpc(...a),
    auth: {
      onAuthStateChange: (cb: (event: string) => void) => {
        authCb = cb;
        return { data: { subscription: { unsubscribe() {} } } };
      },
    },
  },
}));

import {
  consentState,
  getRecitationConsent,
  guardianNote,
  resetRecitationConsentCache,
  setRecitationConsent,
} from "./recitation-consent";

describe("موافقة التحليل الآلي للصوت في العميل (P0-05)", () => {
  beforeEach(() => {
    rpc.mockReset();
    resetRecitationConsentCache();
  });

  it("مطفأة ما لم يقل الخادم نعم صراحة", async () => {
    rpc.mockResolvedValueOnce({ data: { memo_context: true }, error: null });
    expect(await getRecitationConsent()).toBe(false);
    expect(rpc).toHaveBeenCalledWith("my_ai_consent");
  });

  it("تُحفظ في الذاكرة ثم تُنسى عند تبديل الحساب", async () => {
    rpc.mockResolvedValue({ data: { recitation_audio: true }, error: null });
    expect(await getRecitationConsent()).toBe(true);
    expect(await getRecitationConsent()).toBe(true);
    expect(rpc).toHaveBeenCalledTimes(1);
    authCb?.("TOKEN_REFRESHED");
    await getRecitationConsent();
    expect(rpc).toHaveBeenCalledTimes(1);
    authCb?.("SIGNED_IN");
    await getRecitationConsent();
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("المنح والسحب بدالة الخادم، والخطأ يُرمى", async () => {
    rpc.mockResolvedValueOnce({ data: { recitation_audio: true }, error: null });
    expect((await setRecitationConsent(true)).effective).toBe(true);
    expect(rpc).toHaveBeenCalledWith("set_recitation_ai_consent", { _on: true });
    rpc.mockResolvedValueOnce({ data: null, error: new Error("x") });
    await expect(setRecitationConsent(false)).rejects.toThrow("x");
  });

  it("القاصر (القرار 0011): موافقته وحدها غير نافذة، والشرح بحسب ربط وليّ الأمر", async () => {
    const child = { recitation_audio: true, recitation_effective: false, minor: true };
    expect(guardianNote(consentState({ ...child, has_guardian: true }))).toBe(
      "recitationConsent.waitGuardian",
    );
    expect(guardianNote(consentState({ ...child, has_guardian: false }))).toBe(
      "recitationConsent.linkGuardian",
    );
    expect(
      guardianNote(
        consentState({ ...child, recitation_effective: true, guardian_recitation: true }),
      ),
    ).toBeNull();
    expect(guardianNote(consentState({ recitation_audio: false, minor: true }))).toBeNull();
    rpc.mockResolvedValueOnce({ data: { ...child, has_guardian: true }, error: null });
    expect(await getRecitationConsent()).toBe(false);
    rpc.mockResolvedValueOnce({
      data: { recitation_audio: true, recitation_effective: true },
      error: null,
    });
    await setRecitationConsent(true, true);
    expect(rpc).toHaveBeenLastCalledWith("set_recitation_ai_consent", {
      _on: true,
      _age_13_plus: true,
    });
  });
});
