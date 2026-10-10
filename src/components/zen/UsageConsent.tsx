import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "@/lib/toast";
import { useT } from "@/lib/i18n";
import {
  amAppOwner,
  fetchAnalyticsConsent,
  setAnalyticsConsent,
  type AnalyticsConsent,
} from "@/lib/usage";

/** موافقة صريحة على الإحصاءات المجمّعة (13.4)، معطّلة افتراضياً، ولا تُتاح لمن دون 13. */
export function UsageConsent() {
  const t = useT();
  const [c, setC] = useState<AnalyticsConsent | null>(null);
  const [age, setAge] = useState(false);
  const [busy, setBusy] = useState(false);
  const [owner, setOwner] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchAnalyticsConsent()
      .then((x) => {
        if (!alive) return;
        setC(x);
        setAge(x.age_13_plus);
      })
      .catch(() => alive && setC({ granted: false, age_13_plus: false, eligible: true }));
    void amAppOwner().then((o) => alive && setOwner(o));
    return () => {
      alive = false;
    };
  }, []);

  const toggle = async (on: boolean) => {
    setBusy(true);
    try {
      const x = await setAnalyticsConsent(on, age);
      setC(x);
      toast.success(t(x.granted ? "usage.on" : "usage.off"));
    } catch {
      toast.error(t("usage.error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-2" aria-label={t("usage.title")}>
      <h2 className="text-xs font-bold text-muted-foreground px-2">{t("usage.title")}</h2>
      <div className="glass rounded-3xl p-4 space-y-3">
        <p className="text-xs text-muted-foreground leading-relaxed">{t("usage.hint")}</p>
        {c && !c.eligible ? (
          <p className="text-sm text-foreground" role="status">
            {t("usage.notEligible")}
          </p>
        ) : (
          <>
            <label className="flex items-center gap-3 min-h-12 text-sm text-foreground">
              <input
                type="checkbox"
                className="h-6 w-6 accent-primary"
                checked={age}
                disabled={busy || !c || c.granted}
                onChange={(e) => setAge(e.target.checked)}
              />
              {t("usage.age")}
            </label>
            <label className="flex items-center justify-between gap-3 min-h-12 text-sm font-bold text-foreground">
              {t("usage.toggle")}
              <input
                type="checkbox"
                role="switch"
                className="h-6 w-6 accent-primary"
                checked={!!c?.granted}
                disabled={busy || !c || (!c.granted && !age)}
                onChange={(e) => void toggle(e.target.checked)}
              />
            </label>
            {!age && !c?.granted && (
              <p className="text-xs text-muted-foreground">{t("usage.ageRequired")}</p>
            )}
          </>
        )}
        {owner && (
          <Link
            to="/owner/usage"
            className="flex min-h-12 items-center justify-between rounded-2xl bg-secondary/60 px-3 text-sm font-bold text-foreground"
          >
            {t("usage.owner")}
            <span className="text-xs font-normal text-muted-foreground">
              {t("usage.ownerHint")}
            </span>
          </Link>
        )}
      </div>
    </section>
  );
}
