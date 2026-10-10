import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { STUDENT, TEACHER, gotoReady, installFakeSupabase, seedSession } from "./fake-supabase";

// الإصدار 1.20.0 (المرحلة 4): أسهم المقارنة، والتعمّق في المؤشر، وجودة الإدخال لكل معلّم، ودوري الحلقات وإعداداته.

const C = "c-insights";
const win = (o: Record<string, unknown>) => ({
  from: "2026-09-01",
  to: "2026-09-30",
  students: 3,
  active_students: 3,
  attendance_records: 10,
  attendance_rate: 70,
  pages_memorized: 10,
  assessments: 4,
  avg_score: 80,
  exams: 0,
  avg_exam: null,
  records: 8,
  same_day_rate: 75,
  edits_after_close: 1,
  ...o,
});
const shot = (n: string) => (process.env.SHOTS ? `${process.env.SHOTS}/${n}.png` : null);

test("لوحة المدير: سهم التغيّر، والتعمّق بالأقل حضوراً، وجودة المعلّم، والدوري يفعّله المدير", async ({
  page,
  context,
}) => {
  const { calls } = await installFakeSupabase(context, {
    user: TEACHER,
    tables: { centers: [{ weekly_summary_enabled: true }] },
    rpc: {
      center_dashboard: {
        center: { id: C, name: "مركز النور", city: "صنعاء" },
        period_days: 30,
        since: "2026-09-01",
        can_manage: true,
        totals: {
          halaqat: 2,
          students: 3,
          teachers: 1,
          weekly_slots: 0,
          attendance_records: 10,
          attendance_rate: 80,
          pages_memorized: 12,
          assessments: 4,
          avg_score: 80,
          exams: 0,
          avg_exam: null,
          at_risk: 1,
        },
        halaqat: [],
        teachers: [],
        at_risk: [],
        weekly: [],
      },
      center_students: [
        { student_id: "s1", name: "أحمد", halaqat: "حلقة الفجر" },
        { student_id: "s2", name: "بلال", halaqat: "حلقة العصر" },
      ],
      center_kpis: null,
      center_record_quality: null,
      center_period_compare: {
        days: 30,
        current: win({ attendance_rate: 80, pages_memorized: 12 }),
        previous: win({ attendance_rate: 70, pages_memorized: 10 }),
      },
      center_drilldown: {
        days: 30,
        students: [
          {
            student_id: "s1",
            name: "أحمد",
            halaqat: "حلقة الفجر",
            halaqa_id: "h1",
            attendance_total: 5,
            absent: 0,
            attendance_rate: 100,
            pages: 8,
            assessments: 2,
            avg_score: 90,
            avg_exam: null,
            last_activity: "2026-09-29",
          },
          {
            student_id: "s2",
            name: "بلال",
            halaqat: "حلقة العصر",
            halaqa_id: "h2",
            attendance_total: 5,
            absent: 3,
            attendance_rate: 40,
            pages: 4,
            assessments: 2,
            avg_score: 70,
            avg_exam: null,
            last_activity: "2026-09-20",
          },
        ],
      },
      center_teacher_quality: {
        center_id: C,
        days: 30,
        teachers: [
          {
            teacher_id: "t1",
            name: "الأستاذ سالم",
            halaqat: 2,
            records: 10,
            closed: 10,
            same_day: 6,
            same_day_rate: 60,
            late_closes: 4,
            edits_after_close: 2,
            warnings: 1,
            reviewed: 0,
            flagged: 0,
          },
        ],
      },
      center_halaqa_league: {
        center_id: C,
        enabled: false,
        days: 30,
        items: [
          {
            halaqa_id: "h2",
            name: "حلقة العصر",
            students: 2,
            mine: false,
            regularity: 60,
            avg_score: 70,
            challenges: null,
            index: 65,
            index_prev: 50,
            change: 15,
            rank: 1,
          },
          {
            halaqa_id: "h1",
            name: "حلقة الفجر",
            students: 1,
            mine: false,
            regularity: 90,
            avg_score: 90,
            challenges: null,
            index: 90,
            index_prev: 92,
            change: -2,
            rank: 2,
          },
        ],
      },
      my_managed_centers: [{ center_id: C, name: "مركز النور", city: "صنعاء", role: "owner" }],
      set_center_halaqa_league: null,
    },
  });
  await seedSession(context, TEACHER);
  await gotoReady(page, `/center/${C}`);

  // أسهم المقارنة: الحضور +10 نقاط، والصفحات +20%.
  const deltas = page.getByTestId("kpi-delta");
  await expect(deltas.first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("↑ 10 نقطة")).toBeVisible();
  await expect(page.getByText("↑ 20%")).toBeVisible();
  if (shot("center-compare")) await page.screenshot({ path: shot("center-compare")! });

  // التعمّق: الأقل حضوراً أولاً، واللمس يختار الطالب في «تقرير طالب».
  await page.getByRole("button", { name: /نسبة الحضور/ }).click();
  const list = page.getByTestId("drill-list");
  await expect(list.locator("li").first()).toContainText("بلال");
  await expect(list.locator("li").first()).toContainText("40%");
  if (shot("center-drill")) await page.screenshot({ path: shot("center-drill")! });
  await list.locator("li").first().getByRole("button").click();
  await expect(page.locator("select")).toHaveValue("s2");

  // جودة الإدخال لكل معلّم.
  const tq = page.getByTestId("teacher-quality");
  await expect(tq).toContainText("الأستاذ سالم");
  await expect(tq).toContainText("تستحق نظرة");

  // الدوري: الأكثر تحسّناً أولاً ولو كانت قيمته أقل، والمدير يفعّله.
  const league = page.getByTestId("halaqa-league");
  await expect(league.locator("li").first()).toContainText("حلقة العصر");
  const sw = page.getByRole("switch", { name: "إظهار الدوري لأعضاء الحلقات" });
  await expect(sw).toHaveAttribute("aria-checked", "false");
  await sw.click();
  await expect
    .poll(() => calls.find((c) => c.path === "/rest/v1/rpc/set_center_halaqa_league")?.body)
    .toEqual({ _center: C, _on: true });
  await expect(page.getByRole("switch", { name: "ملخص الخميس الأسبوعي" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
});

test("الإنجازات: الدوري لأعضاء الحلقات، وقالب القصة بالاسم الأول افتراضياً", async ({
  page,
  context,
}) => {
  await installFakeSupabase(context, {
    user: STUDENT,
    rpc: {
      student_achievements: {
        student: { id: STUDENT.id, name: "محمد أحمد علي" },
        streak: {
          current: 3,
          best: 5,
          active_30: 10,
          today: true,
          wird_today: true,
          last_day: null,
        },
        memorized_pages: 20,
        memorized: [],
        badges: [],
        certificates: [
          {
            id: "cert1",
            juz: 30,
            status: "approved",
            serial: "Z-0001",
            student_name: "محمد أحمد علي",
            halaqa_name: "حلقة الفجر",
            center_name: "مركز النور",
            teacher_name: "الأستاذ سالم",
            teacher_note: null,
            decided_at: "2026-09-01T00:00:00Z",
            created_at: "2026-09-01T00:00:00Z",
            verify_code: "ABCD2345EF",
          },
        ],
      },
      my_achievement_halaqat: [],
      family_goals_for: [],
      my_halaqa_leagues: [
        {
          center_id: C,
          center_name: "مركز النور",
          enabled: true,
          days: 30,
          items: [
            {
              halaqa_id: "h1",
              name: "حلقة الفجر",
              students: 3,
              mine: true,
              regularity: 80,
              avg_score: 85,
              challenges: 50,
              index: 74,
              index_prev: 70,
              change: 4,
              rank: 1,
            },
          ],
        },
      ],
    },
  });
  await seedSession(context, STUDENT);
  await gotoReady(page, "/achievements");
  const league = page.getByTestId("halaqa-league");
  await expect(league).toContainText("دوري حلقات مركز النور", { timeout: 20_000 });
  await expect(league.locator('[data-league-halaqa="h1"]')).toContainText("حلقة الفجر");

  await page.getByTestId("story-share").click();
  await expect(page.getByTestId("story-preview")).toBeVisible();
  await expect(page.getByTestId("story-hide-name")).toBeChecked();
  if (shot("story-sheet")) await page.screenshot({ path: shot("story-sheet")! });
  const [dl] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "مشاركة الصورة" }).click(),
  ]);
  expect(dl.suggestedFilename()).toBe("zen-story-juz30-Z-0001.png");
  const buf = await readFile((await dl.path())!);
  expect(buf.subarray(1, 4).toString()).toBe("PNG");
  // مقاس القصة من ترويسة PNG (IHDR): العرض ثم الارتفاع.
  expect([buf.readUInt32BE(16), buf.readUInt32BE(20)]).toEqual([1080, 1920]);
  if (process.env.SHOTS) await dl.saveAs(`${process.env.SHOTS}/story.png`);
});
