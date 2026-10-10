import { ImagePlus, Trash2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import { toast } from "@/lib/toast";
import { TEMPLATES, applyTemplate, type ReportConfig, type Template } from "@/lib/reports/config";
import { Choice, Field, inputCls, Toggle } from "./parts";
import type { Patch } from "./ReportSteps";

const SIZES = ["sm", "md", "lg"] as const;
const ALIGNS = ["start", "center", "end"] as const;

/** شكل مصغّر لكل قالب: الرسمي بملخص وجداول، والمختصر بلا ملخص، والمفصّل بصفوف أكثر. */
function Thumb({ template, on }: { template: Template; on: boolean }) {
  const bar = on ? "bg-primary-foreground/70" : "bg-primary/60";
  const line = on ? "bg-primary-foreground/40" : "bg-muted-foreground/30";
  const rows = template === "detailed" ? 6 : template === "brief" ? 2 : 3;
  return (
    <span aria-hidden="true" className="block w-full rounded-lg bg-background/20 p-1.5 space-y-1">
      <span className={`block h-1 w-1/2 rounded ${bar}`} />
      {template !== "brief" && (
        <span className="grid grid-cols-3 gap-0.5">
          {[0, 1, 2].map((i) => (
            <span key={i} className={`block h-2 rounded-sm ${line}`} />
          ))}
        </span>
      )}
      <span className={`block h-1 w-full rounded-sm ${bar}`} />
      {Array.from({ length: rows }, (_, i) => (
        <span key={i} className={`block h-0.5 w-full rounded ${line}`} />
      ))}
    </span>
  );
}

function TemplateCards({ cfg, set }: { cfg: ReportConfig; set: (c: ReportConfig) => void }) {
  const t = useT();
  return (
    <div
      role="radiogroup"
      aria-label={t("reports.layout.template")}
      className="grid grid-cols-3 gap-2"
    >
      {TEMPLATES.map((v) => {
        const on = cfg.template === v;
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => set(applyTemplate(cfg, v))}
            className={`min-h-24 rounded-2xl p-2 flex flex-col gap-1.5 items-center text-xs font-bold ${
              on ? "gradient-primary text-primary-foreground shadow-soft" : "glass text-foreground"
            }`}
          >
            <Thumb template={v} on={on} />
            {t(`reports.template.${v}`)}
          </button>
        );
      })}
    </div>
  );
}

/** التخصيص: القالب والعنوان والاتجاه والمقارنة. */
export function StepLayout({ cfg, set }: { cfg: ReportConfig; set: (c: ReportConfig) => void }) {
  const t = useT();
  const patch: Patch = (p) => set({ ...cfg, ...p });
  return (
    <div className="space-y-3">
      <TemplateCards cfg={cfg} set={set} />
      <Field label={t("reports.layout.title")} hint={t("reports.layout.titleHint")}>
        <input
          value={cfg.title}
          maxLength={90}
          onChange={(e) => patch({ title: e.target.value })}
          placeholder={t(`reports.kindTitle.${cfg.kind}`)}
          className={inputCls}
        />
      </Field>
      <Field label={t("reports.layout.subtitle")}>
        <input
          value={cfg.subtitle}
          maxLength={120}
          onChange={(e) => patch({ subtitle: e.target.value })}
          placeholder={t("reports.layout.subtitleHint")}
          className={inputCls}
        />
      </Field>
      <Field label={t("reports.layout.orientation")}>
        <Choice
          label={t("reports.layout.orientation")}
          value={cfg.orientation}
          onChange={(orientation) => patch({ orientation })}
          options={(["auto", "portrait", "landscape"] as const).map((v) => ({
            value: v,
            label: t(`reports.orientation.${v}`),
          }))}
        />
      </Field>
      <Toggle
        label={t("reports.layout.compare")}
        hint={t("reports.layout.compareHint")}
        checked={cfg.compare}
        onChange={(compare) => patch({ compare })}
      />
    </div>
  );
}

/** التقويم وشكل الأرقام (من هوية التقرير). */
export function StepFormat({ cfg, set }: { cfg: ReportConfig; set: (c: ReportConfig) => void }) {
  const t = useT();
  const patch: Patch = (p) => set({ ...cfg, ...p });
  return (
    <div className="space-y-3">
      <Field label={t("reports.range.calendar")}>
        <Choice
          label={t("reports.range.calendar")}
          value={cfg.calendar}
          onChange={(calendar) => patch({ calendar })}
          options={(["gregorian", "hijri", "both"] as const).map((v) => ({
            value: v,
            label: t(`reports.calendar.${v}`),
          }))}
        />
      </Field>
      <Field label={t("reports.range.digits")}>
        <Choice
          cols={2}
          label={t("reports.range.digits")}
          value={cfg.digits}
          onChange={(digits) => patch({ digits })}
          options={(["arab", "latn"] as const).map((v) => ({
            value: v,
            label: t(`reports.digits.${v}`),
          }))}
        />
      </Field>
    </div>
  );
}

/** يصغّر الشعار المرفوع إلى 360px PNG (لا يُثقل الإعدادات المحفوظة ولا ملف PDF). */
function shrinkLogo(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 360 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.width * k));
      c.height = Math.max(1, Math.round(img.height * k));
      c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/png"));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("bad image"));
    };
    img.src = url;
  });
}

