/**
 * ميزان تقييم التسميع (فحص الأقسام، P0). بدل منزلق يبدأ عند 85 فيحفظه المعلّم المستعجل كما هو، يختار المعلّم
 * تقديراً صريحاً أو يحرّك المنزلق؛ ولا يُحفظ تقييم بلا درجة مختارة.
 */
import { t } from "@/lib/i18n";

export type GradeKey = "excellent" | "veryGood" | "good" | "pass" | "weak";

/** القيمة الممثِّلة لكل تقدير عند اختياره بزر سريع. */
export const GRADE_PRESETS: { key: GradeKey; score: number }[] = [
  { key: "excellent", score: 95 },
  { key: "veryGood", score: 85 },
  { key: "good", score: 75 },
  { key: "pass", score: 60 },
  { key: "weak", score: 40 },
];

/** حدود التقديرات (الحد الأدنى لكل تقدير). */
export function gradeOf(score: number): GradeKey {
  if (score >= 90) return "excellent";
  if (score >= 80) return "veryGood";
  if (score >= 70) return "good";
  if (score >= 50) return "pass";
  return "weak";
}

export function gradeLabel(key: GradeKey): string {
  return t(`grading.${key}`);
}

/** أنواع أخطاء التسميع (تُحفظ نصاً عربياً في assessments.errors كما كانت). */
export const RECITATION_ERROR_TYPES = [
  "نسيان آية",
  "خطأ في الحفظ",
  "أحكام التجويد",
  "المدود",
  "الوقف والابتداء",
  "مخارج الحروف",
] as const;

/**
 * حالة تقييم بطاقة واحدة. كانت الحالة مشتركة بين كل البطاقات فتنتقل درجة طالب وأخطاؤه وملاحظاته إلى
 * الطالب التالي عند فتح بطاقته؛ الآن تبدأ كل بطاقة من هنا (درجة الذكاء الاصطناعي مقترحة إن وُجدت).
 */
export function initialReview(aiScore: number | null | undefined): {
  score: number | null;
  suggested: boolean;
  errs: string[];
  notes: string;
} {
  const s = typeof aiScore === "number" ? Math.max(0, Math.min(100, Math.round(aiScore))) : null;
  return { score: s, suggested: s !== null, errs: [], notes: "" };
}

/** درجة سجل الحلقة (1–5) بالتقدير نفسه المستعمل في التسميع، فلا يرى المعلّم مقياسين مختلفين. */
export function gradeKeyOf5(g: number): GradeKey {
  return (["weak", "pass", "good", "veryGood", "excellent"] as const)[
    Math.min(5, Math.max(1, Math.round(g))) - 1
  ];
}
