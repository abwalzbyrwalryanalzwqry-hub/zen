import { useEffect, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Lock,
  LockOpen,
} from "lucide-react";
import { intlLocale, useLocale, useT } from "@/lib/i18n";
import { hijriDate } from "@/lib/muhasaba/dates";
import {
  daySummary,
  inEditWindow,
  isMember,
  shiftDay,
  type DaySheet,
  type RecordStatus,
} from "@/lib/daily-record";
import type { WeekDay } from "@/lib/daily-record-api";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ensureRegisterDict } from "@/lib/register-i18n";

ensureRegisterDict();

const STATUS_TONE: Record<RecordStatus | "none", string> = {
  none: "bg-muted text-muted-foreground",
  open: "bg-primary/15 text-primary",
  completed: "bg-gold/20 text-gold-ink",
  locked: "bg-destructive/12 text-destructive",
};
const DOT: Record<string, string> = {
  open: "bg-gold",
  completed: "bg-primary",
  locked: "bg-muted-foreground",
};

const asDate = (d: string) => new Date(`${d}T00:00:00Z`);

/**
 * رأس السجل المضغوط (1.14.0): سطر الحلقة والحالة، وسطر اليوم (السابق، التاريخ ← نصف شاشة التقويم، التالي)،
 * وشريط تقدّم الحضور مع ملخص سطر واحد يفتح التفاصيل في نصف شاشة. بدل بطاقة الحلقة الكبيرة والمربعات الثمانية
 * وشريط الأيام وقائمة الحلقات المنسدلة التي كانت تملأ نصف الشاشة قبل أول طالب.
 */
