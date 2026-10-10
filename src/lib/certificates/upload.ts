/**
 * تجهيز صورة للرفع إلى أصول المركز: PNG/JPG/WebP تُصغَّر إلى 2000px كحد أقصى (تبقى حادة للطباعة A4 بدقة
 * ~170 نقطة/بوصة) مع الإبقاء على الشفافية، وSVG يُفحص محلياً (الخادم يرفض غير الآمن كذلك) ثم يُحوَّل إلى PNG (1.25.0)، ويُرفع كما هو إن تعذّر التحويل.
 */
export const MAX_DATA_URL = 1_400_000;
const MAX_SIDE = 2000;
const TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

export type UploadError = "badType" | "tooBig" | "unsafe";

export interface PreparedImage {
  data_url: string;
  width: number;
  height: number;
  mime: string;
}

/**
 * نفس قاعدة الخادم (cert_save_asset): لا سكربت ولا معالجات أحداث ولا روابط خارجية ولا foreignObject.
 * 1.25.0 (فحص الاستوديو L1): ولا كيانات مرمّزة (&#…) يُخفى بها ما سبق، ولا DOCTYPE، ولا url() لغير مرجع داخلي،
 * ولا عناصر تحريك أو تضمين تغيّر الروابط (animate/set/iframe/embed/object).
 */
export const UNSAFE_SVG =
  /<\s*script|\son[a-z]+\s*=|javascript:|<\s*foreignObject|xlink:href\s*=\s*["']?(?!#)|href\s*=\s*["']?(?:https?:|\/\/|data:)|<!ENTITY|<!DOCTYPE|@import|&#|url\(\s*["']?(?!#)|<\s*(?:iframe|embed|object|animate|set|handler|listener)\b/i;

export function isSafeSvg(text: string): boolean {
  return !UNSAFE_SVG.test(text);
}

/** SVG إلى PNG عند الرفع (L1): الشهادة ترسم صورة نقطية لا ملفاً قابلاً للتفسير. يعود null إن تعذّر (بيئة بلا canvas). */
async function rasterizeSvg(
  svgUrl: string,
  size: { width: number; height: number },
): Promise<PreparedImage | null> {
  try {
    const img = new Image();
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("INVALID_IMAGE"));
      img.src = svgUrl;
    });
    const scale = MAX_SIDE / Math.max(size.width, size.height, 1);
    const width = Math.max(1, Math.round(size.width * Math.min(scale, 4)));
    const height = Math.max(1, Math.round(size.height * Math.min(scale, 4)));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, width, height);
    const data_url = canvas.toDataURL("image/png");
    if (!data_url.startsWith("data:image/png") || data_url.length > MAX_DATA_URL) return null;
    return { data_url, width, height, mime: "image/png" };
  } catch {
    return null;
  }
}

const readAs = (f: Blob, how: "text" | "url") =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    if (how === "text") r.readAsText(f);
    else r.readAsDataURL(f);
  });

function svgSize(text: string): { width: number; height: number } {
  const vb = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(text);
  if (vb) return { width: Math.round(+vb[1]), height: Math.round(+vb[2]) };
  const w = /\swidth\s*=\s*["']([\d.]+)/i.exec(text);
  const h = /\sheight\s*=\s*["']([\d.]+)/i.exec(text);
  return { width: w ? Math.round(+w[1]) : 300, height: h ? Math.round(+h[1]) : 300 };
}

export async function prepareImage(file: File): Promise<PreparedImage | UploadError> {
  if (!TYPES.includes(file.type)) return "badType";
  if (file.type === "image/svg+xml") {
    const text = await readAs(file, "text");
    if (!isSafeSvg(text)) return "unsafe";
    const bytes = new TextEncoder().encode(text);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000)
      bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    const data_url = `data:image/svg+xml;base64,${btoa(bin)}`;
    const png = await rasterizeSvg(data_url, svgSize(text));
    if (png) return png;
    if (data_url.length > MAX_DATA_URL) return "tooBig";
    return { data_url, mime: file.type, ...svgSize(text) };
  }
  const src = await readAs(file, "url");
  const img = new Image();
  await new Promise<void>((res, rej) => {
    img.onload = () => res();
    img.onerror = () => rej(new Error("INVALID_IMAGE"));
    img.src = src;
  });
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  if (scale === 1 && src.length <= MAX_DATA_URL)
    return { data_url: src, width, height, mime: file.type };
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
  // الشفافية تحتاج PNG/WebP؛ JPG يبقى JPG بجودة عالية.
  const mime = file.type === "image/jpeg" ? "image/jpeg" : "image/webp";
  for (const q of [0.92, 0.85, 0.75]) {
    const data_url = canvas.toDataURL(mime, q);
    if (data_url.startsWith(`data:${mime}`) && data_url.length <= MAX_DATA_URL)
      return { data_url, width, height, mime };
  }
  return "tooBig";
}
