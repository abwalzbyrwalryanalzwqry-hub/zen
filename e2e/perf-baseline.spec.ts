import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test, type CDPSession, type Page } from "@playwright/test";
import { TEACHER, installFakeSupabase, seedSession } from "./fake-supabase";

/**
 * قياس الأداء (المرحلة 0 من خطة 1.17): جهاز ضعيف محاكى — معالج أبطأ 6 مرات (≈ Android 8 بذاكرة 2GB)،
 * وشبكة محلية. يقيس: البدء البارد إلى أول شاشة تفاعلية، وفتح السجل اليومي لحلقة من 40 طالباً، والتمرير فيه.
 *
 * النتائج في `perf-results/baseline.json` وفي ملخّص CI. الحدود في PERF_BUDGET تُفشل الاختبار فقط حين
 * PERF_ENFORCE=1 (CI يشغّله تقريراً أولاً، ثم يُفعَّل الإلزام بعد ثبات الأرقام). الأرقام المرجعية في
 * docs/PERFORMANCE.md.
 */

export const PERF_BUDGET = {
  coldStartMs: 2500,
  registerOpenMs: 1000,
  registerNavMs: 700,
  jankyFramePct: 5,
};

const CPU_SLOWDOWN = Number(process.env.PERF_CPU ?? 6);
const H = "hhhh0000-0000-4000-8000-0000000000p1";
const R = "rrrr0000-0000-4000-8000-0000000000p1";
const NAMES = ["يوسف", "أحمد", "بلال", "عمر", "زيد", "حمزة", "سالم", "خالد", "مالك", "أنس"];

const roster = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    student_id: `s${i + 1}`,
    name: `${NAMES[i % NAMES.length]} ${i + 1}`,
    avatar: null,
    status: i % 7 === 0 ? "absent" : i % 3 === 0 ? "present" : null,
    reason: null,
    version: 0,
    note: null,
    evaluation: null,
    memorize: null,
    review: null,
    last_memorize: null,
    last_review: null,
    absences_30d: i % 5,
  }));

async function slowDevice(page: Page): Promise<CDPSession> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_SLOWDOWN });
  return cdp;
}

