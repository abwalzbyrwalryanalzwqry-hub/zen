#!/usr/bin/env node
/**
 * ميزانية حجم الحزمة (المرحلة 7.4). يقرأ dist-native/client بعد `npm run build`:
 *  - الحزمة الأولى: كل JS/CSS يشير إليه index.html مباشرة، مضغوطاً بـ gzip.
 *  - أكبر قطعة كسولة (JS) غير مضغوطة، باستثناء بيانات المصحف المضمّنة (quran-*).
 * أي تجاوز يُفشل CI. غيّر الحدود هنا فقط مع سبب في CHANGELOG.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";

export const BUDGET = {
  // 242 (v1.10.0): القاموس العربي مضمَّن في الحزمة الأولى، ونقل نصوص الملفات القديمة إلى t() يُدخلها
  // فيه (كانت في قطع كسولة). الزيادة نحو 2.3KB لنصوص السجل اليومي والحفظ والمحادثة.
  // 238 (v1.12.0، فحص 2026-10 P1-1): نصوص الشاشات المستقلة في قاموس كسول (src/lib/pages-i18n.ts) ووسوم head
  // للصفحات القانونية دون نصوصها، فنزلت الحزمة من 242.0 إلى 235.5KB. الحد يثبّت المكسب مع هامش صغير.
  // 190 (v1.16.0): عميل Supabase (نحو 54KB gzip) خارج الحزمة الأولى (src/integrations/supabase/lazy.ts):
  // الجلسة المحفوظة ترسم الشاشة الأولى ويُحمَّل العميل بعدها، فنزلت الحزمة من 238.0 إلى 184.1KB.
  // 188 (v1.36.0، تدقيق أكتوبر البند الثامن): قاموس السجل اليومي (`dailyRecord.*`) في قطعة كسولة
  // (src/lib/register-i18n.ts) بعد أن كانت الحزمة 190.4KB وتتجاوز الحد، فنزلت إلى 185.5KB.
  initialGzipKB: 188,
  lazyChunkKB: 400,
};

const dir = process.argv[2] ?? "dist-native/client";
const html = readFileSync(join(dir, "index.html"), "utf8");
const refs = [...new Set([...html.matchAll(/\/assets\/[^"')\s]+\.(?:js|css)/g)].map((m) => m[0]))];
let initial = 0;
for (const r of refs) initial += gzipSync(readFileSync(join(dir, r))).length;
const initialKB = initial / 1024;

const assets = join(dir, "assets");
const lazy = readdirSync(assets)
  .filter((f) => f.endsWith(".js") && !refs.includes(`/assets/${f}`) && !/^quran-/.test(f))
  .map((f) => ({ f, kb: statSync(join(assets, f)).size / 1024 }))
  .sort((a, b) => b.kb - a.kb);

const problems = [];
if (initialKB > BUDGET.initialGzipKB)
  problems.push(`الحزمة الأولى ${initialKB.toFixed(1)}KB gzip > ${BUDGET.initialGzipKB}KB`);
for (const { f, kb } of lazy)
  if (kb > BUDGET.lazyChunkKB)
    problems.push(`القطعة ${f} ${kb.toFixed(0)}KB > ${BUDGET.lazyChunkKB}KB`);

console.log(`الحزمة الأولى: ${initialKB.toFixed(1)}KB gzip (الحد ${BUDGET.initialGzipKB})`);
console.log(
  `أكبر القطع الكسولة: ${lazy
    .slice(0, 3)
    .map((x) => `${x.f} ${x.kb.toFixed(0)}KB`)
    .join("، ")}`,
);
if (problems.length) {
  console.error("❌ تجاوز ميزانية الحجم:\n  " + problems.join("\n  "));
  process.exit(1);
}
console.log("✅ ضمن ميزانية الحجم.");
