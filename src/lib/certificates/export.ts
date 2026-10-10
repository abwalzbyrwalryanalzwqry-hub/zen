/**
 * تصدير الشهادة من محرّك الرسم نفسه (render.ts):
 *  • PDF حقيقي: نص قابل للتحديد وزخارف متجهة بقياس الورقة بالضبط (ZenPrint.toPdf في Android بقياس مخصص،
 *    ومربع الطباعة «حفظ PDF» خارج التطبيق) — لا لقطة شاشة.
 *  • PNG عالي الدقة: الصفحة نفسها في SVG ‏foreignObject بخطوط مضمّنة ثم Canvas.
 *  • طباعة ومشاركة (ورقة المشاركة الأصلية: الملف ورابط التحقق).
 */
import { registerPlugin } from "@capacitor/core";
import { embeddedFontCss } from "@/lib/reports/layout";
import { isNative, printHtml, safeFileName, saveFile, type SaveOutcome } from "@/lib/native-file";
import { CERT_CSS, printDocument } from "./render";

type ZenPrintPdf = {
  toPdf(o: {
    html: string;
    name: string;
    landscape: boolean;
    widthMm?: number;
    heightMm?: number;
  }): Promise<{ uri: string }>;
};
const ZenPrint = registerPlugin<ZenPrintPdf>("ZenPrint");

export interface PageSize {
  width: number;
  height: number;
}

/** اسم ملف منظّم: certificate-<اسم الطالب>-<رقم الشهادة أو السنة>. العربية مقبولة بأمان. */
export function certificateFileBase(studentName: string, numberOrYear: string): string {
  const name = studentName
    .normalize("NFC")
    .replace(/[\u064B-\u0652\u0640]/g, "")
    .trim()
    .replace(/\s+/g, "-");
  return safeFileName(`certificate-${name}-${numberOrYear}`).replace(/\s+/g, "-");
}

export const batchFileBase = (halaqa: string, day: string) =>
  safeFileName(`certificates-${halaqa.trim().replace(/\s+/g, "-")}-${day}`).replace(/\s+/g, "-");

// نمط الطباعة التلقائية نفسه في التقارير (stripAutoPrint يزيله داخل التطبيق).
const AUTO_PRINT =
  "\u003Cscript>window.onload = () => setTimeout(() => window.print(), 350);\u003C/script>";

export async function certificateDocument(pages: string[], size: PageSize, title: string) {
  return printDocument(pages, size, await embeddedFontCss(), title);
}

/** PDF: ملف في التطبيق ثم ورقة المشاركة؛ وإن تعذّر فمربع الطباعة. خارج التطبيق مربع الطباعة («حفظ PDF»). */
export async function exportCertificatePdf(
  pages: string[],
  size: PageSize,
  fileBase: string,
  title: string,
  shareText?: string,
): Promise<SaveOutcome | "printed"> {
  const html = await certificateDocument(pages, size, title);
  const name = safeFileName(fileBase);
  if (isNative()) {
    try {
      const { uri } = await ZenPrint.toPdf({
        html,
        name,
        landscape: size.width > size.height,
        widthMm: size.width,
        heightMm: size.height,
      });
      const { Share } = await import("@capacitor/share");
      try {
        await Share.share({ title, text: shareText, files: [uri], dialogTitle: title });
        return "shared";
      } catch {
        return "cancelled";
      }
    } catch (e) {
      console.warn("[certificates] toPdf failed, falling back to print", e);
      await printHtml(html, name);
      return "printed";
    }
  }
  await printHtml(html.replace("</body>", `${AUTO_PRINT}</body>`), name);
  return "printed";
}

export async function printCertificates(pages: string[], size: PageSize, title: string) {
  const html = await certificateDocument(pages, size, title);
  await printHtml(isNative() ? html : html.replace("</body>", `${AUTO_PRINT}</body>`), title);
}

