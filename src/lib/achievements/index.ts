import { supabase } from "@/integrations/supabase/client";
import { rpc, type RpcName } from "@/integrations/supabase/rpc";

/**
 * التحفيز والإنجازات (المرحلة 12).
 * الأوسمة والشهادات تُمنح في قاعدة البيانات فقط (مُشغّل على سجل المصحف)، والعرض
 * من دوال SECURITY DEFINER تتحقق من العلاقة بالطالب. المحاسبة الشخصية لا تدخل هنا.
 */

const db = supabase;

export type BadgeKind = "surah" | "hizb" | "juz" | "streak";
export type CertificateStatus = "pending" | "approved" | "rejected";
export type ChallengeKind = "khatma" | "pages";

export type Streak = {
  current: number;
  best: number;
  active_30: number;
  today: boolean;
  wird_today: boolean;
  last_day: string | null;
};

export type Badge = { kind: BadgeKind; no: number; label: string; earned_at: string };

export type Certificate = {
  id: string;
  juz: number;
  status: CertificateStatus;
  serial: string;
  student_name: string;
  halaqa_name: string | null;
  center_name: string | null;
  teacher_name: string | null;
  teacher_note: string | null;
  decided_at: string | null;
  created_at: string;
  /** رمز التحقق (10.2)، للمعتمدة فقط. */
  verify_code?: string | null;
};

export type Achievements = {
  student: { id: string; name: string } | null;
  streak: Streak;
  memorized_pages: number;
  memorized: number[];
  badges: Badge[];
  certificates: Certificate[];
};

export type PendingCertificate = {
  id: string;
  student_id: string;
  student_name: string;
  juz: number;
  halaqa_name: string | null;
  created_at: string;
};

export type HonorRow = {
  student_id: string;
  name: string;
  active_30: number;
  streak: number;
  badges: number;
  is_me: boolean;
};

export type HonorBoard = { enabled: boolean; can_manage: boolean; rows: HonorRow[] };

export type ChallengePart = { part: number; name: string; mine: boolean; done: boolean };

export type Challenge = {
  id: string;
  title: string;
  kind: ChallengeKind;
  target: number;
  starts_on: string;
  ends_on: string;
  completed_at: string | null;
  progress: number;
  my_pages: number;
  contributors: number;
  parts: ChallengePart[];
};

export type ChallengesView = {
  can_manage: boolean;
  is_member: boolean;
  today: string;
  challenges: Challenge[];
};

export type AchievementHalaqa = {
  halaqa_id: string;
  halaqa_name: string;
  honor_board: boolean;
  active_challenges: number;
};

export const BADGE_GROUP_LABEL: Record<BadgeKind, string> = {
  juz: "الأجزاء",
  hizb: "الأحزاب",
  surah: "السور",
  streak: "الالتزام",
};

export const STREAK_MILESTONES = [7, 30, 100] as const;

const ORDINALS = [
  "الأول",
  "الثاني",
  "الثالث",
  "الرابع",
  "الخامس",
  "السادس",
  "السابع",
  "الثامن",
  "التاسع",
  "العاشر",
];
const ORDINALS_TEEN = [
  "الحادي عشر",
  "الثاني عشر",
  "الثالث عشر",
  "الرابع عشر",
  "الخامس عشر",
  "السادس عشر",
  "السابع عشر",
  "الثامن عشر",
  "التاسع عشر",
];
const ORDINALS_TENS_UNIT = [
  "الحادي",
  "الثاني",
  "الثالث",
  "الرابع",
  "الخامس",
  "السادس",
  "السابع",
  "الثامن",
  "التاسع",
];

/** «الجزء الحادي والعشرون» — ترتيب عربي للأعداد 1..30. */
export function juzOrdinal(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 30) return String(n);
  if (n <= 10) return ORDINALS[n - 1];
  if (n < 20) return ORDINALS_TEEN[n - 11];
  if (n === 20) return "العشرون";
  if (n < 30) return `${ORDINALS_TENS_UNIT[n - 21]} والعشرون`;
  return "الثلاثون";
}

/** رسالة السلسلة: تشجيع بلا لوم عند الانقطاع. */
export function streakMessage(s: Streak): string {
  if (s.current === 0) {
    return s.active_30 > 0
      ? `التزمت ${s.active_30} يوماً هذا الشهر. ابدأ سلسلة جديدة اليوم.`
      : "ابدأ اليوم: سجّل وردك أو احفظ صفحة.";
  }
  if (!s.today) return `سلسلتك ${s.current} يوماً. سجّل اليوم لتستمر.`;
  const next = STREAK_MILESTONES.find((m) => m > s.current);
  return next
    ? `سلسلتك ${s.current} يوماً. بقي ${next - s.current} لوسام ${next} يوماً.`
    : `سلسلتك ${s.current} يوماً. بارك الله فيك.`;
}

