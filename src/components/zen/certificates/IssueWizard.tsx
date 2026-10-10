import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useT } from "@/lib/i18n";
import { usePagesDict } from "@/lib/pages-i18n";
import { toast } from "@/lib/toast";
import { addLocalDays, localDayKey } from "@/lib/local-day";
import {
  certApi,
  certKeys,
  CertError,
  type IssuedRef,
  type StudioContext,
} from "@/lib/certificates/api";
import { brandPalette, freezeBrand } from "@/lib/certificates/brand";
import type { AchievementRef } from "@/lib/certificates/eligibility";
import { suggestFromMilestones } from "@/lib/certificates/eligibility";
import { cloneDesign, normalizeDesign, type Design } from "@/lib/certificates/model";
import { parsePick, pickTemplate, type TemplatePick } from "@/lib/certificates/resolve";
import { systemTemplate } from "@/lib/certificates/templates";
import { sampleVars } from "@/lib/certificates/variables";
import { Designer } from "./Designer";
import { useFontsReady, useHalaqaReports } from "./hooks";
import { IssueProgress, IssueResults } from "./IssueResults";
import type { StepKey } from "./helpers";
import { PreviewDialog } from "./PreviewDialog";
import { SaveTemplateDialog } from "./SaveTemplateDialog";
import { SBtn } from "./StudioFrame";
import { TemplatePicker } from "./TemplatePicker";
import { galleryItems } from "./helpers";
import { useBatchPreview, studentVars } from "./useBatchPreview";
import { ANOMALY_SEVERITY, anomaliesFor, anomalyText, fetchAnomalies } from "@/lib/record-audit";
import { useDesignSources } from "./useDesignSources";
import { StepCircle, StepStudents, StepType } from "./WizardSteps";
import { WizardNav } from "./WizardNav";

export interface WizardInit {
  halaqa?: string | null;
  students?: string[];
  type?: string | null;
  ref?: AchievementRef;
  template?: string | null;
  design?: Design | null;
  batchId?: string | null;
  replacesId?: string | null;
  from?: string;
  to?: string;
  issueDate?: string;
}

const STEPS = ["circle", "type", "students", "template", "design", "preview"] as const;
type Step = (typeof STEPS)[number];

/**
 * تدفق الإصدار: المركز ← الحلقة ← النوع ← الطلاب ← القالب ← (تخصيص التصميم) ← المعاينة والفحص ← الإصدار.
 * فردي أو جماعي بالمسار نفسه: لكل طالب شهادته ورقمه وQR وقيمه. المسودة تُحفظ دفعةً وتُستأنف.
 */
