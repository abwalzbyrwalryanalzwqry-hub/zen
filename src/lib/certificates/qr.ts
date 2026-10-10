/**
 * QR الشهادة: يفتح شاشة التحقق داخل التطبيق مباشرة من كاميرا الجوال (zen://verify?code=…، رابط عميق
 * مسجّل في Android)، والماسح داخل التطبيق يقرؤه كذلك مع الصيغة القديمة zen-cert:. لا بيانات خاصة في الرمز:
 * رمز التحقق وحده.
 *
 * 1.23.0 (فحص الاستوديو H1): إن ضُبط `VITE_PUBLIC_VERIFY_URL` في البناء (صفحة verify/ في الموقع العام) صار الرمز
 * رابط https يفتحه أي جوال بلا التطبيق، وفيه «افتح في تطبيق زِن». الماسح يقرأ الصيغتين (parseVerifyCode).
 */
export const VERIFY_LINK_PREFIX = "zen://verify?code=";

export function verifyLinkFor(code: string, publicBase?: string | null): string {
  const base = (publicBase ?? "").trim();
  if (/^https:\/\/[^\s?#]+$/.test(base))
    return `${base}${base.endsWith("/") ? "" : "/"}?code=${code}`;
  return `${VERIFY_LINK_PREFIX}${code}`;
}

export const verifyLink = (code: string) =>
  verifyLinkFor(code, import.meta.env.VITE_PUBLIC_VERIFY_URL as string | undefined);
/** مسار التحقق داخل التطبيق (للمشاركة النصية وللانتقال المباشر). */
export const verifyPath = (code: string) => `/verify?code=${encodeURIComponent(code)}`;

/** SVG متجه للرمز (يبقى حاداً في PDF). يُحمَّل qrcode عند الحاجة فقط. */
export async function qrSvg(payload: string, dark = "#1d2a24", light = "#ffffff"): Promise<string> {
  const QR = await import("qrcode");
  const svg = await QR.toString(payload, {
    type: "svg",
    margin: 0,
    errorCorrectionLevel: "M",
    color: { dark, light },
  });
  return svg.replace(
    "<svg ",
    '<svg width="100%" height="100%" preserveAspectRatio="xMidYMid meet" ',
  );
}
