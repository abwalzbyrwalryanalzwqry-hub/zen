/**
 * وصول آمن إلى localStorage (تدقيق أكتوبر 2026، المرحلة 4).
 *
 * `localStorage` نفسه قد يرمي: يكون غير معرَّف على الخادم، ويرمي SecurityError حين يُعطَّل التخزين في المتصفح
 * (حظر ملفات تعريف الارتباط، وبعض أوضاع التصفح الخاص وWebView)، ويرمي QuotaExceededError عند الامتلاء. ونداء
 * مباشر في أول عرض (كالسمة ووضع الشاشة الرئيسية) كان يُسقط التطبيق كله. هنا لا شيء يرمي: القراءة الفاشلة
 * تعيد `null`، والكتابة الفاشلة تعيد `false`.
 *
 * الملفات الجديدة تستعمل هذه الوحدة، وقاعدة ESLint `no-restricted-properties` تمنع غيرها. أما الملفات القديمة
 * المستثناة في `eslint.config.js` فتُنقل إليها بالتدريج.
 */

// مختصرة عمداً: في الحزمة الأولى (السمة وشاشة البداية)، والميزانية 190KB.
const store = (): Storage => window.localStorage; // يرمي على الخادم وحين يُعطَّل التخزين، والنداءات تلتقطه.

export function readLocal(key: string): string | null {
  try {
    return store().getItem(key);
  } catch {
    return null;
  }
}

export function writeLocal(key: string, value: string): boolean {
  try {
    store().setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function removeLocal(key: string): void {
  try {
    store().removeItem(key);
  } catch {
    /* لا شيء نفعله */
  }
}

/** JSON مخزَّن، و`fallback` عند الغياب أو التلف. */
export function readLocalJson<T>(key: string, fallback: T): T {
  try {
    const raw = store().getItem(key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writeLocalJson(key: string, value: unknown): boolean {
  try {
    return writeLocal(key, JSON.stringify(value));
  } catch {
    return false;
  }
}
