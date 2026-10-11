#!/usr/bin/env node
/**
 * يبني نسخة Android المضمَّنة (تعمل دون إنترنت):
 *   1. واجهة SPA كاملة في dist-native/client (بلا خادم، ZEN_NATIVE=1).
 *   2. المصحف كاملاً داخل الحزمة تلقائياً: صفحات مصحف المدينة الـ604 ملفات نصية صغيرة في
 *      public/data/quran/mushaf15 (نحو 2.4 ميغابايت) مع خط مجمع الملك فهد في public/fonts.
 *   3. خطوط ثمانية الخمسة تُنسخ صراحة إلى ناتج WebView النهائي عند توفرها؛ غيابها لا يوقف البناء.
 *   4. `cap sync android` لنسخها إلى مشروع أندرويد.
 *
 * الاستخدام:  npm run build:apk-web   ثم   cd android && ./gradlew assembleRelease
 * الميزات التي تحتاج اتصالاً (المساعد، التسميع، الأدوات، الإشعارات) تمرّ بدوال Supabase Edge، فلا خادم ويب.
 */
import { execSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const OUT = join(ROOT, "dist-native/client");
const PAGES = 604;
const THMANYAH_FONT_FILES = [
  "thmanyahsans-Regular.woff2",
  "thmanyahsans-Medium.woff2",
  "thmanyahsans-Bold.woff2",
  "thmanyahserifdisplay-Bold.woff2",
  "thmanyahseriftext-Regular.woff2",
];

const run = (cmd, env = {}) =>
  execSync(cmd, { cwd: ROOT, stdio: "inherit", env: { ...process.env, ...env } });

rmSync(join(ROOT, "dist-native"), { recursive: true, force: true });
run("npx vite build");

if (!existsSync(join(OUT, "index.html"))) {
  throw new Error("لم يُنتج البناء dist-native/client/index.html");
}

const mushafDir = join(OUT, "data/quran/mushaf15");
const pages = existsSync(mushafDir)
  ? readdirSync(mushafDir).filter((f) => f.endsWith(".json")).length
  : 0;
if (pages !== PAGES) throw new Error(`صفحات المصحف في الحزمة ${pages} من ${PAGES}`);
if (!existsSync(join(OUT, "fonts/kfgqpc-hafs-uthmanic-v18.woff2"))) {
  throw new Error("خط المصحف غير موجود في الحزمة");
}

// لا نعتمد على نسخ public الضمني: نضع خطوط ثمانية صراحة في جذر WebView الذي ينسخه Capacitor.
// خطوط ثمانية اختيارية: إذا لم تُرفع ملفاتها بعد، يكمل البناء بخط Zen Text البديل.
const sourceFonts = join(ROOT, "public/fonts/thmanyah");
const targetFonts = join(OUT, "fonts/thmanyah");
mkdirSync(targetFonts, { recursive: true });
const bundledThmanyahFonts = [];
for (const file of THMANYAH_FONT_FILES) {
  const source = join(sourceFonts, file);
  if (!existsSync(source)) continue;
  copyFileSync(source, join(targetFonts, file));
  bundledThmanyahFonts.push(file);
}
for (const file of bundledThmanyahFonts) {
  const bundled = join(targetFonts, file);
  if (!existsSync(bundled) || statSync(bundled).size === 0) {
    throw new Error(`خط ثمانية مفقود أو فارغ في ناتج Android: ${bundled}`);
  }
}

console.log(`المصحف مضمَّن: ${pages} صفحة.`);
if (bundledThmanyahFonts.length > 0) {
  console.log(`خطوط ثمانية مضمّنة ومتحقق منها: ${bundledThmanyahFonts.length} ملفات.`);
} else {
  console.log("خطوط ثمانية غير متوفرة؛ سيُستخدم خط Zen Text البديل.");
}

if (!process.argv.includes("--no-sync")) {
  run("npx cap sync android");
}
