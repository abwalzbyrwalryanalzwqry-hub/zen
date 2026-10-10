import { supabase } from "@/integrations/supabase/client";
import { rpc } from "@/integrations/supabase/rpc";
import {
  looksLikeEmail,
  normalizeUsername,
  passwordTooLong,
  usernameError,
  usernameToEmail,
} from "@/lib/username";
import { isCommonPassword } from "./common-passwords";
import { breachCount } from "./password-breach";
import { rememberAccount } from "./recent-accounts";

/* ─────────── رموز الدول (لأرقام التواصل في المراكز، لا للدخول) ─────────── */

export type Country = { code: string; dial: string; flag: string; label: string; digits: number };

/** الدول الأكثر استخداماً في حلقات التحفيظ — اليمن أولاً (السوق الأساسي). */
export const COUNTRIES: Country[] = [
  { code: "YE", dial: "+967", flag: "🇾🇪", label: "اليمن", digits: 9 },
  { code: "SA", dial: "+966", flag: "🇸🇦", label: "السعودية", digits: 9 },
  { code: "AE", dial: "+971", flag: "🇦🇪", label: "الإمارات", digits: 9 },
  { code: "EG", dial: "+20", flag: "🇪🇬", label: "مصر", digits: 10 },
  { code: "JO", dial: "+962", flag: "🇯🇴", label: "الأردن", digits: 9 },
  { code: "KW", dial: "+965", flag: "🇰🇼", label: "الكويت", digits: 8 },
  { code: "QA", dial: "+974", flag: "🇶🇦", label: "قطر", digits: 8 },
  { code: "OM", dial: "+968", flag: "🇴🇲", label: "عُمان", digits: 8 },
  { code: "BH", dial: "+973", flag: "🇧🇭", label: "البحرين", digits: 8 },
  { code: "TR", dial: "+90", flag: "🇹🇷", label: "تركيا", digits: 10 },
  { code: "MY", dial: "+60", flag: "🇲🇾", label: "ماليزيا", digits: 9 },
];

export const DEFAULT_COUNTRY = COUNTRIES[0];

export function findCountry(code: string): Country {
  return COUNTRIES.find((c) => c.code === code) ?? DEFAULT_COUNTRY;
}

/** يبني رقماً دولياً بصيغة E.164 (‏+967771234567) من رمز الدولة والرقم المحلي. */
export function toE164(country: Country, localNumber: string): string {
  const digits = localNumber.replace(/\D/g, "").replace(/^0+/, "");
  return `${country.dial}${digits}`;
}

export function isValidLocalNumber(country: Country, localNumber: string): boolean {
  const digits = localNumber.replace(/\D/g, "").replace(/^0+/, "");
  // تسامح بخانة واحدة زيادة أو نقصاً لاختلاف أطوال الشبكات.
  return digits.length >= country.digits - 1 && digits.length <= country.digits + 1;
}

/* ─────────── الدخول باسم المستخدم وكلمة المرور ───────────
 * بلا بريد ولا هاتف ولا مزوّد رسائل: التفاصيل في src/lib/username.ts وترحيل
 * 20261005100000_username_auth.sql. الدور لا يُرسل من العميل: كل حساب جديد طالب. */

export const MIN_PASSWORD_LENGTH = 8;

export class AuthFlowError extends Error {}

export type NewAccount = { username: string; recoveryCode: string };

/** خطأ من Supabase Auth أو من دالة RPC: الرمز (`code`) أثبت من نص الرسالة الذي قد يتغيّر مع الترقية. */
export type AuthErrorLike =
  string | { message?: string; code?: string | null; status?: number; reasons?: string[] };

/**
 * رموز Supabase Auth الرسمية (`AuthError.code`) ← رسالة عربية. تُقدَّم على مطابقة النص (M10)، فلا
 * تتغيّر الرسالة إن غيّر Supabase صياغة خطئه بالإنجليزية.
 */
