import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { PhoneFrame } from "@/components/zen/PhoneFrame";
import { useSession } from "@/hooks/useSession";
import { useMuhasabaReminder } from "@/lib/muhasaba/reminder";
import { startSelfReviewSync } from "@/lib/quran/memorize-api";
import { startAccountSync } from "@/lib/account-sync";
import { guestAllowed, isGuest } from "@/lib/offline/guest";
import { GuestLocked } from "@/components/zen/GuestHome";
import { OfflineBanner } from "@/components/zen/OfflineBanner";
import { TextAiConsentHost } from "@/components/zen/ai/TextAiConsentHost";

/**
 * تخطيط محمي: كل مسار تحته يتطلب جلسة مسجَّلة.
 * الجلسة تُحفظ في المتصفح (لا كوكي على الخادم)، لذلك يجري التحقق في العميل
 * مع شاشة انتظار أثناء استرجاع الجلسة — بدل تكرار منطق التوجيه في كل صفحة.
 */
export const Route = createFileRoute("/_authed")({
  component: AuthedLayout,
});

function AuthedLayout() {
  const { session, loading, userId, guest } = useSession();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });

  // الإشعارات والتطبيق في الخلفية من FCM وحده (القاعدتان 28 و33)، لا اشتراك لحظي هنا (M6).
  // تذكير «محاسبتي» الاختياري (لا يعمل إلا إذا فعّله المستخدم).
  useMuhasabaReminder(userId);
  // مراجعات «أتقنتُها» المحفوظة بلا اتصال تُرسل الآن وكلما عاد الاتصال (M8).
  const signedIn = !!session;
  useEffect(() => {
    if (guest || !signedIn) return;
    const offReviews = startSelfReviewSync();
    // حالة القراءة والمنطقة الزمنية مع الحساب (H4 وH3).
    const offAccount = startAccountSync();
    return () => {
      offReviews();
      offAccount();
    };
  }, [guest, signedIn]);

  // الإشعارات الفورية (1.16.1): الجهاز يُسجَّل تلقائياً بعد الدخول، والإذن يُطلب مرة واحدة فقط
  // (src/lib/notify/device.ts). بعد لحظة كي لا يقاطع طلب الإذن أول رسم.
  const accountId = signedIn && !guest ? userId : null;
  useEffect(() => {
    if (!accountId) return;
    const h = setTimeout(() => {
      void import("@/lib/notify/device")
        .then((m) => m.autoRegister(accountId))
        .catch(() => undefined);
    }, 1500);
    return () => clearTimeout(h);
  }, [accountId]);

  useEffect(() => {
    // isGuest() مباشرة: حالة الضيف في الخطّاف قد تتأخر عن انتهاء التحميل بدورة رسم واحدة،
    // فيُحوَّل الضيف خطأً إلى صفحة الدخول عند فتح التطبيق.
    if (!loading && !session && !guest && !isGuest()) {
      navigate({ to: "/auth/login", replace: true });
    }
  }, [loading, session, guest, navigate]);

  // الضيف: ما يعمل على الجهاز وحده متاح، وغيره يعرض دعوة لتسجيل الدخول.
  if (!loading && guest) {
    return guestAllowed(path) ? <Outlet /> : <GuestLocked />;
  }

  if (loading || !session) {
    return (
      <PhoneFrame>
        <div className="flex-1 flex items-center justify-center">
          <Loader2
            className="w-6 h-6 animate-spin text-primary"
            aria-label="جارٍ التحقق من الجلسة"
          />
        </div>
      </PhoneFrame>
    );
  }

  return (
    <>
      <OfflineBanner />
      <Outlet />
      <TextAiConsentHost />
    </>
  );
}
