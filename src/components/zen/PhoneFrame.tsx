import { lazy, Suspense, type ReactNode } from "react";
import { IS_NATIVE_BUILD } from "@/lib/offline/native-shim";
import { useOptionalRecitationPlayer } from "@/hooks/quran/recitation-host";

// شريط التلاوة العائم يُحمَّل عند وجود تلاوة جارية فقط، لا في الحزمة الأولى (M1).
const GlobalRecitationBar = lazy(() =>
  import("@/components/zen/quran/recitation-bar").then((m) => ({
    default: m.GlobalRecitationBar,
  })),
);

/**
 * إطار الشاشة. ارتفاعه ارتفاع الشاشة بالضبط (100dvh)، فلا تتمرّر الصفحة كلها كموقع ويب،
 * بل تتمرّر المنطقة الوسطى وحدها ويبقى الرأس والشريط السفلي ثابتين.
 * - تطبيق الهاتف: ملء الشاشة دائماً، مع هوامش الأمان (شريط الحالة وشريط الإيماءات) — لا إطار «جوال» حتى على الأجهزة اللوحية.
 * - الويب: ملء الشاشة على الجوال، وإطار جوال في الوسط على الشاشات الواسعة.
 */
export function PhoneFrame({
  children,
  pattern = true,
}: {
  children: ReactNode;
  pattern?: boolean;
}) {
  const outer = IS_NATIVE_BUILD
    ? "h-[100dvh] w-full flex justify-center overflow-hidden bg-background"
    : "h-[100dvh] w-full flex items-stretch sm:items-center justify-center p-0 sm:p-6 overflow-hidden";
  const frame = IS_NATIVE_BUILD
    ? "zen-safe relative w-full max-w-[640px] h-full overflow-clip bg-background flex flex-col"
    : "zen-safe relative w-full max-w-[440px] h-full sm:h-[880px] sm:max-h-full sm:rounded-[44px] overflow-clip shadow-2xl bg-background flex flex-col";
  const playing = !!useOptionalRecitationPlayer()?.track;
  return (
    <div className={outer} dir="rtl">
      <div className={frame}>
        {/* الزخارف في طبقة قصّ مستقلة: البقعتان تخرجان عن حدود الإطار (‎-left-20‎)، ولو كانتا داخل
            الإطار مباشرة لصار قابلاً للتمرير أفقياً برمجياً (overflow:hidden يبقى حاوية تمرير)،
            فيزيحه أندرويد عند ظهور لوحة المفاتيح لإظهار الحقل — فتنقطع الواجهة من جانب ويظهر فراغ في الآخر. */}
        <div aria-hidden="true" className="absolute inset-0 overflow-hidden pointer-events-none">
          {pattern && (
            <div className="absolute inset-0 bg-pattern opacity-[0.06] dark:opacity-[0.08]" />
          )}
          <div className="absolute -top-32 -right-32 w-80 h-80 rounded-full bg-primary/25 blur-3xl" />
          <div className="absolute -bottom-40 -left-20 w-96 h-96 rounded-full bg-gold/15 blur-3xl" />
        </div>
        <div className="zen-frame relative flex-1 min-h-0 flex flex-col z-10 overflow-y-auto overflow-x-hidden overscroll-contain">
          {children}
        </div>
        {/* تلاوة المصحف الجارية تبقى في المتناول من أي شاشة. */}
        {playing && (
          <Suspense fallback={null}>
            <GlobalRecitationBar />
          </Suspense>
        )}
      </div>
    </div>
  );
}