const AUTH_CODE_MESSAGES: Record<string, string> = {
  invalid_credentials: "اسم المستخدم أو كلمة المرور غير صحيحة.",
  user_not_found: "اسم المستخدم أو كلمة المرور غير صحيحة.",
  user_banned: "هذا الحساب موقوف. تواصل مع إدارة المركز.",
  user_already_exists: "اسم المستخدم مستخدم من قبل، اختر غيره.",
  email_exists: "اسم المستخدم مستخدم من قبل، اختر غيره.",
  same_password: "كلمة المرور الجديدة يجب أن تختلف عن الحالية.",
  over_request_rate_limit: "محاولات كثيرة. انتظر قليلاً ثم أعد المحاولة.",
  over_email_send_rate_limit: "محاولات كثيرة. انتظر قليلاً ثم أعد المحاولة.",
  too_many_requests: "محاولات كثيرة. انتظر قليلاً ثم أعد المحاولة.",
  signup_disabled: "التسجيل مغلق حالياً. تواصل مع إدارة المركز.",
  email_provider_disabled: "التسجيل مغلق حالياً. تواصل مع إدارة المركز.",
  session_expired: "انتهت الجلسة. سجّل الدخول من جديد.",
  session_not_found: "انتهت الجلسة. سجّل الدخول من جديد.",
  refresh_token_not_found: "انتهت الجلسة. سجّل الدخول من جديد.",
  request_timeout: "تعذّر الاتصال بالخدمة. تحقق من الإنترنت.",
};

/** رسالة كلمة مرور ظهرت في تسريبات معروفة (Leaked Password Protection، C4). */
export const PWNED_PASSWORD_MESSAGE =
  "كلمة المرور هذه ظهرت في تسريبات معروفة على الإنترنت، فاختر كلمة أخرى لم تستعملها في مكان آخر.";

/** رسائل الأخطاء بالعربية — لا نكشف تفاصيل تقنية للمستخدم ولا وجود الحسابات. */
export function arabicAuthError(error: AuthErrorLike): string {
  const message = typeof error === "string" ? error : (error.message ?? "");
  const code = typeof error === "string" ? null : (error.code ?? null);
  if (code === "weak_password") {
    const reasons = typeof error === "string" ? [] : (error.reasons ?? []);
    return reasons.includes("pwned") || /pwned|leaked|breach/i.test(message)
      ? PWNED_PASSWORD_MESSAGE
      : PASSWORD_RULE_MESSAGE;
  }
  if (code && AUTH_CODE_MESSAGES[code]) return AUTH_CODE_MESSAGES[code];
  if (typeof error !== "string" && error.status === 429)
    return AUTH_CODE_MESSAGES.over_request_rate_limit;
  return arabicAuthMessage(message);
}

/** المطابقة بالنص: لاستثناءات دوال قاعدة البيانات (`RAISE EXCEPTION 'USERNAME_TAKEN'`)، وكاحتياط. */
function arabicAuthMessage(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials") || m.includes("invalid_credentials"))
    return "اسم المستخدم أو كلمة المرور غير صحيحة.";
  if (m.includes("username_taken")) return "اسم المستخدم مستخدم من قبل، اختر غيره.";
  if (m.includes("invalid_username")) return "اسم المستخدم غير صالح.";
  if (m.includes("wrong_password")) return "كلمة المرور الحالية غير صحيحة.";
  if (m.includes("pwned") || m.includes("leaked")) return PWNED_PASSWORD_MESSAGE;
  if (m.includes("weak_password") && message.includes("شائعة")) return COMMON_PASSWORD_MESSAGE;
  if (m.includes("weak_password") || (m.includes("password") && m.includes("at least")))
    return PASSWORD_RULE_MESSAGE;
  if (m.includes("invalid_name")) return "اكتب اسم الطالب (حرفان على الأقل).";
  if (m.includes("not_allowed") && message.includes("ليست حلقتك"))
    return "لا يمكنك إضافة طلاب إلى حلقة ليست حلقتك.";
  if (m.includes("not_allowed")) return "تعيين كلمة المرور متاح لمعلّم حلقة الطالب فقط.";
  if (m.includes("already_claimed")) return "لديك اسم مستخدم بالفعل.";
  if (
    m.includes("rate_limited") ||
    m.includes("rate limit") ||
    m.includes("too many") ||
    m.includes("429")
  )
    return "محاولات كثيرة. انتظر قليلاً ثم أعد المحاولة.";
  if (m.includes("signups not allowed") || m.includes("disabled"))
    return "التسجيل مغلق حالياً. تواصل مع إدارة المركز.";
  if (m.includes("network") || m.includes("fetch"))
    return "تعذّر الاتصال بالخدمة. تحقق من الإنترنت.";
  return "تعذّر إتمام العملية. أعد المحاولة بعد قليل.";
}

