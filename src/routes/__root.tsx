import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { installAppResume } from "@/lib/app-resume";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  type ErrorComponentProps,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { lazy, Suspense, useEffect, type ReactNode } from "react";

import { dirOf, initLocale, useLocale } from "@/lib/i18n";
import { track } from "@/lib/usage";

import appCss from "../styles.css?url";
import { installNativeShell } from "../lib/native";
import { startNetworkMonitor } from "@/lib/network";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { installErrorMonitoring, reportError, RELEASE } from "../lib/monitoring";
import { applySystemFontScale, sendPendingCrashReport } from "../lib/native-system";
import { RecitationPlayerProvider } from "@/hooks/quran/recitation-host";
import { PERF_BOOT_SCRIPT } from "@/lib/perf-mode";
import { AppLockGate } from "@/components/zen/lock/AppLockGate";

// إشعارات تحميل التلاوات خارج الحزمة الأولى (M1): تُحمَّل بعد الإقلاع مباشرة، ولا تحميل قبل أن
// يفتح المستخدم شاشة التلاوات.
// sonner خارج الحزمة الأولى (M1)؛ `@/lib/toast` ينتظر تركيبه قبل أي إشعار.
const Toaster = lazy(() => import("@/components/ui/sonner"));
const RecitationDownloadNotifier = lazy(() =>
  import("@/components/zen/quran/recitation-bar").then((m) => ({
    default: m.RecitationDownloadNotifier,
  })),
);

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center" dir="rtl">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">الصفحة غير موجودة</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          الصفحة التي تبحث عنها غير موجودة أو نُقلت.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            الصفحة الرئيسية
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  const normalized = error instanceof Error ? error : new Error(String(error));
  console.error(normalized);
  const router = useRouter();
  const isConfig = normalized.message.includes("Missing Supabase environment");
  useEffect(() => {
    reportLovableError(normalized, { boundary: "tanstack_root_error_component" });
    reportError(normalized, { boundary: "root" });
    // يُبلّغ مرة واحدة لكل خطأ فعلي.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center" dir="rtl">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {isConfig ? "إعدادات الاتصال غير مكتملة" : "تعذّر تحميل الصفحة"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {isConfig
            ? "متغيّرات الاتصال بقاعدة البيانات غير موجودة في هذه النسخة. أعد ربط Lovable Cloud أو أضف ملف ‎.env‎."
            : "حدث خطأ غير متوقع. أعد المحاولة أو ارجع إلى الصفحة الرئيسية."}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            أعد المحاولة
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            الصفحة الرئيسية
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      // قفل التطبيق 1.29.0 (L6): CSP محافظة لا تكسر جسر Capacitor المضمَّن (لا script-src): لا إضافات
      // <object>/<embed>، ولا <base> يغيّر وجهة الروابط النسبية. التفاصيل في docs/APP_LOCK.md.
      { httpEquiv: "Content-Security-Policy", content: "object-src 'none'; base-uri 'self'" },
      { name: "theme-color", content: "#0d2a22" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "زِن" },
      { title: "Zen — تعلم القرآن بذكاء" },
      {
        name: "description",
        content: "زِن — منصة تعليمية ذكية للقرآن الكريم، تربط المعلم بالطالب بتجربة فاخرة وهادئة.",
      },
      { property: "og:title", content: "Zen — تعلم القرآن بذكاء" },
      { property: "og:description", content: "منصة رسائل تعليمية ذكية للقرآن الكريم." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      // خطوط نص القرآن (أميري قرآن، شهرزاد، نسخ) لقسم المصحف — مستضافة ذاتياً.
      { rel: "stylesheet", href: "/fonts/quran-fonts.css" },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "apple-touch-icon", href: "/icons/apple-touch-icon.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('zen-theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark')}var f=localStorage.getItem('zen-font');if(f==='sm'||f==='lg'||f==='xl'){document.documentElement.dataset.font=f}if(localStorage.getItem('zen-contrast')==='high'){document.documentElement.classList.add('hc')}var l=localStorage.getItem('zen-locale');if(l==='ar'){document.documentElement.lang=l;document.documentElement.dir='rtl'}${PERF_BOOT_SCRIPT}}catch(e){}`,
          }}
        />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  // تطبيق Android فقط: لا عامل خدمة (الملفات كلها داخل التطبيق)، والإشعارات من FCM.
  const locale = useLocale();
  useEffect(() => {
    installErrorMonitoring();
    void initLocale(); // اللغة المحفوظة واتجاهها (13.1)
    track("app_open"); // مرة في اليوم وبموافقة فقط (13.4)
    void startNetworkMonitor(); // حالة الاتصال من النظام لا من WebView (M7)
    void applySystemFontScale(); // خط النظام ← حجم الخط في التطبيق ما لم يختر المستخدم (H5)
    void sendPendingCrashReport(RELEASE); // عطل أصلي سابق، بموافقة فقط (L7)
    // ملفات التصدير المؤقتة الأقدم من يوم (1.17.0)، بعد أن يهدأ التشغيل.
    const pruneTimer = window.setTimeout(() => {
      void import("@/lib/export-cache").then((m) => m.pruneExports()).catch(() => undefined);
    }, 8000);
    const offResume = installAppResume(); // تحديث البيانات عند العودة من الخلفية
    // في تطبيق الهاتف: النقر على إشعار يفتح صفحته داخل التطبيق.
    const offShell = installNativeShell({
      go: (path) => router.history.push(path),
      back: () => router.history.back(),
      home: () => void router.navigate({ to: "/today", replace: true }),
      path: () => router.state.location.pathname,
      // إشعار وصل والتطبيق مفتوح: يعرضه النظام بصوت الجوال، وهنا تتحدّث العدّادات وقائمة الإشعارات.
      onPush: () => {
        void queryClient.invalidateQueries({ queryKey: ["unread-notifications"] });
        void queryClient.invalidateQueries({ queryKey: ["more-badges"] });
        window.dispatchEvent(new Event("zen:push"));
      },
      // نقر إشعاراً في الجوال: قرأه، فيُعلَّم مقروءاً في الصندوق بدل أن يبقى عدّاده.
      onOpen: (nid) => {
        const refresh = () => {
          void queryClient.invalidateQueries({ queryKey: ["unread-notifications"] });
          void queryClient.invalidateQueries({ queryKey: ["more-badges"] });
          window.dispatchEvent(new Event("zen:push"));
        };
        if (!nid) return refresh();
        void import("@/lib/zen-lms")
          .then((m) => m.markNotificationRead(nid))
          .catch(() => undefined)
          .finally(refresh);
      },
    });
    return () => {
      window.clearTimeout(pruneTimer);
      offResume();
      offShell?.();
    };
  }, [router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      {/* مشغّل التلاوة المشترك لقسم المصحف: عنصر صوت واحد تستمر تلاوته بين الشاشات. */}
      {/* قفل التطبيق (1.28.0): لا تُركَّب الصفحات قبل أول فتح ناجح، وتُحجب كلها عند إعادة القفل. */}
      <AppLockGate>
        <RecitationPlayerProvider>
          <Outlet />
          <Suspense fallback={null}>
            <RecitationDownloadNotifier />
          </Suspense>
        </RecitationPlayerProvider>
      </AppLockGate>
      <Suspense fallback={null}>
        <Toaster position="top-center" dir={dirOf(locale)} richColors closeButton={false} />
      </Suspense>
    </QueryClientProvider>
  );
}
