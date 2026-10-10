/**
 * قاموس السجل اليومي (`dailyRecord.*`، نحو 5KB gzip): خارج الحزمة الأولى، فلا يُحمَّل إلا مع الوحدات التي تستعمله
 * (السجل اليومي والتقارير وجودة السجل ونظرة الطالب والإشعارات). كل وحدة تستعمل مفاتيحه تنادي
 * `ensureRegisterDict()` في أعلاها صراحةً (الحزمة sideEffects: false، فالاستيراد المجرّد يُحذف عند البناء)،
 * فالقاموس حاضر قبل أي t() منها. أما ملفات المسارات فتُبنى أعلاها في الحزمة الأولى (head)، فتنادي
 * `useRegisterDict()` داخل المكوّن، وعنوانا الصفحتين (`dailyRecord.title` و`reports`) في القاموس الرئيسي. القرار 0010.
 */
import { useState } from "react";
import { extendDict } from "@/lib/i18n";
import ar from "@/locales/register/ar.json";

export function ensureRegisterDict(): void {
  extendDict("ar", ar);
}

/** لملفات المسارات: يضمن القاموس قبل أول رسم دون أن يدخل الحزمة الأولى. */
export function useRegisterDict(): void {
  useState(ensureRegisterDict);
}
