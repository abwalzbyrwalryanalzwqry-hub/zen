// نظام خطوط ثمانية المركزي لتطبيق زِن.
// يعمل داخل Android/Capacitor فقط، ولا يحمّل الخطوط في نسخة الويب العامة.
import { Capacitor } from "@capacitor/core";

export const THMANYAH_FONT_FAMILIES = {
  primary: "Thmanyah Sans",
  display: "Thmanyah Serif Display",
  reading: "Thmanyah Serif Text",
} as const;

export const THMANYAH_FONT_WEIGHTS = [400, 500, 700] as const;

type ThmanyahFontFile = { family: string; weight: number; file: string };

const FONT_FILES: ThmanyahFontFile[] = [
  { family: THMANYAH_FONT_FAMILIES.primary, weight: 400, file: "thmanyahsans-Regular.woff2" },
  { family: THMANYAH_FONT_FAMILIES.primary, weight: 500, file: "thmanyahsans-Medium.woff2" },
  { family: THMANYAH_FONT_FAMILIES.primary, weight: 700, file: "thmanyahsans-Bold.woff2" },
  { family: THMANYAH_FONT_FAMILIES.display, weight: 700, file: "thmanyahserifdisplay-Bold.woff2" },
  { family: THMANYAH_FONT_FAMILIES.reading, weight: 400, file: "thmanyahseriftext-Regular.woff2" },
];

let loadPromise: Promise<boolean> | undefined;

function fontUrl(file: string): string {
  return new URL(`/fonts/thmanyah/${file}`, window.location.origin).href;
}

/** يحمّل ويتحقق من كل ملفات الخطوط قبل تفعيل متغيرات CSS. */
export function loadThmanyahFonts(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return Promise.resolve(false);
  if (typeof document === "undefined" || !("fonts" in document)) return Promise.resolve(false);
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const root = document.documentElement;
    root.dataset.thmanyahFonts = "loading";
    const results = await Promise.allSettled(
      FONT_FILES.map(async (font) => {
        const face = new FontFace(font.family, `url(${fontUrl(font.file)}) format("woff2")`, {
          weight: String(font.weight),
          display: "swap",
        });
        await face.load();
        document.fonts.add(face);
        return font;
      }),
    );

    const failures = results.flatMap((result, index) =>
      result.status === "rejected" ? [FONT_FILES[index].file] : [],
    );
    root.dataset.thmanyahFontsLoaded = String(FONT_FILES.length - failures.length);
    root.dataset.thmanyahFontsFailed = failures.join(",");

    if (failures.length > 0) {
      root.dataset.thmanyahFonts = "fallback";
      return false;
    }

    root.style.setProperty(
      "--zen-font-sans",
      `"${THMANYAH_FONT_FAMILIES.primary}", "Zen Text", system-ui, sans-serif`,
    );
    root.style.setProperty(
      "--zen-font-display",
      `"${THMANYAH_FONT_FAMILIES.display}", "${THMANYAH_FONT_FAMILIES.primary}", serif`,
    );
    root.style.setProperty(
      "--zen-font-reading",
      `"${THMANYAH_FONT_FAMILIES.reading}", "${THMANYAH_FONT_FAMILIES.primary}", serif`,
    );
    root.dataset.thmanyahFonts = "loaded";
    return true;
  })();

  return loadPromise;
}

export function areThmanyahFontsSupported(): boolean {
  return Capacitor.isNativePlatform();
}
