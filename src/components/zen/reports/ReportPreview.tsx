import { useState } from "react";
import {
  AlertTriangle,
  Check,
  FileSpreadsheet,
  FileText,
  Loader2,
  MoreHorizontal,
  Palette,
  Printer,
  RefreshCw,
  Share2,
  SlidersHorizontal,
} from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useT } from "@/lib/i18n";
import { toast } from "@/lib/toast";
import { BUILD_STAGES, type BuildState } from "@/hooks/use-report-build";
import { downloadCsv, downloadExcel, exportPdf, shareReport } from "@/lib/reports/export";
import { printHtml, type SaveOutcome } from "@/lib/native-file";
import { fmtDate } from "@/lib/reports/format";
import type { Computed } from "@/lib/reports/compute";
import type { ReportConfig } from "@/lib/reports/config";
import { PagesView } from "./PagesView";

type Action = "pdf" | "excel" | "csv" | "share" | "print";

/** مراحل «جارٍ إعداد التقرير...» ظاهرة للمستخدم. */
export function BuildProgress({ stage }: { stage: BuildState["stage"] }) {
  const t = useT();
  const at = BUILD_STAGES.indexOf(stage);
  return (
    <div role="status" className="glass rounded-3xl p-5 space-y-3">
      <p className="text-sm font-black text-foreground flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin text-primary" aria-hidden="true" />
        {t("reports.build.title")}
      </p>
      <ol className="space-y-1.5">
        {BUILD_STAGES.map((s, i) => (
          <li
            key={s}
            className={`text-xs flex items-center gap-2 ${i <= at ? "text-foreground font-bold" : "text-muted-foreground"}`}
          >
            <span
              aria-hidden="true"
              className={`w-4 h-4 rounded-full flex items-center justify-center ${i < at ? "bg-primary text-primary-foreground" : i === at ? "bg-primary/20" : "bg-muted"}`}
            >
              {i < at && <Check className="w-3 h-3" />}
            </span>
            {t(`reports.build.${s}`)}
          </li>
        ))}
      </ol>
    </div>
  );
}

export function BuildError({ onRetry, onBack }: { onRetry: () => void; onBack: () => void }) {
  const t = useT();
  return (
    <div
      role="alert"
      className="glass rounded-3xl p-5 flex flex-col items-center text-center gap-2"
    >
      <AlertTriangle className="w-6 h-6 text-gold" aria-hidden="true" />
      <p className="text-sm font-black text-foreground">{t("reports.error.title")}</p>
      <p className="text-xs text-muted-foreground">{t("reports.error.hint")}</p>
      <div className="flex gap-2 w-full">
        <button
          type="button"
          onClick={onRetry}
          className="flex-1 min-h-11 rounded-2xl gradient-primary text-primary-foreground text-sm font-bold flex items-center justify-center gap-1.5"
        >
          <RefreshCw className="w-4 h-4" aria-hidden="true" />
          {t("common.retry")}
        </button>
        <button
          type="button"
          onClick={onBack}
          className="flex-1 min-h-11 rounded-2xl glass text-sm font-bold"
        >
          {t("reports.error.back")}
        </button>
      </div>
    </div>
  );
}

