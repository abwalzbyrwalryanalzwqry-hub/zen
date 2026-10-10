import { useMemo, useState } from "react";
import { useT } from "@/lib/i18n";
import type { CertType, IssueItem, StudioContext } from "@/lib/certificates/api";
import { achievementVars } from "@/lib/certificates/achievement-vars";
import { composePage, type Sources } from "@/lib/certificates/compose";
import { evaluate, type AchievementRef, type Eligibility } from "@/lib/certificates/eligibility";
import { domMeasurer } from "@/lib/certificates/fit";
import type { Design } from "@/lib/certificates/model";
import { checkCertificate } from "@/lib/certificates/validate";
import {
  achievementVarsOnly,
  mergeVars,
  serverPreviewVars,
  type VarBag,
} from "@/lib/certificates/variables";
import type { HalaqaReports } from "./hooks";
import type { PreviewItem } from "./PreviewDialog";

export interface BatchInput {
  ctx: StudioContext | undefined;
  halaqaId: string | null;
  type: CertType | null;
  aref: AchievementRef;
  reports: HalaqaReports | undefined;
  selected: string[];
  overrides: Record<string, boolean>;
  design: Design | null;
  hasTemplate: boolean;
  sources: Sources;
  issueDate: string;
  from: string;
  to: string;
  fontsReady: boolean;
  /** التركيب والفحص (ثقيلان) عند فتح المعاينة أو الإصدار فقط. */
  active: boolean;
}

/** أهلية كل طالب للنوع من سجل الإنجاز القائم. */
export function eligibilityMap(
  type: CertType | null,
  reports: HalaqaReports | undefined,
  aref: AchievementRef,
) {
  const m = new Map<string, Eligibility>();
  if (!type || !reports) return m;
  for (const s of reports.students)
    m.set(s.id, evaluate(type.conditions, reports.byId.get(s.id) ?? null, aref));
  return m;
}

/** قيم طالب واحد: قيم سجل الإنجاز ثم قيم الخادم (تغلب)، كما ستكتبها cert_issue في اللقطة. */
export function studentVars(i: BatchInput, sid: string, name: string): VarBag {
  const h = i.ctx?.halaqat.find((x) => x.id === i.halaqaId);
  const c = i.ctx?.centers.find((x) => x.id === h?.center_id);
  const ach =
    i.type && i.design
      ? achievementVars(i.reports?.byId.get(sid) ?? null, i.type, i.aref, i.design.numbers)
      : {};
  return mergeVars(
    ach,
    serverPreviewVars({
      studentId: sid,
      studentName: name,
      // «الاسم الرسمي» في الهوية يغلب اسم المركز، كما في cert_issue (1.23.0).
      centerName: i.sources.brand?.officialName?.trim() || c?.name || "",
      circleName: h?.name ?? "",
      teacherName: h?.teacher_name ?? null,
      issueDate: i.issueDate,
      typeName: i.type?.name ?? "",
      periodFrom: i.from,
      periodTo: i.to,
    }),
  );
}

/**
 * يركّب شهادة كل طالب محدد ويفحصها، ويجهّز بنود الإصدار. كل طالب بقيمه وحده (لا تداخل بين الطلاب):
 * الاسم والقيم ورقم الشهادة وQR خاصة به.
 */
export function useBatchPreview(i: BatchInput) {
  const t = useT();
  const [measure] = useState(() => (typeof document !== "undefined" ? domMeasurer() : null));
  // L6 (1.25.0): الأهلية والبنود تُحسب مرة لكل تغيّر في مدخلاتها لا في كل رسم (حتى 200 طالب).
  const elig = useMemo(
    () => eligibilityMap(i.type, i.reports, i.aref),
    [i.type, i.reports, i.aref],
  );
  const out = useMemo(() => {
    const h = i.ctx?.halaqat.find((x) => x.id === i.halaqaId);
    const previews: PreviewItem[] = [];
    const items: IssueItem[] = [];
    let frozen: Design | null = null;
    if (i.design && i.type) {
      const names = new Map((i.reports?.students ?? []).map((s) => [s.id, s.name]));
      for (const sid of i.selected) {
        const name = names.get(sid) ?? t("certificates.none");
        const vars = studentVars(i, sid, name);
        const e = elig.get(sid) ?? null;
        const ov = !!i.overrides[sid];
        items.push({
          student_id: sid,
          vars: achievementVarsOnly(vars),
          achievement_ref: i.aref ?? undefined,
          eligibility: e ? { eligible: e.eligible, manual: e.manual, checks: e.checks } : undefined,
          override: ov && !!e && !e.eligible ? true : undefined,
        });
        if (!i.active) continue;
        const c = composePage(i.design, vars, i.sources, {
          uid: `p${previews.length}`,
          pending: true,
          measure,
        });
        frozen ??= c.design;
        const r = checkCertificate({
          design: c.design,
          issues: c.issues,
          overflow: c.overflow,
          studentInHalaqa: names.has(sid),
          hasCenter: !!h?.center_id,
          hasHalaqa: !!h,
          hasTemplate: i.hasTemplate,
          eligibility: e,
          override: ov,
          fontsReady: i.fontsReady,
          qrOk: true,
        });
        previews.push({ id: sid, name, html: c.html, ok: r.ok, items: r.items });
      }
    }
    return { previews, items, frozen };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- المدخلات كلها في i؛ تُسرد حقولها لا الكائن
  }, [
    elig,
    i.ctx,
    i.halaqaId,
    i.type,
    i.aref,
    i.reports,
    i.selected,
    i.overrides,
    i.design,
    i.hasTemplate,
    i.sources,
    i.issueDate,
    i.from,
    i.to,
    i.fontsReady,
    i.active,
    measure,
    t,
  ]);
  return { ...out, elig };
}
