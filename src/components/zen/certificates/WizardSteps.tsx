import { Check, Loader2 } from "lucide-react";
import { localDayKey } from "@/lib/local-day";
import { useT } from "@/lib/i18n";
import { SURAHS } from "@/lib/quran-meta";
import { juzOrdinal } from "@/lib/achievements";
import type { CertType, StudioContext } from "@/lib/certificates/api";
import type { AchievementRef, Eligibility } from "@/lib/certificates/eligibility";
import { Field, Sel, Toggle, Txt } from "./fields";
import { condLabel } from "./helpers";

const card = (on: boolean) =>
  `text-start rounded-2xl border p-3 transition ${on ? "border-primary bg-primary/5 ring-2 ring-primary/30" : "border-border bg-card hover:border-primary/40"}`;

export function StepCircle({
  ctx,
  center,
  halaqa,
  onCenter,
  onHalaqa,
}: {
  ctx: StudioContext;
  center: string | null;
  halaqa: string | null;
  onCenter: (id: string) => void;
  onHalaqa: (id: string) => void;
}) {
  const t = useT();
  const list = ctx.halaqat.filter((h) => h.can_issue && (!center || h.center_id === center));
  return (
    <div className="space-y-4">
      {ctx.centers.length > 1 && (
        <Sel
          label={t("certificates.home.center")}
          value={center ?? ""}
          options={[
            { value: "", label: t("certificates.all") },
            ...ctx.centers.map((c) => ({ value: c.id, label: c.name })),
          ]}
          onChange={(v) => onCenter(v)}
        />
      )}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((h) => (
          <button
            key={h.id}
            type="button"
            onClick={() => onHalaqa(h.id)}
            className={card(h.id === halaqa)}
            aria-pressed={h.id === halaqa}
          >
            <p className="text-sm font-black">{h.name}</p>
            <p className="text-xs text-muted-foreground">
              {ctx.centers.find((c) => c.id === h.center_id)?.name}
              {h.teacher_name ? ` — ${h.teacher_name}` : ""}
            </p>
            <p className="text-[0.6875rem] text-muted-foreground mt-1">
              {t("certificates.wizard.students", { n: h.students })}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}

export function StepType({
  types,
  typeKey,
  onType,
  aref,
  onRef,
  from,
  to,
  issueDate,
  onDates,
  suggested,
}: {
  types: CertType[];
  typeKey: string | null;
  onType: (k: string) => void;
  aref: AchievementRef;
  onRef: (r: AchievementRef) => void;
  from: string;
  to: string;
  issueDate: string;
  onDates: (p: { from?: string; to?: string; issueDate?: string }) => void;
  suggested?: string | null;
}) {
  const t = useT();
  const type = types.find((x) => x.key === typeKey) ?? null;
  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {types
          .filter((x) => x.active)
          .map((x) => (
            <button
              key={x.key}
              type="button"
              onClick={() => onType(x.key)}
              className={card(x.key === typeKey)}
              aria-pressed={x.key === typeKey}
            >
              <p className="text-sm font-black flex items-center gap-1">
                {x.name}
                {suggested === x.key && (
                  <span className="text-[0.625rem] rounded-full bg-gold/20 px-1.5 py-0.5 font-bold">
                    {t("certificates.type.suggested")}
                  </span>
                )}
              </p>
              <p className="text-[0.6875rem] text-muted-foreground mt-1">
                {x.conditions.length
                  ? x.conditions.map((c) => condLabel(t, c.kind, c.gte ?? null)).join(" · ")
                  : t("certificates.type.manualHint")}
              </p>
            </button>
          ))}
      </div>
      {type?.param === "surah" && (
        <Sel
          label={t("certificates.type.surah")}
          value={aref?.kind === "surah" ? aref.surah : 0}
          options={[
            { value: 0, label: "—" },
            ...SURAHS.map((s) => ({ value: s.n, label: `${s.n}. ${s.name}` })),
          ]}
          onChange={(n) => onRef(n ? { kind: "surah", surah: n } : null)}
        />
      )}
      {type?.param === "juz" && (
        <Sel
          label={t("certificates.type.juz")}
          value={aref?.kind === "juz" ? aref.juz : 0}
          options={[
            { value: 0, label: "—" },
            ...Array.from({ length: 30 }, (_, i) => ({ value: i + 1, label: juzOrdinal(i + 1) })),
          ]}
          onChange={(n) => onRef(n ? { kind: "juz", juz: n } : null)}
        />
      )}
      {(type?.param === "course" || type?.param === "milestone") && (
        <Txt
          label={t(
            type.param === "course" ? "certificates.type.course" : "certificates.type.milestone",
          )}
          value={aref?.kind === "course" ? aref.title : aref?.kind === "milestone" ? aref.text : ""}
          onChange={(v) =>
            onRef(
              v.trim()
                ? type.param === "course"
                  ? { kind: "course", title: v }
                  : { kind: "milestone", text: v }
                : null,
            )
          }
        />
      )}
      <div className="grid gap-2 sm:grid-cols-3">
        <DateField
          label={t("certificates.filter.from")}
          value={from}
          onChange={(v) => onDates({ from: v })}
        />
        <DateField
          label={t("certificates.filter.to")}
          value={to}
          onChange={(v) => onDates({ to: v })}
        />
        <DateField
          label={t("certificates.wizard.issueDate")}
          value={issueDate}
          max={localDayKey()}
          onChange={(v) => onDates({ issueDate: v })}
        />
      </div>
    </div>
  );
}

function DateField({
  label,
  value,
  max,
  onChange,
}: {
  label: string;
  value: string;
  /** تاريخ الإصدار لا يكون في المستقبل (الخادم يرفضه كذلك: FUTURE_DATE). */
  max?: string;
  onChange: (v: string) => void;
}) {
  return (
    <Field label={label}>
      {(id) => (
        <input
          id={id}
          type="date"
          value={value}
          max={max}
          onChange={(e) => e.target.value && onChange(e.target.value)}
          className="w-full rounded-lg bg-background border border-border px-2 py-1.5 text-xs"
        />
      )}
    </Field>
  );
}

export function StepStudents({
  students,
  loading,
  selected,
  onSelected,
  elig,
  overrides,
  onOverride,
  canOverride,
  asRequest = false,
}: {
  students: { id: string; name: string }[];
  loading: boolean;
  selected: string[];
  onSelected: (ids: string[]) => void;
  elig: Map<string, Eligibility>;
  overrides: Record<string, boolean>;
  onOverride: (id: string, v: boolean) => void;
  canOverride: boolean;
  /** غير المدير (1.24.0): التجاوز طلب اعتماد — تصدر «بانتظار الاعتماد» بلا رقم حتى يعتمدها المدير. */
  asRequest?: boolean;
}) {
  const t = useT();
  if (loading)
    return (
      <p className="text-xs text-muted-foreground flex items-center gap-2 py-8 justify-center">
        <Loader2 className="w-4 h-4 animate-spin" /> {t("certificates.wizard.computing")}
      </p>
    );
  if (!students.length)
    return (
      <p className="text-xs text-muted-foreground text-center py-8">
        {t("certificates.empty.students")}
      </p>
    );
  const set = new Set(selected);
  const eligible = students.filter((s) => elig.get(s.id)?.eligible).map((s) => s.id);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          className="text-xs font-bold text-primary"
          onClick={() => onSelected(students.map((s) => s.id))}
        >
          {t("certificates.wizard.selectAll")}
        </button>
        <span className="text-border">|</span>
        <button
          type="button"
          className="text-xs font-bold text-primary"
          onClick={() => onSelected(eligible)}
        >
          {t("certificates.wizard.selectEligible")} ({eligible.length})
        </button>
        <span className="flex-1" />
        <span className="text-xs text-muted-foreground">
          {t("certificates.wizard.selected", { n: selected.length })}
        </span>
      </div>
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {students.map((s) => {
          const e = elig.get(s.id);
          const on = set.has(s.id);
          return (
            <li
              key={s.id}
              className={`rounded-xl border p-2.5 ${on ? "border-primary/50 bg-primary/5" : "border-border bg-card"}`}
            >
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5 w-4 h-4 accent-[hsl(var(--primary))]"
                  checked={on}
                  onChange={(ev) =>
                    onSelected(
                      ev.target.checked ? [...selected, s.id] : selected.filter((x) => x !== s.id),
                    )
                  }
                />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-bold break-words">{s.name}</span>
                  {e && !e.manual && (
                    <span
                      className={`text-[0.6875rem] font-bold ${e.eligible ? "text-primary" : "text-amber-700"}`}
                    >
                      {e.eligible ? <Check className="inline w-3 h-3" /> : null}{" "}
                      {t(e.eligible ? "certificates.eligible" : "certificates.notEligible")}
                    </span>
                  )}
                  {e && !e.manual && !e.eligible && (
                    <span className="block text-[0.625rem] text-muted-foreground">
                      {e.checks
                        .filter((c) => !c.ok)
                        .map((c) => condLabel(t, c.kind, c.need, c.actual))
                        .join(" · ")}
                    </span>
                  )}
                </span>
              </label>
              {on && e && !e.manual && !e.eligible && canOverride && (
                <div className="mt-1.5 ps-6">
                  <Toggle
                    label={t(asRequest ? "certificates.approval.request" : "certificates.override")}
                    checked={!!overrides[s.id]}
                    onChange={(v) => onOverride(s.id, v)}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
