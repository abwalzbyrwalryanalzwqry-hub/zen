#!/usr/bin/env node
/**
 * مقياس تقدّم الترجمة (تدقيق أكتوبر 2026، المرحلة 4.1).
 *
 *   node scripts/i18n-progress.mjs            تقرير في الطرفية
 *   node scripts/i18n-progress.mjs --summary  تقرير Markdown (لملخّص CI)
 *   node scripts/i18n-progress.mjs --check    يفشل إن زاد النص العربي المكتوب مباشرة عن خط الأساس
 *
 * خط الأساس `src/locales/i18n-baseline.json` لا يرتفع أبداً: كل نقل لنصوص ملف إلى t() يُنزله
 * (`--write-baseline`). اللغة لا تُفعَّل للمستخدمين (READY_LOCALES) قبل أن يصل ملفها إلى 100%.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const rel = (p) => relative(ROOT, p).split("\\").join("/");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const ARABIC = /[\u0621-\u064A]/;
const BASELINE = "src/locales/i18n-baseline.json";
// العربية وحدها منذ 1.35.0 (حُذفت الإنجليزية)؛ أضف رمز اللغة هنا مع قاموسها إن عادت لغة ثانية.
const LOCALES = [];

function uiFiles(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return uiFiles(p);
    return p.endsWith(".tsx") && !p.endsWith(".test.tsx") ? [rel(p)] : [];
  });
}
// مطابق لـ codeOnly في i18n.test.ts: العربية مسموحة في التعليقات.
const codeOnly = (src) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

function flat(o, p = "") {
  return Object.entries(o).flatMap(([k, v]) =>
    v && typeof v === "object" ? flat(v, `${p}${k}.`) : [[`${p}${k}`, String(v)]],
  );
}

export function measure() {
  const files = [...uiFiles(join(ROOT, "src/components")), ...uiFiles(join(ROOT, "src/routes"))];
  let arabicLines = 0;
  const legacy = [];
  for (const f of files) {
    const lines = codeOnly(read(f))
      .split("\n")
      .filter((l) => ARABIC.test(l)).length;
    if (lines) {
      legacy.push(f);
      arabicLines += lines;
    }
  }
  const ar = new Map(flat(JSON.parse(read("src/locales/ar.json"))));
  const locales = {};
  for (const l of LOCALES) {
    const d = new Map(flat(JSON.parse(read(`src/locales/${l}.json`))));
    // مترجَم = موجود وغير فارغ وليس نسخة من العربية.
    const done = [...ar.keys()].filter((k) => d.get(k)?.trim() && d.get(k) !== ar.get(k)).length;
    locales[l] = { done, pct: ar.size ? Math.floor((done / ar.size) * 100) : 100 };
  }
  // نسبة الواجهة المنقولة: الملفات بلا نص عربي مباشر من كل ملفات الواجهة.
  const migratedPct = Math.floor(((files.length - legacy.length) / files.length) * 100);
  return {
    files: files.length,
    legacyFiles: legacy.length,
    arabicLines,
    keys: ar.size,
    migratedPct,
    locales,
  };
}

const m = measure();
const args = process.argv.slice(2);

if (args.includes("--write-baseline")) {
  writeFileSync(
    join(ROOT, BASELINE),
    JSON.stringify({ legacyFiles: m.legacyFiles, arabicLines: m.arabicLines }, null, 2) + "\n",
  );
  console.log(`✅ خط الأساس: ${m.legacyFiles} ملفاً، ${m.arabicLines} سطراً.`);
  process.exit(0);
}

const lines = [
  `ملفات الواجهة: ${m.files} — منقولة إلى t(): ${m.files - m.legacyFiles} (${m.migratedPct}%)`,
  `ملفات فيها نص عربي مباشر: ${m.legacyFiles}، بمجموع ${m.arabicLines} سطراً`,
  `مفاتيح القاموس العربي: ${m.keys}`,
  ...Object.entries(m.locales).map(
    ([l, v]) => `${l}: ${v.done}/${m.keys} مفتاحاً (${v.pct}% من القاموس)`,
  ),
];

if (args.includes("--summary")) {
  console.log(["## تقدّم الترجمة", "", ...lines.map((l) => `- ${l}`)].join("\n"));
} else {
  console.log(lines.join("\n"));
}

if (args.includes("--check")) {
  const base = JSON.parse(read(BASELINE));
  const worse = [];
  if (m.legacyFiles > base.legacyFiles) worse.push(`ملفات ${m.legacyFiles} > ${base.legacyFiles}`);
  if (m.arabicLines > base.arabicLines) worse.push(`أسطر ${m.arabicLines} > ${base.arabicLines}`);
  if (worse.length) {
    console.error(
      `❌ زاد النص العربي المكتوب مباشرة (${worse.join("، ")}). استعمل t() ومفاتيح ar.json.`,
    );
    process.exit(1);
  }
  if (m.legacyFiles < base.legacyFiles || m.arabicLines < base.arabicLines) {
    console.log("ℹ️ تحسّن عن خط الأساس؛ أنزله: node scripts/i18n-progress.mjs --write-baseline");
  }
}
