import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * المرحلة 7.5/7.6: الشاشتان الكبيرتان قُسّمتا، ولا ملف في أجزائهما يتجاوز 400 سطر.
 * أضف هنا أي شاشة تُقسَّم لاحقاً.
 */
const SPLIT = [
  "src/routes/_authed.mushaf.read.tsx",
  "src/components/mushaf/reader",
  "src/hooks/mushaf",
  "src/routes/_authed.chats.$chatId.tsx",
  "src/components/chat",
  "src/hooks/chat",
];
const MAX = 400;

function files(p: string): string[] {
  const st = statSync(p);
  if (st.isFile()) return [p];
  return readdirSync(p).flatMap((f) => files(join(p, f)));
}

describe("حجم ملفات الشاشات المقسَّمة", () => {
  it(`لا ملف يتجاوز ${MAX} سطر`, () => {
    const over = SPLIT.flatMap(files)
      .map((f) => ({ f, n: readFileSync(f, "utf8").split("\n").length }))
      .filter((x) => x.n > MAX);
    expect(over).toEqual([]);
  });
});