/** نسبة الإطارات المتقطّعة (> 50ms) أثناء تمرير القائمة. */
async function scrollJank(page: Page): Promise<{ frames: number; janky: number; pct: number }> {
  await page.evaluate(() => {
    const w = window as unknown as { __frames: number[]; __stop: boolean };
    w.__frames = [];
    w.__stop = false;
    let last = performance.now();
    const tick = (t: number) => {
      w.__frames.push(t - last);
      last = t;
      if (!w.__stop) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  for (let i = 0; i < 12; i++) {
    await page.mouse.wheel(0, 420);
    await page.waitForTimeout(120);
  }
  for (let i = 0; i < 12; i++) {
    await page.mouse.wheel(0, -420);
    await page.waitForTimeout(120);
  }
  return page.evaluate(() => {
    const w = window as unknown as { __frames: number[]; __stop: boolean };
    w.__stop = true;
    const f = w.__frames.slice(2);
    const janky = f.filter((d) => d > 50).length;
    return {
      frames: f.length,
      janky,
      pct: f.length ? Math.round((janky / f.length) * 1000) / 10 : 0,
    };
  });
}

test("قياس الأداء على جهاز ضعيف محاكى", async ({ page, context }) => {
  test.setTimeout(180_000);
  const students = roster(40);
  await installFakeSupabase(context, {
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
      user_roles: [{ user_id: TEACHER.id, role: "teacher" }],
    },
    rpc: {
      daily_record_sheet: () => ({
        halaqa: { id: H, name: "حلقة الفجر", teacher_name: "الأستاذ يحيى" },
        date: "2026-10-04",
        today: "2026-10-04",
        can_edit: true,
        can_lock: false,
        record: {
          id: R,
          status: "open",
          version: 1,
          notes: null,
          completed_at: null,
          locked_at: null,
          completed_by_name: null,
        },
        students,
      }),
      daily_record_week: [],
    },
  });
  await seedSession(context, TEACHER);
  // وضع الأداء (1.17.0): PERF_MODE=on|off يثبّته، ودونه «تلقائي» حسب الجهاز.
  const perfMode = process.env.PERF_MODE;
  if (perfMode === "on" || perfMode === "off")
    await context.addInitScript((v) => localStorage.setItem("zen-perf", v), perfMode);
  await slowDevice(page);

  // 1) البدء البارد: من طلب الصفحة إلى أول زر تفاعلي (React مُرطَّب).
  const t0 = Date.now();
  await page.goto("/today");
  await page.waitForFunction(() => {
    const el = document.querySelector("nav a, main button");
    return !!el && Object.keys(el).some((k) => k.startsWith("__reactFiber"));
  });
  const coldStartMs = Date.now() - t0;

  // 2) فتح السجل من داخل التطبيق كما يفعل المعلّم: زر «السجل» في صفحة المعلّم بعد أن تهدأ (1.17.0).
  await page.goto("/teacher");
  const link = page.locator('a[href^="/teacher/register"]').first();
  await expect(link).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(2500);
  const tn = Date.now();
  await link.click();
  await expect(page.locator("li[data-student]").first()).toBeVisible({ timeout: 60_000 });
  const registerFirstRowMs = Date.now() - tn;
  await expect(page.locator("li[data-student]")).toHaveCount(40, { timeout: 60_000 });
  const registerNavMs = Date.now() - tn;

  // 3) فتح السجل اليومي بتحميل كامل للصفحة (أسوأ حالة) حتى يظهر آخر صف.
  const t1 = Date.now();
  await page.goto(`/teacher/register?halaqa=${H}`);
  await expect(page.locator("li[data-student]")).toHaveCount(40, { timeout: 60_000 });
  const registerOpenMs = Date.now() - t1;

  // 4) التمرير في القائمة.
  const box = await page.locator("li[data-student]").first().boundingBox();
  if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const jank = await scrollJank(page);

  const heap = await page.evaluate(() => {
    const m = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    return m ? Math.round(m.usedJSHeapSize / 1048576) : null;
  });
  const glass = await page.evaluate(
    () =>
      [...document.querySelectorAll("*")].filter((el) => {
        const f = getComputedStyle(el).backdropFilter;
        return !!f && f !== "none";
      }).length,
  );

  const result = {
    at: new Date().toISOString(),
    cpuSlowdown: CPU_SLOWDOWN,
    perfMode: await page.evaluate(() => document.documentElement.classList.contains("perf")),
    coldStartMs,
    registerOpenMs,
    registerNavMs,
    registerFirstRowMs,
    scroll: jank,
    heapMB: heap,
    blurredElements: glass,
    budget: PERF_BUDGET,
  };
  mkdirSync("perf-results", { recursive: true });
  writeFileSync(
    `perf-results/${process.env.PERF_LABEL ?? "baseline"}.json`,
    JSON.stringify(result, null, 2),
  );
  console.log("PERF", JSON.stringify(result));
  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFileSync } = await import("node:fs");
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `\n### الأداء (معالج أبطأ ${CPU_SLOWDOWN}×)\n\n| المقياس | القيمة | الحد |\n|---|---|---|\n` +
        `| البدء البارد | ${coldStartMs}ms | ${PERF_BUDGET.coldStartMs}ms |\n` +
        `| أول صف في السجل من صفحة المعلّم | ${registerFirstRowMs}ms | — |\n` +
        `| السجل كاملاً من صفحة المعلّم | ${registerNavMs}ms | ${PERF_BUDGET.registerNavMs}ms |\n` +
        `| فتح السجل بتحميل كامل (40 طالباً) | ${registerOpenMs}ms | ${PERF_BUDGET.registerOpenMs}ms |\n` +
        `| إطارات متقطّعة في التمرير | ${jank.pct}% | ${PERF_BUDGET.jankyFramePct}% |\n` +
        `| عناصر بتمويه خلفي | ${glass} | — |\n`,
    );
  }

  if (process.env.PERF_ENFORCE === "1") {
    expect(coldStartMs).toBeLessThanOrEqual(PERF_BUDGET.coldStartMs);
    expect(registerOpenMs).toBeLessThanOrEqual(PERF_BUDGET.registerOpenMs);
    expect(registerNavMs).toBeLessThanOrEqual(PERF_BUDGET.registerNavMs);
    expect(jank.pct).toBeLessThanOrEqual(PERF_BUDGET.jankyFramePct);
  }
});

