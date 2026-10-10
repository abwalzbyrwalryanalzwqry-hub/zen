import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useT } from "@/lib/i18n";
import { SURAHS } from "@/lib/quran-meta";
import { normalizeName } from "@/lib/daily-record";

/**
 * قائمة السور داخل نصف الشاشة نفسها (1.14.0) بدل نافذة فوق نافذة: بحث بالاسم (بلا همزات ولا تشكيل) أو
 * الرقم، والسور خارج المسموح (قبل البداية أو بعدها حسب الاتجاه) معطّلة، والمختارة في المنتصف.
 */
export function SurahList({
  current,
  min = 1,
  max = 114,
  onPick,
}: {
  current?: number;
  min?: number;
  max?: number;
  onPick: (n: number) => void;
}) {
  const t = useT();
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const k = normalizeName(q);
    if (!k) return SURAHS;
    return SURAHS.filter((s) => String(s.n) === k || normalizeName(s.name).includes(k));
  }, [q]);
  return (
    <div className="space-y-2">
      <label className="relative block">
        <span className="sr-only">{t("surahPicker.search")}</span>
        <Search
          className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("surahPicker.search")}
          className="w-full min-h-11 rounded-2xl border border-border/60 bg-background/70 ps-9 pe-3 text-sm"
        />
      </label>
      {list.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground" role="status">
          {t("surahPicker.none")}
        </p>
      ) : (
        <ul className="grid gap-1" role="list">
          {list.map((s) => {
            const on = s.n === current;
            return (
              <li key={s.n}>
                <button
                  type="button"
                  disabled={s.n < min || s.n > max}
                  aria-current={on ? "true" : undefined}
                  ref={on ? (el) => el?.scrollIntoView({ block: "center" }) : undefined}
                  onClick={() => onPick(s.n)}
                  className={`w-full min-h-12 rounded-2xl px-2 flex items-center gap-2 text-start disabled:opacity-35 ${
                    on ? "bg-primary/12 ring-1 ring-primary/40" : "bg-muted/40"
                  }`}
                >
                  <span className="w-8 h-8 shrink-0 rounded-lg border border-gold/30 bg-gold/10 text-gold-ink text-xs font-bold flex items-center justify-center tabular-nums">
                    {s.n}
                  </span>
                  <span className="flex-1 min-w-0 truncate font-display text-sm font-medium text-foreground">
                    {s.name}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {t("surahPicker.ayahs", { n: s.ayahs })}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
