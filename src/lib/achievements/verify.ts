/**
 * التحقق من الشهادات (10.2): رمز من 16 حرفاً يُطبع على الشهادة نصاً وQR (`zen-cert:<code>`).
 * يتحقق منه أي مستخدم مسجّل من شاشة «تحقّق من شهادة» في التطبيق.
 */
import { supabase } from "@/integrations/supabase/client";

export const CERT_QR_PREFIX = "zen-cert:";
const ALPHABET = /^[A-HJ-NP-Z2-9]{16}$/;

export const certQrPayload = (code: string) => `${CERT_QR_PREFIX}${code}`;

/** يُطبع مقسّماً XXXX-XXXX-XXXX-XXXX ليسهل نقله باليد. */
export const formatVerifyCode = (code: string) => code.replace(/(.{4})(?=.)/g, "$1-");

/**
 * من نص ممسوح أو مكتوب: يقبل البادئة `zen-cert:` (شهادات الجزء) ورابط `zen://verify?code=` أو
 * `…/verify?code=` (شهائد الاستوديو — يفتحه ماسح الكاميرا مباشرة في التطبيق)، والشرطات والمسافات والصغيرة.
 */
export function parseVerifyCode(text: string): string | null {
  let t = text.trim();
  const link = /[?&]code=([^&#\s]+)/i.exec(t);
  if (link && /verify/i.test(t)) t = decodeURIComponent(link[1]);
  if (t.toLowerCase().startsWith(CERT_QR_PREFIX)) t = t.slice(CERT_QR_PREFIX.length);
  const code = t.replace(/[\s-]/g, "").toUpperCase();
  return ALPHABET.test(code) ? code : null;
}

export type VerifyResult =
  | {
      status: "valid";
      kind?: "auto";
      student_name: string;
      juz: number;
      halaqa_name: string | null;
      center_name: string | null;
      teacher_name: string | null;
      decided_at: string | null;
      serial: string;
    }
  | {
      /** شهادة من استوديو الشهائد: صحيحة أو ملغاة أو مستبدَلة بأحدث (لا يُحذف شيء). */
      status: "valid" | "revoked" | "replaced";
      kind: "studio";
      certificate_number: string | null;
      student_name: string;
      center_name: string | null;
      halaqa_name: string | null;
      type_name: string | null;
      issue_date: string | null;
      revoked_at: string | null;
      /** رقم الشهادة البديلة إن أُعيد إصدارها (1.22.0). */
      replaced_by?: string | null;
      /** أرشفها المركز من قوائمه؛ لا يغيّر صحتها. */
      archived?: boolean;
      /** صدرت باعتماد إدارة المركز (1.24.0). */
      approved?: boolean;
      approved_at?: string | null;
      /** بصمة SHA-256 للّقطة (1.26.0). */
      fingerprint?: string | null;
    }
  | { status: "invalid" }
  | { status: "rate_limited" };

export async function verifyCertificate(code: string): Promise<VerifyResult> {
  const { data, error } = await supabase.rpc("verify_certificate", { _code: code });
  if (error) throw new Error("تعذّر التحقق. تحقّق من الاتصال.");
  return data as unknown as VerifyResult;
}
