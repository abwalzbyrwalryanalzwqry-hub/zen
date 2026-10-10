// مشاركة بطاقات الآيات والإنجازات: النص، والصورة عبر مربع المشاركة الأصلي (M5: من share-card.ts دون تغيير
// السلوك؛ يُعاد تصديرها منه).

import { Capacitor } from "@capacitor/core";
import { toArabicDigits } from "./format";

export function buildShareText(input: {
  text: string;
  surahNameAr: string;
  ayahFrom: number;
  ayahTo: number;
}): string {
  const ref =
    input.ayahFrom === input.ayahTo
      ? `[سورة ${input.surahNameAr}: ${toArabicDigits(input.ayahFrom)}]`
      : `[سورة ${input.surahNameAr}: ${toArabicDigits(input.ayahFrom)}-${toArabicDigits(input.ayahTo)}]`;
  return `${input.text}\n${ref}\n\n— من تطبيق زِن`;
}

/* ---------- Sharing ---------- */

export type ShareOutcome = "shared" | "downloaded" | "copied" | "cancelled";

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("تعذّر إنشاء الصورة"));
    }, "image/png");
  });
}

function base64FromDataUrl(dataUrl: string): string {
  const at = dataUrl.indexOf(",");
  return at >= 0 ? dataUrl.slice(at + 1) : dataUrl;
}

/** Shares the rendered card as an image, with graceful fallbacks. */
export async function shareCardImage(
  canvas: HTMLCanvasElement,
  fileName: string,
  text: string,
  dialogTitle = "مشاركة الآية",
): Promise<ShareOutcome> {
  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const { Share } = await import("@capacitor/share");
    const data = base64FromDataUrl(canvas.toDataURL("image/png"));
    const path = `zen-share/${fileName}`;
    await Filesystem.writeFile({ path, directory: Directory.Cache, data, recursive: true });
    const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache });
    try {
      await Share.share({ title: "زِن", text, files: [uri], dialogTitle });
      return "shared";
    } catch {
      return "cancelled";
    }
  }

  const blob = await canvasToBlob(canvas);
  const file = new File([blob], fileName, { type: "image/png" });
  const nav = navigator as Navigator & {
    canShare?: (data: { files?: File[] }) => boolean;
    share?: (data: { files?: File[]; text?: string; title?: string }) => Promise<void>;
  };
  if (nav.canShare?.({ files: [file] }) && nav.share) {
    try {
      await nav.share({ files: [file], text, title: "زِن" });
      return "shared";
    } catch {
      return "cancelled";
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return "downloaded";
}

/**
 * ينسخ النص إلى الحافظة فعلاً (لا مربع المشاركة)، ويعيد نجاح الكتابة.
 * Clipboard API أولاً (WebView في Capacitor سياق آمن)، ثم طريقة execCommand للمتصفحات القديمة.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* نجرّب الطريقة القديمة */
  }
  if (typeof document === "undefined") return false;
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

/** Shares plain text, falling back to the clipboard. */
export async function shareCardText(text: string): Promise<ShareOutcome> {
  if (Capacitor.isNativePlatform()) {
    const { Share } = await import("@capacitor/share");
    try {
      await Share.share({ title: "زِن", text, dialogTitle: "مشاركة الآية" });
      return "shared";
    } catch {
      return "cancelled";
    }
  }
  const nav = navigator as Navigator & { share?: (data: { text: string }) => Promise<void> };
  if (nav.share) {
    try {
      await nav.share({ text });
      return "shared";
    } catch {
      return "cancelled";
    }
  }
  return (await copyText(text)) ? "copied" : "cancelled";
}
