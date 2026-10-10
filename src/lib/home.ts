/**
 * تجربة حسب الدور (المرحلة 9): أي واجهة يرى صاحب الحساب، وما في شريطه السفلي وصفحة «المزيد».
 *
 * هذه الملفات منطق عرض فقط. الصلاحيات لا تُستنتج من هنا أبداً: قاعدة البيانات تبقى الحَكَم
 * (دور المعلم من user_roles، وولاية الأمر من guardian_links).
 */
import { rpc } from "@/integrations/supabase/rpc";
import { t } from "@/lib/i18n";
import type { FeatureKey } from "@/lib/feature-flags";

export type AccountKind = "student" | "guardian";
export type HomeMode = "student" | "teacher" | "guardian";

export type HomeContext = {
  account_kind: AccountKind | null;
  is_teacher: boolean;
  children: number;
  halaqas_joined: number;
  halaqas_taught: number;
  center_staff: boolean;
  /** 1.19.0: مركز يدرّس فيه المعلّم أو يعمل فيه فعّل «الوضع المبسّط» لمعلّميه. */
  center_simple_mode: boolean;
  /** 1.19.0: خطوات «أول يوم لك» للمعلّم (null لغير المعلّم). */
  setup: TeacherSetup | null;
  /** 1.19.0: أقرب تحدٍّ جارٍ في حلقات الطالب. */
  active_challenge: ActiveChallenge | null;
};

export type TeacherSetup = { students: number; records: boolean; guardians: boolean };
export type ActiveChallenge = {
  id: string;
  halaqa_id: string;
  title: string;
  kind: "khatma" | "pages";
  target: number;
  progress: number;
  ends_on: string;
};

export const EMPTY_CONTEXT: HomeContext = {
  account_kind: null,
  is_teacher: false,
  children: 0,
  halaqas_joined: 0,
  halaqas_taught: 0,
  center_staff: false,
  center_simple_mode: false,
  setup: null,
  active_challenge: null,
};

/**
 * المعلّم أولاً (دوره ممنوح برمز)، ثم ولي الأمر إن اختاره صراحةً، أو لم يختر شيئاً وله
 * أبناء مرتبطون وليس طالباً في أي حلقة. ما سوى ذلك طالب.
 */
export function resolveHomeMode(ctx: HomeContext): HomeMode {
  if (ctx.is_teacher) return "teacher";
  if (ctx.account_kind === "guardian") return "guardian";
  if (ctx.account_kind === null && ctx.children > 0 && ctx.halaqas_joined === 0) return "guardian";
  return "student";
}

/** يُسأل صاحب الحساب مرة واحدة: طالب أم ولي أمر؟ (المعلّم لا يُسأل.) */
export function needsKindChoice(ctx: HomeContext): boolean {
  return !ctx.is_teacher && ctx.account_kind === null;
}

export type NavKey =
  "today" | "quran" | "mushaf" | "chats" | "teacher" | "family" | "exams" | "muhasaba" | "more";

export type NavItem = { key: NavKey; to: string; label: string };

const NAV_TO: Record<NavKey, string> = {
  today: "/today",
  quran: "/quran",
  mushaf: "/mushaf",
  chats: "/chats",
  teacher: "/teacher",
  family: "/family",
  exams: "/exams",
  muhasaba: "/muhasaba",
  more: "/more",
};
// النصوص من القاموس (13.1) وتُقرأ عند كل نداء لتتبع اللغة الحالية.
const nav = (k: NavKey, home = false): NavItem => ({
  key: k,
  to: NAV_TO[k],
  label: t(home ? "nav.home" : `nav.${k}`),
});

/** الشريط السفلي: خمسة عناصر على الأكثر، آخرها «المزيد». */
export function navItemsFor(mode: HomeMode): NavItem[] {
  const keys: NavKey[] =
    mode === "teacher"
      ? ["today", "teacher", "chats", "mushaf", "more"]
      : mode === "guardian"
        ? ["today", "family", "chats", "more"]
        : ["today", "quran", "mushaf", "chats", "more"];
  return keys.map((k) => nav(k, k === "today" && mode !== "student"));
}

/**
 * مدخل «المزيد» ومجموعته بمفتاح ثابت لا يتغيّر بلغة الواجهة (تحليل «المزيد» ARC-01/A11Y-01):
 * المفتاح يُستعمل للأيقونة ومعرّف العنوان ومفتاح React بدل النص المترجَم.
 */
export type MoreLink = { key: string; to: string; label: string; hint: string };
export type MoreSection = { key: string; title: string; links: MoreLink[] };

