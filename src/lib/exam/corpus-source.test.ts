import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { corpusFromSurahFiles, fetchSurahFiles, type SurahFile } from "./corpus-source";
import { surahName } from "./scope";
import manifest from "@/data/quran-integrity.json";

const PUBLIC = join(__dirname, "../../../public");
const readSurah = (n: number) =>
  JSON.parse(readFileSync(join(PUBLIC, `data/quran/uthmani/${n}.json`), "utf8")) as SurahFile;

describe("مصدر واحد لنص المصحف (M2)", () => {
  it("المتن المبني من ملفات السور المضمَّنة يطابق الملف المرجعي ببصمته", () => {
    const files = Array.from({ length: 114 }, (_, i) => readSurah(i + 1));
    const raw = corpusFromSurahFiles(files, manifest, surahName);
    const sha = createHash("sha256").update(JSON.stringify(raw), "utf8").digest("hex");
    expect(sha).toBe(manifest.sha256);
    expect(raw.totalAyahs).toBe(6236);
  });

  it("أي تغيير في حرف واحد يُفشل البصمة", () => {
    const files = Array.from({ length: 114 }, (_, i) => readSurah(i + 1));
    files[111].ayahs[0] = { ...files[111].ayahs[0], t: files[111].ayahs[0].t + "ا" };
    const raw = corpusFromSurahFiles(files, manifest, surahName);
    const sha = createHash("sha256").update(JSON.stringify(raw), "utf8").digest("hex");
    expect(sha).not.toBe(manifest.sha256);
  });

  it("يقرأ الملفات الـ114 من المسار المحلي، ويفشل بوضوح إن نقص ملف", async () => {
    const urls: string[] = [];
    const ok = (async (url: string) => {
      urls.push(url);
      const n = Number(/(\d+)\.json$/.exec(url)![1]);
      return new Response(JSON.stringify(readSurah(n)));
    }) as unknown as typeof fetch;
    const files = await fetchSurahFiles(ok);
    expect(files).toHaveLength(114);
    expect(urls[0]).toBe("/data/quran/uthmani/1.json");
    const missing = (async () => new Response("", { status: 404 })) as unknown as typeof fetch;
    await expect(fetchSurahFiles(missing)).rejects.toThrow("ملف السورة");
  });
});
