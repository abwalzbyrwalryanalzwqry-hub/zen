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

/**
 * تعيش الملفات في جذر WebView النهائي الذي يتحقق منه build-native.mjs قبل cap sync.
 * هذا المسار المطلق يصبح capacitor://localhost/fonts/... في Android.
 */
function fontUrl(file: string): string {
  return new URL(`/fonts/thmanyah/${file}`, window.location.origin).href;
}

/** يحمّل الخطوط داخل حزمة Android/Capacitor فقط. */
export async function loadThmanyahFonts(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  if (typeof document === "undefined" || !("fonts" in document)) return false;

  for (const font of FONT_FILES) {
    const key = `${font.family}:${font.weight}`;
    if (loadedFamilies.has(key)) continue;

    try {
      const face = new FontFace(font.family, `url(${fontUrl(font.file)}) format("woff2")`, {
        weight: String(font.weight),
        display: "swap",
      });
      await face.load();
      document.fonts.add(face);
      loadedFamilies.add(key);
    } catch {
      // فشل وزن واحد لا يعطّل بدء التطبيق؛ خط Zen Text يبقى بديلًا.
    }
  }

  // لا نُعلن عائلات ثمانية كخطوط أساسية إلا بعد تحميل ملف واحد منها بنجاح.
  if (loadedFamilies.size === 0) return false;

  const root = document.documentElement;
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

  return true;
}

export function areThmanyahFontsSupported(): boolean {
  return Capacitor.isNativePlatform();
}
