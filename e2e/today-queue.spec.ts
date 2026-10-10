import { expect, test } from "@playwright/test";
import { STUDENT, gotoReady, installFakeSupabase, seedSession } from "./fake-supabase";

// المرحلة 8.2: طابور اليوم أولاً في شاشة اليوم، والبند يُشطب بعد إنجازه.
test("طابور اليوم: البنود بزمنها، و«قرأت وردي» يشطب الورد، وبطاقة توقّع الختم", async ({
  page,
  context,
}) => {
  let wird = false;
  const queue = () => ({
    day: "2026-09-29",
    total_minutes: wird ? 15 : 30,
    done: wird ? 1 : 0,
    items: [
      {
        kind: "assignment",
        id: "a1",
        surah_name: "الملك",
        from_ayah: 1,
        to_ayah: 5,
        sub: "memorize",
        done: false,
        minutes: 10,
      },
      {
        kind: "review",
        id: "r1",
        surah_name: "النبأ",
        from_ayah: 1,
        to_ayah: 10,
        done: false,
        minutes: 5,
      },
      { kind: "wird", id: "wird", done: wird, minutes: 15 },
    ],
  });
  const { calls } = await installFakeSupabase(context, {
    user: STUDENT,
    tables: {
      profiles: [{ id: STUDENT.id, name: "طالب", role: "student" }],
      // صفحة يومياً في آخر 20 يوماً ← بطاقة توقّع الختم (8.5).
      mushaf_records: Array.from({ length: 20 }, (_, i) => ({
        id: `m${i}`,
        student_id: STUDENT.id,
        page: i + 1,
        kind: "memorize",
        session_date: new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10),
      })),
    },
    rpc: {
      my_home_context: () => ({
        account_kind: "student",
        is_teacher: false,
        children: 0,
        halaqas_joined: 1,
        halaqas_taught: 0,
        center_staff: false,
      }),
      my_today_queue: () => queue(),
    },
  });
  await context.route("**/rest/v1/daily_wird*", async (route) => {
    if (route.request().method() === "POST") wird = true;
    return route.fulfill({ status: 201, contentType: "application/json", body: "[]" });
  });
  await seedSession(context, STUDENT);

  await gotoReady(page, "/today");
  const card = page.getByRole("region", { name: "طابور اليوم" });
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(card).toContainText("واجب: الملك 1–5");
  await expect(card).toContainText("مراجعة: النبأ 1–10");
  await expect(card).toContainText("0/3 · بقي 30 دقيقة");
  await expect(card.getByRole("link", { name: "احفظ" })).toHaveAttribute(
    "href",
    /mushaf\/memorize\?surah=78/,
  );

  await card.getByRole("button", { name: "قرأت وردي" }).click();
  await expect(card).toContainText("1/3 · بقي 15 دقيقة");
  await expect(card.locator('[data-kind="wird"][data-done]')).toBeVisible();
  expect(
    calls.filter((c) => c.path === "/rest/v1/rpc/my_today_queue").length,
  ).toBeGreaterThanOrEqual(2);
});
