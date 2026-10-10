/**
 * قيم متغيّرات الإنجاز من سجل الإنجاز القائم: StudentReport (compute) ← {{achievement.*}} و{{memorization.*}}
 * و{{revision.*}} و{{evaluation.average}} و{{attendance.rate}}. الصياغة من القاموس، والأرقام بنمط الشهادة.
 */
import { t } from "@/lib/i18n";
import { SURAHS } from "@/lib/quran-meta";
import { juzOrdinal } from "@/lib/achievements";
import type { StudentReport } from "@/lib/reports/compute";
import { fmtNum, fmtPct } from "@/lib/reports/format";
import type { AchievementRef } from "./eligibility";
import type { NumberStyleSpec } from "./model";
import type { VarBag } from "./variables";

export interface TypeInfo {
  key: string;
  name: string;
  text_kind: string;
  /** نصوص مخصصة لنوع أنشأه المركز: description بالمتغيّر {achievement}. */
  texts?: Record<string, string> | null;
}

const pages = (n: number, s: NumberStyleSpec) =>
  t("certificates.unit.pages", { n: fmtNum(n, s.digits, 1) });

function point(
  seg: { surah_name: string; to_ayah: number } | null | undefined,
  s: NumberStyleSpec,
) {
  return seg
    ? t("certificates.unit.point", {
        surah: seg.surah_name,
        ayah: fmtNum(seg.to_ayah, s.digits, 0),
      })
    : "";
}

/** عنوان الإنجاز: من المرجع المختار (سورة/جزء/مقرر) وإلا من النوع. */
export function achievementTitle(type: TypeInfo, ref: AchievementRef): string {
  if (ref?.kind === "surah")
    return t("certificates.ach.surah", { surah: SURAHS[ref.surah - 1]?.name ?? "" });
  if (ref?.kind === "juz") return t("certificates.ach.juz", { juz: juzOrdinal(ref.juz) });
  if (ref?.kind === "course") return ref.title;
  if (ref?.kind === "milestone") return ref.text;
  if (type.key === "quran_complete") return t("certificates.ach.khatm");
  const k = `certificates.achTitle.${type.key}`;
  const v = t(k);
  return v === k ? type.name : v;
}

export function achievementVars(
  r: StudentReport | null,
  type: TypeInfo,
  ref: AchievementRef,
  s: NumberStyleSpec,
): VarBag {
  const title = achievementTitle(type, ref);
  const out: VarBag = {
    achievement: {
      title,
      type: type.name,
      description: type.texts?.description
        ? type.texts.description.replace(/\{achievement\}/g, title)
        : t(`certificates.typeText.${type.text_kind}`, { achievement: title }),
    },
  };
  if (!r) return out;
  const st = r.stats;
  const amount =
    ref?.kind === "juz" || type.key === "juz_complete"
      ? t("certificates.unit.juzCount", { n: fmtNum(r.journey.completedJuz.length, s.digits, 0) })
      : st.memorize.pages > 0
        ? pages(st.memorize.pages, s)
        : st.review.pages > 0
          ? pages(st.review.pages, s)
          : "";
  if (amount) out.achievement!.amount = amount;
  out.memorization = {};
  if (st.memorize.pages > 0) out.memorization.total = pages(st.memorize.pages, s);
  const lastMem = point(r.journey.last ?? st.memorize.last?.segments.at(-1), s);
  if (lastMem) out.memorization.last = lastMem;
  out.revision = {};
  if (st.review.pages > 0) out.revision.total = pages(st.review.pages, s);
  const lastRev = point(st.review.last?.segments.at(-1), s);
  if (lastRev) out.revision.last = lastRev;
  if (st.avgEvaluation != null)
    out.evaluation = {
      average: t("certificates.unit.outOf5", { n: fmtNum(st.avgEvaluation, s.digits, 1) }),
    };
  if (st.attendance.rate != null) out.attendance = { rate: fmtPct(st.attendance.rate, s.digits) };
  return out;
}