const LINK_TO = {
  assistant: "/assistant",
  recite: "/recite",
  exams: "/exams",
  stories: "/stories",
  achievements: "/achievements",
  quran: "/quran",
  mushaf: "/mushaf",
  muhasaba: "/muhasaba",
  family: "/family",
  register: "/teacher/register",
  attendanceCode: "/teacher/attendance-code",
  atRisk: "/teacher/at-risk",
  import: "/teacher/import",
  verify: "/verify",
  certificates: "/certificates",
  centers: "/centers",
  notifications: "/notifications",
  settingsDisplay: "/settings/display",
  settingsNotifications: "/settings/notifications",
  settingsPrayer: "/settings/prayer",
  settingsLock: "/settings/lock",
  storage: "/storage",
  about: "/about",
  privacy: "/legal/privacy",
  terms: "/legal/terms",
  appHealth: "/app-health",
  ownerUsage: "/owner/usage",
  ownerFeedback: "/owner/feedback",
  help: "/help",
  feedback: "/feedback",
  whatsNew: "/about/whats-new",
  fees: "/fees",
  remote: "/recite/remote",
  teacherRemote: "/teacher/remote",
} as const;
type LinkKey = keyof typeof LINK_TO;
const link = (k: LinkKey): MoreLink => ({
  key: k,
  to: LINK_TO[k],
  label: t(`more.links.${k}.label`),
  hint: t(`more.links.${k}.hint`),
});
/** روابط «المزيد» بلغة الواجهة الحالية. */
const links = () =>
  Object.fromEntries((Object.keys(LINK_TO) as LinkKey[]).map((k) => [k, link(k)])) as Record<
    LinkKey,
    MoreLink
  >;
const sec = (k: string) => ({ key: k, title: t(`more.sections.${k}`) });

/** شريط الضيف (دون حساب): ما يعمل على الجهاز وحده. */
export function guestNavItems(): NavItem[] {
  return (["today", "mushaf", "exams", "muhasaba", "more"] as NavKey[]).map((k) =>
    nav(k, k === "today"),
  );
}

/**
 * «المزيد» للضيف (تحليل «المزيد» IA-03، §7.3): ما ليس في شريطه فقط. المصحف والاختبارات والمحاسبة في الشريط،
 * فلا تتكرّر هنا. الخصوصية والشروط ظاهرة له (IA-05، مطلب Google Play).
 */
export function guestMoreSections(): MoreSection[] {
  const L = links();
  return [
    { ...sec("app"), links: [L.settingsDisplay, L.settingsPrayer, L.settingsLock, L.storage] },
    supportSection(true),
    aboutSection(),
  ];
}

/**
 * «المساعدة والدعم» (GAP-02/04/07): الأسئلة المتكررة، والإبلاغ عن مشكلة (يحتاج حساباً فلا يظهر للضيف)،
 * وما الجديد. المشاركة والتقييم إجراءان تضيفهما صفحة «المزيد» في القسم نفسه.
 */
export function supportSection(guest = false): MoreSection {
  const L = links();
  return {
    ...sec("support"),
    links: guest ? [L.help, L.whatsNew] : [L.help, L.feedback, L.whatsNew],
  };
}

/** «عن زِن» في آخر «المزيد» للجميع: الإصدار والمطوّر والمصادر داخل الصفحة، والخصوصية والشروط مباشرة. */
export function aboutSection(): MoreSection {
  const L = links();
  return { ...sec("about"), links: [L.about, L.privacy, L.terms] };
}

/** «صاحب التطبيق» لمالكه وحده (BUG-18): صحة التطبيق، والاستخدام ومفاتيح الميزات (كانت صفحة يتيمة). */
export function ownerSection(): MoreSection {
  const L = links();
  return { ...sec("owner"), links: [L.appHealth, L.ownerUsage, L.ownerFeedback] };
}

/**
 * صفحة «المزيد»: كل ما ليس في الشريط، مرتّباً حسب الدور. ولي الأمر لا يرى أدوات الطالب.
 * `on`: مفاتيح الميزات (4.2) — المدخل المعطَّل يختفي، والقسم الفارغ يختفي معه.
 */
export function moreSectionsFor(
  mode: HomeMode,
  ctx: HomeContext,
  on: (k: FeatureKey) => boolean = () => true,
  simple = false,
): MoreSection[] {
  return sectionsFor(mode, ctx, simple)
    .map((s) => ({
      ...s,
      links: s.links.filter((l) => {
        const k = FLAGGED_LINKS[l.to];
        return !k || on(k);
      }),
    }))
    .filter((s) => s.links.length > 0);
}

