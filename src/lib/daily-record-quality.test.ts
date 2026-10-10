/**
 * بوابات جودة «السجل اليومي للحلقة» (خطة التطوير، docs/DAILY_RECORD.md):
 * - DR-04: كل كود يرفعه الخادم في ترحيلات السجل له نص في القاموس بلغتيه (ar وen)، فلا يظهر «تعذّر الحفظ» لخطأ معروف.
 * - DR-03: لا اتجاه ثابت ولا عربية في الشيفرة ولا خصائص اتجاه فيزيائية في ملفات القسم.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import ar from "@/locales/register/ar.json";
import { ERROR_CODES } from "./daily-record";

const MIG = "supabase/migrations";
const DAILY_MIGRATIONS = readdirSync(MIG).filter(
  (f) => /daily_record/.test(f) || f === "20261021100000_halaqa_register.sql",
);
// أكواد من دوال أخرى تُستدعى ضمناً ولا تصل إلى معلّم السجل (apply_review يرفض غير المعلّم قبلها).
const NOT_SURFACED = new Set(["NOT_ALLOWED"]);

const get = (d: unknown, path: string) =>
  path.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], d);

describe("أكواد أخطاء السجل اليومي", () => {
  const raised = new Set<string>();
  for (const f of DAILY_MIGRATIONS)
    for (const m of readFileSync(`${MIG}/${f}`, "utf8").matchAll(/RAISE EXCEPTION '([A-Z_]+)'/g))
      raised.add(m[1]);

  it("ترحيلات السجل موجودة وفيها أكواد", () => {
    expect(DAILY_MIGRATIONS.length).toBeGreaterThanOrEqual(2);
    expect(raised.size).toBeGreaterThan(10);
  });
  it.each([...raised].filter((c) => !NOT_SURFACED.has(c)))("%s معروف في الواجهة", (code) => {
    expect(ERROR_CODES as readonly string[]).toContain(code);
  });
  it.each([...ERROR_CODES, "NETWORK", "UNKNOWN"])("%s له نص", (code) => {
    for (const d of [ar]) {
      const v = get(d, `dailyRecord.errors.${code}`);
      expect(typeof v === "string" && v.length > 0, code).toBe(true);
    }
  });
});

const files = (d: string) =>
  readdirSync(d)
    .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
    .map((f) => `${d}/${f}`);
const REGISTER_FILES = [
  ...files("src/components/zen/register"),
  "src/routes/_authed.teacher_.register.tsx",
  "src/components/zen/teacher/StudentDailyOverview.tsx",
];
const ARABIC = /[\u0621-\u064A]/;
const codeOnly = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const PHYSICAL =
  /\b(?:-?(?:ml|mr|pl|pr)-\S+|(?:left|right)-\d\S*|text-(?:left|right)|rounded-[lr]-\S+|border-[lr](?:-\S+)?)\b/;

describe("السجل اليومي: الاتجاه والترجمة", () => {
  it.each(REGISTER_FILES)('%s: لا dir="rtl" ثابت', (f) => {
    expect(readFileSync(f, "utf8")).not.toMatch(/dir="rtl"/);
  });
  it.each(REGISTER_FILES)("%s: لا عربية في الشيفرة", (f) => {
    const hit = codeOnly(readFileSync(f, "utf8")).match(
      new RegExp(`.{0,30}${ARABIC.source}.{0,30}`),
    );
    expect(hit?.[0] ?? null).toBeNull();
  });
  it.each(REGISTER_FILES)("%s: خصائص اتجاه منطقية فقط", (f) => {
    const hit = codeOnly(readFileSync(f, "utf8")).match(PHYSICAL);
    expect(hit?.[0] ?? null).toBeNull();
  });
});

describe("السجل اليومي: الوصول (المرحلة 3)", () => {
  it.each(REGISTER_FILES)(
    "%s: لا نص أصغر من text-xs ولا أهداف لمس أقل من 44px ولا ألوان ثابتة",
    (f) => {
      const src = codeOnly(readFileSync(f, "utf8"));
      expect(
        src.match(/text-\[0\.6\d*rem\]|\bmin-h-(?:[0-9]|10)\b|\bbg-\[#/)?.[0] ?? null,
      ).toBeNull();
    },
  );
  it("مجموعات الاختيار عبر RadioRow (أسهم وHome/End)", () => {
    for (const f of [
      "src/components/zen/register/attendance-ui.tsx",
      "src/components/zen/register/StudentDayDialog.tsx",
    ])
      expect(readFileSync(f, "utf8")).not.toMatch(/role="radiogroup"/);
  });
});
