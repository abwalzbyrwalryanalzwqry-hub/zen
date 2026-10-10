import { expect, test } from "@playwright/test";
import { STUDENT, gotoReady, installFakeSupabase, seedSession } from "./fake-supabase";

// المرحلة 9.6: @ تفتح قائمة الأعضاء بالأسماء، والإرسال يرمّز الإشارة، والعرض يبرزها.
test("الإشارة إلى زميل في النقاش", async ({ page, context }) => {
  const R = "rrrr0000-0000-4000-8000-000000000002";
  const B = "10310310-0000-0000-0000-00000000000b";
  const messages: Array<Record<string, unknown>> = [];
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
      room_mention_candidates: [
        { user_id: "t1", name: "الشيخ خالد", mod: true },
        { user_id: B, name: "بلال", mod: false },
      ],
      post_room_message: (b: unknown) => {
        messages.push({
          id: "m1",
          sender_id: STUDENT.id,
          sender_name: "أنا",
          content: (b as { _content: string })._content,
          created_at: new Date().toISOString(),
          mine: true,
          pinned: false,
          deleted: false,
          hidden: false,
          reactions: [],
        });
        return "m1";
      },
    },
  });
  await seedSession(context, STUDENT);
  await gotoReady(page, `/rooms/${R}`);
  const box = page.getByPlaceholder("اكتب رسالة…");
  await box.click();
  await box.pressSequentially("شكراً @بل");
  const picker = page.getByRole("listbox", { name: "أشر إلى" });
  await expect(picker.getByRole("option")).toHaveCount(1);
  await picker.getByRole("option", { name: "بلال" }).click();
  await expect(box).toHaveValue("شكراً @بلال ");
  await box.pressSequentially("على المراجعة");
  await page.getByRole("button", { name: "إرسال" }).click();
  const sent = calls.find((c) => c.path === "/rest/v1/rpc/post_room_message")?.body as {
    _content: string;
  };
  expect(sent._content).toBe(`شكراً @[بلال](${B}) على المراجعة`);
  await expect(page.locator(`[data-mention="${B}"]`)).toHaveText("@بلال");
  await expect(page.getByText(`(${B})`)).toHaveCount(0);
});
