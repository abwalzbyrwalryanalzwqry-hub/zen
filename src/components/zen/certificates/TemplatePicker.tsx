import { useState, type ReactNode } from "react";
import { useT } from "@/lib/i18n";
import type { TemplateRow } from "@/lib/certificates/api";
import { composePage, type Sources } from "@/lib/certificates/compose";
import { normalizeDesign, type Design } from "@/lib/certificates/model";
import {
  GALLERY_CATEGORIES,
  SYSTEM_TEMPLATES,
  systemTemplateName,
  type GalleryCategory,
} from "@/lib/certificates/templates";
import { pickKey, type TemplatePick } from "@/lib/certificates/resolve";
import type { VarBag } from "@/lib/certificates/variables";
import { CertPage } from "./CertPage";
import type { GalleryItem } from "./helpers";

/**
 * معرض القوالب: مصغّرات حقيقية من محرّك الرسم (لا صور ثابتة) بقيم نموذجية وهوية المركز، مع تصفية بالتصنيف.
 * قوالب المركز أولاً ثم قوالب زِن الثمانية.
 */
export function TemplatePicker({
  items,
  sources,
  vars,
  value,
  onPick,
  actions,
  scopeLabel,
}: {
  items: GalleryItem[];
  sources: Sources;
  vars: VarBag;
  value?: TemplatePick | null;
  onPick?: (it: GalleryItem) => void;
  actions?: (it: GalleryItem) => ReactNode;
  scopeLabel?: (it: GalleryItem) => string;
}) {
  const t = useT();
  const [cat, setCat] = useState<GalleryCategory | "all">("all");
  const shown = items.filter((i) => cat === "all" || i.categories.includes(cat));
  const sel = pickKey(value ?? null);
  return (
    <div className="space-y-3">
      <div
        className="flex gap-1.5 overflow-x-auto pb-1"
        role="tablist"
        aria-label={t("certificates.designer.categories")}
      >
        {(["all", ...GALLERY_CATEGORIES] as const).map((c) => (
          <button
            key={c}
            role="tab"
            aria-selected={cat === c}
            onClick={() => setCat(c)}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold border ${cat === c ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border"}`}
          >
            {c === "all" ? t("certificates.all") : t(`certificates.gallery.cat.${c}`)}
          </button>
        ))}
      </div>
      {!shown.length && (
        <p className="text-xs text-muted-foreground text-center py-6">
          {t("certificates.empty.search")}
        </p>
      )}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((it) => {
          const k = pickKey(it.pick);
          const html = composePage(it.design, vars, sources, {
            uid: `g${k.replace(/[^a-z0-9]/gi, "").slice(0, 10)}`,
            pending: true,
          }).html;
          const on = k === sel;
          return (
            <li
              key={k}
              className={`rounded-2xl border bg-card overflow-hidden ${on ? "border-primary ring-2 ring-primary/30" : "border-border"} ${it.row?.archived ? "opacity-60" : ""}`}
            >
              <button
                type="button"
                disabled={!onPick}
                onClick={() => onPick?.(it)}
                className="block w-full text-start"
                aria-pressed={on}
              >
                <div className="p-3 bg-muted/40">
                  <CertPage
                    html={html}
                    width={it.design.page.width}
                    height={it.design.page.height}
                    maxHeight={200}
                    label={it.name}
                  />
                </div>
                <div className="px-3 pt-2">
                  <p className="text-sm font-black flex items-center gap-1.5">
                    {it.name}
                    {scopeLabel && (
                      <span className="text-[0.625rem] rounded-full bg-gold/15 px-1.5 py-0.5 font-bold">
                        {scopeLabel(it)}
                      </span>
                    )}
                  </p>
                  {it.desc && (
                    <p className="text-[0.6875rem] text-muted-foreground line-clamp-2">{it.desc}</p>
                  )}
                </div>
              </button>
              {actions && (
                <div className="px-3 pb-3 pt-2 flex flex-wrap gap-1.5">{actions(it)}</div>
              )}
              {!actions && <div className="h-3" />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