/** تجميع الأوسمة حسب النوع بترتيب العرض، والأرقام تصاعدياً. */
export function groupBadges(badges: Badge[]): { kind: BadgeKind; items: Badge[] }[] {
  const order: BadgeKind[] = ["juz", "hizb", "surah", "streak"];
  return order
    .map((kind) => ({
      kind,
      items: badges.filter((b) => b.kind === kind).sort((a, b) => a.no - b.no),
    }))
    .filter((g) => g.items.length > 0);
}

export type NewChallenge = {
  title: string;
  kind: ChallengeKind;
  target: number;
  starts_on: string;
  ends_on: string;
};

/** التحقق من تحدٍّ جديد قبل إرساله (يطابق قيود قاعدة البيانات). */
export function validateChallenge(c: NewChallenge): string | null {
  const title = c.title.trim();
  if (title.length < 2 || title.length > 80) return "العنوان بين حرفين و80 حرفاً.";
  if (c.kind === "pages" && (!Number.isInteger(c.target) || c.target < 1 || c.target > 100000))
    return "الهدف عدد صفحات بين 1 و100000.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.starts_on) || !/^\d{4}-\d{2}-\d{2}$/.test(c.ends_on))
    return "حدّد تاريخي البداية والنهاية.";
  const days = (Date.parse(c.ends_on) - Date.parse(c.starts_on)) / 86_400_000;
  if (days < 0) return "النهاية قبل البداية.";
  if (days > 120) return "أقصى مدة للتحدي 120 يوماً.";
  return null;
}

export function challengePercent(c: Pick<Challenge, "progress" | "target">): number {
  if (c.target <= 0) return 0;
  return Math.min(100, Math.round((c.progress / c.target) * 100));
}

// ─────────────────────── الاتصال ───────────────────────

// الاسم مُتحقَّق منه وقت الترجمة؛ الوسائط تُبنى في الدوال المصدَّرة أدناه.
async function call<T>(fn: RpcName, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await rpc(fn, args as never);
  if (error) throw new Error(error.message);
  return data as T;
}

export const getAchievements = (studentId: string) =>
  call<Achievements>("student_achievements", { _student: studentId });

export async function logWird(studentId: string, day: string, pages: number | null) {
  const { error } = await db.from("daily_wird").insert({ student_id: studentId, day, pages });
  if (error)
    throw new Error(error.code === "23505" ? "سجّلت ورد هذا اليوم من قبل." : error.message);
}

export async function unlogWird(studentId: string, day: string) {
  const { error } = await db.from("daily_wird").delete().eq("student_id", studentId).eq("day", day);
  if (error) throw new Error(error.message);
}

export const myPendingCertificates = () =>
  call<PendingCertificate[]>("my_pending_certificates").then((r) => r ?? []);

export const decideCertificate = (id: string, approve: boolean, note?: string) =>
  call<{ ok: boolean }>("decide_certificate", { _id: id, _approve: approve, _note: note ?? null });

export const getHonorBoard = (halaqaId: string) =>
  call<HonorBoard>("halaqa_honor_board", { _halaqa: halaqaId });

export const setHonorBoard = (halaqaId: string, enabled: boolean) =>
  call<void>("set_honor_board", { _halaqa: halaqaId, _enabled: enabled });

export const getChallenges = (halaqaId: string) =>
  call<ChallengesView>("halaqa_challenges_view", { _halaqa: halaqaId });

export const myAchievementHalaqat = () =>
  call<AchievementHalaqa[]>("my_achievement_halaqat").then((r) => r ?? []);

export async function createChallenge(halaqaId: string, userId: string, c: NewChallenge) {
  const bad = validateChallenge(c);
  if (bad) throw new Error(bad);
  const { error } = await db.from("halaqa_challenges").insert({
    halaqa_id: halaqaId,
    title: c.title.trim(),
    kind: c.kind,
    target: c.kind === "khatma" ? 30 : c.target,
    starts_on: c.starts_on,
    ends_on: c.ends_on,
    created_by: userId,
  });
  if (error) throw new Error(error.message);
}

export async function deleteChallenge(id: string) {
  const { error } = await db.from("halaqa_challenges").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

const PART_ERROR: Record<string, string> = {
  taken: "حجز هذا الجزء عضو آخر.",
  limit: "لديك 3 أجزاء لم تُتمّها بعد.",
};

export async function partAction(
  challengeId: string,
  part: number,
  action: "claim" | "done" | "release",
) {
  const r = await call<{ ok: boolean; error?: string }>("challenge_part_action", {
    _challenge: challengeId,
    _part: part,
    _action: action,
  });
  if (!r.ok) throw new Error(PART_ERROR[r.error ?? ""] ?? "تعذّر التنفيذ.");
}

export const logChallengePages = (challengeId: string, pages: number) =>
  call<{ ok: boolean }>("log_challenge_pages", { _challenge: challengeId, _pages: pages });