/** تنبيه التحقق قبل التصدير: «يوجد ٣ سجلات تحتاج إلى مراجعة» مع عرضها. لا تقرير ناقص بلا تنبيه. */
export function IssuesBanner({ computed, cfg }: { computed: Computed; cfg: ReportConfig }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const issues = computed.issues;
  if (!issues.length) return null;
  const names = new Map(computed.data.students.map((s) => [s.id, s.name]));
  const detailText = (d: string) =>
    d === "memorize" || d === "review" ? t(`reports.kind.${d}`) : d;
  return (
    <div role="status" className="rounded-2xl border border-gold/40 bg-gold/10">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="w-full min-h-11 px-3 flex items-center gap-1.5 text-start text-sm font-black text-foreground"
      >
        <AlertTriangle className="w-4 h-4 text-gold shrink-0" aria-hidden="true" />
        <span className="flex-1">{t("reports.validation.banner", { n: issues.length })}</span>
        <span className="text-xs font-bold text-primary">
          {open ? t("reports.validation.hide") : t("reports.validation.show")}
        </span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2">
          <p className="text-xs text-foreground">{t("reports.validation.hint")}</p>
          <ul className="space-y-1 text-xs text-foreground max-h-60 overflow-y-auto">
            {issues.map((i, k) => (
              <li key={k} className="rounded-xl bg-background/60 px-2.5 py-1.5">
                <b className="font-bold">{i.studentId ? (names.get(i.studentId) ?? "—") : "—"}</b>
                {i.date ? ` · ${fmtDate(i.date, cfg)}` : ""} · {t(`reports.issue.${i.kind}`)}
                {i.detail ? ` (${detailText(i.detail)})` : ""}
                {i.severity === "error" ? ` (${t("reports.validation.excluded")})` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * المعاينة والتصدير في خطوة واحدة (1.15.0): الصفحات الحقيقية، وزرا «تخصيص الشكل» و«الفترة والطلاب»، وشريط
 * ثابت أسفل الشاشة: PDF (الأساسي) · مشاركة · المزيد (Excel وCSV وطباعة في نصف شاشة).
 */
export function ReportPreview({
  computed,
  cfg,
  build,
  onEdit,
  onSetup,
  onExported,
}: {
  computed: Computed;
  cfg: ReportConfig;
  build: BuildState;
  onEdit: () => void;
  onSetup: () => void;
  onExported?: () => void;
}) {
  const t = useT();
  const [busy, setBusy] = useState<Action | null>(null);
  const [more, setMore] = useState(false);
  const laid = build.laid;
  const doc = build.doc;
  const run = async (a: Action) => {
    if (!laid || !doc) return;
    setBusy(a);
    try {
      let r: SaveOutcome | "printed";
      if (a === "pdf") r = await exportPdf(laid.print, cfg, doc);
      else if (a === "excel") r = await downloadExcel(computed, cfg, doc);
      else if (a === "csv") r = await downloadCsv(computed, cfg, doc);
      else if (a === "share") r = await shareReport(laid.print, computed, cfg, doc);
      else {
        await printHtml(laid.print, doc.fileBase);
        r = "printed";
      }
      if (r !== "cancelled") onExported?.();
      if (r === "downloaded") toast.success(t("reports.export.downloaded"));
      else if (r === "shared") toast.success(t("reports.export.shared"));
    } catch (e) {
      console.error("[reports] export failed", e);
      toast.error(t("reports.export.failed"));
    } finally {
      setBusy(null);
      setMore(false);
    }
  };
  const icon = (a: Action, Icon: typeof FileText) =>
    busy === a ? (
      <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
    ) : (
      <Icon className="w-4 h-4" aria-hidden="true" />
    );
  const off = !!busy || !laid;
  const ghost =
    "min-h-11 rounded-2xl glass text-sm font-bold flex items-center justify-center gap-1.5 disabled:opacity-60";
  return (
    <div className="space-y-3">
      <IssuesBanner computed={computed} cfg={cfg} />
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={onEdit} className={ghost}>
          <Palette className="w-4 h-4" aria-hidden="true" />
          {t("reports.preview.edit")}
        </button>
        <button type="button" onClick={onSetup} className={ghost}>
          <SlidersHorizontal className="w-4 h-4" aria-hidden="true" />
          {t("reports.preview.setup")}
        </button>
      </div>
      {!laid || !doc ? (
        <BuildProgress stage={build.stage} />
      ) : (
        <PagesView html={laid.preview} pages={laid.pages.length} landscape={doc.landscape} />
      )}
      {doc && (
        <p className="text-xs text-muted-foreground break-words">
          {t("reports.export.fileName", { name: doc.fileBase })}
        </p>
      )}
      <div className="sticky bottom-0 -mx-3 px-3 pt-2 pb-3 bg-background/90 backdrop-blur border-t border-border/60 flex gap-2">
        <button
          type="button"
          onClick={() => void run("pdf")}
          disabled={off}
          className="flex-1 min-h-12 rounded-2xl gradient-primary text-primary-foreground text-sm font-bold flex items-center justify-center gap-1.5 disabled:opacity-60"
        >
          {icon("pdf", FileText)}
          {t("reports.export.pdf")}
        </button>
        <button
          type="button"
          onClick={() => void run("share")}
          disabled={off}
          className={`${ghost} min-h-12 px-4`}
        >
          {icon("share", Share2)}
          {t("reports.export.share")}
        </button>
        <button
          type="button"
          onClick={() => setMore(true)}
          disabled={off}
          aria-label={t("reports.export.more")}
          className={`${ghost} min-h-12 min-w-12`}
        >
          <MoreHorizontal className="w-5 h-5" aria-hidden="true" />
        </button>
      </div>
      <Sheet open={more} onOpenChange={setMore}>
        <SheetContent title={t("reports.export.more")} snap="auto" bodyClassName="space-y-2">
          <button
            type="button"
            onClick={() => void run("excel")}
            disabled={off}
            className={`w-full ${ghost}`}
          >
            {icon("excel", FileSpreadsheet)}
            {t("reports.export.excel")}
          </button>
          <button
            type="button"
            onClick={() => void run("print")}
            disabled={off}
            className={`w-full ${ghost}`}
          >
            {icon("print", Printer)}
            {t("reports.export.print")}
          </button>
          <button
            type="button"
            onClick={() => void run("csv")}
            disabled={off}
            className={`w-full ${ghost}`}
          >
            {icon("csv", FileText)}
            {t("reports.export.csv")}
          </button>
        </SheetContent>
      </Sheet>
    </div>
  );
}
