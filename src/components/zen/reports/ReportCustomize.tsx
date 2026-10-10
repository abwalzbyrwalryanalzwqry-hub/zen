import { BadgeCheck, ChevronLeft } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useT } from "@/lib/i18n";
import type { ReportConfig } from "@/lib/reports/config";
import { StepBranding, StepFormat, StepLayout } from "./ReportDesign";
import { IdentityScope, StepColors } from "./ReportIdentity";

export type CustomizeOpen = null | "customize" | "identity";

/**
 * التخصيص نصف شاشة فوق المعاينة (1.15.0): كل تغيير ينعكس على الصفحات خلفها. القالب والعنوان والاتجاه هنا،
 * وما يُضبط مرة واحدة (الشعار والترويسة والتذييل والألوان والتقويم والأرقام) في «هوية التقرير».
 */
export function CustomizeSheets({
  open,
  setOpen,
  cfg,
  set,
  canEdit,
}: {
  open: CustomizeOpen;
  setOpen: (o: CustomizeOpen) => void;
  cfg: ReportConfig;
  set: (c: ReportConfig) => void;
  canEdit: boolean;
}) {
  const t = useT();
  const done = (
    <button
      type="button"
      onClick={() => setOpen(null)}
      className="w-full min-h-12 rounded-2xl gradient-primary text-primary-foreground text-sm font-bold"
    >
      {t("reports.setup.done")}
    </button>
  );
  return (
    <>
      <Sheet open={open === "customize"} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent
          title={t("reports.preview.edit")}
          description={t("reports.customize.hint")}
          bodyClassName="space-y-3"
          footer={done}
        >
          <StepLayout cfg={cfg} set={set} />
          <button
            type="button"
            onClick={() => setOpen("identity")}
            className="w-full min-h-12 rounded-2xl glass px-3 flex items-center gap-2 text-start"
          >
            <BadgeCheck className="w-4 h-4 text-primary" aria-hidden="true" />
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-bold text-foreground">
                {t("reports.identity.title")}
              </span>
              <span className="block text-xs text-muted-foreground">
                {t("reports.identity.hint")}
              </span>
            </span>
            <ChevronLeft
              className="w-4 h-4 text-muted-foreground ltr:rotate-180"
              aria-hidden="true"
            />
          </button>
        </SheetContent>
      </Sheet>
      <Sheet open={open === "identity"} onOpenChange={(o) => !o && setOpen("customize")}>
        <SheetContent
          title={t("reports.identity.title")}
          description={t("reports.identity.hint")}
          bodyClassName="space-y-4"
          footer={done}
        >
          <IdentityScope canEdit={canEdit} />
          <StepColors cfg={cfg} set={set} />
          <StepBranding cfg={cfg} set={set} />
          <StepFormat cfg={cfg} set={set} />
        </SheetContent>
      </Sheet>
    </>
  );
}