/** قاعدة كلمة المرور الجديدة (C4): 8 أحرف على الأقل، فيها حرف ورقم. */
export const PASSWORD_RULE_MESSAGE = `كلمة المرور ${MIN_PASSWORD_LENGTH} أحرف على الأقل، وفيها حرف ورقم.`;

/** خطأ قاعدة كلمة المرور الجديدة، أو null إن كانت مقبولة. لا يُطبَّق على الدخول بكلمة قديمة. */
export function passwordRuleError(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return PASSWORD_RULE_MESSAGE;
  if (passwordTooLong(password)) return "كلمة المرور طويلة جداً.";
  if (!/\p{L}/u.test(password) || !/\p{Nd}/u.test(password)) return PASSWORD_RULE_MESSAGE;
  if (isCommonPassword(password)) return COMMON_PASSWORD_MESSAGE;
  return null;
}

export const COMMON_PASSWORD_MESSAGE = "كلمة المرور شائعة وسهلة التخمين، اختر غيرها.";

/* ─────────── قفل مؤقت بعد محاولات دخول فاشلة (C4) ───────────
 * على الجهاز: بعد 5 محاولات فاشلة متتالية يُقفل الدخول 30 ثانية، ويتضاعف القفل مع كل فشل تالٍ حتى
 * 15 دقيقة. حدّ معدّل Supabase Auth على الخادم يبقى الحماية الأساسية؛ هذا يمنع التخمين السريع من الواجهة. */

export const LOGIN_LOCK_KEY = "zen-login-lock";
const LOCK_AFTER = 5;
const LOCK_BASE_MS = 30_000;
const LOCK_MAX_MS = 15 * 60_000;

type LockState = { fails: number; until: number };

function readLock(): LockState {
  try {
    const v = JSON.parse(localStorage.getItem(LOGIN_LOCK_KEY) ?? "null") as LockState | null;
    return v && typeof v.fails === "number" && typeof v.until === "number"
      ? v
      : { fails: 0, until: 0 };
  } catch {
    return { fails: 0, until: 0 };
  }
}

function writeLock(v: LockState | null) {
  try {
    if (v) localStorage.setItem(LOGIN_LOCK_KEY, JSON.stringify(v));
    else localStorage.removeItem(LOGIN_LOCK_KEY);
  } catch {
    /* التخزين معطّل: لا قفل محلي */
  }
}

/** مدة القفل بعد `fails` محاولة فاشلة (0 قبل الحد). دالة نقية للاختبار. */
export function lockDurationMs(fails: number): number {
  if (fails < LOCK_AFTER) return 0;
  return Math.min(LOCK_MAX_MS, LOCK_BASE_MS * 2 ** (fails - LOCK_AFTER));
}

/** الثواني المتبقية من القفل الحالي (0 إن لم يكن مقفلاً). */
export function loginLockSeconds(now = Date.now()): number {
  const { until } = readLock();
  return until > now ? Math.ceil((until - now) / 1000) : 0;
}

export function recordLoginFailure(now = Date.now()): void {
  const fails = readLock().fails + 1;
  const ms = lockDurationMs(fails);
  writeLock({ fails, until: ms ? now + ms : 0 });
}

export function clearLoginFailures(): void {
  writeLock(null);
}

