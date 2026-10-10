/**
 * «اليوم» بتوقيت الجهاز (تدقيق 2026-10، المرحلة 1.1).
 *
 * `toISOString().slice(0, 10)` يعيد يوم **UTC**: في عدن (UTC+3) يخطئ بين 00:00 و03:00، وفي جاكرتا (UTC+7)
 * تُسجَّل حلقة الفجر عند 05:00 بتاريخ الأمس. أي تاريخ يعني «يوم المستخدم» يمرّ من هنا. الطوابع الزمنية من
 * قاعدة البيانات (`created_at`، `timestamptz` بصيغة UTC) تُحوَّل إلى يوم محلي بـ `localDayOf` لا بقصّ النص.
 * يحرس ذلك `no-restricted-syntax` في `eslint.config.js`، ويختبره `local-day.test.ts` بعدة مناطق زمنية.
 * نظير القاعدة 43 في SQL (`zen_today()`).
 */

const pad = (n: number) => String(n).padStart(2, "0");

/** YYYY-MM-DD بتوقيت الجهاز. */
export function localDayKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** يوم محلي لطابع زمني من الخادم (ISO بمنطقة) أو تاريخ مجرّد YYYY-MM-DD (يُعاد كما هو). */
export function localDayOf(ts: string | null | undefined): string {
  if (!ts) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(ts)) return ts;
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? ts.slice(0, 10) : localDayKey(d);
}

/** اليوم المحلي بعد (أو قبل) n يوماً، عند الظهيرة لتجنّب قفزات التوقيت الصيفي. */
export function addLocalDays(n: number, from: Date = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate(), 12);
  d.setDate(d.getDate() + n);
  return localDayKey(d);
}