/** مسار المدخل ← مفتاح الميزة الذي يتحكّم في ظهوره. */
const FLAGGED_LINKS: Record<string, FeatureKey> = {
  [LINK_TO.stories]: "stories",
  [LINK_TO.achievements]: "achievements",
  [LINK_TO.assistant]: "assistant",
  [LINK_TO.recite]: "recite",
  [LINK_TO.certificates]: "certificates",
  [LINK_TO.fees]: "fees",
  [LINK_TO.remote]: "remote",
  [LINK_TO.teacherRemote]: "remote",
};

function sectionsFor(mode: HomeMode, ctx: HomeContext, simple = false): MoreSection[] {
  const L = links();
  // «التطبيق» (§7.2): صفحة لكل سؤال. «الحساب» نفسه بطاقة أعلى «المزيد» فلا يتكرّر رابطه هنا (IA-02).
  const account: MoreSection = {
    ...sec("app"),
    links: [
      L.notifications,
      L.settingsDisplay,
      L.settingsNotifications,
      L.settingsPrayer,
      L.settingsLock,
      L.storage,
    ],
  };
  if (mode === "guardian") {
    return [
      ...(ctx.children > 0 || ctx.center_staff ? [{ ...sec("halaqat"), links: [L.centers] }] : []),
      ...(ctx.children > 0 ? [{ ...sec("children"), links: [L.fees] }] : []),
      { ...sec("self"), links: [L.mushaf, L.muhasaba, L.assistant] },
      account,
    ];
  }
  if (mode === "teacher" && simple) {
    // الوضع المبسّط (1.19.0): ما يحتاجه المعلّم كل يوم فقط؛ بقية الأدوات تعود بإيقافه من «التفضيلات».
    return [
      { ...sec("teacherTools"), links: [L.register, L.attendanceCode, L.atRisk, L.teacherRemote] },
      { ...sec("teaching"), links: [L.centers] },
      { ...sec("self"), links: [L.quran, L.muhasaba] },
      ...(ctx.children > 0 ? [{ ...sec("children"), links: [L.family, L.fees] }] : []),
      account,
    ];
  }
  if (mode === "teacher") {
    return [
      // أدوات المعلّم مجمَّعة هنا بدل تكرارها بطاقاتٍ في الرئيسية (فحص الأقسام P1).
      {
        ...sec("teacherTools"),
        links: [
          L.register,
          L.teacherRemote,
          L.certificates,
          L.attendanceCode,
          L.atRisk,
          L.import,
          L.exams,
          L.verify,
        ],
      },
      { ...sec("teaching"), links: [L.centers] },
      { ...sec("self"), links: [L.quran, L.recite, L.muhasaba, L.assistant, L.stories] },
      ...(ctx.children > 0 ? [{ ...sec("children"), links: [L.family, L.fees] }] : []),
      account,
    ];
  }
  return [
    {
      ...sec("learning"),
      links: [L.recite, L.remote, L.exams, L.stories, L.achievements, L.assistant],
    },
    { ...sec("self"), links: [L.muhasaba, L.fees] },
    ...(ctx.children > 0 ? [{ ...sec("children"), links: [L.family] }] : []),
    { ...sec("halaqa"), links: [L.centers] },
    account,
  ];
}

/** «المزيد» نشط في الشريط حين تكون الصفحة الحالية من روابطه. */
export function activeNavKey(path: string, items: NavItem[]): NavKey | null {
  const hit = items
    .filter((i) => i.key !== "more")
    .find((i) => path === i.to || path.startsWith(i.to + "/"));
  return hit ? hit.key : items.some((i) => i.key === "more") ? "more" : null;
}

function asContext(raw: unknown): HomeContext {
  const r = (raw ?? {}) as Partial<HomeContext>;
  return {
    account_kind:
      r.account_kind === "student" || r.account_kind === "guardian" ? r.account_kind : null,
    is_teacher: !!r.is_teacher,
    children: Number(r.children ?? 0),
    halaqas_joined: Number(r.halaqas_joined ?? 0),
    halaqas_taught: Number(r.halaqas_taught ?? 0),
    center_staff: !!r.center_staff,
    center_simple_mode: !!r.center_simple_mode,
    setup: r.setup
      ? {
          students: Number(r.setup.students ?? 0),
          records: !!r.setup.records,
          guardians: !!r.setup.guardians,
        }
      : null,
    active_challenge: r.active_challenge?.id ? r.active_challenge : null,
  };
}

export async function fetchHomeContext(): Promise<HomeContext> {
  const { data, error } = await rpc("my_home_context");
  if (error) throw error;
  return asContext(data);
}

export async function setAccountKind(kind: AccountKind): Promise<void> {
  const { error } = await rpc("set_account_kind", { _kind: kind });
  if (error) throw error;
}
