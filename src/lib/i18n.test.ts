import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import ar from "@/locales/ar.json";
import {
  __registerDict,
  availableLocales,
  dirOf,
  getLocale,
  initLocale,
  isLocale,
  isReadyLocale,
  setLocale,
  t,
} from "./i18n";

describe("الترجمة (13.1)", () => {
  afterEach(async () => {
    await setLocale("ar");
  });
  it("العربية افتراضية، والمفاتيح المنقّطة والمتغيّرات", () => {
    expect(getLocale()).toBe("ar");
    expect(t("nav.today")).toBe("اليوم");
    expect(t("nav.unread", { n: 3 })).toBe("3 رسالة غير مقروءة");
    expect(t("more.links.settings.hint")).toContain("مواقيت الصلاة");
  });
  it("المفتاح المفقود يظهر كما هو، والقاموس الناقص يرجع إلى العربية", () => {
    expect(t("nope.missing")).toBe("nope.missing");
    __registerDict("ar", ar as never);
  });
  it("اللغات غير المكتملة مخفية، والمختارة سابقاً تعود إلى العربية (H8)", async () => {
    expect(availableLocales().map((l) => l.code)).toEqual(["ar"]);
    expect(isReadyLocale("en")).toBe(false);
    const ls = new Map<string, string>([["zen-locale", "en"]]);
    const orig = globalThis.localStorage;
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (k: string) => ls.get(k) ?? null,
        setItem: (k: string, v: string) => void ls.set(k, v),
        removeItem: (k: string) => void ls.delete(k),
      },
    });
    try {
      await initLocale();
      expect(getLocale()).toBe("ar");
      expect(ls.has("zen-locale")).toBe(false);
    } finally {
      Object.defineProperty(globalThis, "localStorage", { configurable: true, value: orig });
    }
  });
  it("الاتجاه والتحقق من اللغة", () => {
    expect(dirOf("ar")).toBe("rtl");
    expect(isLocale("ar")).toBe(true);
    expect(isLocale("xx")).toBe(false);
  });
  it("قيم القاموس نصوص غير فارغة", () => {
    const walk = (o: unknown, p = ""): string[] =>
      typeof o === "string"
        ? o.trim()
          ? []
          : [p]
        : Object.entries(o as object).flatMap(([k, v]) => walk(v, p ? `${p}.${k}` : k));
    expect(walk(ar)).toEqual([]);
  });
});

// لا نص عربي مكتوب مباشرة في المكوّنات الجديدة: النصوص في src/locales/ar.json عبر t().
// الملفات القائمة قبل 13.1 في القائمة المرحلية أدناه وتُنقل تدريجياً؛ ملف نُقل بالكامل يجب حذفه منها.
const ARABIC = /[\u0621-\u064A]/;
const LEGACY: string[] = JSON.parse(readFileSync("src/locales/legacy-arabic-files.json", "utf8"));

function uiFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return uiFiles(p);
    return p.endsWith(".tsx") && !p.endsWith(".test.tsx") ? [p] : [];
  });
}

/** يحذف التعليقات قبل الفحص (العربية مسموحة في التعليقات). */
function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

describe("لا نص عربي مكتوب مباشرة (13.1)", () => {
  const files = [...uiFiles("src/components"), ...uiFiles("src/routes")].sort();
  const withArabic = files.filter((f) => ARABIC.test(codeOnly(readFileSync(f, "utf8"))));
  it("كل مكوّن فيه نص عربي مدرج في القائمة المرحلية (الجديد يستعمل t())", () => {
    expect(withArabic.filter((f) => !LEGACY.includes(f))).toEqual([]);
  });
  it("القائمة المرحلية لا تحوي ملفاً نُقلت نصوصه أو حُذف", () => {
    expect(LEGACY.filter((f) => !withArabic.includes(f))).toEqual([]);
  });
});

describe("العربية وحدها (1.35.0)", () => {
  it("لا قاموس لغة أخرى، وطلب لغة غير معروفة لا يغيّر شيئاً", async () => {
    expect(existsSync("src/locales/en.json")).toBe(false);
    await setLocale("en" as never);
    expect(getLocale()).toBe("ar");
    expect(dirOf("ar")).toBe("rtl");
    expect(t("nav.today")).toBe("اليوم");
  });
});
