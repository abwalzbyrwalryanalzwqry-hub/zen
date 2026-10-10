/**
 * هوية المركز للشهائد (centers.certificate_brand): مراجع لأصول المركز لا صور مكرّرة.
 *   { logo, logo_white, stamp, signatures: { supervisor, director }, signers: { director: {name,title} … },
 *     colors: { primary, accent }, officialName }
 * توقيع المعلّم شخصي: أصل توقيع رفعه المعلّم نفسه (label = "teacher").
 * قبل الإصدار تُحلّ مراجع brand:* إلى asset:<id> فتُجمَّد الشهادة بهوية يوم إصدارها.
 */
import { cloneDesign, type Design, type Palette } from "./model";

export type SignerRole = "teacher" | "supervisor" | "director";
export const SIGNER_ROLES: SignerRole[] = ["teacher", "supervisor", "director"];

export interface CertBrand {
  logo?: string | null;
  logo_white?: string | null;
  stamp?: string | null;
  signatures?: Partial<Record<Exclude<SignerRole, "teacher">, string | null>>;
  signers?: Partial<Record<SignerRole, { name?: string; title?: string }>>;
  colors?: { primary?: string | null; accent?: string | null };
  officialName?: string | null;
  /** 1.24.0: كل شهادة من غير المدير تنتظر اعتماده (private.cert_approval_reasons). */
  requireApproval?: boolean;
  /** 1.24.0: رمز المركز في الرقم ZEN-<رمز>-YYYY-NNNN (2–6 حروف لاتينية كبيرة أو أرقام، فريد). */
  numberPrefix?: string | null;
}

/** ما يقبله الخادم رمزاً للترقيم؛ غيره يُتجاهل ويُشتقّ رمز من بصمة المركز. */
export const cleanNumberPrefix = (v: string) =>
  v
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);

/** خريطة brand:<key> ← asset:<id> للرسم. */
export function brandRefs(
  brand: CertBrand | null,
  teacherSignature?: string | null,
): Record<string, string> {
  const out: Record<string, string> = {};
  const put = (k: string, id?: string | null) => {
    if (id) out[k] = `asset:${id}`;
  };
  put("logo", brand?.logo);
  put("logo_white", brand?.logo_white ?? brand?.logo);
  put("stamp", brand?.stamp);
  put("signature:supervisor", brand?.signatures?.supervisor);
  put("signature:director", brand?.signatures?.director);
  put("signature:teacher", teacherSignature);
  return out;
}

const HEX = /^#[0-9a-f]{6}$/i;

/** لوحة القالب بألوان المركز (إن وُجدت وكانت صالحة). */
export function brandPalette(p: Palette, brand: CertBrand | null): Palette {
  const c = brand?.colors;
  return {
    ...p,
    primary: c?.primary && HEX.test(c.primary) ? c.primary : p.primary,
    accent: c?.accent && HEX.test(c.accent) ? c.accent : p.accent,
  };
}

/**
 * يجمّد التصميم للإصدار: brand:* ← asset:<id> (أو يُحذف المرجع إن لم تُضبط الهوية، فلا يُرسل مرجع ناقص)،
 * واسم الموقّع الفارغ يُملأ من الهوية (مدير المركز/المشرف) — المعلّم من {{teacher.name}}.
 */
export function freezeBrand(
  d: Design,
  brand: CertBrand | null,
  refs: Record<string, string>,
): Design {
  const out = cloneDesign(d);
  const res = (src: string | null | undefined) =>
    src && src.startsWith("brand:") ? (refs[src.slice(6)] ?? "") : (src ?? "");
  if (out.page.backgroundImage) out.page.backgroundImage = res(out.page.backgroundImage) || null;
  for (const e of out.elements) {
    if (e.type === "image") e.src = res(e.src);
    if (e.type === "signature") {
      const role = e.src?.startsWith("brand:signature:") ? (e.src.slice(16) as SignerRole) : null;
      e.src = res(e.src) || null;
      if (role && !e.signer.trim()) e.signer = brand?.signers?.[role]?.name ?? "";
      if (role && brand?.signers?.[role]?.title) e.label = brand.signers[role]!.title!;
    }
  }
  return out;
}

/** هل في التصميم مرجع هوية غير محلول؟ (يمنعه الخادم كذلك: UNRESOLVED_BRAND). */
export const hasBrandRefs = (d: Design) => /"brand:[a-z_:]+"/.test(JSON.stringify(d));
