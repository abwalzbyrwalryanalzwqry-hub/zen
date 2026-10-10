import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Cloud, Smartphone } from "lucide-react";
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useT } from "@/lib/i18n";
import { readableColors, type ColorKey, type ReportConfig } from "@/lib/reports/config";
import {
  COLOR_PRESETS,
  applyIdentity,
  fetchIdentity,
  identityOf,
  paletteFrom,
  presetOf,
  saveIdentity,
} from "@/lib/reports/identity";

const COLOR_KEYS: ColorKey[] = [
  "primary",
  "headerBg",
  "headerText",
  "text",
  "heading",
  "border",
  "zebra",
];

/** أين تُحفظ الهوية: للمركز كله أو لهذا الجهاز. */
export function IdentityScope({ canEdit }: { canEdit: boolean }) {
  const t = useT();
  const Icon = canEdit ? Cloud : Smartphone;
  return (
    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
      {t(canEdit ? "reports.identity.center" : "reports.identity.device")}
    </p>
  );
}

/** الألوان: ست لوحات جاهزة ولون مخصص واحد تُشتق منه البقية؛ والألوان السبعة تحت «متقدم». */
export function StepColors({ cfg, set }: { cfg: ReportConfig; set: (c: ReportConfig) => void }) {
  const t = useT();
  const { fixes } = readableColors(cfg.colors);
  const current = presetOf(cfg.colors);
  const setColor = (k: ColorKey, v: string) => set({ ...cfg, colors: { ...cfg.colors, [k]: v } });
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-black text-foreground mb-1">
        {t("reports.color.title")}
      </legend>
      <div role="radiogroup" aria-label={t("reports.color.title")} className="flex flex-wrap gap-2">
        {COLOR_PRESETS.map((p) => {
          const on = current === p.id;
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={t(`reports.color.preset.${p.id}`)}
              onClick={() => set({ ...cfg, colors: { ...p.colors } })}
              style={{ background: p.colors.primary }}
              className={`w-11 h-11 rounded-full flex items-center justify-center text-white ${
                on ? "ring-2 ring-offset-2 ring-primary ring-offset-background" : ""
              }`}
            >
              {on && <Check className="w-5 h-5" aria-hidden="true" />}
            </button>
          );
        })}
        <label
          className={`h-11 rounded-full glass ps-1 pe-3 flex items-center gap-2 text-xs font-bold cursor-pointer ${
            current === null ? "ring-2 ring-offset-2 ring-primary ring-offset-background" : ""
          }`}
        >
          <input
            type="color"
            aria-label={t("reports.color.custom")}
            value={cfg.colors.primary}
            onChange={(e) => set({ ...cfg, colors: paletteFrom(e.target.value) })}
            className="w-9 h-9 rounded-full border border-border bg-transparent cursor-pointer"
          />
          {t("reports.color.custom")}
        </label>
      </div>
      {fixes.length > 0 && (
        <div role="status" className="rounded-2xl border border-gold/40 bg-gold/10 p-3 space-y-1">
          <p className="text-xs font-black text-foreground">{t("reports.color.fixed")}</p>
          <ul className="text-xs text-foreground list-disc ps-5">
            {fixes.map((f) => (
              <li key={f.key}>
                {t("reports.color.fixedItem", { name: t(`reports.color.${f.key}`) })}
              </li>
            ))}
          </ul>
        </div>
      )}
      <details className="glass rounded-2xl px-3">
        <summary className="min-h-11 flex items-center text-sm font-bold text-foreground cursor-pointer">
          {t("reports.color.advanced")}
        </summary>
        <ul className="space-y-1 pb-3">
          {COLOR_KEYS.map((k) => (
            <li key={k} className="flex items-center gap-3 min-h-11">
              <span className="flex-1 text-sm text-foreground">{t(`reports.color.${k}`)}</span>
              <input
                type="color"
                aria-label={t(`reports.color.${k}`)}
                value={cfg.colors[k]}
                onChange={(e) => setColor(k, e.target.value)}
                className="w-11 h-11 rounded-xl border border-border bg-transparent cursor-pointer"
              />
            </li>
          ))}
        </ul>
      </details>
    </fieldset>
  );
}
