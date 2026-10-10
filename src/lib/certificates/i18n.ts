/**
 * قاموس استوديو الشهائد: يُحمَّل مع شاشاته فقط (لا يثقل الحزمة الأولى)، على نمط قاموس التقارير. يحتاج
 * الاستوديو قاموس التقارير كذلك (نصوص المحطات من سجل الإنجاز).
 */
import { useState } from "react";
import { extendDict, t } from "@/lib/i18n";
import { ensureReportsDict } from "@/lib/reports/i18n";
import ar from "@/locales/certificates/ar.json";

export function ensureCertificatesDict(): Promise<void> {
  extendDict("ar", ar);
  return ensureReportsDict();
}

export function useCertificatesDict(): void {
  useState(() => void ensureCertificatesDict());
}
