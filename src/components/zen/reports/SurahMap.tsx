import { useState } from "react";
import { useT } from "@/lib/i18n";
import { fmtNum } from "@/lib/reports/format";
import type { SurahProgress } from "@/lib/reports/achieve";

const TONE: Record<SurahProgress["state"], string> = {
  none: "bg-muted/60 text-muted-foreground",
  partial: "bg-gold/25 text-gold-ink",
  done: "bg-primary text-primary-foreground",
};

/** خريطة السور الـ114: لم يبدأ / جارٍ / مكتمل، محسوبة من مقاطع الحفظ لا من إدخال يدوي. */
export function SurahMap({ map }: { map: SurahProgress[] }) {
  const t = useT();
  const [picked, setPicked] = useState<SurahProgress | null>(null);
  const count = (s: SurahProgress["state"]) => map.filter((m) => m.state === s).length;
  return (
    <div className="space-y-2">
      <ul className="flex flex-wrap gap-2 text-xs text-muted-foreground" aria-hidden="true">
        {(["done", "partial", "none"] as const).map((s) => (
          <li key={s} className="flex items-center gap-1">
            <span className={`inline-block w-3 h-3 rounded ${TONE[s]}`} />
            {t(`reports.ach.map.${s}`)} ({fmtNum(count(s), "latn", 0)})
          </li>
        ))}
      </ul>
      <ol className="grid grid-cols-10 gap-1" aria-label={t("reports.ach.map.title")}>
        {map.map((m) => (
          <li key={m.n}>
            <button
              type="button"
              onClick={() => setPicked(m)}
              aria-label={t("reports.ach.map.cell", {
                name: m.name,
                state: t(`reports.ach.map.${m.state}`),
                done: m.done,
                total: m.ayahs,
              })}
              className={`w-full aspect-square min-h-7 rounded-md text-xs font-bold tabular-nums ${TONE[m.state]} ${
                picked?.n === m.n ? "ring-2 ring-foreground" : ""
              }`}
            >
              {m.n}
            </button>
          </li>
        ))}
      </ol>
      {picked && (
        <p role="status" className="text-xs text-foreground bg-muted/50 rounded-2xl px-3 py-2">
          {t("reports.ach.map.detail", {
            name: picked.name,
            state: t(`reports.ach.map.${picked.state}`),
            done: picked.done,
            total: picked.ayahs,
          })}
        </p>
      )}
    </div>
  );
}
