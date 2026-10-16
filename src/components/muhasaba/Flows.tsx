import { useState } from "react";
import { Bell, BellOff, Loader2, Lock, Sparkles } from "lucide-react";
import { Chip, Sheet, Switch } from "./parts";
import { notificationState, requestNotificationPermission } from "@/lib/system-notify";
import { muhasabaCoach } from "@/lib/tools-client";
import { isNativeApp } from "@/lib/native";
import { t } from "@/lib/i18n";
import { HABIT_PRESETS, type MuhasabaSettings } from "@/lib/muhasaba/types";
import { TextAiConsentStatus } from "@/components/zen/ai/TextAiConsentDialog";

// تطبيق Android: WebView بلا `window.Notification`، وتذكير المحاسبة يصل عبر FCM من الخادم
// (`muhasaba_time` في الإعدادات ← التنبيهات)، فنرشد المستخدم إليه بدل «متصفحك لا يدعم».
const nativeReminderHint = () => t("nativeReminders.muhasabaHint");

// ─────────────────────── البدء لأول مرة ───────────────────────

export type OnboardingResult = {
  track_prayers: boolean;
  track_quran: boolean;
  presets: string[];
  reminder_enabled: boolean;
  reminder_time: string;
  /** اختار «عادات أخرى»: نفتح له قائمة العادات مباشرة بعد البدء. */
  openHabits: boolean;
};

const TRACK_OPTIONS: { key: string; label: string }[] = [
  { key: "prayers", label: "الصلوات" },
  { key: "quran", label: "القرآن" },
  { key: "azkar", label: "الأذكار" },
  { key: "witr", label: "الوتر" },
  { key: "parents", label: "بر الوالدين" },
  { key: "other", label: "عادات أخرى" },
];

/** ثلاث خطوات قصيرة داخل الصفحة نفسها — بلا تنقّل بين صفحات. */
export function Onboarding({ onDone }: { onDone: (r: OnboardingResult) => void }) {
  const [step, setStep] = useState(0);
  const [track, setTrack] = useState<Set<string>>(new Set(["prayers", "quran", "azkar", "witr"]));
  const [reminder, setReminder] = useState(false);
  const [time, setTime] = useState("21:30");
  const [notice, setNotice] = useState<string | null>(null);

  const toggle = (k: string) => {
    const next = new Set(track);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    setTrack(next);
  };

  const toggleReminder = async () => {
    if (reminder) {
      setReminder(false);
      setNotice(null);
      return;
    }
    const perm = await requestNotificationPermission();
    if (perm === "granted") {
      setReminder(true);
      setNotice(null);
    } else {
      setNotice(
        perm === "unsupported"
          ? isNativeApp()
            ? nativeReminderHint()
            : "متصفحك لا يدعم التنبيهات؛ يمكنك فتح «محاسبتي» من الصفحة الرئيسية متى شئت."
          : "التنبيهات غير مسموحة. يمكنك تفعيلها لاحقاً من إعدادات المتصفح.",
      );
    }
  };

  const finish = () => {
    const presets: string[] = [];
    if (track.has("azkar")) presets.push("azkar_morning", "azkar_evening");
    if (track.has("witr")) presets.push("witr");
    if (track.has("parents")) presets.push("parents");
    onDone({
      track_prayers: track.has("prayers"),
      track_quran: track.has("quran"),
      presets: presets.filter((k) => HABIT_PRESETS.some((p) => p.key === k)),
      reminder_enabled: reminder,
      reminder_time: time,
      openHabits: track.has("other"),
    });
  };

  return (
    <div className="flex-1 flex flex-col px-5 pt-14 pb-8">
      <div
        role="img"
        className="flex gap-1.5 justify-center mb-8"
        aria-label={`الخطوة ${step + 1} من 3`}
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={`h-1.5 rounded-full transition-all ${i === step ? "w-8 bg-primary" : "w-3 bg-muted-foreground/30"}`}
          />
        ))}
      </div>

      {step === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 anim-float-in">
          <div
            className="w-20 h-20 rounded-3xl bg-primary/15 flex items-center justify-center text-4xl"
            aria-hidden
          >
            🌱
          </div>
          <h1 className="text-2xl font-black text-foreground">محاسبتي</h1>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-[280px]">
            مساحة يومية تقف فيها مع نفسك: ماذا فعلت اليوم؟ ماذا تريد أن تُصلح؟ وما الخطوة التي ستبدأ
            بها غداً؟
          </p>
          <p className="text-[0.6875rem] text-muted-foreground inline-flex items-center gap-1">
            <Lock className="w-3 h-3" aria-hidden /> خاصة بك وحدك — لا يراها معلّمك ولا غيره.
          </p>
        </div>
      )}

      {step === 1 && (
        <div className="flex-1 flex flex-col gap-4 anim-float-in">
          <h1 className="text-xl font-black text-foreground">اختر ما تريد متابعته</h1>
          <p className="text-[0.6875rem] text-muted-foreground">يمكنك تغيير ذلك في أي وقت.</p>
          <div className="flex flex-wrap gap-2">
            {TRACK_OPTIONS.map((o) => (
              <Chip key={o.key} active={track.has(o.key)} onClick={() => toggle(o.key)}>
                {o.label}
              </Chip>
            ))}
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="flex-1 flex flex-col gap-4 anim-float-in">
          <h1 className="text-xl font-black text-foreground">تذكير لطيف؟</h1>
          <p className="text-[0.6875rem] text-muted-foreground">
            تنبيه هادئ مرة واحدة في اليوم بالوقت الذي تختاره. اختياري تماماً.
          </p>
          <div className="glass rounded-3xl p-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-2xl bg-gold/15 flex items-center justify-center">
                {reminder ? (
                  <Bell className="w-4 h-4 text-gold" />
                ) : (
                  <BellOff className="w-4 h-4 text-muted-foreground" />
                )}
              </div>
              <p className="flex-1 text-sm font-medium text-foreground">ذكّرني بالمحاسبة</p>
              <Switch
                checked={reminder}
                onChange={() => void toggleReminder()}
                label="تذكير المحاسبة اليومي"
              />
            </div>
            {reminder && (
              <div className="flex items-center gap-2">
                <label htmlFor="ob-time" className="text-[0.6875rem] text-muted-foreground">
                  الوقت
                </label>
                <input
                  id="ob-time"
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value || "21:30")}
                  dir="ltr"
                  className="glass rounded-xl px-3 py-1.5 text-xs outline-none"
                />
              </div>
            )}
            {notice && <p className="text-[0.6875rem] text-muted-foreground">{notice}</p>}
          </div>
        </div>
      )}

      <div className="flex gap-2 mt-6">
        {step > 0 && (
          <button
            onClick={() => setStep(step - 1)}
            className="min-h-12 px-5 rounded-2xl glass text-sm font-semibold"
          >
            السابق
          </button>
        )}
        <button
          onClick={() => (step < 2 ? setStep(step + 1) : finish())}
          className="flex-1 min-h-12 rounded-2xl bg-primary text-primary-foreground text-sm font-bold active:scale-[0.98] transition-all"
        >
          {step === 0 ? "لنبدأ" : step === 1 ? "التالي" : "ابدأ محاسبتي"}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────── الإعدادات ───────────────────────

