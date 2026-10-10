import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Award, HeartHandshake, Loader2, Scale } from "lucide-react";
import { QueryError } from "@/components/zen/QueryError";
import { StudioFrame } from "@/components/zen/certificates/StudioFrame";
import { Sel } from "@/components/zen/certificates/fields";
import { useHalaqaReports, useStudioContext } from "@/components/zen/certificates/hooks";
import { useT, t as tStatic } from "@/lib/i18n";
import { addLocalDays, localDayKey } from "@/lib/local-day";
import { certApi } from "@/lib/certificates/api";
import { useCertificatesDict } from "@/lib/certificates/i18n";
import { deservedList, fairness, groupDeserved, issueSearch } from "@/lib/certificates/honor";

const PERIODS = [30, 90, 180, 365] as const;
const str = (v: unknown) => (typeof v === "string" && v ? v.slice(0, 80) : undefined);

/**
 * /certificates/honor — التكريم والإنصاف (1.26.0، فحص الاستوديو المرحلة 5): من استحق شهادة بمحطة ولم ينلها
 * (إصدار جماعي بلمسة لكل نوع)، ومن لم يُكرَّم في الفترة، وتوزيع الشهادات على طلاب الحلقة.
 */
export const Route = createFileRoute("/_authed/certificates/honor")({
  head: () => ({ meta: [{ title: tStatic("meta.certificatesHonor") }] }),
  validateSearch: (s: Record<string, unknown>): { halaqa?: string } => ({ halaqa: str(s.halaqa) }),
  component: HonorScreen,
});

