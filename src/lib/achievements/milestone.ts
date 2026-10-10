/**
 * بطاقات الإنجاز للمشاركة (11.4): «ختم جزء» و«سلسلة 30 يوماً» فأكثر. نص تشجيعي فقط، بلا درجات
 * ولا اسم ولا مقارنة. «محاسبتي» خارجها دائماً (القاعدة 16): لا يقبل هذا الملف إلا أوسمة الأجزاء
 * والسلاسل.
 */
import { juzOrdinal, type Badge } from "./index";

export type Milestone = {
  key: string;
  kind: "juz" | "streak";
  no: number;
  eyebrow: string;
  headline: string;
  sub: string;
  figure?: number;
  shareText: string;
  fileName: string;
};

/** أقل سلسلة تُعرض للمشاركة. */
export const SHARE_STREAK_MIN = 30;

export function milestoneFor(b: Pick<Badge, "kind" | "no">): Milestone | null {
  if (b.kind === "juz" && Number.isInteger(b.no) && b.no >= 1 && b.no <= 30) {
    const ord = juzOrdinal(b.no);
    return {
      key: `juz-${b.no}`,
      kind: "juz",
      no: b.no,
      eyebrow: "إنجاز بفضل الله",
      headline: `ختمتُ حفظ الجزء ${ord}`,
      sub: "خيركم من تعلّم القرآن وعلّمه",
      figure: b.no,
      shareText: `الحمد لله، ختمتُ حفظ الجزء ${ord} من القرآن الكريم.\n\n— من تطبيق زِن`,
      fileName: `zen-juz-${b.no}.png`,
    };
  }
  if (b.kind === "streak" && Number.isInteger(b.no) && b.no >= SHARE_STREAK_MIN) {
    return {
      key: `streak-${b.no}`,
      kind: "streak",
      no: b.no,
      eyebrow: "التزام مع القرآن",
      headline: `${b.no} يوماً متتالية`,
      sub: "أحبّ الأعمال إلى الله أدومها وإن قلّ",
      figure: b.no,
      shareText: `الحمد لله، أتممتُ ${b.no} يوماً متتالية مع القرآن.\n\n— من تطبيق زِن`,
      fileName: `zen-streak-${b.no}.png`,
    };
  }
  return null;
}

/** الإنجازات القابلة للمشاركة، الأحدث أولاً. */
export function shareableMilestones(badges: Badge[]): Milestone[] {
  return [...badges]
    .sort((a, b) => b.earned_at.localeCompare(a.earned_at))
    .map(milestoneFor)
    .filter((m): m is Milestone => m != null);
}

/** يرسم البطاقة ويشاركها (محلياً بالكامل). */
export async function shareMilestone(
  m: Milestone,
  theme: "night" | "emerald" | "light" = "night",
): Promise<"shared" | "downloaded" | "copied" | "cancelled"> {
  const { renderMilestoneCard, shareCardImage } = await import("@/lib/quran/share-card");
  const canvas = document.createElement("canvas");
  await renderMilestoneCard(canvas, {
    eyebrow: m.eyebrow,
    headline: m.headline,
    sub: m.sub,
    figure: m.figure,
    theme,
    size: "square",
  });
  return shareCardImage(canvas, m.fileName, m.shareText, "مشاركة الإنجاز");
}
