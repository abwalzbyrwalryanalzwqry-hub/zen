import { describe, expect, it } from "vitest";
import { manyToDetails, type AssetBlob, type CertDetail } from "./api";
import { isSafeSvg } from "./upload";
import { normalizeDesign } from "./model";

describe("isSafeSvg 1.25.0 (L1)", () => {
  it.each([
    '<svg><a href="&#106;avascript:x()"/></svg>',
    '<svg><rect style="fill:url(https://e.x/a)"/></svg>',
    '<svg><animate attributeName="href" to="x"/></svg>',
    '<svg><set attributeName="href" to="x"/></svg>',
    '<svg><image href="data:image/svg+xml;base64,AA"/></svg>',
    "<!DOCTYPE svg><svg/>",
    "<svg><embed/></svg>",
  ])("rejects %s", (s) => expect(isSafeSvg(s)).toBe(false));
  it("keeps local references", () => {
    expect(
      isSafeSvg(
        '<svg xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g"/></defs><rect fill="url(#g)"/><use href="#g"/></svg>',
      ),
    ).toBe(true);
  });
});

describe("manyToDetails (M6)", () => {
  it("rebuilds each detail with its design and the shared assets, in order", () => {
    const d = normalizeDesign({ elements: [] });
    const asset = { id: "a1" } as AssetBlob;
    const base = (id: string, design_id: string | null) =>
      ({ id, design_id }) as unknown as Omit<CertDetail, "design" | "assets">;
    const out = manyToDetails({
      items: [base("c1", "d1"), base("c2", "d1"), base("c3", null)],
      designs: { d1: d },
      assets: [asset],
    });
    expect(out.map((x) => x.id)).toEqual(["c1", "c2", "c3"]);
    expect(out[0].design).toBe(d);
    expect(out[1].design).toBe(d);
    expect(out[2].design).toBeNull();
    expect(out[0].assets).toEqual([asset]);
  });
});
