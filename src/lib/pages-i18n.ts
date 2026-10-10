/**
 * قاموس الشاشات المستقلة («المساعدة» وملاحظات «ما الجديد» و«عن زِن» والمحادثات والعائلة والإشعارات وصفحة الطالب
 * والتحقق وصحة التطبيق والاستيراد): يُحمَّل معها فقط ولا يثقل الحزمة
 * الأولى (فحص 2026-10، P1-1)، على نمط قاموس التقارير. العربية فوراً (متزامن قبل أول رسم).
 * يُنادى `usePagesDict()` في أول مكوّن الشاشة.
 */
import { useState } from "react";
import { extendDict } from "@/lib/i18n";
import ar from "@/locales/pages/ar.json";

export function ensurePagesDict(): Promise<void> {
  extendDict("ar", ar);
  return Promise.resolve();
}

/** يضمن القاموس قبل أول رسم للشاشة (التهيئة الكسولة تعمل مرة واحدة). */
export function usePagesDict(): void {
  useState(() => void ensurePagesDict());
}