export function SettingsSheet({
  settings,
  onChange,
  onClose,
  onManageHabits,
}: {
  settings: MuhasabaSettings;
  onChange: (p: Partial<MuhasabaSettings>) => void;
  onClose: () => void;
  onManageHabits: () => void;
}) {
  const [perm, setPerm] = useState(notificationState());
  const [notice, setNotice] = useState<string | null>(null);

  const toggleReminder = async () => {
    if (settings.reminder_enabled) {
      onChange({ reminder_enabled: false });
      return;
    }
    const p = await requestNotificationPermission();
    setPerm(p);
    if (p === "granted") {
      onChange({ reminder_enabled: true });
      setNotice(null);
    } else {
      setNotice(
        p === "unsupported"
          ? isNativeApp()
            ? nativeReminderHint()
            : "متصفحك لا يدعم التنبيهات."
          : "التنبيهات غير مسموحة لهذا الموقع. فعّلها من إعدادات المتصفح ثم عد إلى هنا.",
      );
    }
  };

  return (
    <Sheet title="إعدادات محاسبتي" onClose={onClose}>
      <div className="space-y-3">
        <div className="glass rounded-2xl p-3 space-y-3">
          <div className="flex items-center gap-3">
            <p className="flex-1 text-sm font-medium text-foreground">التذكير اليومي</p>
            <Switch
              checked={settings.reminder_enabled}
              onChange={() => void toggleReminder()}
              label="التذكير اليومي"
            />
          </div>
          {settings.reminder_enabled && (
            <div className="flex items-center gap-2">
              <label htmlFor="st-time" className="text-[0.6875rem] text-muted-foreground">
                الوقت
              </label>
              <input
                id="st-time"
                type="time"
                value={settings.reminder_time}
                onChange={(e) => onChange({ reminder_time: e.target.value || "21:30" })}
                dir="ltr"
                className="glass rounded-xl px-3 py-1.5 text-xs outline-none"
              />
            </div>
          )}
          {settings.reminder_enabled && perm !== "granted" && (
            <p className="text-[0.6875rem] text-destructive">
              التنبيهات متوقفة من المتصفح، فلن يصلك التذكير حتى تسمح بها.
            </p>
          )}
          {notice && <p className="text-[0.6875rem] text-muted-foreground">{notice}</p>}
          <p className="text-[0.625rem] text-muted-foreground">
            يصل التذكير حين يكون زِن مفتوحاً أو مثبّتاً على جهازك.
          </p>
        </div>

        <div className="glass rounded-2xl p-3 space-y-3">
          <div className="flex items-center gap-3">
            <p className="flex-1 text-sm font-medium text-foreground">متابعة الصلوات</p>
            <Switch
              checked={settings.track_prayers}
              onChange={() => onChange({ track_prayers: !settings.track_prayers })}
              label="متابعة الصلوات"
            />
          </div>
          <div className="flex items-center gap-3">
            <p className="flex-1 text-sm font-medium text-foreground">علاقتي بالقرآن</p>
            <Switch
              checked={settings.track_quran}
              onChange={() => onChange({ track_quran: !settings.track_quran })}
              label="متابعة القرآن"
            />
          </div>
          <button
            onClick={onManageHabits}
            className="w-full min-h-10 rounded-xl glass text-xs font-semibold"
          >
            إدارة «طاعاتي»
          </button>
        </div>

        <p className="text-[0.6875rem] text-muted-foreground inline-flex items-start gap-1">
          <Lock className="w-3 h-3 mt-0.5 shrink-0" aria-hidden />
          بيانات محاسبتك خاصة بك وحدك؛ لا يطّلع عليها معلّمك ولا أي مستخدم آخر، ولا تدخل في أي ترتيب
          أو مقارنة.
        </p>
      </div>
    </Sheet>
  );
}

