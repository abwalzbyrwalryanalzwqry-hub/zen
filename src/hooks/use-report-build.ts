import { useEffect, useState } from "react";
import { buildDoc, type ReportDoc } from "@/lib/reports/doc";
import { layoutReport, type LaidOut } from "@/lib/reports/layout";
import type { Computed } from "@/lib/reports/compute";
import type { ReportConfig } from "@/lib/reports/config";

export type BuildStage = "attendance" | "work" | "build" | "pages" | "done";
export const BUILD_STAGES: BuildStage[] = ["attendance", "work", "build", "pages", "done"];

export interface BuildState {
  stage: BuildStage;
  doc: ReportDoc | null;
  laid: LaidOut | null;
  error: unknown;
}

const tick = () => new Promise((r) => setTimeout(r, 0));

/**
 * بناء التقرير على مراحل ظاهرة («معالجة بيانات الحضور»، «تجهيز الصفحات»...) بدل دوّار صامت. المرحلتان
 * الأوليان حساب صرف سبق في compute؛ هنا يُبنى المستند ويُقاس ويُقسم إلى صفحات. أي تعديل في الإعدادات
 * يعيد البناء (بعد مهلة قصيرة) دون إعادة جلب البيانات.
 */
export function useReportBuild(
  computed: Computed | null,
  cfg: ReportConfig,
  delay = 0,
): BuildState {
  const [state, setState] = useState<BuildState>({
    stage: "attendance",
    doc: null,
    laid: null,
    error: null,
  });
  useEffect(() => {
    if (!computed) return;
    let live = true;
    const set = (s: Partial<BuildState>) => live && setState((p) => ({ ...p, ...s }));
    const timer = setTimeout(async () => {
      try {
        set({ stage: "attendance", error: null });
        await tick();
        set({ stage: "work" });
        await tick();
        set({ stage: "build" });
        const doc = buildDoc(computed, cfg);
        await tick();
        set({ stage: "pages", doc });
        const laid = await layoutReport(doc, cfg);
        set({ stage: "done", doc, laid });
      } catch (e) {
        console.error("[reports] build failed", e);
        set({ error: e });
      }
    }, delay);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [computed, cfg, delay]);
  return state;
}
