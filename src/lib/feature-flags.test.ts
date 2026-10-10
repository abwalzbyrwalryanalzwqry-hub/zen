import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  FEATURE_DEFAULTS,
  FEATURE_KEYS,
  bucketOf,
  isFeatureOn,
  toFlagMap,
  type FlagRow,
} from "./feature-flags";
import { EMPTY_CONTEXT, moreSectionsFor } from "./home";

const row = (key: string, enabled: boolean, rollout = 100): FlagRow => ({
  key,
  enabled,
  rollout,
  note: null,
});

describe("مفاتيح الميزات (4.2)", () => {
  it("بلا صف ⇒ القيمة الافتراضية (لا تختفي ميزة دون اتصال)", () => {
    expect(isFeatureOn({}, "stories", "u1")).toBe(true);
  });

  it("المعطَّل مخفي عن الجميع، و100% للجميع، و0% لا أحد", () => {
    expect(isFeatureOn(toFlagMap([row("stories", false)]), "stories", "u1")).toBe(false);
    expect(isFeatureOn(toFlagMap([row("stories", true, 100)]), "stories", null)).toBe(true);
    expect(isFeatureOn(toFlagMap([row("stories", true, 0)]), "stories", "u1")).toBe(false);
  });

  it("الطرح الجزئي ثابت لكل حساب وقريب من النسبة", () => {
    const flags = toFlagMap([row("assistant", true, 30)]);
    const ids = Array.from({ length: 2000 }, (_, i) => `user-${i}`);
    const on = ids.filter((id) => isFeatureOn(flags, "assistant", id)).length / ids.length;
    expect(on).toBeGreaterThan(0.25);
    expect(on).toBeLessThan(0.35);
    expect(isFeatureOn(flags, "assistant", "user-7")).toBe(
      isFeatureOn(flags, "assistant", "user-7"),
    );
    expect(bucketOf("assistant", "user-7")).toBe(bucketOf("assistant", "user-7"));
    // الضيف (بلا حساب) لا يدخل طرحاً جزئياً.
    expect(isFeatureOn(flags, "assistant", null)).toBe(false);
  });

  it("الافتراضي مغلق للميزات غير الأساسية، ومطابق للخادم (N-04)", () => {
    const off = FEATURE_KEYS.filter((k) => !FEATURE_DEFAULTS[k]).sort();
    expect(off).toEqual(["assistant", "fees", "recite_ai", "remote"]);
    const sql = readFileSync(
      "supabase/migrations/20261223100000_server_flags_text_ai_consent.sql",
      "utf8",
    );
    const m = /x\.k NOT IN \(([^)]*)\)/.exec(sql);
    const serverOff = (m?.[1] ?? "")
      .match(/'([a-z_]+)'/g)
      ?.map((x) => x.slice(1, -1))
      .sort();
    expect(serverOff).toEqual(off);
  });

  it("التوزيع مطابق لـ private.flag_bucket (فحص قاعدة البيانات 180)", () => {
    expect(bucketOf("assistant", "22222222-2222-2222-2222-222222222222")).toBe(3);
    expect(bucketOf("recite_ai", "18018018-0000-0000-0000-000000000003")).toBe(10);
    expect(bucketOf("fees", "00000000-0000-0000-0000-000000000000")).toBe(82);
  });

  it("المفاتيح المجهولة تُتجاهل", () => {
    expect(Object.keys(toFlagMap([row("unknown_x", false)]))).toEqual([]);
  });

  it("«المزيد» يُخفي المدخل المعطَّل والقسم الذي يفرغ", () => {
    const all = moreSectionsFor("student", EMPTY_CONTEXT);
    const without = moreSectionsFor("student", EMPTY_CONTEXT, (k) => k !== "stories");
    const paths = (s: ReturnType<typeof moreSectionsFor>) =>
      s.flatMap((x) => x.links.map((l) => l.to));
    expect(paths(all)).toContain("/stories");
    expect(paths(without)).not.toContain("/stories");
    expect(paths(without).length).toBe(paths(all).length - 1);
    const none = moreSectionsFor("guardian", EMPTY_CONTEXT, (k) => k !== "assistant");
    expect(none.every((s) => s.links.length > 0)).toBe(true);
  });
});
