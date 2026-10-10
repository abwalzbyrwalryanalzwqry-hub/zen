import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { words } from "./tajweed-diff";
import {
  RECITATION_GATE,
  gradeRecitation,
  plantError,
  summarizeEval,
  type EvalVerdict,
  type PlantedError,
} from "./recitation-eval";

const quran = JSON.parse(readFileSync("src/data/quran-uthmani.json", "utf8")) as {
  surahs: { ayahs: string[] }[];
};
const KINDS: PlantedError[] = ["delete", "substitute", "repeat", "swap"];

describe("تقييم التسميع الآلي (المرحلة 3)", () => {
  it("المقارنة تكشف كل خطأ مزروع، ولا تنبّه على تفريغ سليم بلا تشكيل", () => {
    const verdicts: EvalVerdict[] = [];
    // 30 مقطعاً من سور قصيرة ومتوسطة، كل مقطع سليم مرة ومع كل نوع خطأ مرة.
    for (let s = 77; s < 114; s += 1) {
      const ref = quran.surahs[s].ayahs.slice(0, 3).join(" ");
      const n = words(ref).length;
      verdicts.push(
        gradeRecitation({
          id: `${s}-ok`,
          hasError: false,
          reference: ref,
          transcript: words(ref).join(" "),
        }),
      );
      KINDS.forEach((k, j) =>
        verdicts.push(
          gradeRecitation({
            id: `${s}-${k}`,
            hasError: true,
            reference: ref,
            transcript: plantError(ref, k, (j * 3 + s) % n),
          }),
        ),
      );
    }
    const sum = summarizeEval(verdicts);
    expect(sum.missed).toEqual([]);
    expect(sum.falseAlarms).toEqual([]);
    expect(sum.detection).toBe(1);
    expect(sum.pass).toBe(true);
  });

  it("البوابة ترفض العيّنة الصغيرة أو الاكتشاف الضعيف أو الإنذار الكاذب", () => {
    const v = (id: string, hasError: boolean, flagged: boolean): EvalVerdict => ({
      id,
      hasError,
      flagged,
      score: 0,
    });
    const many = (n: number, e: boolean, f: boolean) =>
      Array.from({ length: n }, (_, i) => v(`${e}${i}`, e, f));
    expect(summarizeEval([...many(5, true, true), ...many(5, false, false)]).pass).toBe(false);
    const weak = summarizeEval([
      ...many(10, true, true),
      ...many(2, true, false),
      ...many(10, false, false),
    ]);
    expect(weak.detection).toBeLessThan(RECITATION_GATE.minDetection);
    expect(weak.pass).toBe(false);
    const noisy = summarizeEval([
      ...many(12, true, true),
      ...many(8, false, false),
      ...many(2, false, true),
    ]);
    expect(noisy.falseAlarm).toBeGreaterThan(RECITATION_GATE.maxFalseAlarm);
    expect(noisy.pass).toBe(false);
  });
});
