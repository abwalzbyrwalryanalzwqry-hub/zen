// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { readFileSync } from "node:fs";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const APP_VERSION = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
).version;

/**
 * زِن تطبيق Android فقط (قرار صاحب التطبيق، 28 سبتمبر 2026): البناء الوحيد نسخة SPA ثابتة تُشحن داخل
 * التطبيق (Capacitor) وتعمل دون اتصال، بلا nitro ولا SSR ولا خادم ويب، وتُولَّد صفحة `index.html` واحدة
 * يتكفّل الموجّه بكل المسارات منها. `VITE_ZEN_NATIVE=1` دائماً، في البناء وفي خادم التطوير.
 */
process.env.VITE_ZEN_NATIVE = "1";

export default defineConfig({
  nitro: false,
  tanstackStart: {
    // src/server.ts: غلاف أخطاء التصيير المسبق لصفحة index.html.
    server: { entry: "server" },
    spa: { enabled: true, prerender: { outputPath: "/index.html", crawlLinks: false } },
  },
  vite: {
    build: { outDir: "dist-native" },
    // رقم الإصدار في «عن زِن» (src/lib/app-version.ts).
    define: { __APP_VERSION__: JSON.stringify(APP_VERSION) },
  },
});
