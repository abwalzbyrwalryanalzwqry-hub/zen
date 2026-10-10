import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import {
  BellOff,
  CalendarRange,
  ChevronLeft,
  Loader2,
  Route as RouteIcon,
  Settings2,
  Sparkles,
  WifiOff,
} from "lucide-react";
import { PhoneFrame } from "@/components/zen/PhoneFrame";
import { BottomNav } from "@/components/zen/BottomNav";
import { useSession } from "@/hooks/useSession";
import { useMuhasaba } from "@/lib/muhasaba/useMuhasaba";
import {
  careDays,
  closeDay,
  closingDua,
  dailyMessage,
  daySummary,
  growthStage,
  habitsForDay,
  quranItems,
  rateGoal,
  reopenDay,
  setGoal,
  setMood,
  setNote,
  setPrayer,
  toggleFocus,
  toggleHabit,
  toggleQuranSelf,
  welcomeState,
  WELCOME_TEXT,
  yesterdayPledge,
} from "@/lib/muhasaba/logic";
import { gregorianDate, hijriDate, weekday, weekdayName } from "@/lib/muhasaba/dates";
import {
  CloseDayBar,
  FocusCard,
  HabitsCard,
  HarvestCard,
  MoodCard,
  PausedHint,
  PledgeCard,
  PrayersCard,
  QuranCard,
  YesterdayPledgeCard,
} from "@/components/muhasaba/DayCards";
import { HabitsSheet } from "@/components/muhasaba/HabitsSheet";
import { ClosingScreen, CoachSheet, Onboarding, SettingsSheet } from "@/components/muhasaba/Flows";
import { SyncBadge } from "@/components/muhasaba/parts";
import { notificationState } from "@/lib/system-notify";
import { useMinuteClock, usePrayerSettings } from "@/hooks/usePrayerSettings";
import { localDay, prayerTimes } from "@/lib/prayer";
import { isOnline } from "@/lib/network";

export const Route = createFileRoute("/_authed/muhasaba/")({
  head: () => ({
    meta: [
      { title: "محاسبتي — Zen" },
      {
        name: "description",
        content: "مساحة يومية خاصة تقف فيها مع نفسك: صلواتك، قرآنك، عاداتك، وعهدك لغدٍ أفضل.",
      },
    ],
  }),
  component: MuhasabaScreen,
});

type SheetKind = "habits" | "settings" | "coach" | null;

