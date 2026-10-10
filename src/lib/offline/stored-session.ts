/**
 * الجلسة المحفوظة على الجهاز (العمل دون اتصال، 1.16.0). يحفظ Supabase الجلسة في localStorage تحت
 * `sb-<ref>-auth-token`، لكن `getSession()` يعيد `null` إن انتهى رمز الدخول (ساعة) ولم يستطع تجديده
 * لانقطاع الشبكة، مع أنه يُبقي الجلسة نفسها في التخزين (خطأ قابل للإعادة لا يحذفها). فكان المعلّم
 * بلا اتصال يُعاد إلى صفحة الدخول ولا يبلغ إلا وضع الضيف.
 *
 * هنا قراءة متزامنة لتلك الجلسة: تبقى «جلسة الجهاز» مقبولة ما دامت في التخزين ومعها رمز تجديد، لأن
 * Supabase يحذفها بنفسه حين يرفض الخادم التجديد فعلاً (خروج، أو حساب محذوف). الخادم يبقى الحَكَم: لا
 * طلب يخرج برمز منتهٍ، والقراءات من نسخة الجهاز، والكتابات في صناديق الإرسال حتى يعود الاتصال.
 */
import type { Session } from "@supabase/supabase-js";

type Store = Pick<Storage, "getItem">;

function defaultStore(): Store | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

/** مفتاح التخزين كما يبنيه Supabase: `sb-<أول مقطع من اسم المضيف>-auth-token`. */
export function authStorageKey(
  url: string | undefined = import.meta.env.VITE_SUPABASE_URL,
): string {
  try {
    return `sb-${new URL(url ?? "").hostname.split(".")[0]}-auth-token`;
  } catch {
    return "";
  }
}

function isSession(v: unknown): v is Session {
  if (!v || typeof v !== "object") return false;
  const s = v as Partial<Session>;
  return (
    typeof s.access_token === "string" &&
    typeof s.refresh_token === "string" &&
    !!s.refresh_token &&
    !!s.user &&
    typeof s.user.id === "string" &&
    !!s.user.id
  );
}

/** الجلسة المحفوظة أو null (تالفة، أو بلا مستخدم، أو بلا رمز تجديد). */
export function readStoredSession(
  s: Store | null = defaultStore(),
  key: string = authStorageKey(),
): Session | null {
  if (!s || !key) return null;
  try {
    const raw = s.getItem(key);
    if (!raw) return null;
    const v: unknown = JSON.parse(raw);
    // نسخ قديمة من المكتبة كانت تلفّها في { currentSession }.
    const session = isSession(v)
      ? v
      : isSession((v as { currentSession?: unknown } | null)?.currentSession)
        ? (v as { currentSession: Session }).currentSession
        : null;
    return session;
  } catch {
    return null;
  }
}

/** معرّف صاحب جلسة الجهاز (لفصل نسخ القراءة دون اتصال لكل حساب) أو null. */
export function storedUserId(s?: Store | null, key?: string): string | null {
  return readStoredSession(s, key)?.user.id ?? null;
}

/** هل انتهى رمز الدخول (مع هامش دقيقة)؟ الطلبات به تُرفض من الخادم. */
export function isAccessExpired(session: Session, now = Date.now()): boolean {
  return !session.expires_at || session.expires_at * 1000 - now < 60_000;
}
