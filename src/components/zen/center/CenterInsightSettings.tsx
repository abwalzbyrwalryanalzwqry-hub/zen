import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { myManagedCenters } from "@/lib/center";
import { fetchLeague, setLeagueEnabled, setWeeklySummary } from "@/lib/center-insights";
import { useT } from "@/lib/i18n";
import { toast } from "@/lib/toast";
import { HalaqaLeague } from "./HalaqaLeague";

/**
 * دوري الحلقات وملخص الخميس في لوحة المركز (1.20.0): الطاقم يرى الدوري دائماً (معاينة قبل تفعيله لأعضاء
 * الحلقات)، ومنشئ المركز أو مديره وحدهما يفعّلانه ويوقفان الملخص الأسبوعي. على نمط CenterSimpleModeSetting.
 */
export function CenterInsightSettings({ centerId }: { centerId: string }) {
  const t = useT();
  const qc = useQueryClient();
  const [canManage, setCanManage] = useState(false);
  const [weekly, setWeekly] = useState(true);
  const [busy, setBusy] = useState<"league" | "weekly" | null>(null);
  const league = useQuery({
    queryKey: ["center-league", centerId],
    queryFn: () => fetchLeague(centerId, 30),
    retry: false,
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    let alive = true;
    (async () => {
      const centers = await myManagedCenters().catch(() => []);
      const me = centers.find((c) => c.center_id === centerId);
      const ok = me?.role === "owner" || me?.role === "manager";
      if (!alive || !ok) return;
      setCanManage(true);
      const { data } = await supabase
        .from("centers")
        .select("weekly_summary_enabled")
        .eq("id", centerId)
        .maybeSingle();
      if (alive) setWeekly(data?.weekly_summary_enabled !== false);
    })();
    return () => {
      alive = false;
    };
  }, [centerId]);

  const leagueOn = league.data?.enabled === true;
  const toggleLeague = async () => {
    setBusy("league");
    try {
      await setLeagueEnabled(centerId, !leagueOn);
      await qc.invalidateQueries({ queryKey: ["center-league", centerId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("centerInsights.err.save"));
    } finally {
      setBusy(null);
    }
  };
  const toggleWeekly = async () => {
    setBusy("weekly");
    try {
      await setWeeklySummary(centerId, !weekly);
      setWeekly(!weekly);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("centerInsights.err.save"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      {league.data && <HalaqaLeague league={league.data} />}
      {canManage && (
        <div
          className="glass-strong rounded-3xl p-4 space-y-3"
          data-testid="center-insight-settings"
        >
          <Switch
            id="center-league"
            icon={Trophy}
            label={t("centerInsights.league.toggle")}
            hint={t("centerInsights.league.toggleHint")}
            on={leagueOn}
            busy={busy === "league" || !league.data}
            onToggle={() => void toggleLeague()}
          />
          <Switch
            id="center-weekly"
            icon={Bell}
            label={t("centerInsights.weekly.toggle")}
            hint={t("centerInsights.weekly.toggleHint")}
            on={weekly}
            busy={busy === "weekly"}
            onToggle={() => void toggleWeekly()}
          />
        </div>
      )}
    </>
  );
}

function Switch({
  id,
  icon: Icon,
  label,
  hint,
  on,
  busy,
  onToggle,
}: {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  hint: string;
  on: boolean;
  busy: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-primary" aria-hidden="true" />
        <p id={id} className="text-sm font-bold text-foreground flex-1">
          {label}
        </p>
        <button
          role="switch"
          aria-checked={on}
          aria-labelledby={id}
          onClick={onToggle}
          disabled={busy}
          className={`w-11 h-6 rounded-full transition-colors relative disabled:opacity-60 ${on ? "bg-primary" : "bg-muted"}`}
        >
          <span
            className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${on ? "start-0.5" : "start-[1.375rem]"}`}
          />
        </button>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{hint}</p>
    </div>
  );
}
