import { lazy, Suspense, useSyncExternalStore, type ReactNode } from "react";
import { Capacitor } from "@capacitor/core";

// منطق القفل كله خارج الحزمة الأولى: يُحمَّل في تطبيق Android فقط (من ملفات الحزمة المحلية).
const AppLockRuntime = lazy(() => import("./AppLockRuntime"));

function nativeAndroid(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
  } catch {
    return false;
  }
}

const noop = () => () => undefined;

/**
 * false في الخادم وفي تمريرة الترطيب، ثم true: يطابق ما يُرسم في الترطيب ما رسمه الخادم (لا شيء)، فلا خطأ
 * ترطيب (#418) حين يختلف مسار Android عن الويب.
 */
function useHydrated(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}

/**
 * بوّابة قفل التطبيق حول التطبيق كله (__root.tsx). خارج Android (الويب والاختبارات) لا قفل: يُعرض التطبيق
 * كما كان. في Android لا يُرسم أي محتوى حتى تُحمَّل وحدة القفل وتصل حالته من الطبقة الأصلية، والغطاء الأصلي
 * يملأ الشاشة في أثناء ذلك.
 */
export function AppLockGate({ children }: { children: ReactNode }) {
  const hydrated = useHydrated();
  if (!hydrated) return null;
  if (!nativeAndroid()) return <>{children}</>;
  return (
    <Suspense fallback={null}>
      <AppLockRuntime>{children}</AppLockRuntime>
    </Suspense>
  );
}
