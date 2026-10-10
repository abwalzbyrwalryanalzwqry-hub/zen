/**
 * قراءة جسم طلب دالة Edge بحدّ للحجم (تدقيق 1.6). `req.json()` يقرأ الجسم كاملاً في الذاكرة قبل أي تحقق،
 * فطلب ضخم واحد يستهلك ذاكرة الدالة. هنا: `Content-Length` المعلَن أولاً، ثم عدّ البايتات أثناء القراءة
 * (لأن الترويسة قد تغيب مع الإرسال المجزّأ). بلا اعتماديات، ونسخته المطابقة في `_shared/edge-http.ts`.
 */

export class BodyTooLargeError extends Error {
  status = 413;
  constructor(public limit: number) {
    super("الطلب أكبر من المسموح.");
    this.name = "BodyTooLargeError";
  }
}

/** حدود الأجسام لكل دالة (بايت). */
export const BODY_LIMITS = {
  /** 30 رسالة × 4000 محرف عربي (≈ 240KB) مع هامش. */
  ai: 512 * 1024,
  /** مقطع تسميع مباشر 400KB بـ base64 (≈ 540KB) مع هامش. */
  recitation: 1024 * 1024,
  tools: 256 * 1024,
  push: 16 * 1024,
} as const;

/** يقرأ JSON بحدّ أقصى للحجم. الجسم الفارغ أو غير الصالح ⇒ `{}` (كالسلوك السابق). */
export async function readJsonLimited(
  req: Request,
  maxBytes: number,
): Promise<Record<string, unknown>> {
  const declared = Number(req.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes) throw new BodyTooLargeError(maxBytes);
  if (!req.body) return {};
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new BodyTooLargeError(maxBytes);
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    buf.set(c, off);
    off += c.byteLength;
  }
  try {
    const v = JSON.parse(new TextDecoder().decode(buf));
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
