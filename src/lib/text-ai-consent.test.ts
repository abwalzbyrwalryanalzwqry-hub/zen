import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { onAuthStateChange: vi.fn() }, rpc: vi.fn() },
}));
vi.mock("@/lib/offline/guest", () => ({ isGuest: () => false }));

import { supabase } from "@/integrations/supabase/client";
import {
  ensureTextAiConsent,
  registerTextAiHost,
  resetTextAiCache,
  textAiState,
} from "./text-ai-consent";

describe("موافقة الذكاء الاصطناعي النصّي (N-03)", () => {
  it("النافذة من الخادم وحده؛ الخادم القديم بلا الحقل ⇒ غير نافذة", () => {
    expect(textAiState({ text_ai: true, text_ai_effective: true }).effective).toBe(true);
    expect(textAiState({ text_ai: true, text_ai_effective: false, minor: true }).effective).toBe(
      false,
    );
    expect(textAiState({ text_ai: true }).effective).toBe(false);
    expect(textAiState(null)).toEqual({
      own: false,
      effective: false,
      minor: false,
      hasGuardian: false,
    });
  });

  it("بلا موافقة يُسأل المضيف، ورفضه يوقف الطلب", async () => {
    resetTextAiCache();
    vi.mocked(supabase.rpc).mockResolvedValue({ data: { text_ai: false }, error: null } as never);
    const off = registerTextAiHost(async () => false);
    expect(await ensureTextAiConsent()).toBe(false);
    off();
  });

  it("الموافقة النافذة لا تسأل", async () => {
    resetTextAiCache();
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: { text_ai: true, text_ai_effective: true },
      error: null,
    } as never);
    const host = vi.fn(async () => false);
    const off = registerTextAiHost(host);
    expect(await ensureTextAiConsent()).toBe(true);
    expect(host).not.toHaveBeenCalled();
    off();
  });

  it("تعذّر السؤال ⇒ يمضي والخادم يحسم", async () => {
    resetTextAiCache();
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: new Error("x") } as never);
    expect(await ensureTextAiConsent()).toBe(true);
  });
});
