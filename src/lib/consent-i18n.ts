/**
 * قاموس موافقة التحليل الآلي للصوت (`recitationConsent.*`): يُحمَّل مع شاشات التسميع فقط ولا يثقل
 * الحزمة الأولى، على نمط قاموس القفل (`lock-i18n`).
 */
import { useState } from "react";
import { extendDict } from "@/lib/i18n";
import ar from "@/locales/consent/ar.json";

export function ensureConsentDict(): Promise<void> {
  extendDict("ar", ar);
  return Promise.resolve();
}

export function useConsentDict(): void {
  useState(() => void ensureConsentDict());
}
