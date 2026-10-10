import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import {
  Arabesque,
  Icon,
  RingProgress,
  Screen,
  ScreenHeader,
  SectionLabel,
} from "@/components/zen/quran/shell";
import { icons } from "@/components/zen/quran/shell-icons";
import { toArabicDigits, useReadingHistory } from "@/lib/quran";
import {
  KHATMAH_PRESETS,
  MAX_DAYS,
  MUSHAF_PAGES,
  useKhatmah,
  type KhatmahStatus,
  type PageSpot,
} from "@/lib/quran/khatmah-plan";

export const Route = createFileRoute("/_authed/mushaf/khatmah")({
  head: () => ({
    meta: [
      { title: "الختمة المخطّطة — Zen" },
      {
        name: "description",
        content: "حدّد مدة ختمتك ويوزّع زِن صفحات المصحف على الأيام، مع ورد يومي وتتبّع للتقدّم.",
      },
    ],
  }),
  component: KhatmahScreen,
});

const PRESET_LABEL: Record<number, string> = {
  7: "أسبوع",
  10: "١٠ أيام",
  15: "نصف شهر",
  30: "شهر",
  60: "شهران",
};

function dateLabel(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("ar-u-nu-arab", { day: "numeric", month: "long" }).format(
    new Date(y, m - 1, d, 12),
  );
}

const daysWord = (n: number) =>
  n === 1
    ? "يوم واحد"
    : n === 2
      ? "يومان"
      : n <= 10
        ? `${toArabicDigits(n)} أيام`
        : `${toArabicDigits(n)} يوماً`;
const pagesWord = (n: number) =>
  n === 1
    ? "صفحة واحدة"
    : n === 2
      ? "صفحتان"
      : n <= 10
        ? `${toArabicDigits(n)} صفحات`
        : `${toArabicDigits(n)} صفحة`;

