/**
 * محاكاة انقطاع الشبكة كما في التطبيق (1.16.0): ملفات الواجهة داخل التطبيق فتبقى متاحة، وSupabase وحده
 * لا يُبلغ. `context.setOffline` يقطع الخادم المحلي أيضاً (فتفشل أجزاء الواجهة الكسولة)، فنقطع هنا
 * طلبات Supabase الوهمي وحدها، ونجعل `navigator.onLine` يتبع علامة في localStorage مع حدثَي
 * `online`/`offline` (كما يفعل src/lib/network.ts في التطبيق).
 */
import type { BrowserContext, Page } from "@playwright/test";
import { FAKE_SUPABASE_URL, STORAGE_KEY, session, type FakeUser } from "./fake-supabase";

const FLAG = "e2e-offline";

export async function installOfflineSwitch(context: BrowserContext) {
  const net = { down: false };
  await context.addInitScript((flag) => {
    Object.defineProperty(Navigator.prototype, "onLine", {
      configurable: true,
      get: () => localStorage.getItem(flag) !== "1",
    });
  }, FLAG);
  // يُسجَّل بعد installFakeSupabase فيسبقه (آخر مسار مسجَّل يُجرَّب أولاً).
  await context.route(`${FAKE_SUPABASE_URL}/**`, (route) =>
    net.down ? route.abort("internetdisconnected") : route.fallback(),
  );
  return {
    async set(page: Page, down: boolean) {
      net.down = down;
      await page.evaluate(
        ([flag, d]) => {
          if (d) localStorage.setItem(flag, "1");
          else localStorage.removeItem(flag);
          window.dispatchEvent(new Event(d ? "offline" : "online"));
        },
        [FLAG, down] as const,
      );
    },
  };
}

/** جلسة تُزرع مرة واحدة (لا تُعاد عند كل تحميل) كي يبقى ما يكتبه Supabase أو الاختبار فيها. */
export async function seedSessionOnce(context: BrowserContext, user: FakeUser) {
  await context.addInitScript(
    ([key, value]) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, value);
      localStorage.setItem("zen-onboarded", "1");
    },
    [STORAGE_KEY, JSON.stringify(session(user))] as const,
  );
}

/** يجعل رمز الدخول المحفوظ منتهياً (كأن ساعة مضت دون اتصال). */
export async function expireStoredToken(page: Page) {
  await page.evaluate((key) => {
    const s = JSON.parse(localStorage.getItem(key) ?? "{}");
    s.expires_at = Math.floor(Date.now() / 1000) - 600;
    localStorage.setItem(key, JSON.stringify(s));
  }, STORAGE_KEY);
}
