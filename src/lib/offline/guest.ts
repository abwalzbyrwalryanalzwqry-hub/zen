/**
 * وضع الضيف (نسخة Android دون اتصال): يفتح ما يعمل على الجهاز وحده — المصحف، والاختبارات
 * القرآنية، و«محاسبتي»، ومواقيت الصلاة — بلا حساب ولا شبكة. كل بياناته في localStorage تحت
 * معرّف ثابت لا يطابق أي مستخدم حقيقي، ولا يُرسَل منها شيء إلى الخادم (انظر offline-fetch.ts).
 */

export const GUEST_ID = "00000000-0000-4000-8000-000000000000";
const KEY = "zen-guest";
const EVENT = "zen-guest-change";

export function isGuest(): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setGuest(on: boolean): void {
  if (typeof localStorage === "undefined") return;
  try {
    if (on) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {
    /* تخزين ممتلئ أو محظور: يبقى الوضع كما هو */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function onGuestChange(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}

/** المسارات المتاحة للضيف؛ غيرها يعرض دعوة لتسجيل الدخول. */
const GUEST_PREFIXES = [
  "/today",
  "/mushaf",
  "/exams",
  "/muhasaba",
  "/settings",
  "/more",
  "/about",
  "/help",
  "/storage",
];

export function guestAllowed(path: string): boolean {
  return GUEST_PREFIXES.some((p) => path === p || path.startsWith(p + "/"));
}