/** ٧ الترويسة والشعار والتذييل. */
export function StepBranding({ cfg, set }: { cfg: ReportConfig; set: (c: ReportConfig) => void }) {
  const t = useT();
  const header = (p: Partial<ReportConfig["header"]>) =>
    set({ ...cfg, header: { ...cfg.header, ...p } });
  const logo = (p: Partial<ReportConfig["logo"]>) => set({ ...cfg, logo: { ...cfg.logo, ...p } });
  const footer = (p: Partial<ReportConfig["footer"]>) =>
    set({ ...cfg, footer: { ...cfg.footer, ...p } });
  const upload = async (f: File | undefined) => {
    if (!f) return;
    if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(f.type) || f.size > 3_000_000) {
      toast.error(t("reports.logo.bad"));
      return;
    }
    try {
      logo({ mode: "custom", dataUrl: await shrinkLogo(f) });
    } catch {
      toast.error(t("reports.logo.bad"));
    }
  };
  const sizeOpts = SIZES.map((v) => ({ value: v, label: t(`reports.size.${v}`) }));
  const alignOpts = ALIGNS.map((v) => ({ value: v, label: t(`reports.align.${v}`) }));
  return (
    <div className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="text-sm font-black text-foreground mb-1">
          {t("reports.header.title")}
        </legend>
        <Toggle
          label={t("reports.header.show")}
          checked={cfg.header.show}
          onChange={(show) => header({ show })}
        />
        {cfg.header.show && (
          <>
            <Field label={t("reports.header.text")} hint={t("reports.header.textHint")}>
              <input
                value={cfg.header.text}
                maxLength={80}
                onChange={(e) => header({ text: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Choice
              label={t("reports.header.align")}
              value={cfg.header.align}
              onChange={(align) => header({ align })}
              options={alignOpts}
            />
          </>
        )}
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="text-sm font-black text-foreground mb-1">
          {t("reports.logo.title")}
        </legend>
        <Choice
          label={t("reports.logo.title")}
          value={cfg.logo.mode}
          onChange={(mode) => logo({ mode })}
          options={(["app", "custom", "none"] as const).map((v) => ({
            value: v,
            label: t(`reports.logo.${v}`),
          }))}
        />
        <p className="text-xs text-muted-foreground">{t("reports.logo.centerNote")}</p>
        {cfg.logo.mode === "custom" && (
          <div className="flex items-center gap-2">
            {cfg.logo.dataUrl && (
              <img
                src={cfg.logo.dataUrl}
                alt={t("reports.logo.current")}
                className="w-12 h-12 object-contain rounded-xl bg-muted"
              />
            )}
            <label className="flex-1 min-h-11 rounded-2xl glass text-sm font-bold flex items-center justify-center gap-1.5 cursor-pointer">
              <ImagePlus className="w-4 h-4" aria-hidden="true" />
              {t("reports.logo.upload")}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="sr-only"
                onChange={(e) => void upload(e.target.files?.[0])}
              />
            </label>
            {cfg.logo.dataUrl && (
              <button
                type="button"
                onClick={() => logo({ dataUrl: null, mode: "app" })}
                aria-label={t("reports.logo.remove")}
                className="min-h-11 min-w-11 rounded-2xl glass text-destructive flex items-center justify-center"
              >
                <Trash2 className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
          </div>
        )}
        {cfg.logo.mode !== "none" && (
          <>
            <Choice
              label={t("reports.logo.align")}
              value={cfg.logo.align}
              onChange={(align) => logo({ align })}
              options={alignOpts}
            />
          </>
        )}
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="text-sm font-black text-foreground mb-1">
          {t("reports.footer.title")}
        </legend>
        <Toggle
          label={t("reports.footer.show")}
          checked={cfg.footer.show}
          onChange={(show) => footer({ show })}
        />
        {cfg.footer.show && (
          <Field label={t("reports.footer.text")}>
            <input
              value={cfg.footer.text}
              maxLength={120}
              onChange={(e) => footer({ text: e.target.value })}
              placeholder={t("reports.meta.footerDefault")}
              className={inputCls}
            />
          </Field>
        )}
        <Toggle
          label={t("reports.footer.pageNumbers")}
          checked={cfg.footer.pageNumbers}
          onChange={(pageNumbers) => footer({ pageNumbers })}
        />
        {cfg.footer.pageNumbers && (
          <Toggle
            label={t("reports.footer.pageTotal")}
            checked={cfg.footer.pageTotal}
            onChange={(pageTotal) => footer({ pageTotal })}
          />
        )}
      </fieldset>
      <details className="glass rounded-2xl px-3 group">
        <summary className="min-h-11 flex items-center text-sm font-bold text-foreground cursor-pointer">
          {t("reports.identity.advanced")}
        </summary>
        <div className="space-y-2 pb-3">
          {cfg.header.show && (
            <>
              <Choice
                label={t("reports.header.size")}
                value={cfg.header.size}
                onChange={(size) => header({ size })}
                options={sizeOpts}
              />
              <Choice
                label={t("reports.header.weight")}
                value={cfg.header.weight}
                onChange={(weight) => header({ weight })}
                options={(["regular", "medium", "black"] as const).map((v) => ({
                  value: v,
                  label: t(`reports.weight.${v}`),
                }))}
              />
            </>
          )}
          {cfg.logo.mode !== "none" && (
            <Choice
              label={t("reports.logo.size")}
              value={cfg.logo.size}
              onChange={(size) => logo({ size })}
              options={sizeOpts}
            />
          )}
        </div>
      </details>
    </div>
  );
}