export function IssueWizard({ ctx, init }: { ctx: StudioContext; init: WizardInit }) {
  usePagesDict();
  const t = useT();
  const qc = useQueryClient();
  const initHal = ctx.halaqat.find((h) => h.id === init.halaqa && h.can_issue) ?? null;
  const [center, setCenter] = useState<string | null>(
    initHal?.center_id ?? (ctx.centers.length === 1 ? ctx.centers[0].id : null),
  );
  const [halaqa, setHalaqa] = useState<string | null>(initHal?.id ?? null);
  const [typeKey, setTypeKey] = useState<string | null>(init.type ?? null);
  const [aref, setRef] = useState<AchievementRef>(init.ref ?? null);
  const [dates, setDates] = useState({
    from: init.from ?? addLocalDays(-90),
    to: init.to ?? localDayKey(),
    issueDate: init.issueDate ?? localDayKey(),
  });
  const [selected, setSelected] = useState<string[]>(init.students ?? []);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [pick, setPick] = useState<TemplatePick | null>(parsePick(init.template));
  const [design, setDesign] = useState<Design | null>(
    init.design ? normalizeDesign(init.design) : null,
  );
  const [step, setStep] = useState<Step>(
    init.design ? "template" : initHal ? (init.type ? "students" : "type") : "circle",
  );
  const [batchId, setBatchId] = useState<string | null>(init.batchId ?? null);
  const [preview, setPreview] = useState<{ open: boolean; i: number }>({ open: false, i: 0 });
  const [progress, setProgress] = useState<StepKey | null>(null);
  const [issued, setIssued] = useState<IssuedRef[] | null>(null);
  const [saveTpl, setSaveTpl] = useState(false);
  const fontsReady = useFontsReady();

  const hal = ctx.halaqat.find((h) => h.id === halaqa) ?? null;
  const cen = ctx.centers.find((c) => c.id === hal?.center_id) ?? null;
  const types = ctx.types.filter(
    (x) => x.active && (!x.center_id || x.center_id === hal?.center_id),
  );
  const type = types.find((x) => x.key === typeKey) ?? null;
  const reports = useHalaqaReports(halaqa, dates.from, dates.to);
  const tpls = useQuery({
    queryKey: certKeys.templates(hal?.center_id ?? ""),
    enabled: !!hal,
    queryFn: () => certApi.templates(hal!.center_id),
    staleTime: 60_000,
  });
  const src = useDesignSources(hal?.center_id ?? null, design, hal?.teacher_id ?? null);

  const suggested =
    !typeKey && selected.length === 1 && reports.data?.byId.get(selected[0])
      ? suggestFromMilestones(reports.data.byId.get(selected[0])!)
      : null;

  const choose = (p: TemplatePick, d: Design) => {
    setPick(p);
    const c = cloneDesign(d);
    if (p.kind === "system") c.palette = brandPalette(c.palette, src.brand?.brand ?? null);
    setDesign(c);
  };
  const autoPick = () => {
    if (design || !hal) return;
    const p = pickTemplate(tpls.data ?? [], { typeKey, halaqaId: hal.id });
    const row = p.kind === "center" ? tpls.data?.find((r) => r.id === p.id) : null;
    const d = row
      ? normalizeDesign(row.design)
      : systemTemplate(p.kind === "system" ? p.key : "")?.build();
    if (d) choose(p, d);
  };

  const batch = useBatchPreview({
    ctx,
    halaqaId: halaqa,
    type,
    aref,
    reports: reports.data,
    selected,
    overrides,
    design,
    hasTemplate: !!design,
    sources: src.sources,
    issueDate: dates.issueDate,
    from: dates.from,
    to: dates.to,
    fontsReady,
    active: preview.open,
  });

  // دقة الإدخال (1.18.0): تنبيهات مراقب السجل للطالب تظهر في «فحص الشهادة» تنبيهاً لا مانعاً — الشهادة تُبنى
  // على السجل، فيُستحسن أن ينظر المُصدِر فيما يبدو غير معتاد قبل الإصدار.
  const anomalies = useQuery({
    queryKey: ["record-anomalies", halaqa, 90],
    enabled: preview.open && !!halaqa,
    retry: false,
    staleTime: 60_000,
    queryFn: () => fetchAnomalies(halaqa!, 90),
  });
  const previews = anomalies.data
    ? batch.previews.map((p) => {
        const extra = anomaliesFor(anomalies.data, p.id)
          .filter((a) => ANOMALY_SEVERITY[a.code] === "check")
          .map((a, n) => ({
            key: `record-${a.code}-${n}`,
            level: "warn" as const,
            text: anomalyText(a),
          }));
        return extra.length ? { ...p, items: [...p.items, ...extra] } : p;
      })
    : batch.previews;

  const payload = (status: "draft" | "issued") => {
    const frozen = freezeBrand(design!, src.sources.brand, src.sources.refs);
    return {
      halaqa_id: halaqa!,
      type_key: typeKey!,
      status,
      template_id: pick?.kind === "center" ? pick.id : null,
      system_template: pick?.kind === "system" ? pick.key : null,
      design: frozen,
      batch_id: batchId,
      replaces_id: init.replacesId ?? null,
      issue_date: dates.issueDate,
      period_from: dates.from,
      period_to: dates.to,
      items: batch.items,
    };
  };

  const fail = (e: unknown, retry: () => void) =>
    toast.error(e instanceof CertError ? e.message : t("certificates.err.generic"), {
      action: { label: t("certificates.retry"), onClick: retry },
    });

  const saveDraft = async () => {
    try {
      const r = await certApi.issue(payload("draft"));
      setBatchId(r.batch_id);
      void qc.invalidateQueries({ queryKey: certKeys.all });
      toast.success(t("certificates.wizard.draftSaved"));
    } catch (e) {
      fail(e, () => void saveDraft());
    }
  };

  const issue = async () => {
    setProgress("prepare");
    try {
      await new Promise((r) => setTimeout(r, 0));
      setProgress("data");
      const p = payload("issued");
      setProgress("design");
      const r = await certApi.issue(p);
      setProgress("file");
      void qc.invalidateQueries({ queryKey: certKeys.all });
      setProgress("done");
      setPreview({ open: false, i: 0 });
      setIssued(r.certificates);
      setTimeout(() => setProgress(null), 600);
    } catch (e) {
      setProgress(null);
      fail(e, () => void issue());
    }
  };

  if (issued)
    return (
      <IssueResults
        issued={issued}
        halaqaName={hal?.name ?? ""}
        onAgain={() => {
          setIssued(null);
          setSelected([]);
          setBatchId(null);
          setStep("students");
        }}
      />
    );

  const can: Record<Step, boolean> = {
    circle: true,
    type: !!halaqa,
    students: !!halaqa && !!type,
    template: !!halaqa && !!type && selected.length > 0,
    design: !!design && !!type && selected.length > 0,
    preview: !!design && !!type && selected.length > 0,
  };
  const go = (s: Step) => {
    if (!can[s]) return;
    if (s === "template" || s === "design" || s === "preview") autoPick();
    if (s === "preview") return setPreview({ open: true, i: 0 });
    setStep(s);
  };
  const nextOf: Partial<Record<Step, Step>> = {
    circle: "type",
    type: "students",
    students: "template",
    template: "preview",
    design: "preview",
  };
  const sample = selected[0]
    ? studentVars(
        {
          ctx,
          halaqaId: halaqa,
          type,
          aref,
          reports: reports.data,
          selected,
          overrides,
          design,
          hasTemplate: true,
          sources: src.sources,
          issueDate: dates.issueDate,
          from: dates.from,
          to: dates.to,
          fontsReady,
          active: false,
        },
        selected[0],
        reports.data?.students.find((s) => s.id === selected[0])?.name ?? "",
      )
    : sampleVars(t, type?.name ?? "");

  return (
    <div className="space-y-4">
      {init.replacesId && (
        <p className="rounded-2xl bg-gold/10 border border-gold/40 p-3 text-xs">
          {t("certificates.wizard.reissueHint")}
        </p>
      )}
      <nav aria-label={t("certificates.wizard.title")} className="flex gap-1 overflow-x-auto pb-1">
        {STEPS.map((s, i) => (
          <button
            key={s}
            type="button"
            disabled={!can[s]}
            onClick={() => go(s)}
            aria-current={step === s ? "step" : undefined}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold border disabled:opacity-40 ${step === s ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border"}`}
          >
            {i + 1}. {t(`certificates.wizard.step.${s}`)}
          </button>
        ))}
      </nav>
      {progress && <IssueProgress step={progress} />}
      {step === "circle" && (
        <StepCircle
          ctx={ctx}
          center={center}
          halaqa={halaqa}
          onCenter={setCenter}
          onHalaqa={(id) => {
            setHalaqa(id);
            setSelected([]);
            setDesign(null);
            setPick(null);
            setStep("type");
          }}
        />
      )}
      {step === "type" && (
        <StepType
          types={types}
          typeKey={typeKey}
          onType={(k) => {
            setTypeKey(k);
            if (suggested && k === suggested.type) setRef(suggested.ref);
            else if (
              types.find((x) => x.key === k)?.param !== types.find((x) => x.key === typeKey)?.param
            )
              setRef(null);
            if (!init.design) {
              setDesign(null);
              setPick(null);
            }
          }}
          aref={aref}
          onRef={setRef}
          from={dates.from}
          to={dates.to}
          issueDate={dates.issueDate}
          onDates={(p) => setDates({ ...dates, ...p })}
          suggested={suggested?.type}
        />
      )}
      {step === "students" && (
        <StepStudents
          students={reports.data?.students ?? []}
          loading={reports.isLoading}
          selected={selected}
          onSelected={setSelected}
          elig={batch.elig}
          overrides={overrides}
          onOverride={(id, v) => setOverrides({ ...overrides, [id]: v })}
          canOverride
          asRequest={!cen?.can_manage}
        />
      )}
      {step === "template" && hal && (
        <TemplatePicker
          items={galleryItems(tpls.data ?? [], t)}
          sources={src.sources}
          vars={sample}
          value={pick}
          onPick={(it) => choose(it.pick, it.design)}
        />
      )}
      {step === "design" && design && hal && (
        <div className="h-[75vh] rounded-2xl border border-border overflow-hidden bg-card">
          <Designer
            key={`${pick ? JSON.stringify(pick) : "x"}`}
            initial={design}
            onChange={setDesign}
            vars={sample}
            sources={src.sources}
            images={src.images}
            onUpload={src.onUpload}
            typeName={type?.name}
          />
        </div>
      )}
      <WizardNav
        step={step}
        canDesign={!!design}
        canSave={!!design && !!hal}
        canDraft={!init.replacesId}
        next={nextOf[step]}
        nextEnabled={!!nextOf[step] && can[nextOf[step]!]}
        onCustomize={() => setStep("design")}
        onSaveTemplate={() => setSaveTpl(true)}
        onSaveDraft={() => void saveDraft()}
        onBack={() =>
          setStep(STEPS[Math.max(0, STEPS.indexOf(step) - (step === "preview" ? 2 : 1))])
        }
        onNext={() => go(nextOf[step]!)}
      />
      {step === "students" && !selected.length && (
        <p className="text-xs text-muted-foreground">{t("certificates.wizard.noneSelected")}</p>
      )}
      {preview.open && design && (
        <PreviewDialog
          open
          onOpenChange={(o) => setPreview({ open: o, i: 0 })}
          items={previews}
          index={preview.i}
          onIndex={(i) => setPreview({ open: true, i })}
          size={design.page}
          onEdit={() => {
            setPreview({ open: false, i: 0 });
            setStep("design");
          }}
          onSaveTemplate={hal ? () => setSaveTpl(true) : undefined}
          onIssue={() => void issue()}
          issuing={!!progress}
          issueLabel={
            selected.length > 1
              ? t("certificates.wizard.issueMany", { n: selected.length })
              : t("certificates.wizard.issueOne")
          }
        />
      )}
      {saveTpl && design && hal && (
        <SaveTemplateDialog
          open
          onOpenChange={setSaveTpl}
          design={design}
          centerId={hal.center_id}
          halaqaId={hal.id}
          canManage={!!cen?.can_manage}
          types={types}
          defaultType={typeKey}
          basedOn={
            pick?.kind === "system"
              ? `system:${pick.key}`
              : pick?.kind === "center"
                ? pick.id
                : null
          }
          onSaved={(id) => {
            setPick({ kind: "center", id });
            void qc.invalidateQueries({ queryKey: certKeys.templates(hal.center_id) });
          }}
        />
      )}
    </div>
  );
}
