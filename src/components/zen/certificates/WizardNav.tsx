import { Eye, Save } from "lucide-react";
import { useT } from "@/lib/i18n";
import { SBtn } from "./StudioFrame";

/** أزرار أسفل معالج الإصدار (فُصلت من IssueWizard.tsx في 1.25.0، فحص الاستوديو L6). */
export function WizardNav({
  step,
  canDesign,
  canSave,
  canDraft,
  next,
  nextEnabled,
  onCustomize,
  onSaveTemplate,
  onSaveDraft,
  onBack,
  onNext,
}: {
  step: string;
  canDesign: boolean;
  canSave: boolean;
  canDraft: boolean;
  next?: string;
  nextEnabled: boolean;
  onCustomize: () => void;
  onSaveTemplate: () => void;
  onSaveDraft: () => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const t = useT();
  return (
    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/60">
      {step === "template" && canDesign && (
        <SBtn onClick={onCustomize}>{t("certificates.wizard.customize")}</SBtn>
      )}
      {(step === "template" || step === "design") && canSave && (
        <>
          <SBtn onClick={onSaveTemplate}>{t("certificates.preview.saveAsTemplate")}</SBtn>
          {canDraft && (
            <SBtn onClick={onSaveDraft}>
              <Save className="w-4 h-4" /> {t("certificates.wizard.saveDraft")}
            </SBtn>
          )}
        </>
      )}
      <span className="flex-1" />
      {step !== "circle" && <SBtn onClick={onBack}>{t("certificates.back")}</SBtn>}
      {next && (
        <SBtn tone="primary" disabled={!nextEnabled} onClick={onNext}>
          {next === "preview" ? (
            <>
              <Eye className="w-4 h-4" /> {t("certificates.wizard.step.preview")}
            </>
          ) : (
            t("certificates.next")
          )}
        </SBtn>
      )}
    </div>
  );
}
