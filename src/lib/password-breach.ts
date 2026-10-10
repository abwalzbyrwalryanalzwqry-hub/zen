/**
 * هل ظهرت كلمة المرور في تسريبات بيانات معروفة؟ (تدقيق أكتوبر 2026، المرحلة 3.1)
 *
 * k-anonymity من Have I Been Pwned: يُرسل أول 5 محارف من بصمة SHA-1 فقط، وتعود كل اللواحق المطابقة لها،
 * والمقارنة على الجهاز. كلمة المرور وبصمتها الكاملة لا تغادران الجهاز. فحص إرشادي يفشل مفتوحاً: انقطاع
 * الشبكة أو بطء الخدمة لا يمنع التسجيل (الحَكَم الإلزامي قاعدة الخادم وقائمة الكلمات الشائعة).
 */
const RANGE_URL = "https://api.pwnedpasswords.com/range/";
const TIMEOUT_MS = 2500;

export async function sha1Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

/** عدد مرات الظهور في التسريبات، أو 0 إن لم تظهر أو تعذّر الفحص. */
export async function breachCount(
  password: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<number> {
  if (!password || typeof fetchImpl !== "function") return 0;
  try {
    const hash = await sha1Hex(password);
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      // Add-Padding: الاستجابة بحجم ثابت تقريباً فلا يُستدل من حجمها على البادئة.
      const res = await fetchImpl(RANGE_URL + prefix, {
        headers: { "Add-Padding": "true" },
        signal: ctrl.signal,
      });
      if (!res.ok) return 0;
      for (const line of (await res.text()).split("\n")) {
        const [s, n] = line.trim().split(":");
        if (s === suffix) return Number(n) || 0;
      }
      return 0;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return 0;
  }
}
