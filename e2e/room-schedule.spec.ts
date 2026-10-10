import { expect, test } from "@playwright/test";
import { TEACHER, gotoReady, installFakeSupabase, seedSession } from "./fake-supabase";

// المرحلة 9.5: المشرف يكتب إعلاناً ويجدوله؛ تظهر قائمة المجدول ويمكن الإلغاء.
test("جدولة رسالة في غرفة الإعلانات", async ({ page, context }) => {
  const R = "rrrr0000-0000-4000-8000-000000000001";
  let list: Array<Record<string, unknown>> = [];
  const { calls } = await installFakeSupabase(context, {
    user: TEACHER,
    rpc: {
      room_info: {
        room_id: R,
        halaqa_id: "h1",
        halaqa_name: "حلقة الفجر",
        kind: "announcements",
        enabled: true,
        role: "mod",
        can_post: true,
        muted_until: null,
        open_reports: 0,
        pinned: null,
      },
      room_messages_page: [],
      room_read_stats: [],
      mark_room_read: null,
      room_scheduled_list: () => list,
      schedule_room_message: (b: unknown) => {
        const x = b as { _content: string; _at: string };
        list = [
          { id: "s1", content: x._content, scheduled_at: x._at, status: "pending", error: null },
        ];
        return "s1";
      },
      cancel_scheduled_room_message: () => {
        list = list.map((r) => ({ ...r, status: "cancelled" }));
        return true;
      },
    },
  });
  await seedSession(context, TEACHER);
  await gotoReady(page, `/rooms/${R}`);
  await page.getByPlaceholder("اكتب إعلاناً للحلقة…").fill("تذكير: الحلقة غداً بعد الفجر");
  await page.getByRole("button", { name: "جدولة الرسالة" }).click();
  const dlg = page.getByRole("dialog", { name: "جدولة رسالة" });
  await expect(dlg).toContainText("تذكير: الحلقة غداً بعد الفجر");
  await dlg.getByRole("button", { name: "جدولة", exact: true }).click();
  await expect(dlg.getByRole("status")).toContainText("جُدولت الرسالة");
  const list1 = dlg.getByRole("list", { name: "الرسائل المجدولة" });
  await expect(list1).toContainText("مجدولة");
  const body = calls.find((c) => c.path === "/rest/v1/rpc/schedule_room_message")?.body as {
    _room: string;
    _at: string;
  };
  expect(body._room).toBe(R);
  expect(Date.parse(body._at) - Date.now()).toBeGreaterThan(55 * 60_000);
  await list1.getByRole("button", { name: "إلغاء" }).click();
  await expect(list1).toContainText("أُلغيت");
  // خانة الكتابة فُرِّغت بعد الجدولة.
  await dlg.getByRole("button", { name: "إغلاق" }).click();
  await expect(page.getByPlaceholder("اكتب إعلاناً للحلقة…")).toHaveValue("");
});