/** القاعدة المحلية ثم فحص التسريبات (إرشادي، يفشل مفتوحاً). الخادم يعيد فحص القاعدة والقائمة الشائعة. */
async function checkPassword(password: string) {
  const err = passwordRuleError(password);
  if (err) throw new AuthFlowError(err);
  if ((await breachCount(password)) > 0) throw new AuthFlowError(PWNED_PASSWORD_MESSAGE);
}

/** يدخل باسم المستخدم (أو بالبريد لحساب قديم أُنشئ به). */
export async function signInWithUsername(
  identifier: string,
  password: string,
): Promise<string | null> {
  const locked = loginLockSeconds();
  if (locked) throw new AuthFlowError(lockedMessage(locked));
  const id = identifier.trim();
  if (!looksLikeEmail(id)) {
    const err = usernameError(id);
    if (err) throw new AuthFlowError("اسم المستخدم أو كلمة المرور غير صحيحة.");
  }
  const email = looksLikeEmail(id) ? id.toLowerCase() : await usernameToEmail(id);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    const msg = arabicAuthError(error);
    // الفشل بسبب الشبكة لا يُحتسب محاولةً خاطئة.
    if (msg === AUTH_CODE_MESSAGES.invalid_credentials) recordLoginFailure();
    throw new AuthFlowError(msg);
  }
  clearLoginFailures();
  // «الحسابات على هذا الجهاز» (GAP-09): المعرّف كما كُتب، لا البريد الداخلي ولا أي رمز.
  if (data?.user) rememberAccount({ userId: data.user.id, username: id });
  return data?.user?.id ?? null;
}

/** «انتظر N ثانية/دقيقة» بالعربية. */
export function lockedMessage(seconds: number): string {
  const wait = seconds >= 60 ? `${Math.ceil(seconds / 60)} دقيقة` : `${seconds} ثانية`;
  return `محاولات دخول خاطئة كثيرة. حاول بعد ${wait}.`;
}

/** ينشئ الحساب في قاعدة البيانات ثم يدخل به، ويعيد رمز الاسترداد (يُعرض مرة واحدة). */
export async function signUpWithUsername(
  username: string,
  password: string,
  name: string,
): Promise<NewAccount> {
  const err = usernameError(username);
  if (err) throw new AuthFlowError(err);
  await checkPassword(password);
  const { data, error } = await rpc("register_username_account", {
    _username: normalizeUsername(username),
    _password: password,
    _name: name.trim() || undefined,
  });
  if (error) throw new AuthFlowError(arabicAuthError(error));
  const out = data as { username: string; recovery_code: string };
  await signInWithUsername(out.username, password);
  return { username: out.username, recoveryCode: out.recovery_code };
}

/** كلمة مرور جديدة برمز الاسترداد، ثم دخول مباشر. يعيد رمز الاسترداد الجديد. */
export async function resetWithRecoveryCode(
  username: string,
  code: string,
  newPassword: string,
): Promise<NewAccount> {
  await checkPassword(newPassword);
  if (usernameError(username)) throw new AuthFlowError("اسم المستخدم أو رمز الاسترداد غير صحيح.");
  const { data, error } = await rpc("reset_password_with_recovery_code", {
    _username: normalizeUsername(username),
    _code: code,
    _new_password: newPassword,
  });
  if (error) throw new AuthFlowError(arabicAuthError(error));
  const out = data as { ok: boolean; username?: string; recovery_code?: string };
  if (!out?.ok || !out.username || !out.recovery_code)
    throw new AuthFlowError("اسم المستخدم أو رمز الاسترداد غير صحيح.");
  await signInWithUsername(out.username, newPassword);
  return { username: out.username, recoveryCode: out.recovery_code };
}

export type LoginInfo = {
  username: string | null;
  must_change_password: boolean;
  has_recovery_code: boolean;
};

export async function getMyLoginInfo(): Promise<LoginInfo | null> {
  const { data, error } = await rpc("my_login_info");
  if (error) return null;
  return (data as LoginInfo | null) ?? null;
}