function KhatmahScreen() {
  const k = useKhatmah();
  return (
    <Screen>
      <ScreenHeader
        title="الختمة المخطّطة"
        subtitle={k.plan ? "وِردك اليومي حتى تختم" : "اختر مدة ويوزّع زِن الصفحات"}
        backTo="/mushaf"
      />
      {k.plan && k.status ? (
        <ActivePlan k={k} status={k.status} />
      ) : (
        <NewPlan onStart={k.start} completedCount={k.completed.length} />
      )}
      {k.completed.length > 0 && (
        <>
          <SectionLabel hint={`${toArabicDigits(k.completed.length)} ختمة`}>ختماتك</SectionLabel>
          <div className="space-y-2 px-5">
            {k.completed.slice(0, 10).map((c) => (
              <div
                key={`${c.startKey}-${c.endKey}`}
                className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card/70 p-3 shadow-soft"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gold/15 text-gold">
                  <Icon d={icons.star} size={16} />
                </span>
                <div className="text-[0.7812rem]">
                  من {dateLabel(c.startKey)} إلى {dateLabel(c.endKey)}
                  <span className="text-muted-foreground">، خطة {daysWord(c.days)}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Screen>
  );
}

// ─── إنشاء خطة ───

function NewPlan({
  onStart,
  completedCount,
}: {
  onStart: (days: number, startPage?: number) => void;
  completedCount: number;
}) {
  const { last } = useReadingHistory();
  const [days, setDays] = useState(30);
  const [fromCurrent, setFromCurrent] = useState(false);
  const startPage = fromCurrent && last ? last.page : 1;
  const perDay = Math.ceil((MUSHAF_PAGES - startPage + 1) / days);

  return (
    <div className="px-5 animate-fade-up">
      <div className="gradient-night relative overflow-hidden rounded-[32px] p-6 text-white shadow-elegant">
        <Arabesque className="pointer-events-none absolute -left-14 -bottom-14 h-64 w-64 text-gold/25" />
        <div className="relative">
          <div className="inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[0.625rem] tracking-[0.3em] backdrop-blur">
            {completedCount ? "ختمة جديدة" : "ابدأ ختمتك"}
          </div>
          <p className="mt-4 font-display text-2xl leading-snug">{pagesWord(perDay)} يومياً</p>
          <p className="mt-1.5 text-xs text-white/70">
            تختم في {daysWord(days)}
            {startPage > 1
              ? ` بدءاً من الصفحة ${toArabicDigits(startPage)}`
              : " من الفاتحة إلى الناس"}
          </p>
        </div>
      </div>

      <SectionLabel>مدة الختمة</SectionLabel>
      <div className="grid grid-cols-3 gap-2">
        {KHATMAH_PRESETS.map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`rounded-2xl border px-2 py-3 text-[0.7812rem] transition ${
              days === d
                ? "border-primary bg-primary/10 font-medium text-primary"
                : "border-border/60 bg-card/70 text-foreground"
            }`}
          >
            {PRESET_LABEL[d]}
          </button>
        ))}
        <div className="flex items-center justify-between rounded-2xl border border-border/60 bg-card/70 px-2">
          <StepButton
            icon={icons.minus}
            label="إنقاص يوم"
            onClick={() => setDays((n) => Math.max(1, n - 1))}
          />
          <span className="text-[0.7812rem] tabular-nums">{toArabicDigits(days)}</span>
          <StepButton
            icon={icons.plus}
            label="زيادة يوم"
            onClick={() => setDays((n) => Math.min(MAX_DAYS, n + 1))}
          />
        </div>
      </div>

      {last && last.page > 1 && (
        <>
          <SectionLabel>نقطة البداية</SectionLabel>
          <div className="grid grid-cols-2 gap-2">
            <Choice active={!fromCurrent} onClick={() => setFromCurrent(false)}>
              من الفاتحة
            </Choice>
            <Choice active={fromCurrent} onClick={() => setFromCurrent(true)}>
              من موضعي (ص {toArabicDigits(last.page)})
            </Choice>
          </div>
        </>
      )}

      <button
        onClick={() => onStart(days, startPage)}
        className="gradient-primary mt-6 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[0.8438rem] font-medium text-primary-foreground shadow-glow transition active:scale-[0.98]"
      >
        <Icon d={icons.check} size={16} />
        ابدأ الختمة
      </button>
    </div>
  );
}

// ─── خطة نشطة ───

function ActivePlan({ k, status }: { k: ReturnType<typeof useKhatmah>; status: KhatmahStatus }) {
  const plan = k.plan!;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(plan.reached);
  const [confirmCancel, setConfirmCancel] = useState(false);
  // تقدّم جديد من الخادم أو جهاز آخر يحدّث المسودة (أثناء العرض، M12).
  const [draftFor, setDraftFor] = useState(plan.reached);
  if (draftFor !== plan.reached) {
    setDraftFor(plan.reached);
    setDraft(plan.reached);
  }

  const percent = Math.round(status.progress * 100);
  const finished = status.phase === "finished";

  return (
    <>
      <div className="px-5 animate-fade-up">
        <div className="gradient-night relative overflow-hidden rounded-[32px] p-6 text-white shadow-elegant">
          <Arabesque className="pointer-events-none absolute -left-14 -bottom-14 h-64 w-64 text-gold/25" />
          <div className="relative flex items-center justify-between">
            <div className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[0.625rem] tracking-[0.3em] backdrop-blur">
              {finished
                ? "تمّت الختمة"
                : status.phase === "overdue"
                  ? "انتهت المدة"
                  : `اليوم ${toArabicDigits(status.day)} من ${toArabicDigits(plan.days)}`}
            </div>
            {status.behind > 0 && !finished && (
              <span className="rounded-full bg-amber-400/20 px-2.5 py-1 text-[0.625rem] text-amber-200">
                متأخّر {pagesWord(status.behind)}
              </span>
            )}
            {status.ahead > 0 && !finished && (
              <span className="rounded-full bg-emerald-400/20 px-2.5 py-1 text-[0.625rem] text-emerald-200">
                متقدّم {pagesWord(status.ahead)}
              </span>
            )}
          </div>

          <div className="relative mt-5">
            {finished ? (
              <>
                <p className="font-display text-2xl leading-snug">ختمت القرآن الكريم</p>
                <p className="mt-1.5 text-xs text-white/70">
                  تقبّل الله منك. ابدأ ختمة جديدة متى شئت.
                </p>
              </>
            ) : status.portion ? (
              <>
                <p className="text-[0.6875rem] text-white/75">
                  ورد اليوم: {pagesWord(status.portion.pages)}
                </p>
                <PortionRange from={status.portion.from} to={status.portion.to} />
              </>
            ) : (
              <>
                <p className="font-display text-2xl leading-snug">أتممت ورد اليوم</p>
                <p className="mt-1.5 text-xs text-white/70">
                  بلغت الصفحة {toArabicDigits(plan.reached)}. نلتقي غداً إن شاء الله.
                </p>
              </>
            )}
          </div>

          {finished ? (
            <button
              onClick={k.cancel}
              className="relative mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-white/15 py-3 text-[0.8125rem] font-medium backdrop-blur"
            >
              <Icon d={icons.refresh} size={16} />
              ختمة جديدة
            </button>
          ) : (
            status.portion && (
              <div className="relative mt-6 grid grid-cols-2 gap-2">
                <Link
                  to="/mushaf/read"
                  search={{ page: status.portion.from.page, mode: "mushaf" }}
                  className="flex items-center justify-center gap-2 rounded-2xl bg-white/15 py-3 text-[0.8125rem] font-medium backdrop-blur transition active:scale-[0.98]"
                >
                  <Icon d={icons.quran} size={16} />
                  اقرأ الآن
                </Link>
                <button
                  onClick={k.doneToday}
                  className="gradient-gold flex items-center justify-center gap-2 rounded-2xl py-3 text-[0.8125rem] font-medium text-navy transition active:scale-[0.98]"
                >
                  <Icon d={icons.check} size={16} />
                  أتممت الورد
                </button>
              </div>
            )
          )}
        </div>
      </div>

      {!finished && (status.behind > 0 || status.phase === "overdue") && (
        <div className="mx-5 mt-4 rounded-3xl border border-amber-500/30 bg-amber-500/10 p-4">
          <p className="text-[0.7812rem] leading-relaxed">
            {status.phase === "overdue"
              ? "انتهت مدة الخطة قبل الختم. أعد التوزيع لتكمل على مهل."
              : `لتختم في موعدك تحتاج ${pagesWord(status.paceToFinish)} يومياً من الآن. يمكنك إعادة توزيع الباقي على الأيام المتبقية.`}
          </p>
          <button
            onClick={() => k.redistribute(status.phase === "overdue" ? 7 : undefined)}
            className="mt-3 inline-flex items-center gap-2 rounded-xl border border-amber-500/40 px-3 py-2 text-[0.75rem] font-medium"
          >
            <Icon d={icons.refresh} size={14} />
            {status.phase === "overdue" ? "أكمل خلال أسبوع" : "إعادة التوزيع"}
          </button>
        </div>
      )}

      <SectionLabel hint={`تنتهي ${dateLabel(status.endKey)}`}>التقدّم</SectionLabel>
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-4 px-5">
        <div className="rounded-3xl border border-border/60 bg-card/70 p-3 shadow-soft backdrop-blur-xl">
          <RingProgress
            value={status.progress}
            size={104}
            stroke={8}
            trackColor="rgba(148,163,184,0.2)"
          >
            <div className="text-center">
              <div className="font-display text-xl font-medium tabular-nums">
                {toArabicDigits(percent)}٪
              </div>
              <div className="text-[0.5625rem] text-muted-foreground">
                {toArabicDigits(status.readPages)} من {toArabicDigits(status.totalPages)}
              </div>
            </div>
          </RingProgress>
        </div>
        <div className="grid gap-2.5">
          <Stat icon={icons.calendar} label="الأيام المتبقية" value={daysWord(status.daysLeft)} />
          <Stat
            icon={icons.target}
            label="المعدّل المطلوب"
            value={`${pagesWord(status.paceToFinish)} / يوم`}
          />
        </div>
      </div>

      {!finished && (
        <>
          <SectionLabel>تصحيح الموضع</SectionLabel>
          <div className="px-5">
            <div className="rounded-3xl border border-border/60 bg-card/70 p-4 shadow-soft">
              <p className="text-[0.7188rem] leading-relaxed text-muted-foreground">
                يتقدّم الموضع تلقائياً حين تقلّب صفحات المصحف في وضع الصفحات، أو بزرّ «أتممت الورد».
              </p>
              {editing ? (
                <div className="mt-3 flex items-center gap-2">
                  <StepButton
                    icon={icons.minus}
                    label="صفحة أقل"
                    onClick={() => setDraft((n) => Math.max(plan.startPage - 1, n - 1))}
                  />
                  <input
                    type="number"
                    inputMode="numeric"
                    min={plan.startPage - 1}
                    max={MUSHAF_PAGES}
                    value={draft}
                    onChange={(e) => setDraft(Number(e.target.value) || 0)}
                    className="w-20 rounded-xl border border-border bg-background px-2 py-2 text-center text-[0.8125rem] tabular-nums"
                    aria-label="آخر صفحة قرأتها"
                  />
                  <StepButton
                    icon={icons.plus}
                    label="صفحة أكثر"
                    onClick={() => setDraft((n) => Math.min(MUSHAF_PAGES, n + 1))}
                  />
                  <button
                    onClick={() => {
                      k.adjustReached(draft);
                      setEditing(false);
                    }}
                    className="gradient-primary mr-auto rounded-xl px-3 py-2 text-[0.75rem] font-medium text-primary-foreground"
                  >
                    تأكيد
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setEditing(true)}
                  className="mt-3 inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-[0.75rem]"
                >
                  آخر صفحة قرأتها: {toArabicDigits(plan.reached)}
                </button>
              )}
            </div>
          </div>
        </>
      )}

      <div className="mt-6 px-5">
        {confirmCancel ? (
          <div className="flex items-center gap-2 rounded-2xl border border-destructive/40 bg-destructive/5 p-3">
            <span className="flex-1 text-[0.75rem]">
              إلغاء الخطة الحالية؟ لا يؤثر على سجل قراءتك.
            </span>
            <button
              onClick={k.cancel}
              className="rounded-xl bg-destructive px-3 py-1.5 text-[0.75rem] text-destructive-foreground"
            >
              إلغاء الخطة
            </button>
            <button
              onClick={() => setConfirmCancel(false)}
              className="rounded-xl border border-border px-3 py-1.5 text-[0.75rem]"
            >
              تراجع
            </button>
          </div>
        ) : (
          !finished && (
            <button
              onClick={() => setConfirmCancel(true)}
              className="w-full rounded-2xl border border-border/60 py-3 text-[0.75rem] text-muted-foreground"
            >
              إلغاء الخطة
            </button>
          )
        )}
      </div>
    </>
  );
}

function PortionRange({ from, to }: { from: PageSpot; to: PageSpot }) {
  const same = from.surah === to.surah;
  return (
    <div className="mt-1.5">
      <p className="font-display text-2xl leading-snug">
        {same ? `سورة ${from.surahName}` : `من ${from.surahName} إلى ${to.surahName}`}
      </p>
      <p className="mt-1.5 text-xs text-white/70 tabular-nums">
        الصفحات {toArabicDigits(from.page)} إلى {toArabicDigits(to.page)}،{" "}
        {to.juz !== from.juz
          ? `الأجزاء ${toArabicDigits(from.juz)} إلى ${toArabicDigits(to.juz)}`
          : `الجزء ${toArabicDigits(from.juz)}`}
      </p>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card/70 p-3 shadow-soft backdrop-blur-xl">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gold/15 text-gold">
        <Icon d={icon} size={16} />
      </span>
      <div className="min-w-0">
        <div className="text-[0.625rem] tracking-[0.2em] text-muted-foreground">{label}</div>
        <div className="mt-0.5 font-display text-base font-medium tabular-nums">{value}</div>
      </div>
    </div>
  );
}

function StepButton({
  icon,
  label,
  onClick,
}: {
  icon: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="flex h-8 w-8 items-center justify-center rounded-full border border-border/60 bg-background/70"
    >
      <Icon d={icon} size={14} />
    </button>
  );
}

function Choice({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-2xl border px-3 py-3 text-[0.7812rem] transition ${
        active
          ? "border-primary bg-primary/10 font-medium text-primary"
          : "border-border/60 bg-card/70 text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
