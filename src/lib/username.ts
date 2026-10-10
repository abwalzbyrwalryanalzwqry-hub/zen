/**
 * الدخول باسم مستخدم وكلمة مرور، بلا بريد ولا هاتف ولا أي خدمة رسائل خارجية.
 *
 * Supabase Auth يعمل بالبريد وكلمة المرور، فيُشتق من اسم المستخدم «بريد داخلي» لا يُرسل إليه شيء:
 *   `<sha256("zen-username:" + الاسم الموحَّد) أول 32 محرفاً>@users.zen.invalid`
 * - النطاق `.invalid` محجوز (RFC 2606) فلا يمكن أن يكون بريداً حقيقياً لأحد.
 * - البصمة تسمح بأسماء عربية (البريد يقبل ASCII فقط) وطولها ثابت.
 * - الحساب تُنشئه قاعدة البيانات (`register_username_account`) بالبصمة نفسها، مؤكَّداً دون رسالة،
 *   فلا يعتمد على إعداد «تأكيد البريد» في لوحة Supabase، ولا يُرسَل أي بريد أبداً.
 * - الدخول بعدها `signInWithPassword` العادي من Supabase Auth بالبريد الداخلي.
 */

export const USERNAME_EMAIL_DOMAIN = "users.zen.invalid";
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 24;
/** bcrypt يقرأ أول 72 بايت فقط: الأطول يُرفض بدل أن يُقصّ بصمت. */
export const PASSWORD_MAX_BYTES = 72;

const ARABIC_DIGITS = /[\u0660-\u0669\u06F0-\u06F9]/g;
/** التشكيل والتطويل لا يغيّران الاسم: «مُحَمَّد» و«محمد» اسم واحد. */
const ARABIC_MARKS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;
/** حرف (لاتيني صغير أو عربي) في البداية، ثم حروف وأرقام و`_` و`.`، بلا نقطتين متتاليتين أو نقطة في الطرفين. */
const USERNAME_RE =
  /^[a-z\u0621-\u064A](?:[a-z0-9_\u0621-\u064A]|\.(?!\.))*[a-z0-9_\u0621-\u064A]$/;

/** الصورة الموحَّدة التي تُحفظ ويُشتق منها البريد: تطبيع NFKC وحروف صغيرة وأرقام لاتينية. */
export function normalizeUsername(raw: string): string {
  return raw
    .normalize("NFKC")
    .replace(ARABIC_MARKS, "")
    .replace(ARABIC_DIGITS, (d) => {
      const c = d.charCodeAt(0);
      return String(c >= 0x06f0 ? c - 0x06f0 : c - 0x0660);
    })
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .trim()
    .toLowerCase();
}

/** رسالة الخطأ بالعربية، أو null إن كان الاسم صالحاً (بعد التوحيد). */
export function usernameError(raw: string): string | null {
  const u = normalizeUsername(raw);
  if (u.length === 0) return "اكتب اسم المستخدم.";
  if (/\s/.test(u)) return "اسم المستخدم بلا مسافات. استخدم _ أو . بين الكلمات.";
  if ([...u].length < USERNAME_MIN) return `اسم المستخدم ${USERNAME_MIN} أحرف على الأقل.`;
  if ([...u].length > USERNAME_MAX) return `اسم المستخدم ${USERNAME_MAX} حرفاً على الأكثر.`;
  if (/^[0-9_.]/.test(u)) return "ابدأ اسم المستخدم بحرف.";
  if (!USERNAME_RE.test(u)) return "اسم المستخدم حروف عربية أو إنجليزية وأرقام و _ و . فقط.";
  return null;
}

export function isValidUsername(raw: string): boolean {
  return usernameError(raw) === null;
}

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** البريد الداخلي لاسم مستخدم (بعد توحيده). يطابق ما تحسبه قاعدة البيانات حرفاً بحرف. */
export async function usernameToEmail(raw: string): Promise<string> {
  const hex = await sha256Hex(`zen-username:${normalizeUsername(raw)}`);
  return `${hex.slice(0, 32)}@${USERNAME_EMAIL_DOMAIN}`;
}

export function isInternalEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase().endsWith(`@${USERNAME_EMAIL_DOMAIN}`);
}

/** حقل الدخول يقبل اسم المستخدم، ويقبل البريد بصمت لحسابات أُنشئت به قبل هذا التغيير. */
export function looksLikeEmail(identifier: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(identifier.trim());
}

export function passwordTooLong(password: string): boolean {
  return new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES;
}

/**
 * اقتراح اسم مستخدم من اسم الطالب (المعلّم يعدّله إن شاء): الكلمات بـ `_`، وما لا يصلح يُحذف،
 * ويُضاف رقم إن بدأ بغير حرف أو قصر. النتيجة صالحة دائماً أو فارغة.
 */
export function suggestUsername(name: string, suffix = ""): string {
  const base = normalizeUsername(name)
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_.\u0621-\u064A]/g, "")
    .replace(/[_.]{2,}/g, "_")
    .replace(/^[0-9_.]+|[_.]+$/g, "");
  let u = [...base].slice(0, USERNAME_MAX - suffix.length).join("") + suffix;
  if ([...u].length < USERNAME_MIN) u = u ? `${u}_1`.slice(0, USERNAME_MAX) : "";
  return isValidUsername(u) ? u : "";
}
