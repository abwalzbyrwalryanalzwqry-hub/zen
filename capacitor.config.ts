import type { CapacitorConfig } from "@capacitor/cli";

/**
 * تطبيق زِن لـ Android (ولاحقاً iOS). **Android فقط، ولا تطبيق ويب** (قرار صاحب التطبيق، 28 سبتمبر 2026).
 *
 * الواجهة كلها مضمَّنة داخل التطبيق من `dist-native/client` (يبنيها `npm run build:apk-web`)، ومعها
 * المصحف كاملاً، فلا يحمّل التطبيق أي صفحة من نطاق ويب. الاتصال الوحيد بالشبكة هو Supabase (البيانات
 * والمصادقة ودوال Edge). لا `server.url` هنا عن قصد، ويحرس ذلك `src/lib/android-only.test.ts`.
 */
const config: CapacitorConfig = {
  appId: "app.zen.quran",
  appName: "زِن",
  webDir: "dist-native/client",
  android: {
    allowMixedContent: false,
    // قفل التطبيق (1.28.0): سجل الجسر في نسخ التصحيح يكتب وسائط كل استدعاء في logcat والكونسول، ومنها رمز
    // PIN. نسخ الإصدار بلا سجل أصلاً، وهنا يُغلق في التصحيح أيضاً فلا يظهر الرمز في أي سجل.
    loggingBehavior: "none",
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