/**
 * 1.21.1: التمرير في «المحادثات» (120 محادثة) و«طلابي» (120 طالباً) على الجهاز الضعيف نفسه — القائمتان الأطول
 * بعد السجل اليومي. النتائج في `perf-results/<label>-lists.json` وملخّص CI، والإلزام كسابقه بـ PERF_ENFORCE=1.
 */
test("قياس التمرير في المحادثات وطلابي على جهاز ضعيف محاكى", async ({ page, context }) => {
  test.setTimeout(180_000);
  const N = 120;
  const iso = (minAgo: number) => new Date(Date.now() - minAgo * 60_000).toISOString();
  const ids = Array.from(
    { length: N },
    (_, i) => `bbbbbbbb-0000-4000-8000-${String(i).padStart(12, "0")}`,
  );
  const name = (i: number) => `${NAMES[i % NAMES.length]} ${i + 1}`;
  await installFakeSupabase(context, {
    user: TEACHER,
    tables: {
      user_roles: [{ user_id: TEACHER.id, role: "teacher" }],
      profiles: ids.map((id, i) => ({ id, name: name(i), avatar: null, role: "student" })),
      halaqat: [{ id: "h1", name: "حلقة الفجر", teacher_id: TEACHER.id, created_at: iso(9999) }],
      halaqa_students: ids.map((id) => ({ halaqa_id: "h1", student_id: id })),
    },
    rpc: {
      my_home_context: {
        account_kind: null,
        is_teacher: true,
        children: 0,
        halaqas_joined: 0,
        halaqas_taught: 1,
        center_staff: false,
      },
      my_halaqa_student_ids: ids,
      my_inbox: ids.map((id, i) => ({
        id: `c${i}`,
        is_group: false,
        title: null,
        last_message: `السلام عليكم ورحمة الله، رسالة رقم ${i + 1}`,
        updated_at: iso(i * 7),
        created_at: iso(5000),
        peer: { id, name: name(i), avatar: null, role: "student" },
        unread: i % 4,
        muted: false,
      })),
      my_rooms: [],
    },
  });
  await seedSession(context, TEACHER);
  await slowDevice(page);

  const measure = async (url: string, row: string, count: number) => {
    const t0 = Date.now();
    await page.goto(url);
    await expect(page.locator(row).nth(count - 1)).toBeAttached({ timeout: 60_000 });
    const openMs = Date.now() - t0;
    await page.waitForTimeout(1500);
    const box = await page.locator(row).first().boundingBox();
    if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    return { openMs, scroll: await scrollJank(page) };
  };
  const chats = await measure("/chats", 'a[href^="/chats/c"]', N);
  const students = await measure("/teacher?tab=students", 'a[href*="/student/"]', N);

  const result = {
    at: new Date().toISOString(),
    cpuSlowdown: CPU_SLOWDOWN,
    items: N,
    chats,
    students,
  };
  mkdirSync("perf-results", { recursive: true });
  writeFileSync(
    `perf-results/${process.env.PERF_LABEL ?? "baseline"}-lists.json`,
    JSON.stringify(result, null, 2),
  );
  console.log("PERF-LISTS", JSON.stringify(result));
  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFileSync } = await import("node:fs");
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `\n### القوائم الطويلة (${N} عنصراً، معالج أبطأ ${CPU_SLOWDOWN}×)\n\n| القائمة | الفتح | إطارات متقطّعة |\n|---|---|---|\n` +
        `| المحادثات | ${chats.openMs}ms | ${chats.scroll.pct}% |\n` +
        `| طلابي | ${students.openMs}ms | ${students.scroll.pct}% |\n`,
    );
  }
  if (process.env.PERF_ENFORCE === "1") {
    expect(chats.scroll.pct).toBeLessThanOrEqual(PERF_BUDGET.jankyFramePct);
    expect(students.scroll.pct).toBeLessThanOrEqual(PERF_BUDGET.jankyFramePct);
  }
});
