import { Link } from "@tanstack/react-router";
import { BookOpen, Check, CheckCircle2, Mic } from "lucide-react";
import { Bar, SectionTitle } from "./parts";
import {
  PRAYER_LABEL,
  PRAYERS,
  PRAYER_STATUS_LABEL,
  type MuhasabaDay,
  type PrayerKey,
  type PrayerStatus,
} from "@/lib/muhasaba/types";
import { type DaySummary, type QuranItem } from "@/lib/muhasaba/logic";
import { formatTime } from "@/lib/prayer";
export { FocusCard, HabitsCard, MoodCard } from "./ReflectionCards";
export { CloseDayBar, PausedHint, PledgeCard, YesterdayPledgeCard } from "./PledgeCards";

// ─────────────────────── حصاد اليوم ───────────────────────

export function HarvestCard({
  summary,
  showPrayers,
  showQuran,
}: {
  summary: DaySummary;
  showPrayers: boolean;
  showQuran: boolean;
}) {
  const nothing =
    summary.prayers.logged === 0 && summary.quran.done === 0 && summary.habits.done === 0;
  return (
    <section className="glass rounded-3xl p-4 space-y-3" aria-labelledby="harvest-title">
      <div className="flex items-center gap-2">
        <span className="text-base" aria-hidden>
          🌿
        </span>
        <h2 id="harvest-title" className="flex-1 text-sm font-bold text-foreground">
          حصاد اليوم
        </h2>
        <span className="text-[0.625rem] text-muted-foreground">ما أنجزته اليوم</span>
      </div>
      {showPrayers && (
        <Bar
          label="الصلاة"
          value={summary.prayers.logged}
          total={summary.prayers.total}
          text={
            summary.prayers.logged === 0
              ? "لم تُسجَّل بعد"
              : `سجّلت ${summary.prayers.logged} من ${summary.prayers.total}${summary.prayers.onTime ? ` · ${summary.prayers.onTime} في وقتها` : ""}`
          }
        />
      )}
      {showQuran && (
        <Bar
          label="القرآن"
          value={summary.quran.done}
          total={summary.quran.total}
          text={
            summary.quran.done === 0
              ? "لا شيء بعد"
              : `${summary.quran.done} من ${summary.quran.total}`
          }
          tone="gold"
        />
      )}
      <Bar
        label="الطاعات"
        value={summary.habits.done}
        total={Math.max(summary.habits.total, 1)}
        text={
          summary.habits.total === 0
            ? "لا عادات مجدولة اليوم"
            : `${summary.habits.done} من ${summary.habits.total}`
        }
      />
      {nothing && (
        <p className="text-[0.6875rem] text-muted-foreground">
          صفحة اليوم ما زالت بيضاء — ابدأ بأي شيء تحب، ولو بنقرة واحدة.
        </p>
      )}
    </section>
  );
}

// ─────────────────────── الصلوات ───────────────────────

const STATUS_ORDER: PrayerStatus[] = ["on_time", "late", "missed"];

const STATUS_STYLE: Record<PrayerStatus, string> = {
  on_time: "bg-primary text-primary-foreground",
  late: "bg-gold text-gold-foreground",
  missed: "bg-foreground/15 text-foreground ring-1 ring-foreground/30",
};

