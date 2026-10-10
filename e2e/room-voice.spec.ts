import { expect, test } from "@playwright/test";
import { STUDENT, gotoReady, installFakeSupabase, seedSession } from "./fake-supabase";

// المرحلة 9.7: تسجيل رسالة صوتية في النقاش ثم تشغيلها برابط موقّع.
test("رسالة صوتية في غرفة الحلقة", async ({ page, context }) => {
  const R = "rrrr0000-0000-4000-8000-000000000003";
  const messages: Array<Record<string, unknown>> = [];
  await context.addInitScript(() => {
    // ميكروفون ومسجّل وهميان: الاختبار لا يملك جهاز صوت.
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) },
    });
    class FakeRecorder {
      state = "inactive";
      mimeType = "audio/webm";
      ondataavailable: ((e: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      start() {
        this.state = "recording";
      }
      stop() {
        this.state = "inactive";
        this.ondataavailable?.({ data: new Blob(["x"], { type: "audio/webm" }) });
        this.onstop?.();
      }
    }
    (window as unknown as { MediaRecorder: unknown }).MediaRecorder = FakeRecorder;
  });
  const { calls } = await installFakeSupabase(context, {
    user: STUDENT,
    rpc: {
      room_info: {
        room_id: R,
        halaqa_id: "h1",
        halaqa_name: "حلقة الفجر",
        kind: "discussion",
        enabled: true,
        role: "member",
        can_post: true,
        muted_until: null,
        open_reports: 0,
        pinned: null,
      },
      room_messages_page: () => messages,
      mark_room_read: null,
      room_mention_candidates: [],
      my_room_voice_allowed: true,
      post_room_voice: (b: unknown) => {
        const { _path, _seconds } = b as { _path: string; _seconds: number };
        messages.push({
          id: "v1",
          sender_id: STUDENT.id,
          sender_name: "أنا",
          content: "رسالة صوتية",
          kind: "voice",
          media_path: _path,
          duration_seconds: _seconds,
          created_at: new Date().toISOString(),
          mine: true,
          pinned: false,
          deleted: false,
          hidden: false,
          reactions: [],
        });
        return "v1";
      },
    },
  });
  await context.route(/\/storage\/v1\/object\/sign\//, (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ signedURL: "/object/sign/room-media/x?token=t" }),
    }),
  );
  await seedSession(context, STUDENT);
  await gotoReady(page, `/rooms/${R}`);
  await page.getByRole("button", { name: "تسجيل رسالة صوتية" }).click();
  await expect(page.getByRole("group", { name: "تسجيل جارٍ" })).toContainText("1/60", {
    timeout: 5_000,
  });
  await page.getByRole("button", { name: "إيقاف وإرسال" }).click();
  await expect
    .poll(() => calls.find((c) => c.path === "/rest/v1/rpc/post_room_voice")?.body)
    .toBeTruthy();
  const body = calls.find((c) => c.path === "/rest/v1/rpc/post_room_voice")!.body as {
    _room: string;
    _path: string;
    _seconds: number;
  };
  expect(body._room).toBe(R);
  expect(body._path).toMatch(new RegExp(`^${R}/${STUDENT.id}/[0-9a-f-]+\\.webm$`));
  expect(body._seconds).toBeGreaterThanOrEqual(1);
  expect(
    calls.some((c) => c.path.startsWith(`/storage/v1/object/room-media/${R}/${STUDENT.id}/`)),
  ).toBe(true);
  const play = page.getByRole("button", { name: /تشغيل رسالة صوتية/ });
  await play.click();
  await expect(page.getByLabel("رسالة صوتية", { exact: true })).toBeVisible();
  await expect(page.getByText("رسالة صوتية", { exact: true })).toHaveCount(0);
});
