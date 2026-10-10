/**
 * قاموس قارئ المصحف (`mushafReader.*`): يُحمَّل مع شاشات المصحف فقط ولا يثقل الحزمة الأولى،
 * على نمط قاموس الشاشات المستقلة (`pages-i18n`). العربية تُضاف متزامنة عند استيراد الوحدة
 * (قبل أول رسم). نصوص مؤقّت التلاوة وحدها في القاموس الرئيسي لأن
 * شريط التلاوة العائم في الحزمة الأولى.
 */
import { useState } from "react";
import { extendDict } from "@/lib/i18n";
import ar from "@/locales/mushaf/ar.json";

export function ensureMushafDict(): Promise<void> {
  extendDict("ar", ar);
  return Promise.resolve();
}

/**
 * لملفات المسارات: نداء الوحدة في أعلى ملف المسار يُدخل القاموس في الحزمة الأولى (تعريف المسار
 * يُحمَّل مبكراً)، أما داخل المكوّن فيُقسَم معه.
 */
export function useMushafDict(): void {
  useState(() => void ensureMushafDict());
}
