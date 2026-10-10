import type { ReactNode } from "react";
import { PhoneFrame } from "@/components/zen/PhoneFrame";
import { BackButton } from "@/components/zen/BackButton";

/**
 * غلاف الصفحات الفرعية لـ«المزيد» (تحليل «المزيد» IA-09/IA-10): رأس برجوع إلى أبيها، وبلا شريط سفلي،
 * وحشوة سفلية ثابتة بلا `pb-28` لشريط غير موجود.
 */
export function SettingsShell({
  title,
  fallback = "/more",
  trailing,
  children,
}: {
  title: string;
  fallback?: string;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  return (
    <PhoneFrame>
      <div className="flex-1 flex flex-col">
        <header className="px-5 pt-12 pb-3 flex items-center gap-3">
          <BackButton fallback={fallback} />
          <h1 className="flex-1 min-w-0 text-xl font-black text-foreground truncate">{title}</h1>
          {trailing}
        </header>
        <div className="flex-1 overflow-y-auto px-3 pb-8 space-y-4">{children}</div>
      </div>
    </PhoneFrame>
  );
}

/** صف إعداد: عنوان ووصف اختياري، وعنصر التحكّم في الطرف. */
export function SettingRow({
  id,
  label,
  hint,
  control,
}: {
  id: string;
  label: string;
  hint?: string;
  control: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <p id={id} className="text-sm font-bold text-foreground">
          {label}
        </p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {control}
    </div>
  );
}
