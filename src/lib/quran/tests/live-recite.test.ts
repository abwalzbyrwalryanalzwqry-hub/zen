import { describe, expect, it } from "vitest";
import {
  addPending,
  blobToBase64,
  heardSoFar,
  initialLive,
  liveAlignment,
  mimeToFormat,
  resolveChunk,
} from "@/lib/quran/live-recite";

const REF = "قُلْ هُوَ ٱللَّهُ أَحَدٌ ٱللَّهُ ٱلصَّمَدُ";

describe("التسميع المباشر (8.4)", () => {
  it("المقاطع تُضمّ بترتيبها، ولا قفز فوق مقطع معلّق", () => {
    let s = initialLive();
    const a = addPending(s);
    const b = addPending(a.state);
    s = resolveChunk(b.state, b.index, "الله الصمد");
    expect(heardSoFar(s)).toBe("");
    s = resolveChunk(s, a.index, "قل هو الله أحد");
    expect(heardSoFar(s)).toBe("قل هو الله أحد الله الصمد");
  });

  it("المطابقة التراكمية: الجارية «لم تُبلغ»، والنهائية «ساقطة»", () => {
    let s = initialLive();
    const a = addPending(s);
    s = resolveChunk(a.state, a.index, "قل هو الله");
    const live = liveAlignment(REF, s, false);
    expect(live.stop).toBe(3);
    expect(live.words.map((w) => w.status)).toEqual([
      "ok",
      "ok",
      "ok",
      "pending",
      "pending",
      "pending",
    ]);
    expect(liveAlignment(REF, s, true).counts.missed).toBe(3);
  });

  it("المقطع الفاشل يُحسب ولا يوقف الباقي", () => {
    let s = initialLive();
    const a = addPending(s);
    const b = addPending(a.state);
    s = resolveChunk(b.state, a.index, null);
    s = resolveChunk(s, b.index, "قل هو");
    expect(s.failed).toBe(1);
    expect(heardSoFar(s)).toBe("قل هو");
  });

  it("الصيغة من نوع MIME، وbase64", async () => {
    expect(mimeToFormat("audio/webm;codecs=opus")).toBe("webm");
    expect(mimeToFormat("audio/ogg")).toBe("ogg");
    expect(mimeToFormat("audio/mp4")).toBe("m4a");
    expect(await blobToBase64(new Blob([new Uint8Array([104, 105])]))).toBe("aGk=");
  });
});
