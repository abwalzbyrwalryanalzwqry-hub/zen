/**
 * تنبيهات النظام داخل الواجهة. زِن تطبيق Android فقط (لا ويب ولا عامل خدمة)، فالإشعارات والتطبيق مغلق
 * تأتي من FCM (`src/lib/native.ts` و`zen-push-dispatch`). ما هنا تنبيه محلي إن أتاحه النظام فقط.
 */

export type NotificationPermissionState = "unsupported" | NotificationPermission;

export function notificationState(): NotificationPermissionState {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

/** يطلب إذن التنبيهات (يجب أن يأتي من نقرة مستخدم على iOS وChrome). */
export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  if (Notification.permission !== "default") return Notification.permission;
  return await Notification.requestPermission();
}

/**
 * يُظهر تنبيه نظام عبر عامل خدمة إن وُجد. التطبيق بلا عامل خدمة (القاعدة 33) فيعود false غالباً،
 * والإشعار والتطبيق في الخلفية يصل من FCM. لا يُظهر شيئاً إذا كانت الواجهة ظاهرة.
 */
export async function showSystemNotification(input: {
  title: string;
  body?: string;
  url?: string;
  tag?: string;
  force?: boolean;
}): Promise<boolean> {
  if (notificationState() !== "granted") return false;
  if (!input.force && typeof document !== "undefined" && document.visibilityState === "visible") {
    return false;
  }
  const reg =
    typeof navigator !== "undefined" && "serviceWorker" in navigator
      ? await navigator.serviceWorker.getRegistration().catch(() => undefined)
      : undefined;
  if (!reg) return false;
  await reg.showNotification(input.title, {
    body: input.body ?? "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    dir: "rtl",
    lang: "ar",
    tag: input.tag ?? "zen",
    data: { url: input.url ?? "/today" },
  });
  return true;
}
