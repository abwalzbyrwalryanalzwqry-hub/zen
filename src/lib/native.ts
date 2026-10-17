import { Capacitor } from "@capacitor/core";
import { toast } from "@/lib/toast";
import { t } from "@/lib/i18n";
import { closeTopOverlay, decideBack, inAppHistoryIndex, overlayOpen } from "@/lib/back-nav";
import { runBackInterceptors } from "@/lib/quran/native-shell";
import { currentSession } from "@/hooks/useSession";
import { isLockShowing } from "@/lib/app-lock-probe";
import {
  savedToken,
  turnOnDevice,
  unregisterDevice,
  type RegisterResult,
} from "@/lib/notify/device";

/**
 * جسر تطبيق Android (Capacitor). كل ما هنا يعود بهدوء خارج التطبيق (مثل اختبارات E2E في المتصفح).
 *
 * - الإشعارات: رمز FCM يُحفظ عبر save_native_push_token ويمرّ الإرسال بصندوق push_outbox نفسه
 *   (قاعدة 28): لا إشعار يُرسَل من العميل.
 * - التسجيل الصوتي: getUserMedia داخل WebView مع إذن RECORD_AUDIO في AndroidManifest؛ لا مكوّن
 *   إضافي.
 * - الموقع لمواقيت الصلاة يبقى على الجهاز.
 */

export { ANDROID_CHANNEL, NATIVE_TOKEN_KEY } from "@/lib/notify/device";

export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function nativePlatform(): "android" | "ios" | null {
  if (!isNativeApp()) return null;
  const p = Capacitor.getPlatform();
  return p === "android" || p === "ios" ? p : null;
}

export function nativePushToken(): string | null {
  return savedToken();
}

/**
 * رابط عميق zen:// (L6) ← مسار داخلي: zen://quran/2 ← /quran/2، وzen:///today ← /today.
 * غير ذلك (مخطط آخر أو مسار غير آمن) يُهمل.
 */
export function deepLinkPath(url: unknown): string | null {
  if (typeof url !== "string") return null;
  const m = /^zen:\/\/(.*)$/i.exec(url.trim());
  if (!m) return null;
  const rest = m[1].replace(/^\/+/, "");
  return safeInternalPath(`/${rest}`);
}

/** رابط الإشعار داخلي فقط؛ غيره يُهمل (لا فتح لروابط خارجية من حمولة). */
export function safeInternalPath(url: unknown): string | null {
  if (typeof url !== "string") return null;
  return /^\/(?!\/)[A-Za-z0-9/_\-$?=&.]*$/.test(url) ? url : null;
}

/** الوحدة لا الإضافة: إضافة Capacitor تبدو «thenable» فإرجاعها من وعد يعلّقه للأبد (انظر notify/device.ts). */
function pushModule() {
  return import("@capacitor/push-notifications");
}

const REGISTER_ERRORS: Record<RegisterResult, string | null> = {
  on: null,
  unsupported: "الإشعارات الأصلية متاحة في تطبيق الهاتف فقط.",
  denied: "لم يُسمح بالإشعارات. فعّلها من إعدادات الهاتف.",
  offline: "لا اتصال الآن: يُسجَّل جهازك للإشعارات عند عودة الاتصال.",
  failed: "تعذّر التسجيل في خدمة الإشعارات. حاول مرة أخرى.",
};

/** تفعيل صريح (الإعدادات): يطلب الإذن ويسجّل الجهاز (notify/device.ts). يعيد رسالة خطأ عربية أو null. */
export async function enableNativePush(): Promise<string | null> {
  if (!nativePlatform()) return REGISTER_ERRORS.unsupported;
  const user = currentSession()?.user.id;
  if (!user) return "سجّل الدخول أولاً.";
  return REGISTER_ERRORS[await turnOnDevice(user)];
}

/** عند الخروج: يحذف رمز الجهاز دون أن يُحفظ إيقاف (الدخول التالي يسجّله من جديد). */
export async function disableNativePush(): Promise<void> {
  await unregisterDevice({ remember: false });
}

export type ShellNav = {
  /** فتح مسار داخلي (من إشعار). */
  go: (path: string) => void;
  /** وصل إشعار والتطبيق مفتوح (يعرضه النظام بصوته؛ هنا تحديث العدّادات والقائمة). */
  onPush?: () => void;
  /** نقر المستخدم إشعاراً في الجوال: `nid` معرّف التنبيه في الصندوق ليُعلَّم مقروءاً (null للتذكيرات). */
  onOpen?: (nid: string | null) => void;
  back: () => void;
  home: () => void;
  path: () => string;
};

/**
 * يُستدعى مرة عند تشغيل التطبيق الأصلي: النقر على إشعار يفتح صفحته داخل التطبيق،
 * وزر الرجوع في أندرويد يتنقّل داخل التطبيق بدل إغلاقه (انظر back-nav.ts). يعيد دالة الإلغاء.
 */
export function installNativeShell(nav: ShellNav): () => void {
  if (!isNativeApp()) return () => undefined;
  let removed = false;
  const handles: { remove: () => Promise<void> }[] = [];
  const keep = (h: { remove: () => Promise<void> }) => {
    if (removed) void h.remove();
    else handles.push(h);
  };

  void pushModule().then(async ({ PushNotifications: Push }) => {
    keep(
      await Push.addListener("pushNotificationActionPerformed", (a) => {
        const data = a.notification.data as { url?: unknown; nid?: unknown } | undefined;
        const path = safeInternalPath(data?.url);
        const nid =
          typeof data?.nid === "string" && /^[0-9a-f-]{36}$/i.test(data.nid) ? data.nid : null;
        nav.onOpen?.(nid);
        if (path) nav.go(path);
      }),
    );
    keep(await Push.addListener("pushNotificationReceived", () => nav.onPush?.()));
  });

  let lastExitPress: number | null = null;
  void import("@capacitor/app").then(async ({ App }) => {
    // L6: رابط zen:// فتح التطبيق، أو وصل وهو مفتوح.
    const open = (url: unknown) => {
      const path = deepLinkPath(url);
      if (path) nav.go(path);
    };
    void App.getLaunchUrl()
      .then((r) => open(r?.url))
      .catch(() => undefined);
    keep(await App.addListener("appUrlOpen", (e) => open(e.url)));
    keep(
      await App.addListener("backButton", () => {
        // شاشة القفل ظاهرة: الرجوع لا يتنقّل خلفها، بل ينقل التطبيق إلى الخلفية كما يفعل النظام.
        if (isLockShowing()) {
          void App.minimizeApp();
          return;
        }
        // معترض نشط (كالخروج من ملء الشاشة في قارئ المصحف) يستهلك الضغطة أولاً.
        if (runBackInterceptors()) return;
        const action = decideBack({
          path: nav.path(),
          overlayOpen: overlayOpen(),
          canGoBack: inAppHistoryIndex() > 0,
          lastExitPress,
          now: Date.now(),
        });
        switch (action) {
          case "close-overlay":
            closeTopOverlay();
            break;
          case "confirm-exit":
            lastExitPress = Date.now();
            toast(t("native.pressBackAgain"), { duration: 2000 });
            break;
          case "exit":
            void App.exitApp();
            break;
          case "history-back":
            nav.back();
            break;
          case "go-home":
            nav.home();
            break;
        }
      }),
    );
  });

  return () => {
    removed = true;
    for (const h of handles) void h.remove();
  };
}