export function PrayersCard({
  day,
  onSet,
  times,
  now,
}: {
  day: MuhasabaDay;
  onSet: (p: PrayerKey, s: PrayerStatus) => void;
  /** مواقيت اليوم إن ضبطها المستخدم؛ تُعرض بجانب كل صلاة. */
  times?: Record<PrayerKey, Date> | null;
  now?: Date;
}) {
  return (
    <section className="space-y-2" aria-labelledby="prayers-title">
      <SectionTitle>
        <span id="prayers-title">صلواتي</span>
      </SectionTitle>
      <div className="glass rounded-3xl p-3 space-y-2">
        {PRAYERS.map((p) => {
          const cur = day.prayers[p];
          const at = times?.[p];
          // لا تُسجَّل صلاة لم يدخل وقتها بعد (إلا إن كانت مسجّلة من قبل فيمكن إلغاؤها).
          const notYet = !!at && !!now && at > now && !cur;
          return (
            <div
              key={p}
              role="group"
              aria-label={`صلاة ${PRAYER_LABEL[p]}`}
              className="flex items-center gap-2"
            >
              <span className="w-14 shrink-0">
                <span className="block text-sm font-bold text-foreground">{PRAYER_LABEL[p]}</span>
                {at && (
                  <span className="block text-[0.625rem] text-muted-foreground">
                    {formatTime(at)}
                  </span>
                )}
              </span>
              <div className="flex-1 grid grid-cols-3 gap-1.5">
                {STATUS_ORDER.map((s) => {
                  const active = cur === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => onSet(p, s)}
                      disabled={notYet}
                      aria-pressed={active}
                      aria-label={`${PRAYER_LABEL[p]}: ${PRAYER_STATUS_LABEL[s]}`}
                      className={`min-h-10 rounded-xl text-[0.6875rem] font-semibold transition-all active:scale-95 disabled:opacity-60 ${
                        active
                          ? STATUS_STYLE[s]
                          : "bg-muted/60 text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {active && <Check className="inline w-3 h-3 me-0.5 -mt-0.5" aria-hidden />}
                      {PRAYER_STATUS_LABEL[s]}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
        <p className="text-[0.625rem] text-muted-foreground px-1 pt-1">
          التسجيل اختياري؛ ما لا تسجّله يبقى «غير مسجّل» ولا يُحسب عليك. انقر مرة ثانية للإلغاء.
          {times ? " الصلاة التي لم يدخل وقتها تُفتح عند دخوله." : ""}
        </p>
      </div>
    </section>
  );
}

// ─────────────────────── القرآن ───────────────────────

export function QuranCard({
  items,
  onToggleSelf,
}: {
  items: QuranItem[];
  onToggleSelf: (k: "wird" | "memorize" | "review") => void;
}) {
  return (
    <section className="space-y-2" aria-labelledby="quran-title">
      <SectionTitle>
        <span id="quran-title">علاقتي بالقرآن اليوم</span>
      </SectionTitle>
      <div className="glass rounded-3xl p-3 space-y-1.5">
        {items.map((it) => {
          const Icon = it.key === "recite" ? Mic : BookOpen;
          const selfable = it.key !== "recite" && it.source !== "auto";
          return (
            <div key={it.key} className="flex items-center gap-3 min-h-11 px-1">
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center ${it.done ? "bg-primary/15" : "bg-muted/60"}`}
              >
                <Icon
                  className={`w-4 h-4 ${it.done ? "text-primary" : "text-muted-foreground"}`}
                  aria-hidden
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">{it.label}</p>
                <p className="text-[0.625rem] text-muted-foreground">
                  {it.source === "auto"
                    ? "سُجّل تلقائياً من سجلّك في زِن"
                    : it.source === "self"
                      ? "سجّلته بنفسك"
                      : it.key === "recite"
                        ? "يظهر هنا تلقائياً حين تسمّع"
                        : "لم يُسجَّل بعد"}
                </p>
              </div>
              {it.source === "auto" ? (
                <CheckCircle2 className="w-5 h-5 text-primary" aria-label="تم" />
              ) : selfable ? (
                <button
                  type="button"
                  onClick={() => onToggleSelf(it.key as "wird" | "memorize" | "review")}
                  aria-pressed={it.done}
                  aria-label={`${it.label}: ${it.done ? "تم — انقر للإلغاء" : "سجّل أنك أنجزته"}`}
                  className={`min-h-9 px-3 rounded-xl text-[0.6875rem] font-semibold active:scale-95 transition-all ${
                    it.done ? "bg-primary text-primary-foreground" : "glass text-foreground"
                  }`}
                >
                  {it.done ? (
                    <>
                      <Check className="inline w-3 h-3 me-0.5 -mt-0.5" aria-hidden /> تم
                    </>
                  ) : (
                    "أنجزته"
                  )}
                </button>
              ) : (
                <Link
                  to="/today"
                  className="min-h-9 px-3 rounded-xl glass text-[0.6875rem] font-semibold inline-flex items-center"
                >
                  سمّع الآن
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
