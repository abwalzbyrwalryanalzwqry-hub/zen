/**
 * الحضور برمز QR (9.2). المعلّم: `issue_attendance_code` كل 30 ثانية ويعرض الرمز QR وأرقاماً.
 * الطالب: يمسح بماسح Google (ML Kit، Android) أو يكتب الأرقام الستة، ثم `check_in`.
 */
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";

export const CODE_TTL_MS = 30_000;
const PREFIX = "zen-attend:";

export const qrPayload = (code: string) => `${PREFIX}${code}`;

/** الأرقام الستة من نص الرمز الممسوح أو المكتوب (يقبل «zen-attend:123456» أو «123 456»). */
export function parseCode(text: string): string | null {
  const t = text.trim();
  const raw = t.startsWith(PREFIX) ? t.slice(PREFIX.length) : t;
  const digits = raw
    .replace(/[\s-]/g, "")
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  return /^\d{6}$/.test(digits) ? digits : null;
}

/** الثواني المتبقية لصلاحية الرمز (لا تقل عن 0). */
export const secondsLeft = (expiresAt: string, now = Date.now()) =>
  Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 1000));

export type IssuedCode = { code: string; expires_at: string; halaqa_id: string };
export type CheckInResult = {
  status: "checked_in" | "already" | "invalid";
  attendance?: string;
  halaqa?: string;
};

export async function issueCode(halaqa: string): Promise<IssuedCode> {
  const { data, error } = await supabase.rpc("issue_attendance_code", { _halaqa: halaqa });
  if (error) throw error;
  return data as unknown as IssuedCode;
}

export async function checkIn(code: string): Promise<CheckInResult> {
  const { data, error } = await supabase.rpc("check_in", { _code: code });
  if (error) {
    if (error.message?.includes("TOO_MANY_ATTEMPTS"))
      throw new Error("محاولات كثيرة. انتظر دقيقة ثم أعد المحاولة.");
    throw new Error("تعذّر تسجيل الحضور. تحقّق من الاتصال.");
  }
  return data as unknown as CheckInResult;
}

export function checkInMessage(r: CheckInResult): string {
  if (r.status === "checked_in") return `سُجّل حضورك في ${r.halaqa ?? "الحلقة"}.`;
  if (r.status === "already") return `حضورك مسجَّل اليوم في ${r.halaqa ?? "الحلقة"} من قبل.`;
  return "الرمز منتهٍ أو غير صحيح. اطلب من المعلّم الرمز الحالي.";
}

export const canScan = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";

/** يمسح QR بماسح Google ويعيد نصه الخام؛ يثبّت وحدة الماسح أول مرة. يعيد null عند الإلغاء. */
export async function scanRaw(): Promise<string | null> {
  const { BarcodeScanner, BarcodeFormat } = await import("@capacitor-mlkit/barcode-scanning");
  const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
  if (!available) {
    await BarcodeScanner.installGoogleBarcodeScannerModule();
    throw new Error("يُنزَّل الماسح الآن من Google Play. أعد المحاولة بعد لحظات، أو اكتب الرمز.");
  }
  try {
    const { barcodes } = await BarcodeScanner.scan({ formats: [BarcodeFormat.QrCode] });
    return barcodes[0]?.rawValue ?? null;
  } catch (e) {
    if (/cancel/i.test(e instanceof Error ? e.message : String(e))) return null;
    throw e;
  }
}

/** رمز الحضور الممسوح (الأرقام الستة) أو null. */
export async function scanCode(): Promise<string | null> {
  const raw = await scanRaw();
  return raw ? parseCode(raw) : null;
}

/** QR بصيغة SVG (مكتبة qrcode تُحمَّل عند الحاجة فقط). */
export async function qrSvg(text: string): Promise<string> {
  const QR = await import("qrcode");
  return QR.toString(text, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
}
