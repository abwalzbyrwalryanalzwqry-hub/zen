import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { cleanNumberPrefix } from "./brand";

/** 1.24.0 (فحص الاستوديو H3/M8): رمز الترقيم كما يقبله الخادم، والقيد يقبل الصيغتين. */
const MIG = readFileSync("supabase/migrations/20261215100000_cert_approval.sql", "utf8");
const FORMAT = new RegExp(/certificate_number ~ '(\^ZEN-[^']+)'/.exec(MIG)![1]);

describe("ترقيم المركز", () => {
  it("الرمز: حروف لاتينية كبيرة وأرقام، ستة على الأكثر", () => {
    expect(cleanNumberPrefix("shd")).toBe("SHD");
    expect(cleanNumberPrefix("م-12 ab!")).toBe("12AB");
    expect(cleanNumberPrefix("ABCDEFGH")).toBe("ABCDEF");
    expect(cleanNumberPrefix("")).toBe("");
  });
  it("القيد يقبل الصيغة الجديدة والقديمة ويرفض غيرهما", () => {
    expect(FORMAT.test("ZEN-SHD-2026-0001")).toBe(true);
    expect(FORMAT.test("ZEN-1E7F-2026-12345")).toBe(true);
    expect(FORMAT.test("ZEN-2026-000123")).toBe(true);
    expect(FORMAT.test("ZEN-shd-2026-0001")).toBe(false);
    expect(FORMAT.test("ZEN-TOOLONG1-2026-0001")).toBe(false);
    expect(FORMAT.test("ZEN-SHD-2026-1")).toBe(false);
  });
  it("كل مسار إصدار يمرّ بأسباب الاعتماد والترقيم الجديد", () => {
    for (const fn of ["cert_issue", "cert_finalize", "cert_approve"]) {
      const body = MIG.slice(MIG.indexOf(`FUNCTION public.${fn}(`));
      const end = body.indexOf("$$;");
      expect(body.slice(0, end)).toContain("cert_next_center_number");
      expect(body.slice(0, end)).not.toContain("cert_next_number(");
    }
  });
});
