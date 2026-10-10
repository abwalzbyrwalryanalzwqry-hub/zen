import { beforeEach, describe, expect, it } from "vitest";
import ar from "@/locales/ar.json";
import arPages from "@/locales/pages/ar.json";
import pkg from "../../package.json";
import {
  RELEASES,
  compareVersions,
  hasUnseenRelease,
  latestRelease,
  markReleaseSeen,
  releaseKey,
  visibleReleases,
} from "./whats-new";

type Dict = { [k: string]: string | Dict };
const getIn = (d: Dict, key: string) =>
  key
    .split(".")
    .reduce<string | Dict | undefined>((n, p) => (typeof n === "object" ? n[p] : undefined), d);
// ملاحظات الإصدارات في قاموس الصفحات الكسول (P1-1)، والعناوين في القاموس الرئيسي.
const get = (key: string) => getIn(arPages as Dict, key) ?? getIn(ar as Dict, key);

describe("ما الجديد (GAP-04)", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    globalThis.localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: () => null,
      length: 0,
    } as Storage;
  });
  it("الإصدارات من الأحدث، ولكل نقطة نص في القاموس", () => {
    for (let i = 1; i < RELEASES.length; i++)
      expect(compareVersions(RELEASES[i - 1].version, RELEASES[i].version)).toBeGreaterThan(0);
    for (const r of RELEASES)
      for (const item of r.items)
        expect(typeof get(`whatsNew.${releaseKey(r.version)}.${item}`)).toBe("string");
  });
  it("الإصدار الحالي له ملاحظات للمستخدم (لا إصدار بلا «ما الجديد»)", () => {
    expect(RELEASES[0].version).toBe(pkg.version);
  });
  it("ملاحظات إصدار لم يُثبَّت بعد لا تظهر", () => {
    expect(latestRelease("1.7.0")?.version).toBe("1.7.0");
    expect(latestRelease("1.8.0")?.version).toBe("1.8.0");
    expect(visibleReleases("1.7.0").map((r) => r.version)).toEqual(["1.7.0"]);
    expect(latestRelease("0.1.0")).toBeNull();
  });
  it("نقطة «جديد» حتى تُفتح الصفحة مرة", () => {
    expect(hasUnseenRelease("1.8.0")).toBe(true);
    markReleaseSeen("1.8.0");
    expect(hasUnseenRelease("1.8.0")).toBe(false);
    // إصدار أحدث له ملاحظات يعيد النقطة.
    expect(hasUnseenRelease("1.9.0")).toBe(true);
  });
});

describe("قاموس الصفحات الكسول (P1-1)", () => {
  const keys = (o: unknown, p = ""): string[] =>
    typeof o === "string"
      ? [p]
      : Object.entries(o as object).flatMap(([k, v]) => keys(v, p ? `${p}.${k}` : k));
  it("لا يتكرر مفتاح بينه وبين القاموس الرئيسي", () => {
    const main = new Set(keys(ar));
    expect(keys(arPages).filter((k) => main.has(k))).toEqual([]);
  });
});
