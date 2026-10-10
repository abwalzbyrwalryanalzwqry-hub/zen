import { History, Star, StarOff, Trash2 } from "lucide-react";
import { useState } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useT } from "@/lib/i18n";
import type { ReportConfig } from "@/lib/reports/config";
import {
  MAX_FAVORITES,
  addFavorite,
  applyShape,
  loadFavorites,
  loadLast,
  removeFavorite,
  type ReportShape,
} from "@/lib/reports/favorites";
import { fmtDate } from "@/lib/reports/format";
import { inputCls } from "./parts";

/**
 * اختصارات أعلى شاشة الإعداد (1.15.0): «كرر آخر تقرير» بعد أول تصدير، وحتى 3 مفضلة مسمّاة. النقر يطبّق
 * التقرير ويفتح المعاينة مباشرة؛ فالتقرير المعتاد ضغطة واحدة.
 */
export function ReportShortcuts({
  halaqa,
  cfg,
  today,
  onApply,
}: {
  halaqa: string;
  cfg: ReportConfig;
  today: string;
  onApply: (c: ReportConfig) => void;
}) {
  const t = useT();
  const [favs, setFavs] = useState(() => loadFavorites(halaqa));
  const [last] = useState(() => loadLast(halaqa));
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const summary = (s: ReportShape) =>
    [
      t(`reports.kindTitle.${s.kind}`),
      s.preset === "custom"
        ? `${fmtDate(s.from, cfg)} – ${fmtDate(s.to, cfg)}`
        : t(`reports.range.${s.preset}`),
    ].join(" · ");
  const go = (s: ReportShape) => onApply(applyShape(cfg, s, today));
  const full = favs.length >= MAX_FAVORITES;
  const row = "flex-1 min-w-0 min-h-12 rounded-2xl glass px-3 flex items-center gap-2 text-start";
  return (
    <div className="space-y-2">
      {last && (
        <button type="button" onClick={() => go(last.shape)} className={`w-full ${row}`}>
          <History className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
          <span className="min-w-0">
            <span className="block text-sm font-bold text-foreground">
              {t("reports.shortcuts.repeat")}
            </span>
            <span className="block text-xs text-muted-foreground truncate">
              {summary(last.shape)}
            </span>
          </span>
        </button>
      )}
      {favs.length > 0 && (
        <ul aria-label={t("reports.shortcuts.favorites")} className="space-y-2">
          {favs.map((f) => (
            <li key={f.id} className="flex items-center gap-2">
              <button type="button" onClick={() => go(f.shape)} className={row}>
                <Star className="w-4 h-4 text-gold shrink-0" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-foreground truncate">{f.name}</span>
                  <span className="block text-xs text-muted-foreground truncate">
                    {summary(f.shape)}
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => setFavs(removeFavorite(halaqa, f.id))}
                aria-label={t("reports.shortcuts.remove", { name: f.name })}
                className="min-h-12 min-w-12 rounded-2xl glass text-destructive flex items-center justify-center"
              >
                <Trash2 className="w-4 h-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={() => {
          setName("");
          setNaming(true);
        }}
        disabled={full}
        className="w-full min-h-11 rounded-2xl text-xs font-bold text-primary flex items-center justify-center gap-1.5 disabled:text-muted-foreground"
      >
        {full ? (
          <StarOff className="w-4 h-4" aria-hidden="true" />
        ) : (
          <Star className="w-4 h-4" aria-hidden="true" />
        )}
        {full ? t("reports.shortcuts.full") : t("reports.shortcuts.save")}
      </button>
      <Sheet open={naming} onOpenChange={setNaming}>
        <SheetContent
          title={t("reports.shortcuts.save")}
          description={summary(cfg)}
          snap="auto"
          footer={
            <button
              type="button"
              disabled={!name.trim()}
              onClick={() => {
                setFavs(addFavorite(halaqa, name, cfg));
                setNaming(false);
              }}
              className="w-full min-h-12 rounded-2xl gradient-primary text-primary-foreground text-sm font-bold disabled:opacity-50"
            >
              {t("reports.shortcuts.confirm")}
            </button>
          }
        >
          <label className="block space-y-1">
            <span className="text-xs font-bold text-muted-foreground">
              {t("reports.shortcuts.name")}
            </span>
            <input
              value={name}
              maxLength={30}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("reports.shortcuts.namePh")}
              className={inputCls}
            />
          </label>
        </SheetContent>
      </Sheet>
    </div>
  );
}
