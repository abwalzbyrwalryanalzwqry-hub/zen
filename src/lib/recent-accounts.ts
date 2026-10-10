/**
 * «الحسابات على هذا الجهاز» (تحليل «المزيد» GAP-09): تبديل حساب آمن دون الاحتفاظ بجلسات متعددة.
 * يُحفظ اسم المستخدم والاسم الظاهر فقط — لا رموز ولا كلمات مرور — وأحدث 5 حسابات. التبديل = خروج كامل
 * (`signOutEverywhere`) ثم شاشة الدخول باسم المستخدم مملوءاً، فلا تبقى بيانات الحساب السابق على الجهاز.
 * القائمة من تفضيلات الجهاز فلا تُمسح عند الخروج، ويحذف المستخدم أي مدخل منها، ويُحذف مدخله مع حسابه.
 */
export const RECENT_ACCOUNTS_KEY = "zen-recent-accounts";
export const RECENT_ACCOUNTS_MAX = 5;

export type RecentAccount = { userId: string; username: string; name: string | null; at: number };

function isEntry(x: unknown): x is RecentAccount {
  const r = x as RecentAccount;
  return (
    !!r &&
    typeof r.userId === "string" &&
    typeof r.username === "string" &&
    r.username.length > 0 &&
    r.username.length <= 254 &&
    (r.name === null || typeof r.name === "string") &&
    typeof r.at === "number"
  );
}

export function readRecentAccounts(): RecentAccount[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_ACCOUNTS_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter(isEntry).slice(0, RECENT_ACCOUNTS_MAX) : [];
  } catch {
    return [];
  }
}

function write(list: RecentAccount[]) {
  try {
    localStorage.setItem(RECENT_ACCOUNTS_KEY, JSON.stringify(list.slice(0, RECENT_ACCOUNTS_MAX)));
  } catch {
    /* التخزين معطّل */
  }
}

/** يسجّل الدخول الناجح (الأحدث أولاً). اسم المستخدم كما كُتب بعد القص. */
export function rememberAccount(e: { userId: string; username: string; name?: string | null }) {
  const username = e.username.trim();
  if (!username || !e.userId) return;
  const prev = readRecentAccounts();
  const old = prev.find((r) => r.userId === e.userId);
  write([
    { userId: e.userId, username, name: e.name ?? old?.name ?? null, at: Date.now() },
    ...prev.filter((r) => r.userId !== e.userId),
  ]);
}

/** يحدّث الاسم الظاهر لحساب مسجَّل (دون تغيير ترتيبه)، ولا يضيف حساباً غير مسجَّل. */
export function updateRecentName(userId: string, name: string | null | undefined) {
  if (!name) return;
  const list = readRecentAccounts();
  if (!list.some((r) => r.userId === userId && r.name !== name)) return;
  write(list.map((r) => (r.userId === userId ? { ...r, name } : r)));
}

export function forgetAccount(userId: string) {
  write(readRecentAccounts().filter((r) => r.userId !== userId));
}

/** الحسابات الأخرى (للتبديل إليها). */
export function otherAccounts(currentUserId: string | null | undefined): RecentAccount[] {
  return readRecentAccounts().filter((r) => r.userId !== currentUserId);
}