function HonorScreen() {
  useCertificatesDict();
  const t = useT();
  const search = Route.useSearch();
  const ctx = useStudioContext();
  const halaqat = (ctx.data?.halaqat ?? []).filter((h) => h.can_issue);
  const [hal, setHal] = useState(search.halaqa ?? "");
  const hid = hal || halaqat[0]?.id || "";
  const [days, setDays] = useState<(typeof PERIODS)[number]>(90);
  const to = localDayKey();
  const from = addLocalDays(-days);
  const honor = useQuery({
    queryKey: ["certificates", "honor", hid, from, to],
    enabled: !!hid,
    queryFn: () => certApi.honor(hid, from, to),
  });
  const reports = useHalaqaReports(hid || null, from, to);
  const rows = useMemo(() => honor.data?.students ?? [], [honor.data]);
  const deserved = useMemo(
    () =>
      deservedList(
        rows,
        (id) => {
          const r = reports.data?.byId.get(id);
          return r ? [...r.milestones, ...r.journey.milestones] : [];
        },
        from,
        to,
      ),
    [rows, reports.data, from, to],
  );
  const fair = useMemo(() => fairness(rows), [rows]);
  const unhonored = rows.filter((r) => r.count === 0);
  const typeName = (k: string) => ctx.data?.types.find((x) => x.key === k)?.name ?? k;

  return (
    <StudioFrame title={t("certificates.honor.title")} subtitle={t("certificates.honor.subtitle")}>
      <div className="max-w-3xl mx-auto p-4 space-y-5">
        <div className="grid grid-cols-2 gap-2">
          <Sel
            label={t("certificates.circle.title")}
            value={hid}
            options={halaqat.map((h) => ({ value: h.id, label: h.name }))}
            onChange={setHal}
          />
          <Sel
            label={t("certificates.honor.period")}
            value={String(days)}
            options={PERIODS.map((d) => ({
              value: String(d),
              label: t("certificates.honor.days", { n: d }),
            }))}
            onChange={(v) => setDays(Number(v) as (typeof PERIODS)[number])}
          />
        </div>
        {(ctx.isLoading || honor.isLoading) && (
          <div
            className="flex justify-center py-10"
            role="status"
            aria-label={t("certificates.loading")}
          >
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        )}
        {honor.error && <QueryError onRetry={() => void honor.refetch()} />}
        {!ctx.isLoading && !halaqat.length && (
          <p className="text-sm text-muted-foreground">{t("certificates.honor.noHalaqa")}</p>
        )}
        {honor.data && (
          <>
            <section className="rounded-2xl border border-gold/50 bg-gold/10 p-4 space-y-3">
              <h2 className="font-black flex items-center gap-2">
                <Award className="w-5 h-5" />{" "}
                {t("certificates.honor.deserved", { n: deserved.length })}
              </h2>
              {reports.isLoading && (
                <p className="text-xs text-muted-foreground">{t("certificates.loading")}</p>
              )}
              {!reports.isLoading && !deserved.length && (
                <p className="text-sm text-muted-foreground">
                  {t("certificates.honor.noneDeserved")}
                </p>
              )}
              {groupDeserved(deserved).map((g) => (
                <div
                  key={`${g.type}:${JSON.stringify(g.ref)}`}
                  className="rounded-xl bg-card border border-border p-3 space-y-2"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm flex-1">
                      {typeName(g.type)}
                      {g.ref?.kind === "juz"
                        ? ` — ${t("certificates.honor.juz", { n: g.ref.juz })}`
                        : ""}
                      {g.ref?.kind === "surah"
                        ? ` — ${t("certificates.honor.surah", { n: g.ref.surah })}`
                        : ""}
                    </span>
                    <Link
                      to="/certificates/new"
                      search={issueSearch(
                        hid,
                        g.type,
                        g.items.map((d) => d.student_id),
                        g.ref,
                      )}
                      className="rounded-xl bg-primary text-primary-foreground px-3 py-1.5 text-xs font-bold"
                    >
                      {t("certificates.honor.issueFor", { n: g.items.length })}
                    </Link>
                  </div>
                  <p className="text-xs text-muted-foreground break-words">
                    {g.items.map((d) => d.name).join("، ")}
                  </p>
                </div>
              ))}
            </section>

            <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
              <h2 className="font-black flex items-center gap-2">
                <HeartHandshake className="w-5 h-5" />{" "}
                {t("certificates.honor.unhonored", { n: unhonored.length })}
              </h2>
              {unhonored.length ? (
                <>
                  <p className="text-xs text-muted-foreground break-words">
                    {unhonored.map((r) => r.name).join("، ")}
                  </p>
                  <Link
                    to="/certificates/new"
                    search={issueSearch(
                      hid,
                      "appreciation",
                      unhonored.map((r) => r.student_id),
                    )}
                    className="inline-flex rounded-xl border border-border px-3 py-1.5 text-xs font-bold hover:bg-muted"
                  >
                    {t("certificates.honor.appreciateAll")}
                  </Link>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t("certificates.honor.allHonored")}
                </p>
              )}
            </section>

            <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
              <h2 className="font-black flex items-center gap-2">
                <Scale className="w-5 h-5" /> {t("certificates.honor.fairness")}
              </h2>
              <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                {(
                  [
                    ["honoredPct", `${fair.honoredPct}%`],
                    ["total", String(fair.total)],
                    ["manualPct", `${fair.manualPct}%`],
                    ["topShare", `×${fair.topShare}`],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k} className="rounded-xl bg-muted/50 p-2">
                    <dt className="text-[0.6875rem] text-muted-foreground">
                      {t(`certificates.honor.stat.${k}`)}
                    </dt>
                    <dd className="text-lg font-black" dir="ltr">
                      {v}
                    </dd>
                  </div>
                ))}
              </dl>
              <div className="space-y-1.5" aria-label={t("certificates.honor.distTitle")}>
                {fair.dist.map((n, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="w-24 shrink-0 text-muted-foreground">
                      {t(`certificates.honor.dist.${i}`)}
                    </span>
                    <span className="flex-1 h-3 rounded-full bg-muted overflow-hidden">
                      <span
                        className={`block h-full ${i === 0 ? "bg-destructive/70" : "bg-primary"}`}
                        style={{ width: `${fair.students ? (n / fair.students) * 100 : 0}%` }}
                      />
                    </span>
                    <span className="w-8 text-end font-bold">{n}</span>
                  </div>
                ))}
              </div>
              <p className="text-[0.6875rem] text-muted-foreground">
                {t("certificates.honor.fairHint")}
              </p>
            </section>
          </>
        )}
      </div>
    </StudioFrame>
  );
}
