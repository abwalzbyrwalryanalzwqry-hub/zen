import { useState } from "react";
import { CalendarDays, Check, ChevronLeft } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useT } from "@/lib/i18n";
import {
  KIND_RECORDS,
  KIND_SECTIONS,
  REPORT_KINDS,
  presetRange,
  rangeError,
  type RangePreset,
  type RecordType,
  type ReportConfig,
  type ReportKind,
} from "@/lib/reports/config";
import { fmtDate } from "@/lib/reports/format";
import { Choice, Field, inputCls } from "./parts";

export type Patch = (p: Partial<ReportConfig>) => void;

/** الشرائح الظاهرة للنطاق؛ البقية اختصارات داخل نصف شاشة «مخصص». */
const MAIN_PRESETS = ["week", "month", "lastMonth", "custom"] as const;
const SHORTCUTS: RangePreset[] = ["today", "week", "month", "lastMonth", "last30", "last90"];

/** النوع: أربع بطاقات. اختيار النوع يضبط أقسامه الافتراضية (تبقى قابلة للإيقاف تحته). */
export function KindPicker({ cfg, patch }: { cfg: ReportConfig; patch: Patch }) {
  const t = useT();
  const pick = (kind: ReportKind) =>
    kind !== cfg.kind && patch({ kind, records: [...KIND_RECORDS[kind]] });
  return (
    <div role="radiogroup" aria-label={t("reports.step.kind")} className="grid grid-cols-2 gap-2">
      {REPORT_KINDS.map((k) => {
        const on = cfg.kind === k;
        return (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => pick(k)}
            className={`min-h-16 rounded-2xl p-3 text-start transition-colors ${
              on ? "gradient-primary text-primary-foreground shadow-soft" : "glass text-foreground"
            }`}
          >
            <span className="block text-sm font-black">{t(`reports.kindTitle.${k}`)}</span>
            <span className={`block text-xs mt-0.5 ${on ? "opacity-90" : "text-muted-foreground"}`}>
              {t(`reports.kindHint.${k}`)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** النطاق: أربع شرائح، و«مخصص» يفتح نصف شاشة فيها الاختصارات والتاريخان. */
export function RangePicker({
  cfg,
  patch,
  today,
}: {
  cfg: ReportConfig;
  patch: Patch;
  today: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const err = rangeError(cfg);
  const main: (typeof MAIN_PRESETS)[number] = (MAIN_PRESETS as readonly string[]).includes(
    cfg.preset,
  )
    ? (cfg.preset as (typeof MAIN_PRESETS)[number])
    : "custom";
  const choose = (p: (typeof MAIN_PRESETS)[number]) => {
    if (p === "custom") return setOpen(true);
    patch({ preset: p, ...presetRange(p, today)! });
  };
  return (
    <div className="space-y-1.5">
      <Choice
        cols={4}
        label={t("reports.range.label")}
        value={main}
        onChange={choose}
        options={MAIN_PRESETS.map((p) => ({ value: p, label: t(`reports.range.${p}`) }))}
      />
      {err ? (
        <p role="alert" className="text-xs font-bold text-destructive">
          {t(`reports.range.error.${err}`)}
        </p>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="min-h-11 w-full rounded-2xl px-3 text-xs text-muted-foreground flex items-center gap-1.5 text-start"
        >
          <CalendarDays className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span className="flex-1">
            {cfg.from === cfg.to
              ? fmtDate(cfg.from, cfg)
              : t("reports.meta.periodRange", {
                  from: fmtDate(cfg.from, cfg),
                  to: fmtDate(cfg.to, cfg),
                })}
          </span>
          <span className="font-bold text-primary">{t("reports.setup.change")}</span>
        </button>
      )}
      <RangeSheet
        open={open}
        onClose={() => setOpen(false)}
        cfg={cfg}
        patch={patch}
        today={today}
      />
    </div>
  );
}

function RangeSheet({
  open,
  onClose,
  cfg,
  patch,
  today,
}: {
  open: boolean;
  onClose: () => void;
  cfg: ReportConfig;
  patch: Patch;
  today: string;
}) {
  const t = useT();
  const err = rangeError(cfg);
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        title={t("reports.range.label")}
        snap="auto"
        bodyClassName="space-y-3"
        footer={
          <button
            type="button"
            disabled={!!err}
            onClick={onClose}
            className="w-full min-h-12 rounded-2xl gradient-primary text-primary-foreground text-sm font-bold disabled:opacity-50"
          >
            {t("reports.setup.done")}
          </button>
        }
      >
        <Choice
          label={t("reports.range.shortcuts")}
          value={cfg.preset}
          onChange={(p) => patch({ preset: p, ...presetRange(p, today)! })}
          options={SHORTCUTS.map((p) => ({ value: p, label: t(`reports.range.${p}`) }))}
        />
        <div className="grid grid-cols-2 gap-2">
          <Field label={t("reports.range.from")} hint={fmtDate(cfg.from, cfg)}>
            <input
              type="date"
              dir="ltr"
              value={cfg.from}
              max={today}
              onChange={(e) => patch({ preset: "custom", from: e.target.value })}
              className={inputCls}
            />
          </Field>
          <Field label={t("reports.range.to")} hint={fmtDate(cfg.to, cfg)}>
            <input
              type="date"
              dir="ltr"
              value={cfg.to}
              max={today}
              onChange={(e) => patch({ preset: "custom", to: e.target.value })}
              className={inputCls}
            />
          </Field>
        </div>
        {err && (
          <p role="alert" className="text-xs font-bold text-destructive">
            {t(`reports.range.error.${err}`)}
          </p>
        )}
      </SheetContent>
    </Sheet>
  );
}

/** الأقسام: شرائح متعددة الاختيار من أقسام النوع، ولا بد من قسم واحد على الأقل. */
export function SectionChips({ cfg, patch }: { cfg: ReportConfig; patch: Patch }) {
  const t = useT();
  const sections = KIND_SECTIONS[cfg.kind];
  const toggle = (r: RecordType) => {
    const on = cfg.records.includes(r);
    patch({
      records: on
        ? cfg.records.filter((x) => x !== r)
        : sections.filter((x) => x === r || cfg.records.includes(x)),
    });
  };
  return (
    <div className="space-y-1.5">
      <ul className="flex flex-wrap gap-1.5" aria-label={t("reports.setup.sections")}>
        {sections.map((r) => {
          const on = cfg.records.includes(r);
          return (
            <li key={r}>
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => toggle(r)}
                className={`min-h-11 rounded-full px-3.5 flex items-center gap-1.5 text-xs font-bold ${
                  on ? "bg-primary/15 text-primary" : "bg-muted/50 text-muted-foreground"
                }`}
              >
                {on && <Check className="w-3.5 h-3.5" aria-hidden="true" />}
                {t(`reports.records.${r}`)}
              </button>
            </li>
          );
        })}
      </ul>
      {!cfg.records.length && (
        <p role="alert" className="text-xs font-bold text-destructive">
          {t("reports.recordsStep.empty")}
        </p>
      )}
    </div>
  );
}

/** سطر يفتح نصف شاشة (الطلاب، والفلاتر). */
export function RowButton({
  label,
  value,
  onClick,
}: {
  label: string;
  value: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full min-h-12 rounded-2xl glass px-3 flex items-center gap-2 text-start"
    >
      <span className="text-sm font-bold text-foreground">{label}</span>
      <span className="flex-1 min-w-0 truncate text-sm text-muted-foreground text-end">
        {value}
      </span>
      <ChevronLeft className="w-4 h-4 text-muted-foreground ltr:rotate-180" aria-hidden="true" />
    </button>
  );
}
