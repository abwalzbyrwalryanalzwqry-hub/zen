import { defineConfig, devices } from "@playwright/test";

/**
 * اختبارات E2E للمسارات الحرجة (الدخول، التسميع، الاختبار، الحضور، المصحف، المساعد).
 * تعمل على **حزمة تطبيق Android نفسها** (`dist-native/client`، بلا خادم ويب) في Chrome بمقاس Pixel 7،
 * مع Supabase وهمي (e2e/fake-supabase.ts)، فلا تحتاج مشروعاً ولا أسراراً.
 * `E2E_BASE_URL` يوجّهها إلى خادم قائم بدل البناء والتشغيل.
 */
const PORT = 4173;
const external = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: external ?? `http://localhost:${PORT}`,
    locale: "ar",
    trace: "retain-on-failure",
    ...devices["Pixel 7"],
    launchOptions: {
      // ميكروفون وهمي للتسجيل الصوتي.
      args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
      // أسماء الملفات العربية: Chromium يستبدلها بـ «download» إن لم تكن لغة النظام UTF-8.
      env: { ...process.env, LANG: "C.UTF-8", LC_ALL: "C.UTF-8" },
    },
    permissions: ["microphone"],
  },
  projects: [{ name: "android-chrome", use: { browserName: "chromium" } }],
  webServer: external
    ? undefined
    : {
        // تُبنى الحزمة بعنوان Supabase الوهمي ثم تُقدَّم ملفاتٍ ثابتة كما في التطبيق.
        command: `node scripts/build-native.mjs --no-sync && node scripts/serve-static.mjs dist-native/client ${PORT}`,
        url: `http://localhost:${PORT}/auth/login`,
        timeout: 300_000,
        reuseExistingServer: !process.env.CI,
        env: {
          VITE_SUPABASE_URL: "http://sb.e2e.test",
          VITE_SUPABASE_PUBLISHABLE_KEY: "e2e-anon-key",
          SUPABASE_URL: "http://sb.e2e.test",
          SUPABASE_PUBLISHABLE_KEY: "e2e-anon-key",
        },
      },
});