// ─────────────────────── مساعد محاسبتي ───────────────────────

export function CoachSheet({ onClose }: { onClose: () => void }) {
  const ask = muhasabaCoach;
  const [text, setText] = useState("");
  const [reply, setReply] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    const q = text.trim();
    if (q.length < 3 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { text: r } = await ask({ data: { text: q } });
      setReply(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر الوصول إلى المساعد الآن.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet title="✨ مساعد محاسبتي" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-[0.6875rem] text-muted-foreground">
          اكتب بإيجاز عن يومك، وسيردّ عليك بكلمة داعمة وخطوة واحدة للغد. لا يُصدر أحكاماً ولا فتاوى.
        </p>
        <label htmlFor="coach-input" className="sr-only">
          اكتب عن يومك
        </label>
        <textarea
          id="coach-input"
          value={text}
          maxLength={600}
          rows={3}
          onChange={(e) => setText(e.target.value)}
          placeholder="مثال: كان يومي مزدحماً ونسيت الأذكار…"
          className="w-full glass rounded-2xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40 resize-none"
        />
        <button
          onClick={() => void send()}
          disabled={busy || text.trim().length < 3}
          className="w-full min-h-11 rounded-2xl bg-primary text-primary-foreground text-xs font-bold disabled:opacity-50 inline-flex items-center justify-center gap-1"
        >
          {busy ? (
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
          ) : (
            <Sparkles className="w-4 h-4" aria-hidden />
          )}
          {busy ? "يكتب…" : "أرسل"}
        </button>
        {error && (
          <p role="alert" className="text-[0.6875rem] text-destructive">
            {error}
          </p>
        )}
        {reply && (
          <div
            aria-live="polite"
            className="glass rounded-2xl p-3 text-sm text-foreground leading-relaxed whitespace-pre-line anim-float-in"
          >
            {reply}
          </div>
        )}
        <TextAiConsentStatus />
        <p className="text-[0.625rem] text-muted-foreground inline-flex items-center gap-1">
          <Lock className="w-3 h-3" aria-hidden /> ما تكتبه هنا لا يُحفظ.
        </p>
      </div>
    </Sheet>
  );
}

// ─────────────────────── شاشة الإغلاق ───────────────────────

export function ClosingScreen({ dua, onDone }: { dua: string; onDone: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="closing-title"
      className="absolute inset-0 z-40 bg-background/95 backdrop-blur-md flex flex-col items-center justify-center text-center px-8 gap-4 anim-float-in"
    >
      <div
        className="w-20 h-20 rounded-full bg-primary/15 flex items-center justify-center text-4xl"
        aria-hidden
      >
        🌙
      </div>
      <h2 id="closing-title" className="text-2xl font-black text-foreground">
        أغلقت يومك
      </h2>
      <p className="text-sm text-foreground">أحسنت على وقفتك مع نفسك.</p>
      <p className="text-sm text-muted-foreground">غداً فرصة جديدة.</p>
      <p className="text-sm text-gold font-semibold leading-relaxed max-w-[280px]">{dua}</p>
      <button
        onClick={onDone}
        autoFocus
        className="mt-4 min-h-12 px-10 rounded-2xl bg-primary text-primary-foreground text-sm font-bold"
      >
        تم
      </button>
    </div>
  );
}
