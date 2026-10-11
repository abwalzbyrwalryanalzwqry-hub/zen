// نظام خطوط ثمانية المركزي لتطبيق زِن.
// يعمل داخل Android/Capacitor فقط، ولا يحمّل الخطوط في نسخة الويب العامة.
// تُضمّن خمسة ملفات فقط لتقليل حجم APK مع الحفاظ على الهوية البصرية.
import { Capacitor } from "@capacitor/core";

export const THMANYAH_FONT_FAMILIES = {
  primary: "Thmanyah Sans",
  display: "Thmanyah Serif Display",
  reading: "Thmanyah Serif Text",
} as const;

/** الأوزان المضمّنة فعليًا في APK. */
export const THMANYAH_FONT_WEIGHTS = [400, 500, 700] as const;

type ThmanyahFontFile = {
  family: string;
  weight: number;
  file: string;
};

// خمسة ملفات فقط: Sans للنص والواجهات، Display للعناوين، Text للقراءة الطويلة.
const FONT_FILES: ThmanyahFontFile[] = [
  { family: THMANYAH_FONT_FAMILIES.primary, weight: 400, file: "thmanyahsans-Regular.woff2" },
  { family: THMANYAH_FONT_FAMILIES.primary, weight: 500, file: "thmanyahsans-Medium.woff2" },
  { family: THMANYAH_FONT_FAMILIES.primary, weight: 700, file: "thmanyahsans-Bold.woff2" },
  { family: THMANYAH_FONT_FAMILIES.display, weight: 700, file: "thmanyahserifdisplay-Bold.woff2" },
  { family: THMANYAH_FONT_FAMILIES.reading, weight: 400, file: "thmanyahseriftext-Regular.woff2" },
];

const loadedFamilies = new Set<string>();

/** يحمّل الخطوط داخل حزمة Android/Capacitor فقط. */
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
      // فشل وزن واحد لا يعطّل بدء التطبيق؛ خط Zen Text يبقى بديلًا.
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

export function areThmanyahFontsSupported(): boolean {
  return Capacitor.isNativePlatform();
}