export function DailyRecordHeader({
  sheet,
  date,
  today,
  week,
  halaqat,
  onDate,
  onHalaqa,
}: {
  sheet: DaySheet | null;
  date: string;
  today: string;
  week: readonly WeekDay[];
  halaqat: ReadonlyArray<{ id: string; name: string }>;
  onDate: (d: string) => void;
  onHalaqa: (id: string) => void;
}) {
  const t = useT();
  const locale = useLocale();
  const [open, setOpen] = useState<"date" | "halaqa" | "summary" | null>(null);
  const status = sheet?.record?.status ?? "none";
  const members = (sheet?.students ?? []).filter(isMember);
  const sum = daySummary(sheet?.students ?? []);
  const marked = members.filter((s) => s.status).length;
  const prev = shiftDay(date, -1);
  const next = shiftDay(date, 1);
  const full = new Intl.DateTimeFormat(intlLocale(locale), {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
  const hijri = hijriDate(date);
  const halaqaName = sheet?.halaqa.name ?? halaqat.find((h) => h.id === sheet?.halaqa.id)?.name;
  const btn =
    "min-h-11 min-w-11 rounded-2xl bg-muted/50 flex items-center justify-center disabled:opacity-40";
  const pct = members.length ? Math.round((marked / members.length) * 100) : 0;
  const line = [
    [sum.present, "present"],
    [sum.late, "late"],
    [sum.absent, "absent"],
    [sum.memorized, "memorized"],
    [sum.reviewed, "reviewed"],
  ]
    .filter(([n]) => (n as number) > 0)
    .map(([n, k]) => `${t(`dailyRecord.summary.${k}`)} ${n}`)
    .join(" · ");

  return (
    <section
      className="glass rounded-3xl p-2.5 space-y-2"
      aria-label={t("dailyRecord.summary.label")}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={halaqat.length < 2}
          onClick={() => setOpen("halaqa")}
          aria-haspopup="dialog"
          aria-label={t("dailyRecord.header.halaqa", { name: halaqaName ?? "" })}
          className="flex-1 min-w-0 min-h-11 rounded-2xl px-2 flex items-center gap-1 text-start disabled:cursor-default"
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-black text-foreground">{halaqaName}</span>
            {sheet?.halaqa.teacher_name && (
              <span className="block truncate text-xs text-muted-foreground">
                {t("dailyRecord.teacher", { name: sheet.halaqa.teacher_name })}
              </span>
            )}
          </span>
          {halaqat.length > 1 && (
            <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          )}
        </button>
        {sheet && (
          <span
            role="status"
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold flex items-center gap-1 ${STATUS_TONE[status]}`}
          >
            {status === "locked" ? (
              <Lock className="w-3.5 h-3.5" aria-hidden="true" />
            ) : status === "completed" ? (
              <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
            ) : (
              <LockOpen className="w-3.5 h-3.5" aria-hidden="true" />
            )}
            {t(`dailyRecord.status.${status}`)}
          </span>
        )}
      </div>

      <nav
        aria-label={t("dailyRecord.days.label")}
        className="grid grid-cols-[auto_1fr_auto] gap-1.5"
      >
        <button
          type="button"
          className={btn}
          disabled={!inEditWindow(prev, today)}
          onClick={() => onDate(prev)}
          aria-label={t("dailyRecord.days.prev")}
        >
          <ChevronRight className="w-5 h-5 ltr:rotate-180" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => setOpen("date")}
          aria-haspopup="dialog"
          aria-label={t("dailyRecord.header.pickDay", { day: full.format(asDate(date)) })}
          className="min-h-11 min-w-0 rounded-2xl bg-muted/50 px-2 flex flex-col items-center justify-center leading-tight"
        >
          <span className="truncate text-sm font-bold text-foreground">
            {date === today ? `${t("dailyRecord.header.today")} · ` : ""}
            {full.format(asDate(date))}
          </span>
          {hijri && <span className="truncate text-xs text-muted-foreground">{hijri}</span>}
        </button>
        <button
          type="button"
          className={btn}
          disabled={!inEditWindow(next, today)}
          onClick={() => onDate(next)}
          aria-label={t("dailyRecord.days.next")}
        >
          <ChevronLeft className="w-5 h-5 ltr:rotate-180" aria-hidden="true" />
        </button>
      </nav>

      {sheet && members.length > 0 && (
        <button
          type="button"
          onClick={() => setOpen("summary")}
          aria-haspopup="dialog"
          className="w-full rounded-2xl px-2 py-1 text-start space-y-1"
        >
          <span className="flex items-center justify-between gap-2 text-xs">
            <span className="font-bold text-foreground">
              {t("dailyRecord.header.progress", { done: marked, total: members.length })}
            </span>
            <span className="truncate text-muted-foreground">{line}</span>
          </span>
          <span
            className="block h-1.5 rounded-full bg-muted-foreground/15 overflow-hidden"
            aria-hidden="true"
          >
            <span
              className="block h-full rounded-full bg-primary transition-[width] motion-reduce:transition-none"
              style={{ width: `${pct}%` }}
            />
          </span>
        </button>
      )}

      <DateSheet
        open={open === "date"}
        date={date}
        today={today}
        week={week}
        onClose={() => setOpen(null)}
        onPick={(d) => {
          setOpen(null);
          onDate(d);
        }}
      />
      <Sheet open={open === "halaqa"} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent title={t("dailyRecord.halaqa")} snap="auto">
          <ul className="grid gap-1.5" role="list">
            {halaqat.map((h) => (
              <li key={h.id}>
                <button
                  type="button"
                  aria-current={h.id === sheet?.halaqa.id ? "true" : undefined}
                  onClick={() => {
                    setOpen(null);
                    onHalaqa(h.id);
                  }}
                  className={`w-full min-h-12 rounded-2xl px-3 text-start text-sm font-bold ${
                    h.id === sheet?.halaqa.id
                      ? "bg-primary/12 text-primary"
                      : "bg-muted/50 text-foreground"
                  }`}
                >
                  {h.name}
                </button>
              </li>
            ))}
          </ul>
        </SheetContent>
      </Sheet>
      {sheet && (
        <Sheet open={open === "summary"} onOpenChange={(o) => !o && setOpen(null)}>
          <SheetContent title={t("dailyRecord.summary.label")} snap="auto">
            <dl className="grid grid-cols-4 gap-1.5">
              {(
                [
                  ["present", sum.present, "text-primary"],
                  ["late", sum.late, "text-gold-ink"],
                  ["absent", sum.absent, "text-destructive"],
                  ["excused", sum.excused, "text-excused"],
                  ["unmarked", sum.unmarked, "text-muted-foreground"],
                  ["memorized", sum.memorized, "text-foreground"],
                  ["reviewed", sum.reviewed, "text-foreground"],
                  ["pages", sum.pages, "text-foreground"],
                ] as const
              ).map(([k, n, tone]) => (
                <div key={k} className="rounded-2xl bg-muted/50 px-1 py-2 text-center">
                  <dt className="text-xs text-muted-foreground leading-tight">
                    {t(`dailyRecord.summary.${k}`)}
                  </dt>
                  <dd className={`text-lg font-black tabular-nums ${tone}`}>{n}</dd>
                </div>
              ))}
            </dl>
          </SheetContent>
        </Sheet>
      )}
    </section>
  );
}

/** تقويم الشهر في نصف شاشة: الأيام خارج نافذة التحرير معطّلة، ونقطة حالة لأيام الأسبوع المعروفة. */
function DateSheet({
  open,
  date,
  today,
  week,
  onClose,
  onPick,
}: {
  open: boolean;
  date: string;
  today: string;
  week: readonly WeekDay[];
  onClose: () => void;
  onPick: (d: string) => void;
}) {
  const t = useT();
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent title={t("dailyRecord.header.dateTitle")} snap="auto">
        {/* المحتوى يُركَّب عند الفتح فيبدأ دائماً على شهر اليوم المعروض. */}
        <MonthGrid date={date} today={today} week={week} onPick={onPick} />
      </SheetContent>
    </Sheet>
  );
}

function MonthGrid({
  date,
  today,
  week,
  onPick,
}: {
  date: string;
  today: string;
  week: readonly WeekDay[];
  onPick: (d: string) => void;
}) {
  const t = useT();
  const locale = useLocale();
  const [month, setMonth] = useState(date.slice(0, 7));
  const first = asDate(`${month}-01`);
  const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  // السبت أول الأسبوع (الشائع في اليمن والخليج).
  const lead = (first.getUTCDay() + 1) % 7;
  const status = new Map(week.map((d) => [d.date, d.status]));
  const shiftMonth = (n: number) => {
    const m = first.getUTCFullYear() * 12 + first.getUTCMonth() + n;
    setMonth(`${Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, "0")}`);
  };
  const monthName = new Intl.DateTimeFormat(intlLocale(locale), {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(first);
  const wd = new Intl.DateTimeFormat(intlLocale(locale), { weekday: "narrow", timeZone: "UTC" });
  const fullFmt = new Intl.DateTimeFormat(intlLocale(locale), {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
  // 2026-10-03 سبت: منه أسماء الأيام السبعة بالترتيب.
  const heads = Array.from({ length: 7 }, (_, i) => wd.format(asDate(shiftDay("2026-10-03", i))));
  const cells: Array<string | null> = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`),
  ];
  const canPrev = inEditWindow(shiftDay(`${month}-01`, -1), today);
  const canNext = month < today.slice(0, 7);
  return (
    <div className="space-y-3">
      {date !== today && (
        <button
          type="button"
          onClick={() => onPick(today)}
          className="w-full min-h-11 rounded-2xl bg-primary/12 text-primary text-sm font-bold"
        >
          {t("dailyRecord.header.goToday")}
        </button>
      )}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          disabled={!canPrev}
          onClick={() => shiftMonth(-1)}
          aria-label={t("dailyRecord.header.prevMonth")}
          className="min-h-11 min-w-11 rounded-2xl bg-muted/50 flex items-center justify-center disabled:opacity-40"
        >
          <ChevronRight className="w-5 h-5 ltr:rotate-180" aria-hidden="true" />
        </button>
        <p className="text-sm font-black text-foreground" aria-live="polite">
          {monthName}
        </p>
        <button
          type="button"
          disabled={!canNext}
          onClick={() => shiftMonth(1)}
          aria-label={t("dailyRecord.header.nextMonth")}
          className="min-h-11 min-w-11 rounded-2xl bg-muted/50 flex items-center justify-center disabled:opacity-40"
        >
          <ChevronLeft className="w-5 h-5 ltr:rotate-180" aria-hidden="true" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center" role="grid" aria-label={monthName}>
        {heads.map((h, i) => (
          <span key={i} className="text-xs text-muted-foreground" role="columnheader">
            {h}
          </span>
        ))}
        {cells.map((d, i) =>
          d ? (
            <button
              key={d}
              type="button"
              role="gridcell"
              disabled={!inEditWindow(d, today)}
              aria-current={d === date ? "date" : undefined}
              aria-label={[
                fullFmt.format(asDate(d)),
                status.has(d) ? t(`dailyRecord.days.status.${status.get(d) ?? "none"}`) : null,
              ]
                .filter(Boolean)
                .join(t("dailyRecord.finish.listSep"))}
              onClick={() => onPick(d)}
              className={`min-h-11 rounded-xl text-sm font-bold tabular-nums flex flex-col items-center justify-center disabled:opacity-30 ${
                d === date
                  ? "bg-primary text-primary-foreground"
                  : d === today
                    ? "ring-1 ring-primary text-foreground"
                    : "bg-muted/40 text-foreground"
              }`}
            >
              {Number(d.slice(8))}
              <span
                aria-hidden="true"
                className={`w-1 h-1 rounded-full ${status.get(d) ? DOT[status.get(d)!] : "bg-transparent"}`}
              />
            </button>
          ) : (
            <span key={`e${i}`} />
          ),
        )}
      </div>
    </div>
  );
}

/** ملاحظة الحلقة لليوم (منفصلة عن ملاحظة الطالب)، تُحفظ تلقائياً بعد توقّف الكتابة. */
const AUTOSAVE_MS = 1500;

export function HalaqaNote({
  value,
  writable,
  saving,
  onSave,
}: {
  value: string | null;
  writable: boolean;
  saving: boolean;
  onSave: (v: string | null) => Promise<boolean>;
}) {
  const t = useT();
  const [text, setText] = useState(value ?? "");
  const [shownFor, setShownFor] = useState(value);
  if (value !== shownFor) {
    setShownFor(value);
    setText(value ?? "");
  }
  const dirty = (value ?? "") !== text.trim();
  // حفظ تلقائي بعد توقّف الكتابة (DR-20)؛ الزر يبقى للحفظ الفوري.
  useEffect(() => {
    if (!writable || !dirty || saving) return;
    const id = window.setTimeout(() => void onSave(text.trim() || null), AUTOSAVE_MS);
    return () => window.clearTimeout(id);
  }, [text, writable, dirty, saving, onSave]);
  return (
    <div className="space-y-2">
      <label className="grid gap-1.5 text-xs font-black text-foreground">
        <span className="sr-only">{t("dailyRecord.notes.label")}</span>
        <textarea
          rows={4}
          maxLength={2000}
          value={text}
          disabled={!writable}
          placeholder={t("dailyRecord.notes.placeholder")}
          onChange={(e) => setText(e.target.value)}
          className="w-full rounded-xl border border-border/60 bg-background/70 px-3 py-2 text-sm font-normal text-foreground outline-none focus:border-primary/60 disabled:opacity-70"
        />
      </label>
      {writable && dirty && (
        <button
          type="button"
          disabled={saving}
          onClick={() => void onSave(text.trim() || null)}
          className="min-h-11 px-3 rounded-xl bg-primary/15 text-primary text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
        >
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
          {t("dailyRecord.notes.save")}
        </button>
      )}
    </div>
  );
}
