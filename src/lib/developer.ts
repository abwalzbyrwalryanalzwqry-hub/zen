/**
 * بيانات المطور لقسم «عن المطور». ثابتة داخل الحزمة (تعمل دون اتصال)، ولا تُرسل إلى أي خادم.
 * القيم المعروضة كما زوّدنا بها صاحب التطبيق حرفياً؛ الروابط مشتقة منها فقط:
 *  - الجوال بمفتاح اليمن الدولي (+967) ليعمل الاتصال من أي شبكة.
 *  - واتساب يفتح محادثة مع رقم الجوال نفسه (wa.me) لأن واتساب لا يفتح المعرّفات بروابط.
 *  - فيسبوك بحث عن الاسم المعطى (لا يوجد رابط حساب محدد).
 *  - تلجرام بالمعرّف المعطى (t.me).
 */

export type DeveloperContactKey =
  "phone" | "email" | "whatsapp" | "facebook" | "telegram" | "address";

export type DeveloperContact = {
  key: DeveloperContactKey;
  /** النص المعروض كما هو. */
  value: string;
  /** الرابط الذي يفتحه الضغط؛ null للبيانات غير التفاعلية (العنوان). */
  href: string | null;
  /** يفتح خارج التطبيق عبر الإنترنت (للتنبيه عند انقطاع الاتصال). */
  needsNetwork: boolean;
  /** نص لاتيني/أرقام: يُعرض LTR داخل الواجهة العربية. */
  ltr: boolean;
};

export const DEVELOPER_NAME = "م. إدريس الزوقري";

const PHONE_LOCAL = "776343551";
const PHONE_INTL = "967" + PHONE_LOCAL;
const EMAIL = "zoqriidris@gmail.com";
const HANDLE = "rzleelzr";
const FACEBOOK_NAME = "إدريس الزوقري";

export const DEVELOPER_CONTACTS: DeveloperContact[] = [
  { key: "phone", value: PHONE_LOCAL, href: `tel:+${PHONE_INTL}`, needsNetwork: false, ltr: true },
  { key: "email", value: EMAIL, href: `mailto:${EMAIL}`, needsNetwork: false, ltr: true },
  {
    key: "whatsapp",
    value: `@${HANDLE}`,
    href: `https://wa.me/${PHONE_INTL}`,
    needsNetwork: true,
    ltr: true,
  },
  {
    key: "facebook",
    value: FACEBOOK_NAME,
    href: `https://www.facebook.com/search/top?q=${encodeURIComponent(FACEBOOK_NAME)}`,
    needsNetwork: true,
    ltr: false,
  },
  {
    key: "telegram",
    value: `@${HANDLE}`,
    href: `https://t.me/${HANDLE}`,
    needsNetwork: true,
    ltr: true,
  },
  { key: "address", value: "اليمن _ إب _ جوبلة", href: null, needsNetwork: false, ltr: false },
];
