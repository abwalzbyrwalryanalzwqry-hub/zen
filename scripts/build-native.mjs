#!/usr/bin/env node
/**
 * يبني نسخة Android المضمَّنة (تعمل دون إنترنت):
 *   1. واجهة SPA كاملة في dist-native/client (بلا خادم، ZEN_NATIVE=1).
 *   2. المصحف كاملاً داخل الحزمة تلقائياً: صفحات مصحف المدينة الـ604 ملفات نصية صغيرة في
 *      public/data/quran/mushaf15 (نحو 2.4 ميغابايت) مع خط مجمع الملك فهد في public/fonts —
 *      لا صور، ولا تنزيل، ولا ضغط، ولا نسخة «خفيفة» منفصلة.
 *   3. `cap sync android` لنسخها إلى مشروع أندرويد.
 *
 * الاستخدام:  npm run build:apk-web   ثم   cd android && ./gradlew assembleRelease
 * الميزات التي تحتاج اتصالاً (المساعد، التسميع، الأدوات، الإشعارات) تمرّ بدوال Supabase Edge، فلا خادم ويب.
 */
import { execSync } from "node:child_process";
import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const OUT = join(ROOT, "dist-native/client");
const PAGES = 604;

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
console.log(`المصحف مضمَّن: ${pages} صفحة.`);

if (!process.argv.includes("--no-sync")) {
  run("npx cap sync android");
}
