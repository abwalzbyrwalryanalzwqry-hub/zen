import { describe, expect, it } from "vitest";
import { defaultConfig, readableColors } from "./config";
import { COLOR_PRESETS, applyIdentity, identityOf, paletteFrom, presetOf } from "./identity";

const base = () => defaultConfig("2026-10-06", "");

describe("report identity", () => {
  it("merges a saved identity field by field and ignores invalid values", () => {
    const c = applyIdentity(base(), {
      colors: { primary: "#123456", text: "red", zebra: 5 },
      header: { text: "مركز النور", align: "sideways", show: "yes" },
      logo: { mode: "custom", dataUrl: "javascript:alert(1)" },
      digits: "latn",
      calendar: "moon",
      kind: "student",
    });
    expect(c.colors.primary).toBe("#123456");
    expect(c.colors.text).toBe(base().colors.text);
    expect(c.header.text).toBe("مركز النور");
    expect(c.header.align).toBe(base().header.align);
    expect(c.header.show).toBe(true);
    expect(c.logo.mode).toBe("custom");
    expect(c.logo.dataUrl).toBeNull();
    expect(c.digits).toBe("latn");
    expect(c.calendar).toBe("gregorian");
    expect(c.kind).toBe(base().kind);
  });

  it("round-trips identityOf through applyIdentity", () => {
    const a = applyIdentity(base(), {
      colors: paletteFrom("#7a1f2b"),
      footer: { text: "x", pageTotal: false },
    });
    expect(identityOf(applyIdentity(base(), identityOf(a)))).toEqual(identityOf(a));
    expect(applyIdentity(a, null)).toBe(a);
    expect(applyIdentity(a, [1, 2])).toBe(a);
  });

  it("offers six readable presets and recognises them", () => {
    expect(COLOR_PRESETS).toHaveLength(6);
    for (const p of COLOR_PRESETS) {
      expect(presetOf(p.colors)).toBe(p.id);
      expect(readableColors(p.colors).fixes).toEqual([]);
    }
    expect(presetOf(base().colors)).toBe("zen");
    expect(presetOf(paletteFrom("#abcdef"))).toBeNull();
  });
});
