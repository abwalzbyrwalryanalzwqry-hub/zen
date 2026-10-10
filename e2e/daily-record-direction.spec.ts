import { expect, test } from "@playwright/test";
import { TEACHER, gotoReady, installFakeSupabase, seedSession, type Call } from "./fake-supabase";

// 1.14.0: الحفظ من الناس صعوداً — الاتجاه محفوظ للطالب، والبداية المقترحة السورة قبلها، وسورة النهاية
// تُقيَّد بما قبل البداية، ويُرسل المدى بترتيبه مع الاتجاه.

const H = "hhhh0000-0000-4000-8000-000000000001";
const R = "rrrr0000-0000-4000-8000-000000000001";

const student = {
  student_id: "s1",
  name: "أحمد",
  avatar: null,
  status: "present",
  reason: null,
  version: 0,
  note: null,
  evaluation: null,
  memorize: null,
  review: null,
  last_memorize: { surah_name: "الناس", from_ayah: 1, to_ayah: 6, session_date: "2026-10-03" },
  last_review: null,
  absences_30d: 0,
  memorize_dir: "backward",
  review_dir: "forward",
};

const sheet = {
  halaqa: { id: H, name: "حلقة الفجر", teacher_name: "الأستاذ يحيى" },
  date: "2026-10-04",
  today: "2026-10-04",
  can_edit: true,
  can_lock: false,
  record: {
    id: R,
    status: "open",
    version: 3,
    notes: null,
    completed_at: null,
    locked_at: null,
    completed_by_name: null,
  },
  students: [student],
};

test("الحفظ من الناس صعوداً: اقتراح السورة قبلها، ونهاية قبل البداية، والإرسال بالترتيب والاتجاه", async ({
  page,
  context,
}) => {
  const fake = await installFakeSupabase(context, {
    user: TEACHER,
    tables: {
      halaqat: [
        {
          id: H,
          center_id: "c1",
          name: "حلقة الفجر",
          teacher_id: TEACHER.id,
          schedule: null,
          created_at: "2026-01-01",
        },
      ],
    },
    rpc: {
      daily_record_sheet: () => sheet as never,
      save_daily_entry: () => ({ ...student, version: 1 }) as never,
    },
  });
  const calls: Call[] = fake.calls;
  await seedSession(context, TEACHER);
  await gotoReady(page, `/teacher/register?halaqa=${H}`);
  await page.getByRole("button", { name: "تفاصيل أحمد" }).click();
  const dialog = page.getByRole("dialog", { name: "أحمد" });
  await dialog.getByRole("button", { name: "إضافة حفظ" }).click();
  const memo = dialog.getByRole("region", { name: "الحفظ" });

  const dir = memo.getByRole("radiogroup", { name: "اتجاه الحفظ" });
  await expect(dir.getByRole("radio", { name: "من الناس إلى الفاتحة" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  // بعد الناس كاملة: الفلق من أولها.
  await expect(memo.getByRole("button", { name: "من سورة" })).toContainText("الفلق");
  await expect(memo.getByLabel("من آية")).toHaveValue("1");

  // سورة النهاية: ما بعد البداية في المصحف معطّل، وما قبلها متاح.
  await memo.getByRole("button", { name: "إلى سورة" }).click();
  const surahs = page.getByRole("dialog", { name: "اختر السورة" });
  await expect(surahs.getByRole("button", { name: /الناس/ })).toBeDisabled();
  await surahs.getByRole("button", { name: /الإخلاص/ }).click();
  await expect(memo.getByRole("button", { name: "إلى سورة" })).toContainText("الإخلاص");
  await memo.getByLabel("إلى آية").fill("4");
  await memo
    .getByRole("radiogroup", { name: "مستوى الأداء في الحفظ" })
    .getByRole("radio", { name: "ممتاز" })
    .click();

  await dialog.getByRole("button", { name: "تم" }).click();
  await expect(dialog).toBeHidden();
  const saved = calls.find((c) => c.path === "/rest/v1/rpc/save_daily_entry");
  expect(saved?.body).toMatchObject({
    _payload: {
      memorize: {
        direction: "backward",
        segments: [
          { surah_name: "الفلق", from_ayah: 1, to_ayah: 5 },
          { surah_name: "الإخلاص", from_ayah: 1, to_ayah: 4 },
        ],
      },
    },
  });
});
