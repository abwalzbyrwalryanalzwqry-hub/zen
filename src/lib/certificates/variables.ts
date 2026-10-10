import { localDayKey } from "@/lib/local-day";

/**
 * المتغيّرات الديناميكية في نصوص الشهادة: {{student.name}} وأخواتها.
 *
 * القيم لا تُكتب في الاستوديو: الطالب والحلقة والمركز والمعلّم من قاعدة البيانات (تكتبها cert_issue في لقطة
 * الشهادة)، والإنجاز والحفظ والمراجعة والحضور والتقييم من محرّك سجل الإنجاز (src/lib/reports) — فلا منطق
 * حساب موازٍ هنا. متغيّر غير معروف أو بلا قيمة يمنع الإصدار («يوجد متغير غير قابل للقراءة.»).
 */

export type VarGroup =
  | "student"
  | "center"
  | "circle"
  | "teacher"
  | "achievement"
  | "memorization"
  | "revision"
  | "evaluation"
  | "attendance"
  | "certificate"
  | "period";

export interface VarDef {
  key: string;
  group: VarGroup;
  /** مصدر القيمة: من الخادم وقت الإصدار، أو من سجل الإنجاز على الجهاز. */
  source: "server" | "achievement";
  /** قيمة يملؤها الخادم عند الإصدار (رقم الشهادة) فلا تُعدّ ناقصة في المعاينة. */
  assignedAtIssue?: boolean;
  /** صورة لا نص (شعار المركز). */
  image?: boolean;
}

export const VARIABLES: VarDef[] = [
  { key: "student.name", group: "student", source: "server" },
  { key: "student.fullName", group: "student", source: "server" },
  { key: "student.id", group: "student", source: "server" },
  { key: "center.name", group: "center", source: "server" },
  { key: "center.logo", group: "center", source: "server", image: true },
  { key: "circle.name", group: "circle", source: "server" },
  { key: "teacher.name", group: "teacher", source: "server" },
  { key: "achievement.title", group: "achievement", source: "achievement" },
  { key: "achievement.description", group: "achievement", source: "achievement" },
  { key: "achievement.type", group: "achievement", source: "achievement" },
  { key: "achievement.amount", group: "achievement", source: "achievement" },
  { key: "memorization.total", group: "memorization", source: "achievement" },
  { key: "memorization.last", group: "memorization", source: "achievement" },
  { key: "revision.total", group: "revision", source: "achievement" },
  { key: "revision.last", group: "revision", source: "achievement" },
  { key: "evaluation.average", group: "evaluation", source: "achievement" },
  { key: "attendance.rate", group: "attendance", source: "achievement" },
  { key: "certificate.date", group: "certificate", source: "server" },
  { key: "certificate.number", group: "certificate", source: "server", assignedAtIssue: true },
  { key: "certificate.type", group: "certificate", source: "server" },
  { key: "period.from", group: "period", source: "server" },
  { key: "period.to", group: "period", source: "server" },
];

const BY_KEY = new Map(VARIABLES.map((v) => [v.key, v]));
export const isKnownVar = (k: string) => BY_KEY.has(k);
export const varDef = (k: string) => BY_KEY.get(k);

/** القيم: مجموعات → حقول → نص. هي نفسها شكل `snapshot.vars` في قاعدة البيانات. */
export type VarBag = Partial<Record<VarGroup | "custom", Record<string, string | number>>>;

const ANY_TOKEN = /\{\{([^}]*)\}\}/g;

/** المتغيّرات المذكورة في نص (المعروفة وغير المعروفة) بترتيب ظهورها. */
export function tokensOf(text: string): string[] {
  return [...text.matchAll(ANY_TOKEN)].map((m) => m[1].trim());
}

