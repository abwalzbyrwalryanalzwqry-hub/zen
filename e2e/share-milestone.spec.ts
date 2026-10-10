import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { STUDENT, gotoReady, installFakeSupabase, seedSession } from "./fake-supabase";

// المرحلة 11.4: بطاقة «ختم جزء» و«سلسلة 30 يوماً» تُرسم محلياً وتُشارك (تنزيل على المتصفح).
test("مشاركة بطاقة إنجاز", async ({ page, context }) => {
  await installFakeSupabase(context, {
    user: STUDENT,
    rpc: {
      student_achievements: {
        student: { id: STUDENT.id, name: "طالب" },
        streak: {
          current: 31,
          best: 31,
          active_30: 30,
          today: true,
          wird_today: true,
          last_day: null,
        },
        memorized_pages: 20,
        memorized: [],
        badges: [
          { kind: "juz", no: 30, label: "جزء عمّ", earned_at: "2026-09-01T00:00:00Z" },
          { kind: "streak", no: 7, label: "7 أيام", earned_at: "2026-08-01T00:00:00Z" },
          { kind: "streak", no: 30, label: "30 يوماً", earned_at: "2026-09-20T00:00:00Z" },
        ],
        certificates: [],
      },
      my_achievement_halaqat: [],
      family_goals_for: [],
    },
  });
  await seedSession(context, STUDENT);
  await gotoReady(page, "/achievements");
  const group = page.getByRole("group", { name: "شارك إنجازك" });
  await expect(group.getByRole("button")).toHaveCount(2, { timeout: 20_000 });
  await expect(group.getByRole("button").first()).toHaveText("30 يوماً متتالية");
  const [dl] = await Promise.all([
    page.waitForEvent("download"),
    group.getByRole("button", { name: "ختمتُ حفظ الجزء الثلاثون" }).click(),
  ]);
  expect(dl.suggestedFilename()).toBe("zen-juz-30.png");
  const path = await dl.path();
  const buf = await readFile(path!);
  expect(buf.subarray(1, 4).toString()).toBe("PNG");
  if (process.env.SAVE_CARD) await dl.saveAs(process.env.SAVE_CARD);
});
