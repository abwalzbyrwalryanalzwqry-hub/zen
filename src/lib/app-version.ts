/**
 * رقم الإصدار من `package.json` يُحقن وقت البناء (`define` في vite.config.ts وvitest.config.ts)، بدل
 * «١.٠.٠» المكتوب يدوياً في صفحة الحساب (تحليل «المزيد» BUG-16). `scripts/version.mjs --check` يضمن
 * مطابقته لـ CHANGELOG وbuild.gradle.
 */
declare const __APP_VERSION__: string | undefined;

export const APP_VERSION: string =
  typeof __APP_VERSION__ === "string" && __APP_VERSION__ ? __APP_VERSION__ : "0.0.0";
