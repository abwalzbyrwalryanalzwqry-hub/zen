import { defineConfig } from "vitest/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * إعداد مستقل عن vite.config.ts: إعداد التطبيق يحمّل إضافات TanStack Start
 * وnitro التي لا حاجة لها في اختبارات الوحدة (ومحرّك الاختبارات منطق خالص).
 */
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(
      JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")).version,
    ),
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    testTimeout: 30_000,
  },
});
