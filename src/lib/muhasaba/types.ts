/**
 * «محاسبتي» — الأنواع والثوابت.
 *
 * كل النصوص هنا مكتوبة بلغة دافئة غير حُكمية: لا «نسبة صلاح» ولا «تقصير»
 * ولا عقوبة. التطبيق يسجّل ما يختار الطالب تسجيله، ولا يقيس ما لا يُقاس.
 */

export const PRAYERS = ["fajr", "dhuhr", "asr", "maghrib", "isha"] as const;
export type PrayerKey = (typeof PRAYERS)[number];

export const PRAYER_LABEL: Record<PrayerKey, string> = {
  fajr: "الفجر",
  dhuhr: "الظهر",
  asr: "العصر",
  maghrib: "المغرب",
  isha: "العشاء",
};

export type PrayerStatus = "on_time" | "late" | "missed";

export const PRAYER_STATUS_LABEL: Record<PrayerStatus, string> = {
  on_time: "في وقتها",
  late: "متأخرة",
  missed: "فاتتني",
};

export type MoodKey = "calm" | "good" | "tired" | "lacking" | "distant";

export const MOODS: { key: MoodKey; emoji: string; label: string }[] = [
  { key: "calm", emoji: "🌿", label: "مطمئن" },
  { key: "good", emoji: "🙂", label: "جيد" },
  { key: "tired", emoji: "😐", label: "متعب" },
  { key: "lacking", emoji: "😔", label: "مقصّر" },
  { key: "distant", emoji: "🌧️", label: "بعيد" },
];

/** ردّ هادئ على اختيار الحال — لا حكم فيه. */
export const MOOD_ECHO: Record<MoodKey, string> = {
  calm: "الحمد لله على طمأنينة يومك.",
  good: "يوم طيب، بارك الله فيه.",
  tired: "يبدو أن اليوم كان متعباً، وغداً فرصة جديدة.",
  lacking: "مجرد وقوفك مع نفسك الآن خطوة جميلة.",
  distant: "لا بأس، القرب يبدأ بخطوة صغيرة.",
};

export type FocusKey =
  | "prayer_on_time"
  | "quran"
  | "review"
  | "witr"
  | "parents"
  | "tongue"
  | "gaze"
  | "phone"
  | "time"
  | "sleep"
  | "other";

export const FOCUS_OPTIONS: { key: FocusKey; label: string; pledge: string }[] = [
  {
    key: "prayer_on_time",
    label: "الصلاة في وقتها",
    pledge: "غداً سأحافظ على صلاة الفجر في وقتها.",
  },
  { key: "quran", label: "القرآن", pledge: "غداً سأقرأ وردي من القرآن." },
  { key: "review", label: "المراجعة", pledge: "غداً سأراجع محفوظي قبل النوم." },
  { key: "witr", label: "الوتر", pledge: "غداً سأصلّي الوتر قبل أن أنام." },
  { key: "parents", label: "بر الوالدين", pledge: "غداً سأخصّص وقتاً لوالديّ." },
  { key: "tongue", label: "حفظ اللسان", pledge: "غداً سأحفظ لساني وأكثر من الذكر." },
  { key: "gaze", label: "غض البصر", pledge: "غداً سأحفظ بصري وأنتبه لما أشاهد." },
  { key: "phone", label: "تقليل استخدام الهاتف", pledge: "غداً سأقلّل استخدام الهاتف." },
  { key: "time", label: "تنظيم الوقت", pledge: "غداً سأرتّب يومي قبل أن يبدأ." },
  { key: "sleep", label: "النوم مبكراً", pledge: "غداً سأنام مبكراً لأستيقظ للفجر." },
  { key: "other", label: "أخرى", pledge: "" },
];

export const FOCUS_LABEL: Record<FocusKey, string> = Object.fromEntries(
  FOCUS_OPTIONS.map((f) => [f.key, f.label]),
) as Record<FocusKey, string>;

export type GoalResult = "kept" | "partial" | "not_yet";

export const GOAL_RESULT_LABEL: Record<GoalResult, string> = {
  kept: "نعم",
  partial: "جزئياً",
  not_yet: "لم أوفَّق",
};

