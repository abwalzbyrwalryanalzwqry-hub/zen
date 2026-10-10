import { ArrowDown, ArrowUp, Minus, Trophy } from "lucide-react";
import type { League } from "@/lib/center-insights";
import { useT } from "@/lib/i18n";

/**
 * دوري الحلقات (1.20.0): ترتيب بالتحسّن عن الفترة السابقة، لا بالقيمة المطلقة، فتتقدّم الحلقة التي تتحسّن ولو
 * كانت أضعف. مؤشرات جماعية فقط (الانتظام، والتسميع، والتحديات)، بلا أسماء طلاب ولا ترتيب أفراد.
 */
export function HalaqaLeague({ league, title }: { league: League; title?: string }) {
  const t = useT();
  if (league.items.length === 0) return null;
  return (
    <section
      className="glass-strong rounded-3xl p-4 space-y-2"
      aria-label={title ?? t("centerInsights.league.title")}
      data-testid="halaqa-league"
    >
      <p className="text-sm font-bold text-foreground flex items-center gap-1.5">
        <Trophy className="w-4 h-4 text-primary" aria-hidden="true" />
        {title ?? t("centerInsights.league.title")}
      </p>
      <p className="text-xs text-muted-foreground leading-relaxed">
        {t("centerInsights.league.hint", { n: league.days })}
      </p>
      <ol className="space-y-1.5">
        {league.items.map((h) => (
          <li
            key={h.halaqa_id}
            className={`rounded-2xl px-3 py-2 flex items-center gap-2 ${
              h.mine ? "bg-primary/10 ring-1 ring-primary/30" : "glass"
            }`}
            data-league-halaqa={h.halaqa_id}
          >
            <span className="w-6 text-center text-sm font-black text-primary tabular-nums">
              {h.rank}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-xs font-bold text-foreground truncate">{h.name}</span>
              <span className="block text-[0.625rem] text-muted-foreground">
                {t("centerInsights.league.line", {
                  reg: h.regularity == null ? "—" : `${h.regularity}%`,
                  score: h.avg_score ?? "—",
                  ch: h.challenges == null ? "—" : `${h.challenges}%`,
                })}
              </span>
            </span>
            <Change value={h.change} />
          </li>
        ))}
      </ol>
    </section>
  );
}

function Change({ value }: { value: number | null }) {
  const t = useT();
  if (value == null)
    return (
      <span className="text-[0.625rem] text-muted-foreground">
        {t("centerInsights.league.new")}
      </span>
    );
  const Icon = value > 0 ? ArrowUp : value < 0 ? ArrowDown : Minus;
  const tone =
    value > 0 ? "text-primary" : value < 0 ? "text-destructive" : "text-muted-foreground";
  return (
    <span className={`flex items-center gap-0.5 text-xs font-bold tabular-nums ${tone}`} dir="ltr">
      <Icon className="w-3.5 h-3.5" aria-hidden="true" />
      {Math.abs(value)}
    </span>
  );
}