export function lookup(vars: VarBag, key: string): string | null {
  const [g, f] = key.split(".");
  const v = (vars as Record<string, Record<string, unknown> | undefined>)[g]?.[f];
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

export interface Resolved {
  text: string;
  missing: string[];
  unknown: string[];
}

/**
 * يستبدل المتغيّرات بقيمها. الناقص يُترك مكانه علامة قابلة للرؤية في المعاينة («…») ويُعاد في `missing`
 * فيمنع التحقق الإصدار. `allowPending` يقبل رقم الشهادة قبل الإصدار (يعرض نموذجاً).
 */
export function resolveText(
  text: string,
  vars: VarBag,
  opts: { allowPending?: boolean; pending?: string } = {},
): Resolved {
  const missing: string[] = [];
  const unknown: string[] = [];
  const out = text.replace(ANY_TOKEN, (_m, raw: string) => {
    const key = raw.trim();
    if (!/^[a-zA-Z]+\.[a-zA-Z]+$/.test(key) || !isKnownVar(key)) {
      unknown.push(key);
      return "…";
    }
    const v = lookup(vars, key);
    if (v != null) return v;
    if (varDef(key)?.assignedAtIssue && opts.allowPending) return opts.pending ?? "ZEN-0000-000000";
    missing.push(key);
    return "…";
  });
  return { text: out, missing, unknown };
}

/** يُدرج متغيّراً في نص عند موضع المؤشر. */
export function insertToken(text: string, key: string, at = text.length): string {
  const tok = `{{${key}}}`;
  return text.slice(0, at) + tok + text.slice(at);
}

export const hasTokens = (text: string) => /\{\{/.test(text);

/**
 * قيم الخادم في المعاينة قبل الإصدار: تُبنى من البيانات نفسها التي ستكتبها cert_issue (اسم الطالب من ملفه،
 * الحلقة والمركز والمعلّم من الحلقة)، فالمعاينة تطابق الشهادة الصادرة.
 */
export function serverPreviewVars(o: {
  studentId: string;
  studentName: string;
  centerName: string;
  centerCity?: string | null;
  circleName: string;
  teacherName: string | null;
  issueDate: string;
  typeName: string;
  periodFrom?: string | null;
  periodTo?: string | null;
  number?: string | null;
  verifyCode?: string | null;
}): VarBag {
  return {
    student: {
      id: o.studentId.replace(/-/g, "").slice(0, 8).toUpperCase(),
      name: o.studentName,
      fullName: o.studentName,
    },
    center: { name: o.centerName, city: o.centerCity ?? "" },
    circle: { name: o.circleName },
    teacher: { name: o.teacherName ?? "" },
    certificate: {
      number: o.number ?? "",
      date: o.issueDate,
      type: o.typeName,
      verifyCode: o.verifyCode ?? "",
    },
    period: { from: o.periodFrom ?? "", to: o.periodTo ?? "" },
  };
}

/** يدمج مجموعات (اللاحق يغلب)؛ قيم الخادم تُمرَّر أخيراً فتغلب ما يرسله العميل كما في cert_issue. */
export function mergeVars(...bags: VarBag[]): VarBag {
  const out: VarBag = {};
  for (const b of bags)
    for (const [g, fields] of Object.entries(b))
      out[g as VarGroup] = { ...(out[g as VarGroup] ?? {}), ...(fields ?? {}) };
  return out;
}

/** ما يُرسل للخادم من قيم سجل الإنجاز فقط (الخادم يكتب الباقي ويتجاهل غيره). */
export function achievementVarsOnly(v: VarBag): VarBag {
  const keep: (VarGroup | "custom")[] = [
    "achievement",
    "memorization",
    "revision",
    "evaluation",
    "attendance",
    "custom",
  ];
  const out: VarBag = {};
  for (const g of keep) if (v[g]) out[g] = v[g];
  return out;
}

/** قيم نموذجية للمصمم قبل اختيار طالب (من القاموس)؛ المعاينة على طالب حقيقي تستبدلها. */
export function sampleVars(
  tr: (k: string, v?: Record<string, string | number>) => string,
  typeName: string,
): VarBag {
  const s = (k: string) => tr(`certificates.sample.${k}`);
  const achievement = s("achievement");
  return {
    student: { id: "A1B2C3D4", name: s("student"), fullName: s("student") },
    center: { name: s("center"), city: "" },
    circle: { name: s("circle") },
    teacher: { name: s("teacher") },
    achievement: {
      title: achievement,
      type: typeName,
      amount: s("amount"),
      description: tr("certificates.typeText.completion", { achievement }),
    },
    memorization: { total: s("amount"), last: s("last") },
    revision: { total: s("amount"), last: s("last") },
    evaluation: { average: s("average") },
    attendance: { rate: s("rate") },
    certificate: { number: "", date: localDayKey(), type: typeName, verifyCode: "" },
    period: { from: "", to: "" },
  };
}
