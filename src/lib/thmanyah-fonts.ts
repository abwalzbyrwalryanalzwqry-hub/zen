// نظام خطوط ثمانية المركزي لتطبيق زِن.
// يعمل داخل Android/Capacitor فقط، ولا يحمّل الخطوط في نسخة الويب العامة.
// ملفات الخطوط لا تُرفع إلى المستودع العام التزامًا بترخيص ثمانية؛
// انظر docs/licenses/thmanyah/README.md.
import { Capacitor } from "@capacitor/core";

export const THMANYAH_FONT_FAMILIES = {
  display: "Thmanyah Serif Display",
  reading: "Thmanyah Serif Text",
} as const;

/** الأوزان المتاحة فعليًا في الملفات المرفقة من المصدر الرسمي. */
export const THMANYAH_FONT_WEIGHTS = [300, 400, 500, 700, 900] as const;

type ThmanyahFontFile = {
  family: string;
  weight: number;
  file: string;
};

const FONT_FILES: ThmanyahFontFile[] = [
  { family: THMANYAH_FONT_FAMILIES.display, weight: 300, file: "thmanyahserifdisplay-Light.otf" },
  { family: THMANYAH_FONT_FAMILIES.display, weight: 400, file: "thmanyahserifdisplay-Regular.otf" },
  { family: THMANYAH_FONT_FAMILIES.display, weight: 500, file: "thmanyahserifdisplay-Medium.otf" },
  { family: THMANYAH_FONT_FAMILIES.display, weight: 700, file: "thmanyahserifdisplay-Bold.otf" },
  { family: THMANYAH_FONT_FAMILIES.display, weight: 900, file: "thmanyahserifdisplay-Black.otf" },
  { family: THMANYAH_FONT_FAMILIES.reading, weight: 300, file: "thmanyahseriftext-Light.otf" },
  { family: THMANYAH_FONT_FAMILIES.reading, weight: 400, file: "thmanyahseriftext-Regular.otf" },
  { family: THMANYAH_FONT_FAMILIES.reading, weight: 500, file: "thmanyahseriftext-Medium.otf" },
  { family: THMANYAH_FONT_FAMILIES.reading, weight: 700, file: "thmanyahseriftext-Bold.otf" },
  { family: THMANYAH_FONT_FAMILIES.reading, weight: 900, file: "thmanyahseriftext-Black.otf" },
];

const loadedFamilies = new Set<string>();

/**
 * يحمّل خطوط ثمانية داخل حزمة Android/Capacitor فقط.
 * ملفات الخطوط يجب أن تكون في: public/fonts/thmanyah/
 * داخل نسخة البناء الخاصة، دون رفعها إلى المستودع العام.
 */
export async function loadThmanyahFonts(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  if (typeof document === "undefined" || !("fonts" in document)) return false;

  for (const font of FONT_FILES) {
    if (loadedFamilies.has(`${font.family}:${font.weight}`)) continue;

    try {
      const face = new FontFace(
        font.family,
        `url(/fonts/thmanyah/${font.file}) format("opentype")`,
        { weight: String(font.weight), display: "swap" },
      );
      await face.load();
      document.fonts.add(face);
      loadedFamilies.add(`${font.family}:${font.weight}`);
    } catch {
      // غياب ملف وزن واحد لا يجب أن يعطّل بقية الخطوط.
    }
  }

  const root = document.documentElement;
  root.style.setProperty(
    "--font-display",
    `"${THMANYAH_FONT_FAMILIES.display}", "Zen Text", serif`,
  );
  root.style.setProperty(
    "--font-reading",
    `"${THMANYAH_FONT_FAMILIES.reading}", "Zen Text", serif`,
  );

  return loadedFamilies.size > 0;
}

/** هل خطوط ثمانية متاحة في هذه البيئة؟ */
export function areThmanyahFontsSupported(): boolean {
  return Capacitor.isNativePlatform();
}