/** الصفحة نفسها صورةً بدقة dpi (الافتراضي 200 نقطة/بوصة ≈ 2339×1654 لـ A4 أفقي). */
export async function certificatePng(pageHtml: string, size: PageSize, dpi = 200): Promise<Blob> {
  const px = (mm: number) => Math.round((mm / 25.4) * dpi);
  const W = px(size.width);
  const H = px(size.height);
  const fonts = await embeddedFontCss();
  // XHTML صالح داخل SVG: نُغلق الوسوم الفارغة.
  const xhtml = pageHtml.replace(/<(img|br|hr)([^>]*?)\/?>/g, "<$1$2/>");
  const cssW = (size.width / 25.4) * 96;
  const cssH = (size.height / 25.4) * 96;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${cssW} ${cssH}">
<foreignObject x="0" y="0" width="${cssW}" height="${cssH}"><div xmlns="http://www.w3.org/1999/xhtml" style="width:${cssW}px;height:${cssH}px">
<style>${fonts}${CERT_CSS}</style>${xhtml}</div></foreignObject></svg>`;
  const img = new Image();
  img.decoding = "async";
  const loaded = new Promise<void>((res, rej) => {
    img.onload = () => res();
    img.onerror = () => rej(new Error("PNG_RENDER_FAILED"));
  });
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await loaded;
  // مهلة قصيرة كي تُفك الخطوط المضمّنة داخل الصورة قبل الرسم.
  await new Promise((r) => setTimeout(r, 120));
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("PNG_RENDER_FAILED");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  // Safari/WebKit قد يلوّث اللوحة بصورة foreignObject فيرمي toBlob خطأ أمان (L2، 1.25.0): نوحّده في PNG_RENDER_FAILED.
  try {
    ctx.drawImage(img, 0, 0, W, H);
    return await new Promise<Blob>((res, rej) =>
      canvas.toBlob((b) => (b ? res(b) : rej(new Error("PNG_RENDER_FAILED"))), "image/png"),
    );
  } catch {
    throw new Error("PNG_RENDER_FAILED");
  }
}

export async function exportCertificatePng(
  pageHtml: string,
  size: PageSize,
  fileBase: string,
  title: string,
) {
  const blob = await certificatePng(pageHtml, size);
  return saveFile(`${fileBase}.png`, blob, { title });
}

/** PNG وإن تعذّر في هذا المتصفح فـPDF بالمحتوى نفسه (L2). يعيد "pdf" ليُخبر المستخدم بالبديل. */
export async function exportCertificatePngOrPdf(
  pageHtml: string,
  size: PageSize,
  fileBase: string,
  title: string,
): Promise<"png" | "pdf"> {
  try {
    await exportCertificatePng(pageHtml, size, fileBase, title);
    return "png";
  } catch (e) {
    if (!(e instanceof Error) || e.message !== "PNG_RENDER_FAILED") throw e;
    await exportCertificatePdf([pageHtml], size, fileBase, title);
    return "pdf";
  }
}

/**
 * مشاركة: في التطبيق ملف PDF مع رابط التحقق في نص المشاركة؛ في المتصفح صورة PNG عبر مشاركة الويب إن دعمت
 * الملفات، وإلا تنزيلها.
 */
export async function shareCertificate(
  pageHtml: string,
  size: PageSize,
  fileBase: string,
  title: string,
  text: string,
): Promise<SaveOutcome | "printed"> {
  if (isNative()) return exportCertificatePdf([pageHtml], size, fileBase, title, text);
  let blob: Blob;
  try {
    blob = await certificatePng(pageHtml, size);
  } catch {
    return exportCertificatePdf([pageHtml], size, fileBase, title, text);
  }
  const file = new File([blob], `${safeFileName(fileBase)}.png`, { type: "image/png" });
  const nav = navigator as Navigator & {
    canShare?: (d: ShareData) => boolean;
    share?: (d: ShareData) => Promise<void>;
  };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ title, text, files: [file] });
      return "shared";
    } catch {
      return "cancelled";
    }
  }
  return saveFile(file.name, blob, { title });
}
