import { describe, expect, it } from "vitest";
import { migrationDrift } from "../../scripts/check-migrations-deployed.mjs";

describe("migrationDrift (تدقيق 0.5)", () => {
  it("يطابق حين يتساوى المستودع والإنتاج", () => {
    const d = migrationDrift(
      ["20261001100000_a.sql", "20261002100000_b.sql"],
      ["20261001100000", "20261002100000", ""],
    );
    expect(d.notDeployed).toEqual([]);
    expect(d.unknownRemote).toEqual([]);
  });

  it("يكشف ترحيلاً لم يُنشر وآخر على الإنتاج فقط", () => {
    const d = migrationDrift(
      ["20261001100000_a.sql", "20261002100000_b.sql", "README.md"],
      ["20261001100000", "20260101000000"],
    );
    expect(d.notDeployed).toEqual(["20261002100000"]);
    expect(d.unknownRemote).toEqual(["20260101000000"]);
    expect(d.local).toBe(2);
  });

  it("يقرأ رقم الملف من name حين يسجّل النشر وقت التطبيق في version", () => {
    const d = migrationDrift(
      [
        "20261005100000_username_auth.sql",
        "20261022100000_qr.sql",
        "20261111100000_audit_phase1.sql",
      ],
      [
        "20260927213301|username_auth",
        "20260929055057|m20261022100000_qr",
        "20261002203000|20261111100000_audit_phase1",
        "20260927023008|enable_pg_cron_pg_net",
      ],
    );
    expect(d.notDeployed).toEqual([]);
    expect(d.unknownRemote).toEqual([]);
  });
});
