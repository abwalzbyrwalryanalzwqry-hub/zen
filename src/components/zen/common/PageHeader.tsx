import type { ReactNode } from "react";
import { BackButton } from "@/components/zen/BackButton";

/**
 * رأس الصفحة الموحَّد (فحص الأقسام P1): عنوان وسطر وصف وإجراءات. صفحات الشريط السفلي الجذرية
 * بلا زر رجوع؛ الصفحات الفرعية تمرّر `back` (مسار الرجوع إن لم يكن تاريخ داخل التطبيق).
 */
export function PageHeader({
  title,
  subtitle,
  back,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  back?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="px-5 pt-12 pb-3 flex items-center gap-3">
      {back && <BackButton fallback={back} />}
      <div className="flex-1 min-w-0">
        <h1 className="text-xl font-black text-foreground truncate">{title}</h1>
        {subtitle && <p className="text-[0.6875rem] text-muted-foreground truncate">{subtitle}</p>}
      </div>
      {actions}
    </header>
  );
}
