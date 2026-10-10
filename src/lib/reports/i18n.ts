/**
 * قاموس التقارير وسجل الإنجاز: يُحمَّل مع شاشاتهما فقط (لا يثقل الحزمة الأولى). العربية فوراً، وبقية اللغات
 * عند الحاجة. يُنادى `ensureReportsDict()` صراحةً في أعلى وحدة الشاشة (الحزمة sideEffects: false، فالاستيراد
 * المجرّد يُحذف عند البناء).
 */
import { extendDict } from "@/lib/i18n";
import ar from "@/locales/reports/ar.json";

export function ensureReportsDict(): Promise<void> {
  extendDict("ar", ar);
  return Promise.resolve();
}
