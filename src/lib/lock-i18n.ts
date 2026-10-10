/**
 * قاموس قفل التطبيق (`appLock.*`): يُحمَّل مع شاشة القفل وصفحة إعداداته فقط ولا يثقل الحزمة الأولى،
 * على نمط قاموس المصحف (`mushaf-i18n`). العربية متزامنة قبل أول رسم
 * (والبوّابة تنتظرها قبل عرض شاشة القفل).
 */
import { useState } from "react";
import { extendDict } from "@/lib/i18n";
import ar from "@/locales/lock/ar.json";

export function ensureLockDict(): Promise<void> {
  extendDict("ar", ar);
  return Promise.resolve();
}

export function useLockDict(): void {
  useState(() => void ensureLockDict());
}
