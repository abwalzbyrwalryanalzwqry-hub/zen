/**
 * قارئ xlsx صغير على الجهاز (9.3): الورقة الأولى فقط، نصوصاً وأرقاماً. بلا مكتبة SheetJS
 * (ثغراتها المعروفة وحجمها)، وبـ fflate التي يستخدمها التصدير أصلاً.
 */
import { strFromU8, unzipSync } from "fflate";

const decode = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");

/** نص عنصر يحوي <t> (أو عدة <r><t> منسّقة). */
const textOf = (xml: string) =>
  [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decode(m[1])).join("");

/** رقم العمود من مرجع الخلية (A=0، Z=25، AA=26). */
export function colIndex(ref: string): number {
  const letters = ref.replace(/[0-9]/g, "");
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function firstSheetPath(files: Record<string, Uint8Array>): string | null {
  const wb = files["xl/workbook.xml"] && strFromU8(files["xl/workbook.xml"]);
  const rels =
    files["xl/_rels/workbook.xml.rels"] && strFromU8(files["xl/_rels/workbook.xml.rels"]);
  const rid = wb?.match(/<sheet\b[^>]*\br:id="([^"]+)"/)?.[1];
  if (rid && rels) {
    const rel = [...rels.matchAll(/<Relationship\b[^>]*>/g)]
      .map((m) => m[0])
      .find((r) => r.includes(`Id="${rid}"`));
    const target = rel?.match(/Target="([^"]+)"/)?.[1];
    if (target) {
      const p = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
      if (files[p]) return p;
    }
  }
  return Object.keys(files).find((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)) ?? null;
}

/** صفوف الورقة الأولى نصوصاً (الخلايا الفارغة ""). يرمي خطأً عربياً إن لم يكن الملف xlsx. */
export function readXlsx(bytes: Uint8Array): string[][] {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (f) =>
        f.name === "xl/sharedStrings.xml" ||
        f.name.startsWith("xl/worksheets/sheet") ||
        f.name === "xl/workbook.xml" ||
        f.name === "xl/_rels/workbook.xml.rels",
    });
  } catch {
    throw new Error("الملف ليس جدول Excel صالحاً (xlsx).");
  }
  const sheetPath = firstSheetPath(files);
  if (!sheetPath) throw new Error("لم أجد ورقة في الملف.");
  const shared = files["xl/sharedStrings.xml"]
    ? [...strFromU8(files["xl/sharedStrings.xml"]).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
        textOf(m[1]),
      )
    : [];
  const sheet = strFromU8(files[sheetPath]);
  const rows: string[][] = [];
  for (const rm of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: string[] = [];
    for (const cm of rm[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1];
      const body = cm[2] ?? "";
      const ref = attrs.match(/\br="([A-Z]+\d+)"/)?.[1];
      const type = attrs.match(/\bt="([^"]+)"/)?.[1];
      const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let value = "";
      if (type === "s" && v != null) value = shared[Number(v)] ?? "";
      else if (type === "inlineStr") value = textOf(body);
      else if (v != null) value = decode(v);
      const idx = ref ? colIndex(ref) : row.length;
      while (row.length < idx) row.push("");
      row[idx] = value;
    }
    rows.push(row);
  }
  return rows;
}
