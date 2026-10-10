import { useSyncExternalStore } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { lazySupabase } from "@/integrations/supabase/lazy";
import { GUEST_ID, isGuest, onGuestChange, setGuest } from "@/lib/offline/guest";
import { clearOfflineCache } from "@/lib/offline/offline-fetch";
import { isAccessExpired, readStoredSession } from "@/lib/offline/stored-session";
import { isOnline } from "@/lib/network";

/**
 * مخزن جلسة واحد للتطبيق كله (تحليل «المزيد» SEC-06). كان كل مكوّن يستدعي `useSession` يفتح اشتراكه
 * الخاص في `onAuthStateChange` ويطلب `getSession`، فيتكرّر مسح الذاكرة عند الخروج بعدد المكوّنات
 * وتتأخر الصفحات في رؤية الجلسة نفسها. الآن اشتراك واحد كسول يبقى طول عمر التطبيق.
 */
type SessionState = { session: Session | null; loading: boolean; offline: boolean };

const SERVER_STATE: SessionState = { session: null, loading: true, offline: false };
let state: SessionState = SERVER_STATE;
let started = false;
const listeners = new Set<() => void>();

function set(next: Partial<SessionState>) {
  const merged = { ...state, ...next };
  if (
    merged.session === state.session &&
    merged.loading === state.loading &&
    merged.offline === state.offline
  )
    return;
  state = merged;
  for (const l of listeners) l();
}

/**
 * جلسة من Supabase أو، إن أعاد null والجلسة ما زالت في التخزين، جلسة الجهاز (1.16.0): رمزها انتهى ولم
 * يُجدَّد لانقطاع الشبكة، فيبقى الحساب مفتوحاً دون اتصال. الخروج الحقيقي يحذفها من التخزين أولاً.
 */
function resolve(s: Session | null): Pick<SessionState, "session" | "offline"> {
  if (s) return { session: s, offline: false };
  const stored = readStoredSession();
  return stored ? { session: stored, offline: true } : { session: null, offline: false };
}

/** يحاول تجديد جلسة الجهاز عند عودة الاتصال (يطلق TOKEN_REFRESHED فتُستبدل بها). */
function recover() {
  if (!state.offline || !isOnline()) return;
  void lazySupabase()
    .then((supabase) => supabase.auth.getSession())
    .then(({ data }) => set({ ...resolve(data.session), loading: false }))
    .catch(() => undefined);
}

function onAuth(event: AuthChangeEvent, s: Session | null) {
  if (event === "SIGNED_OUT") set({ session: null, offline: false, loading: false });
  else set({ ...resolve(s), loading: false });
  // الدخول بحساب يُنهي وضع الضيف، والخروج يمسح القراءات المخزَّنة لهذا الجهاز (مرة واحدة).
  if (s && isGuest()) setGuest(false);
  if (event === "SIGNED_OUT") {
    void clearOfflineCache();
    // الحساب التالي على الجهاز يضبط منطقته من جديد (H3).
    try {
      localStorage.removeItem("zen.tz.synced"); // TZ_SYNCED_KEY دون استيراد account-sync الثقيل
      // نسخ السجل اليومي على الجهاز (DR-10) فيها أسماء طلاب: لا تبقى للحساب التالي.
      localStorage.removeItem("zen.daily.cache"); // DAILY_CACHE_KEY دون استيراد daily-record-api
      localStorage.removeItem("zen.reports.cache"); // REPORT_CACHE_KEY: بيانات التقارير دون اتصال
    } catch {
      /* لا شيء */
    }
  }
}

function start() {
  if (started) return;
  started = true;
  // فتح فوري: الجلسة المحفوظة تُعرض في أول رسم بلا انتظار الشبكة (كان الفتح ينتظر تجديد الرمز).
  if (typeof window !== "undefined") {
    const stored = readStoredSession();
    if (stored) set({ session: stored, loading: false, offline: isAccessExpired(stored) });
  }
  // العميل يُحمَّل كسولاً (integrations/supabase/lazy.ts): الجلسة المحفوظة أعلاه تكفي للرسم الأول.
  void lazySupabase()
    .then((supabase) => {
      supabase.auth.onAuthStateChange(onAuth);
      return supabase.auth.getSession();
    })
    .then(({ data }) => set({ ...resolve(data.session), loading: false }))
    .catch(() => set({ ...resolve(null), loading: false }));
  if (typeof window !== "undefined") window.addEventListener("online", recover);
}

/** اشتراك في تغيّر الجلسة خارج React (والاختبارات). */
export function subscribeSession(cb: () => void) {
  start();
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

const getSnapshot = () => state;
const getServerSnapshot = () => SERVER_STATE;

/** الجلسة الحالية بلا انتظار عرض: للاستعمال خارج React (مثل معالجات الأحداث). */
export function currentSession(): Session | null {
  return state.session;
}

/**
 * الجلسة الحالية. بلا حساب وفي وضع الضيف يُعاد `userId = GUEST_ID` و`guest = true` كي تعمل
 * الوحدات المحلية (محاسبتي، الاختبارات) كما هي على بيانات الجهاز وحده.
 */
export function useSession() {
  const { session, loading, offline } = useSyncExternalStore(
    subscribeSession,
    getSnapshot,
    getServerSnapshot,
  );
  // وضع الضيف مخزَّن محلياً وله حدث تغيّر: مخزن خارجي (M12)، وعلى الخادم (العرض المسبق للبداية) ليس ضيفاً.
  const guest = useSyncExternalStore(onGuestChange, isGuest, () => false);
  const isGuestMode = !session && guest;
  return {
    session,
    userId: session?.user.id ?? (isGuestMode ? GUEST_ID : null),
    guest: isGuestMode,
    loading,
    /** جلسة الجهاز دون اتصال: الحساب مفتوح والبيانات من الجهاز حتى يتجدّد الرمز. */
    offline,
  };
}
