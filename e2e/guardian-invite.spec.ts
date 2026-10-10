import { expect, test } from "@playwright/test";
import { STUDENT, gotoReady, installFakeSupabase, seedSession } from "./fake-supabase";

// المرحلة 11.1: وليّ الأمر يرى الدعوة التي قبلها ابنه ويوافق عليها من «متابعة أبنائي».
test("موافقة وليّ الأمر على دعوة الحلقة", async ({ page, context }) => {
  let pending = [
    {
      id: "inv1",
      student_id: "kid1",
      student_name: "عمر",
      halaqa_name: "حلقة الفجر",
      teacher_name: "الشيخ خالد",
      center_name: "مركز النور",
      schedule: "يومياً بعد الفجر",
      responded_at: "2026-09-29T08:00:00Z",
    },
  ];
  const { calls } = await installFakeSupabase(context, {
    user: STUDENT,
    rpc: {
      my_guardian_children: [],
      guardian_room_consents: [],
      guardian_pending_invites: () => pending,
      guardian_approve_invite: () => {
        pending = [];
        return "accepted";
      },
    },
  });
  await seedSession(context, STUDENT);
  await gotoReady(page, "/family");
  const box = page.getByRole("region", { name: "طلبات الانضمام إلى حلقات" });
  await expect(box).toContainText("عمر قبل دعوة المعلّم الشيخ خالد", { timeout: 20_000 });
  await expect(box).toContainText("مركز النور");
  await box.getByRole("button", { name: "موافقة" }).click();
  await expect(box.getByRole("status")).toHaveText("انضم عمر إلى «حلقة الفجر».");
  expect(calls.find((c) => c.path === "/rest/v1/rpc/guardian_approve_invite")?.body).toEqual({
    _invite: "inv1",
    _approve: true,
  });
});
