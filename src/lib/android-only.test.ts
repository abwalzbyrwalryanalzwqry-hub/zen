import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// المرحلة 6.10: زِن تطبيق Android فقط (قرار صاحب التطبيق، 28 سبتمبر 2026). لا تطبيق ويب ولا نشر ويب،
// ولا يعتمد التطبيق على أي نطاق ويب. HANDOFF القاعدة 33.
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}
const src = files("src").filter((f) => !f.endsWith(".test.ts"));
const read = (f: string) => readFileSync(f, "utf8");

describe("Android فقط، بلا ويب", () => {
  it("الغلاف يحمّل الواجهة المضمَّنة وحدها، لا نطاق ويب", () => {
    const cap = read("capacitor.config.ts");
    expect(cap).toContain('webDir: "dist-native/client"');
    expect(cap).not.toMatch(/server\s*:|CAP_SERVER_URL|url\s*:/);
  });

  it("البناء الوحيد نسخة التطبيق المضمَّنة (SPA بلا nitro ولا SSR)", () => {
    const vite = read("vite.config.ts");
    expect(vite).toContain("nitro: false");
    expect(vite).toContain('process.env.VITE_ZEN_NATIVE = "1"');
    const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
    expect(pkg.scripts.build).toContain("build-native.mjs");
    expect(Object.keys(pkg.scripts)).not.toContain("gen:vapid");
  });

  it("لا عامل خدمة ولا Web Push ولا تثبيت PWA ولا خادم ويب", () => {
    const bad =
      /serviceWorker\.register|pushManager|applicationServerKey|VITE_VAPID|beforeinstallprompt|VITE_ZEN_SERVER_ORIGIN/;
    expect(src.filter((f) => bad.test(read(f)))).toEqual([]);
    for (const f of ["public/sw.js", "public/offline.html", "public/manifest.webmanifest"])
      expect(existsSync(f), f).toBe(false);
    expect(existsSync(".github/workflows/deploy-web.yml")).toBe(false);
    expect(existsSync("supabase/functions/_shared/webpush.server.ts")).toBe(false);
  });

  it("حفظ الملفات والطباعة يمرّان بـ native-file (لا <a download> ولا window.open في WebView)", () => {
    const allowed = new Set(["src/lib/native-file.ts", "src/lib/quran/share-io.ts"]);
    const bad = /\.download\s*=|window\.open\(|window\.print\(\)/;
    const offenders = src.filter((f) => !allowed.has(f.replaceAll("\\", "/")) && bad.test(read(f)));
    const code = offenders.filter(
      (f) =>
        !/\\u003Cscript>window\.onload = \(\) => setTimeout\(\(\) => window\.print\(\)/.test(
          read(f),
        ) || /\.download\s*=|window\.open\(/.test(read(f)),
    );
    expect(code).toEqual([]);
    const main = read("android/app/src/main/java/app/zen/quran/MainActivity.java");
    expect(main).toContain("registerPlugin(ZenPrintPlugin.class)");
  });

  it("مرسِل الإشعارات FCM وحده", () => {
    const edge = read("supabase/functions/zen-push-dispatch/index.ts");
    expect(edge).not.toMatch(/vapid|webpush/i);
    expect(edge).toContain("FCM_SERVICE_ACCOUNT");
  });

  it("Router يبقى متزامنًا، وAndroid ينتظر نتيجة تحميل الخطوط قبل تركيب الصفحات", () => {
    const router = read("src/router.tsx");
    expect(router).toContain("export const getRouter = () =>");
    expect(router).not.toContain("export const getRouter = async");

    const root = read("src/routes/__root.tsx");
    expect(root).toContain("function FontsGate");
    expect(root).toMatch(/useState\(!areThmanyahFontsSupported\(\)\)/);
    expect(root).toContain("void loadThmanyahFonts().finally");
    expect(root).toContain("<FontsGate>");
  });
});
