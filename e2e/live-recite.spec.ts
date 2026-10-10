import { expect, test } from "@playwright/test";
import { STUDENT, gotoReady, installFakeSupabase, seedSession } from "./fake-supabase";

// المرحلة 8.4: مقاطع قصيرة تُفرَّغ نصاً فقط، والمطابقة التراكمية على الجهاز.
test("التسميع المباشر: الكلمات تتلوّن تباعاً والنهاية تكشف الساقط", async ({ page, context }) => {
  // ميكروفون ومسجّل وهميّان: كل مقطع يُغلق فوراً بملف 2KB.
  await context.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }),
      },
    });
    class FakeRecorder {
      state = "inactive";
      mimeType = "audio/webm";
      ondataavailable: ((e: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      start() {
        this.state = "recording";
        const n = ((w.__chunks as number) ?? 0) + 1;
        w.__chunks = n;
        // مقطعان فقط ثم يتوقف الاختبار بزر الإنهاء.
        if (n <= 2)
          setTimeout(() => {
            if (this.state !== "recording") return;
            this.state = "inactive";
            this.ondataavailable?.({ data: new Blob([new Uint8Array(2000)]) });
            this.onstop?.();
          }, 50);
      }
      stop() {
        if (this.state !== "recording") return;
        this.state = "inactive";
        this.ondataavailable?.({ data: new Blob([new Uint8Array(10)]) }); // المقطع الأخير صامت
        this.onstop?.();
      }
    }
    w.MediaRecorder = FakeRecorder;
  });
  const heard = ["قل هو الله أحد", "الله الصمد"];
  let i = 0;
  let consent = false;
  const { calls } = await installFakeSupabase(context, {
    user: STUDENT,
    rpc: {
      my_ai_consent: () => ({ memo_context: false, recitation_audio: consent }),
      set_recitation_ai_consent: (b: unknown) => {
        consent = (b as { _on: boolean })._on;
        return { memo_context: false, recitation_audio: consent };
      },
    },
    functions: {
      "zen-recitation": (b: unknown) => {
        expect((b as { action: string }).action).toBe("transcribe_chunk");
        return { text: heard[i++] ?? "" };
      },
    },
  });
  await seedSession(context, STUDENT);

  await gotoReady(page, "/recite/live?surah=112&from=1&to=4");
  await expect(page.getByRole("heading", { name: "التسميع المباشر" })).toBeVisible();
  const text = page.getByLabel("نص التسميع");
  await expect(text).toContainText("قُلْ", { timeout: 20_000 });
  await page.getByRole("button", { name: "ابدأ التسميع" }).click();
  // الموافقة على التحليل الآلي قبل أول مقطع (P0-05).
  await page.getByRole("button", { name: "أوافق وأبدأ التحليل" }).click();
  expect(consent).toBe(true);

  // بعد المقطعين: «قل هو الله أحد» + «الله الصمد» صحيحة (البسملة ليست من الآية فلا تُطابق).
  await expect(text.locator('[data-status="ok"]')).toHaveCount(6, { timeout: 10_000 });
  await page.getByRole("button", { name: "إنهاء التسميع" }).click();
  // بعد الإنهاء: الآيتان الأخيرتان ساقطتان.
  await expect(text.locator('[data-status="missed"]')).toHaveCount(9);
  await expect(text.locator('[data-status="pending"]')).toHaveCount(0);
  expect(calls.filter((c) => c.path === "/functions/v1/zen-recitation")).toHaveLength(2);
  await expect(page.getByRole("link", { name: "راجع المقطع في وضع الحفظ" })).toBeVisible();
});