/** يغيّر كلمة المرور بمعرفة الحالية. قاعدة البيانات تُنهي الجلسات، فنعيد الدخول فوراً. */
export async function changeMyPassword(
  username: string | null,
  current: string,
  next: string,
): Promise<void> {
  await checkPassword(next);
  const { error } = await rpc("change_my_password", { _current: current, _new_password: next });
  if (error) throw new AuthFlowError(arabicAuthError(error));
  if (username) await signInWithUsername(username, next);
}

export async function regenerateRecoveryCode(password: string): Promise<string> {
  const { data, error } = await rpc("regenerate_recovery_code", { _password: password });
  if (error) throw new AuthFlowError(arabicAuthError(error));
  return data as string;
}

/** حساب قديم (بريد/هاتف) يختار اسم مستخدم يدخل به من الآن. */
export async function claimUsername(username: string, password: string): Promise<NewAccount> {
  const err = usernameError(username);
  if (err) throw new AuthFlowError(err);
  await checkPassword(password);
  const { data, error } = await rpc("claim_username", {
    _username: normalizeUsername(username),
    _password: password,
  });
  if (error) throw new AuthFlowError(arabicAuthError(error));
  const out = data as { username: string; recovery_code: string };
  await signInWithUsername(out.username, password);
  return { username: out.username, recoveryCode: out.recovery_code };
}

/* ─────────── المعلّم وكلمة مرور طالبه ─────────── */

export type StudentLoginInfo = {
  username: string | null;
  can_set_password: boolean;
  password_set_at: string | null;
  /** اسم الطالب، وهل حسابه أنشأه معلّم (فيعدّل معلّمه اسمه). غائبان في الاستجابات القديمة. */
  name?: string | null;
  managed?: boolean;
};

export async function getStudentLoginInfo(studentId: string): Promise<StudentLoginInfo | null> {
  const { data, error } = await rpc("student_login_info", { _student: studentId });
  if (error) return null;
  return (data as StudentLoginInfo | null) ?? null;
}

export async function teacherSetStudentPassword(studentId: string, password: string) {
  await checkPassword(password);
  const { error } = await rpc("teacher_set_student_password", {
    _student: studentId,
    _new_password: password,
  });
  if (error) throw new AuthFlowError(arabicAuthError(error));
}

export type CreatedStudent = {
  studentId: string;
  username: string;
  name: string;
  recoveryCode: string;
};

/**
 * المعلّم ينشئ حساب طالب جديد في حلقته (المرحلة 6.1): من قاعدة البيانات مباشرة
 * (`teacher_create_student`)، فيعمل في الويب وفي نسخة Android دون خادم. يُلزَم الطالب بتغيير
 * كلمة المرور عند أول دخول، ورمز الاسترداد يُعرض للمعلّم مرة واحدة ليسلّمه للطالب.
 */
export async function teacherCreateStudent(input: {
  halaqaId: string;
  username: string;
  password: string;
  name: string;
}): Promise<CreatedStudent> {
  if (input.name.trim().length < 2) throw new AuthFlowError("اكتب اسم الطالب (حرفان على الأقل).");
  const err = usernameError(input.username);
  if (err) throw new AuthFlowError(err);
  await checkPassword(input.password);
  const { data, error } = await rpc("teacher_create_student", {
    _halaqa: input.halaqaId,
    _username: normalizeUsername(input.username),
    _password: input.password,
    _name: input.name.trim(),
  });
  if (error) throw new AuthFlowError(arabicAuthError(error));
  const out = data as { student_id: string; username: string; name: string; recovery_code: string };
  return {
    studentId: out.student_id,
    username: out.username,
    name: out.name,
    recoveryCode: out.recovery_code,
  };
}

/** كلمة مرور مؤقتة سهلة الإملاء (بلا محارف ملتبسة) يعطيها المعلّم لطالبه. */
export function generateTempPassword(length = 10): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(length);
  // تحقق قاعدة كلمة المرور (حرف ورقم): نعيد التوليد حتى تجتمعا، وهو نادر جداً بطول 10.
  for (;;) {
    crypto.getRandomValues(bytes);
    const pw = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
    if (passwordRuleError(pw) === null) return pw;
  }
}