/** ردّ بعد تقييم العهد — لا لوم ولا كسر سلسلة. */
export const GOAL_RESULT_ECHO: Record<GoalResult, string> = {
  kept: "الحمد لله، وفّقك الله للمزيد.",
  partial: "خطوة في الطريق، والقليل الدائم خير.",
  not_yet: "لا بأس، النية الصادقة بداية، وغداً فرصة جديدة.",
};

/** ما يسجّله الطالب بنفسه في القرآن مما لا يسجّله التطبيق. */
export type QuranSelfKey = "wird" | "memorize" | "review";

export type QuranSelf = Partial<Record<QuranSelfKey, boolean>>;

/** صف يوم واحد كما يُخزَّن (محلياً وفي السحابة). */
export type MuhasabaDay = {
  day: string; // YYYY-MM-DD بالتوقيت المحلي
  prayers: Partial<Record<PrayerKey, PrayerStatus>>;
  habits_done: string[];
  quran_self: QuranSelf;
  mood: MoodKey | null;
  focus: FocusKey[];
  note: string | null;
  goal_key: FocusKey | null;
  goal_text: string | null;
  goal_result: GoalResult | null;
  closed_at: string | null;
  updated_at: string;
};

export type Habit = {
  id: string;
  title: string;
  preset_key: string | null;
  /** 0 = الأحد … 6 = السبت؛ null = كل يوم */
  days: number[] | null;
  position: number;
  paused: boolean;
  archived_at: string | null;
  created_at: string;
};

export type MuhasabaSettings = {
  onboarded_at: string | null;
  track_prayers: boolean;
  track_quran: boolean;
  reminder_enabled: boolean;
  /** HH:MM */
  reminder_time: string;
};

export const DEFAULT_SETTINGS: MuhasabaSettings = {
  onboarded_at: null,
  track_prayers: true,
  track_quran: true,
  reminder_enabled: false,
  reminder_time: "21:30",
};

/** العادات الجاهزة. القائمة قصيرة عمداً؛ والمستخدم يضيف ما يشاء. */
export const HABIT_PRESETS: { key: string; title: string; starter?: boolean }[] = [
  { key: "azkar_morning", title: "أذكار الصباح", starter: true },
  { key: "azkar_evening", title: "أذكار المساء", starter: true },
  { key: "witr", title: "الوتر", starter: true },
  { key: "parents", title: "بر الوالدين", starter: true },
  { key: "qiyam", title: "قيام الليل" },
  { key: "sadaqa", title: "الصدقة" },
  { key: "rahim", title: "صلة الرحم" },
  { key: "tongue", title: "حفظ اللسان" },
  { key: "gaze", title: "غض البصر" },
  { key: "istighfar", title: "الاستغفار" },
  { key: "dua", title: "الدعاء" },
  { key: "helping", title: "مساعدة الآخرين" },
];

export const WEEKDAY_SHORT = ["أحد", "إثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];

/** رسائل أعلى الصفحة — تتبدّل يومياً. */
export const DAILY_MESSAGES = [
  "🌿 يوم جديد، وفرصة جديدة.",
  "اليوم صفحة جديدة في رحلتك.",
  "خطوة صغيرة اليوم تصنع فرقاً مع الأيام.",
  "🌱 القليل الدائم خير من الكثير المنقطع.",
  "دقيقة مع نفسك تكفي لتبدأ.",
  "🌙 ما تزرعه اليوم تجده غداً.",
  "كن رفيقاً بنفسك، وصادقاً معها.",
  "كل يوم بداية تستحق أن تُحسِنها.",
];

/** أدعية قصيرة لشاشة إغلاق اليوم. */
export const CLOSING_DUAS = [
  "اللهم أعنّي على ذكرك وشكرك وحسن عبادتك.",
  "يا مقلّب القلوب ثبّت قلبي على دينك.",
  "اللهم اجعل القرآن ربيع قلبي ونور صدري.",
  "ربّنا تقبّل منّا إنك أنت السميع العليم.",
  "اللهم بارك لي في يومي وفي غدي.",
];

export function emptyDay(day: string): MuhasabaDay {
  return {
    day,
    prayers: {},
    habits_done: [],
    quran_self: {},
    mood: null,
    focus: [],
    note: null,
    goal_key: null,
    goal_text: null,
    goal_result: null,
    closed_at: null,
    updated_at: new Date(0).toISOString(),
  };
}