function MuhasabaScreen() {
  const { userId } = useSession();
  const m = useMuhasaba(userId);
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [closing, setClosing] = useState(false);
  const closeSheet = useCallback(() => setSheet(null), []);

  const today = m.today;
  const prayerSettings = usePrayerSettings();
  const now = useMinuteClock();
  const day = m.getDay(today);
  const settings = m.settings;
  const todaysHabits = useMemo(() => habitsForDay(m.habits, today), [m.habits, today]);
  const summary = daySummary(day, m.habits, m.quran[today]);
  const items = quranItems(m.quran[today], day);
  const welcome = welcomeState(m.days, today);
  const care = careDays(m.days, today, 30);
  const stage = growthStage(care.count);
  const yRow = yesterdayPledge(m.days, today);
  const endOfWeek = weekday(today) === 5 || weekday(today) === 4; // الخميس أو الجمعة

  // ─── تحميل أول مرة (لا شيء على الجهاز بعد، ولم تصل السحابة) ───
  if (!m.ready || !settings || (!settings.onboarded_at && !m.remoteLoaded)) {
    return (
      <PhoneFrame>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-primary" aria-label="جارٍ التحميل" />
        </div>
      </PhoneFrame>
    );
  }

  // ─── البدء لأول مرة ───
  if (!settings.onboarded_at) {
    return (
      <PhoneFrame>
        <Onboarding
          onDone={(r) => {
            m.completeOnboarding(r);
            if (r.openHabits) setSheet("habits");
          }}
        />
      </PhoneFrame>
    );
  }

  const offline = !isOnline();
  const reminderBlocked = settings.reminder_enabled && notificationState() !== "granted";

  return (
    <PhoneFrame>
      <div className="flex-1 flex flex-col">
        <header className="px-5 pt-12 pb-2 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-black text-foreground">محاسبتي</h1>
            <p className="text-[0.6875rem] text-muted-foreground">
              {weekdayName(today)} · {hijriDate(today)}
            </p>
            <p className="text-[0.625rem] text-muted-foreground">{gregorianDate(today)}</p>
          </div>
          <button
            onClick={() => setSheet("settings")}
            aria-label="إعدادات محاسبتي"
            className="w-9 h-9 rounded-xl glass flex items-center justify-center"
          >
            <Settings2 className="w-4 h-4 text-foreground" />
          </button>
          <Link
            to="/today"
            aria-label="رجوع إلى اليوم"
            className="w-9 h-9 rounded-xl glass flex items-center justify-center"
          >
            <ChevronLeft className="w-4 h-4 text-foreground" />
          </Link>
        </header>

        <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-3">
          <div className="px-2 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-gold">{dailyMessage(today)}</p>
            <SyncBadge status={m.status} pending={m.pendingCount} onRetry={() => void m.retry()} />
          </div>

          {(welcome === "returning" || welcome === "missed_yesterday" || welcome === "first") && (
            <div className="glass rounded-3xl p-4 anim-float-in">
              <p className="text-sm font-bold text-foreground">{WELCOME_TEXT[welcome]}</p>
              <p className="text-[0.6875rem] text-muted-foreground">
                {welcome === "returning"
                  ? "سعداء برجوعك. ابدأ من حيث أنت، بنقرة واحدة."
                  : welcome === "first"
                    ? "ابدأ بصلواتك أو بعادة واحدة؛ يكفي دقيقة."
                    : "لا شيء يُحسب عليك، خذ دقيقة مع نفسك الآن."}
              </p>
            </div>
          )}

          {(offline || m.loadError) && (
            <div
              className="glass rounded-2xl px-3 py-2 flex items-center gap-2 text-[0.6875rem] text-muted-foreground"
              role="status"
            >
              <WifiOff className="w-3.5 h-3.5 shrink-0" aria-hidden />
              {offline
                ? "أنت غير متصل. تُحفظ محاسبتك على جهازك وتُزامَن عند عودة الاتصال."
                : "تعذّر جلب بياناتك من السحابة الآن؛ نعرض آخر نسخة على جهازك."}
            </div>
          )}

          {reminderBlocked && (
            <button
              onClick={() => setSheet("settings")}
              className="w-full glass rounded-2xl px-3 py-2 flex items-center gap-2 text-[0.6875rem] text-muted-foreground text-start"
            >
              <BellOff className="w-3.5 h-3.5 shrink-0" aria-hidden />
              التذكير مفعّل، لكن التنبيهات متوقفة من المتصفح. اضغط للتفاصيل.
            </button>
          )}

          {yRow && (
            <YesterdayPledgeCard
              row={yRow}
              onRate={(r) => m.updateDay(yRow.day, (d) => rateGoal(d, r))}
            />
          )}

          <HarvestCard
            summary={summary}
            showPrayers={settings.track_prayers}
            showQuran={settings.track_quran}
          />

          {settings.track_prayers && (
            <PrayersCard
              day={day}
              times={
                prayerSettings && today === localDay(now) ? prayerTimes(prayerSettings, now) : null
              }
              now={now}
              onSet={(p, s) => m.updateDay(today, (d) => setPrayer(d, p, s))}
            />
          )}

          {settings.track_quran && (
            <QuranCard
              items={items}
              onToggleSelf={(k) => m.updateDay(today, (d) => toggleQuranSelf(d, k))}
            />
          )}

          <HabitsCard
            habits={todaysHabits}
            done={day.habits_done}
            onToggle={(id) => m.updateDay(today, (d) => toggleHabit(d, id))}
            onManage={() => setSheet("habits")}
          />

          <MoodCard day={day} onPick={(mood) => m.updateDay(today, (d) => setMood(d, mood))} />

          <FocusCard
            key={`focus-${today}-${m.remoteLoaded}`}
            day={day}
            onToggle={(k) => m.updateDay(today, (d) => toggleFocus(d, k))}
            onNote={(t) => m.updateDay(today, (d) => (t === (d.note ?? "") ? d : setNote(d, t)))}
          />

          <PledgeCard
            key={`pledge-${today}-${day.goal_text ?? ""}`}
            day={day}
            onCommit={(key, text) => m.updateDay(today, (d) => setGoal(d, key, text))}
          />

          <CloseDayBar
            closed={!!day.closed_at}
            onClose={() => {
              m.updateDay(today, (d) => closeDay(d));
              setClosing(true);
            }}
            onReopen={() => m.updateDay(today, (d) => reopenDay(d))}
          />
          <PausedHint />

          <button
            onClick={() => setSheet("coach")}
            className="w-full glass rounded-3xl p-4 flex items-center gap-3 text-start"
          >
            <Sparkles className="w-5 h-5 text-gold" aria-hidden />
            <div className="flex-1">
              <p className="text-sm font-bold text-foreground">✨ مساعد محاسبتي</p>
              <p className="text-[0.6875rem] text-muted-foreground">
                اكتب عن يومك، وخذ كلمة طيبة وخطوة واحدة للغد
              </p>
            </div>
          </button>

          <section className="glass rounded-3xl p-4 space-y-3" aria-labelledby="care-title">
            <div className="flex items-center gap-3">
              <span className="text-2xl" aria-hidden>
                {stage.emoji}
              </span>
              <div className="flex-1">
                <h2 id="care-title" className="text-sm font-bold text-foreground">
                  أيام اعتنيت فيها بنفسك
                </h2>
                <p className="text-[0.6875rem] text-muted-foreground">
                  {care.count} من أصل {care.total} يوماً · {stage.label} — {stage.hint}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Link
                to="/muhasaba/week"
                className={`min-h-11 rounded-2xl text-xs font-semibold inline-flex items-center justify-center gap-1 ${
                  endOfWeek ? "bg-gold text-gold-foreground" : "glass text-foreground"
                }`}
              >
                <CalendarRange className="w-4 h-4" aria-hidden /> مراجعة الأسبوع
              </Link>
              <Link
                to="/muhasaba/journey"
                className="min-h-11 rounded-2xl glass text-xs font-semibold text-foreground inline-flex items-center justify-center gap-1"
              >
                <RouteIcon className="w-4 h-4" aria-hidden /> رحلتي
              </Link>
            </div>
            {endOfWeek && (
              <p className="text-[0.625rem] text-muted-foreground">
                نهاية الأسبوع قريبة — مراجعة قصيرة تساعدك على بداية أجمل.
              </p>
            )}
          </section>
        </div>

        <BottomNav />
      </div>

      {sheet === "habits" && (
        <HabitsSheet
          habits={m.habits}
          onClose={closeSheet}
          onSave={m.saveHabits}
          onAdd={m.addHabit}
        />
      )}
      {sheet === "settings" && (
        <SettingsSheet
          settings={settings}
          onChange={m.updateSettings}
          onClose={closeSheet}
          onManageHabits={() => setSheet("habits")}
        />
      )}
      {sheet === "coach" && <CoachSheet onClose={closeSheet} />}
      {closing && <ClosingScreen dua={closingDua(today)} onDone={() => setClosing(false)} />}
    </PhoneFrame>
  );
}
