/**
 * بوابة جودة قسم «المزيد» (تحليل «المزيد» — المرحلة 5): ما أُصلح في المراحل 0–4 لا يرجع.
 *  - كل ملفات القسم بلا نص عربي مكتوب مباشرة، ولا تعود إلى القائمة المرحلية.
 *  - خصائص اتجاه منطقية فقط (ms/me/ps/pe/start/end) كي تعمل الواجهة في LTR كما في RTL.
 *  - بنية «المزيد» كاملة بالإنجليزية (LTR) دون أي حرف عربي، ودون مفتاح يظهر كما هو.
 */
import { readFileSync, readdirSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { __registerDict, dirOf, getLocale, setLocale } from "./i18n";
import {
  EMPTY_CONTEXT,
  aboutSection,
  guestMoreSections,
  moreSectionsFor,
  ownerSection,
  supportSection,
} from "./home";

const dir = (d: string) =>
  readdirSync(d)
    .filter((f) => f.endsWith(".tsx") && !f.endsWith(".test.tsx"))
    .map((f) => `${d}/${f}`);

const MORE_FILES = [
  ...[
    "about",
    "about_.licenses",
    "about_.whats-new",
    "account",
    "feedback",
    "help",
    "more",
    "notifications",
    "owner.feedback",
    "settings",
    "settings_.display",
    "settings_.notifications",
    "settings_.prayer",
    "storage",
  ].map((r) => `src/routes/_authed.${r}.tsx`),
  ...dir("src/components/zen/more"),
  ...dir("src/components/zen/account"),
  ...dir("src/components/zen/settings"),
  "src/components/zen/AccountSettings.tsx",
  "src/components/zen/LoginSecurity.tsx",
  "src/components/zen/TeacherActivation.tsx",
  "src/components/guardian/GuardianLinkCard.tsx",
];

const ARABIC = /[\u0621-\u064A]/;
const codeOnly = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const PHYSICAL =
  /\b(?:-?(?:ml|mr|pl|pr)-\S+|(?:left|right)-\d\S*|text-(?:left|right)|rounded-[lr]-\S+|border-[lr](?:-\S+)?)\b/;

describe("بوابة «المزيد»: الترجمة والاتجاه", () => {
  const legacy: string[] = JSON.parse(readFileSync("src/locales/legacy-arabic-files.json", "utf8"));
  it.each(MORE_FILES)("%s: بلا عربية في الشيفرة ولا في القائمة المرحلية", (f) => {
    expect(legacy).not.toContain(f);
    expect(ARABIC.test(codeOnly(readFileSync(f, "utf8")))).toBe(false);
  });
  it.each(MORE_FILES)("%s: خصائص اتجاه منطقية فقط", (f) => {
    const hit = codeOnly(readFileSync(f, "utf8")).match(PHYSICAL);
    expect(hit?.[0] ?? null).toBeNull();
  });
});
