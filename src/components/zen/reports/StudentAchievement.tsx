import { useMemo } from "react";
import { AlertTriangle, Flag, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { useT } from "@/lib/i18n";
import { SURAHS } from "@/lib/quran-meta";
import { surahNo } from "@/lib/daily-record";
import { fmtDate, fmtNum, fmtPct, type NumberStyle } from "@/lib/reports/format";
import { surahMap } from "@/lib/reports/achieve";
import { followUpText, gradeText, milestoneText } from "@/lib/reports/doc";
import type { StudentReport } from "@/lib/reports/compute";
import type { ReportData, WorkLine } from "@/lib/reports/types";
import { Row, Section, Stat, Stats } from "./parts";
import { SurahMap } from "./SurahMap";

const S: NumberStyle = { digits: "latn", calendar: "gregorian" };

function pointOf(l: WorkLine | null, end: boolean): string {
  const seg = l ? (end ? l.segments[l.segments.length - 1] : l.segments[0]) : null;
  return seg ? `${seg.surah_name} ${end ? seg.to_ayah : seg.from_ayah}` : "—";
}

/** إنجاز طالب واحد: الملخص والحفظ والمراجعة والمواظبة والجودة والخريطة والمحطات وأسباب المتابعة. */
export function StudentAchievement({ r, data }: { r: StudentReport; data: ReportData }) {
  const t = useT();
  const st = r.stats;
  const j = r.journey;
  const map = useMemo(() => surahMap(j.coverage), [j.coverage]);
  const current = j.last ? surahNo(j.last.surah_name) : 0;
  const n = (x: number | null, d = 1) => fmtNum(x, "latn", d);
  const TrendIcon = st.trend === "up" ? TrendingUp : st.trend === "down" ? TrendingDown : Minus;
  return (
    <div className="space-y-3">
      <Section title={t("reports.ach.summary")}>
        <div>
          <p className="text-base font-black text-foreground break-words">{st.student.name}</p>
          <p className="text-xs text-muted-foreground">
            {data.halaqa.name}
            {data.halaqa.teacher_name ? ` · ${data.halaqa.teacher_name}` : ""}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("reports.meta.periodRange", {
              from: fmtDate(data.from, S),
              to: fmtDate(data.to, S),
            })}
          </p>
        </div>
        <Stats>
          <Stat label={t("reports.sum.rate")} value={fmtPct(st.attendance.rate, "latn")} />
          <Stat label={t("reports.sum.memorizePages")} value={n(st.memorize.pages)} />
          <Stat label={t("reports.sum.reviewPages")} value={n(st.review.pages)} />
        </Stats>
        <Row label={t("reports.sum.avgGrade")} value={gradeText(st.avgGrade, S)} />
        <Row
          label={t("reports.ach.lastMemorize")}
          value={
            st.memorize.last
              ? `${pointOf(st.memorize.last, true)} · ${fmtDate(st.memorize.last.date, S)}`
              : "—"
          }
        />
        <Row
          label={t("reports.ach.lastReview")}
          value={
            st.review.last
              ? `${pointOf(st.review.last, true)} · ${fmtDate(st.review.last.date, S)}`
              : "—"
          }
        />
        <Row
          label={t("reports.ach.lastEvaluation")}
          value={
            st.lastEvaluation
              ? `${gradeText(st.lastEvaluation.value, S)} · ${fmtDate(st.lastEvaluation.date, S)}`
              : "—"
          }
        />
      </Section>

      <Section title={t("reports.section.memorize")}>
        <Stats>
          <Stat label={t("reports.ach.sessions")} value={n(st.memorize.sessions, 0)} />
          <Stat label={t("reports.col.ayahs")} value={n(st.memorize.ayahs, 0)} />
          <Stat label={t("reports.col.pages")} value={n(st.memorize.pages)} />
        </Stats>
        <Row label={t("reports.ach.periodStart")} value={pointOf(st.memorize.first, false)} />
        <Row label={t("reports.ach.lastPoint")} value={pointOf(st.memorize.last, true)} />
        <Row
          label={t("reports.ach.currentSurah")}
          value={current ? (SURAHS[current - 1]?.name ?? "—") : "—"}
        />
        <Row
          label={t("reports.ach.journeyStart")}
          value={
            j.first
              ? `${j.first.surah_name} ${j.first.from_ayah} · ${fmtDate(j.first.date, S)}`
              : "—"
          }
        />
        <Row
          label={t("reports.ach.quranProgress")}
          value={t("reports.ach.quranProgressValue", {
            pct: fmtPct(j.pct, "latn"),
            juz: j.completedJuz.length,
            surahs: j.completedSurahs,
          })}
        />
      </Section>

      <Section title={t("reports.section.review")}>
        <Stats>
          <Stat label={t("reports.ach.sessions")} value={n(st.review.sessions, 0)} />
          <Stat label={t("reports.col.pages")} value={n(st.review.pages)} />
          <Stat label={t("reports.ach.avgReviewGrade")} value={n(st.review.avgGrade)} />
        </Stats>
        <Row label={t("reports.ach.lastReview")} value={pointOf(st.review.last, true)} />
      </Section>

      <Section title={t("reports.ach.attendance")}>
        <Stats cols={4}>
          <Stat
            label={t("reports.col.present")}
            value={n(st.attendance.present + st.attendance.late, 0)}
          />
          <Stat label={t("reports.col.excused")} value={n(st.attendance.excused, 0)} />
          <Stat
            label={t("reports.col.absent")}
            value={n(st.attendance.absent, 0)}
            tone={st.attendance.absent >= 3 ? "warn" : undefined}
          />
          <Stat label={t("reports.col.rate")} value={fmtPct(st.attendance.rate, "latn")} />
        </Stats>
      </Section>

      <Section title={t("reports.ach.quality")}>
        <Row label={t("reports.sum.avgGrade")} value={gradeText(st.avgGrade, S)} />
        <Row label={t("reports.ach.avgEvaluation")} value={n(st.avgEvaluation)} />
        <div className="flex items-center gap-2 text-sm">
          <TrendIcon className="w-4 h-4 text-primary" aria-hidden="true" />
          <span className="font-bold text-foreground">
            {st.trend ? t(`reports.trend.${st.trend}`) : t("reports.trend.unknown")}
          </span>
        </div>
      </Section>

      <Section title={t("reports.ach.map.title")}>
        <SurahMap map={map} />
      </Section>

      <Section title={t("reports.section.timeline")}>
        {j.milestones.length ? (
          <ol className="space-y-2">
            {[...j.milestones]
              .reverse()
              .slice(0, 12)
              .map((m, i) => (
                <li key={`${m.kind}-${m.date}-${i}`} className="flex items-start gap-2.5">
                  <span className="mt-0.5 w-7 h-7 shrink-0 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                    <Flag className="w-3.5 h-3.5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-foreground">
                      {milestoneText(m, S)}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {fmtDate(m.date, S)}
                    </span>
                  </span>
                </li>
              ))}
          </ol>
        ) : (
          <p className="text-xs text-muted-foreground">{t("reports.ach.noMilestones")}</p>
        )}
        {r.milestones.some((m) => m.kind === "regular" || m.kind === "improved") && (
          <ul className="space-y-1">
            {r.milestones
              .filter((m) => m.kind === "regular" || m.kind === "improved")
              .map((m) => (
                <li key={m.kind} className="text-xs font-bold text-primary">
                  {milestoneText(m, S)}
                </li>
              ))}
          </ul>
        )}
      </Section>

      {st.followUp.length > 0 && (
        <section
          role="note"
          className="rounded-3xl border border-gold/40 bg-gold/10 p-3.5 space-y-1.5"
          aria-label={t("reports.follow.title")}
        >
          <p className="text-sm font-black text-foreground flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-gold" aria-hidden="true" />
            {t("reports.follow.title")}
          </p>
          <ul className="space-y-1 text-xs text-foreground list-disc ps-5">
            {st.followUp.map((f) => (
              <li key={f.kind}>{followUpText(f, S)}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
