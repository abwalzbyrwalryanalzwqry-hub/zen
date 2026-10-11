// نظام خطوط ثمانية المركزي لتطبيق زِن.
// يعمل داخل Android/Capacitor فقط، ولا يحمّل الخطوط في نسخة الويب العامة.
// ملفات الخطوط تُجلب أثناء البناء من المستودع الخاص zen-fonts عبر FONTS_REPO_TOKEN.
// انظر docs/licenses/thmanyah/README.md.
import { Capacitor } from "@capacitor/core";

export const THMANYAH_FONT_FAMILIES = {
  primary: "Thmanyah Sans",
  display: "Thmanyah Serif Display",
  reading: "Thmanyah Serif Text",
} as const;

/** الأوزان المتاحة فعليًا في الملفات الرسمية. */
export const THMANYAH_FONT_WEIGHTS = [300, 400, 500, 700, 900] as const;

type ThmanyahFontFile = {
  family: string;
  weight: number;
  file: string;
};

const FONT_FILES: ThmanyahFontFile[] = [
  { family: THMANYAH_FONT_FAMILIES.primary, weight: 300, file: "thmanyahsans-Light.woff2" },
  { family: THMANYAH_FONT_FAMILIES.primary, weight: 400, file: "thmanyahsans-Regular.woff2" },
  { family: THMANYAH_FONT_FAMILIES.primary, weight: 500, file: "thmanyahsans-Medium.woff2" },
  { family: THMANYAH_FONT_FAMILIES.primary, weight: 700, file: "thmanyahsans-Bold.woff2" },
  { family: THMANYAH_FONT_FAMILIES.primary, weight: 900, file: "thmanyahsans-Black.woff2" },
  { family: THMANYAH_FONT_FAMILIES.display, weight: 300, file: "thmanyahserifdisplay-Light.woff2" },
  { family: THMANYAH_FONT_FAMILIES.display, weight: 400, file: "thmanyahserifdisplay-Regular.woff2" },
  { family: THMANYAH_FONT_FAMILIES.display, weight: 500, file: "thmanyahserifdisplay-Medium.woff2" },
  { family: THMANYAH_FONT_FAMILIES.display, weight: 700, file: "thmanyahserifdisplay-Bold.woff2" },
  { family: THMANYAH_FONT_FAMILIES.display, weight: 900, file: "thmanyahserifdisplay-Black.woff2" },
  { family: THMANYAH_FONT_FAMILIES.reading, weight: 300, file: "thmanyahseriftext-Light.woff2" },
  { family: THMANYAH_FONT_FAMILIES.reading, weight: 400, file: "thmanyahseriftext-Regular.woff2" },
  { family: THMANYAH_FONT_FAMILIES.reading, weight: 500, file: "thmanyahseriftext-Medium.woff2" },
  { family: THMANYAH_FONT_FAMILIES.reading, weight: 700, file: "thmanyahseriftext-Bold.woff2" },
  { family: THMANYAH_FONT_FAMILIES.reading, weight: 900, file: "thmanyahseriftext-Black.woff2" },
];

const loadedFamilies = new Set<string>();

/**
 * يحمّل خطوط ثمانية داخل حزمة Android/Capacitor فقط.
 * ملفات woff2 تُجلب من zen-fonts أثناء البناء إلى public/fonts/thmanyah/.
 */
export async function loadThmanyahFonts(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  if (typeof document === "undefined" || !("fonts" in document)) return false;

  for (const font of FONT_FILES) {
    const key = `${font.family}:${font.weight}`;
    if (loadedFamilies.has(key)) continue;

    try {
      const face = new FontFace(
        font.family,
        `url(/fonts/thmanyah/${font.file}) format("woff2")`,
        { weight: String(font.weight), display: "swap" },
      );
      await face.load();
      document.fonts.add(face);
      loadedFamilies.add(key);
    } catch {
      // غياب ملف وزن واحد لا يجب أن يعطّل بقية الخطوط.
    }
  }

  const root = document.documentElement;
  root.style.setProperty(
    "--font-sans",
    `"${THMANYAH_FONT_FAMILIES.primary}", "Zen Text", system-ui, sans-serif`,
  );
  root.style.setProperty(
    "--font-display",
    `"${THMANYAH_FONT_FAMILIES.display}", "${THMANYAH_FONT_FAMILIES.primary}", serif`,
  );
  root.style.setProperty(
    "--font-reading",
    `"${THMANYAH_FONT_FAMILIES.reading}", "${THMANYAH_FONT_FAMILIES.primary}", serif`,
  );

  return loadedFamilies.size > 0;
}

/** هل خطوط ثمانية متاحة في هذه البيئة؟ */
export function areThmanyahFontsSupported(): boolean {
  return Capacitor.isNativePlatform();
}
