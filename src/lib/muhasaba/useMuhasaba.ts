import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { addDays, isoDay } from "./dates";
import { fetchQuranActivity } from "./quran";
import type { QuranActivity } from "./logic";
import {
  loadLocal,
  mergeRemote,
  newId,
  pullRemote,
  pushDay,
  pushHabit,
  pushSettings,
  saveLocal,
  type LocalState,
} from "./storage";
import {
  HABIT_PRESETS,
  emptyDay,
  type Habit,
  type MuhasabaDay,
  type MuhasabaSettings,
} from "./types";
import { GUEST_ID } from "@/lib/offline/guest";
import { isOnline } from "@/lib/network";

export type SyncStatus = "idle" | "saving" | "saved" | "offline" | "error";

const PUSH_DELAY = 700;

const online = () => isOnline();

/**
 * حالة «محاسبتي» للمستخدم: تُقرأ من الجهاز فوراً ثم تُحدَّث من السحابة،
 * وكل تعديل يظهر مباشرة ويُرفع في الخلفية (مع إعادة المحاولة عند عودة الاتصال).
 */
export function useMuhasaba(userId: string | null | undefined, opts?: { from?: string }) {
  const today = isoDay();
  const from = opts?.from ?? addDays(today, -35);

  const [state, setState] = useState<LocalState | null>(null);
  const [quran, setQuran] = useState<Record<string, QuranActivity>>({});
  const [remoteLoaded, setRemoteLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [status, setStatus] = useState<SyncStatus>("idle");

  const stateRef = useRef<LocalState | null>(null);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const commit = useCallback(
    (fn: (s: LocalState) => LocalState) => {
      if (!userId) return;
      setState((prev) => {
        const next = fn(prev ?? loadLocal(userId));
        stateRef.current = next;
        saveLocal(userId, next);
        return next;
      });
    },
    [userId],
  );

  /** يرفع كل ما هو معلّق. آمن للاستدعاء المتكرر. */
  const flush = useCallback(async () => {
    const uid = userId;
    const s = stateRef.current;
    if (!uid || !s) return;
    // الضيف: البيانات على الجهاز وحده، لا رفع.
    if (uid === GUEST_ID) return;
    const { days, habits, settings } = s.pending;
    if (days.length === 0 && habits.length === 0 && !settings) return;
    if (!online()) {
      setStatus("offline");
      return;
    }
    setStatus("saving");
    try {
      if (settings) await pushSettings(uid, s.settings);
      for (const id of habits) {
        const h = s.habits.find((x) => x.id === id);
        if (h) await pushHabit(uid, h);
      }
      const saved: MuhasabaDay[] = [];
      for (const day of days) {
        const d = s.days[day];
        if (d) saved.push(await pushDay(uid, d));
      }
      commit((cur) => {
        const next = { ...cur, days: { ...cur.days }, pending: { ...cur.pending } };
        // لا نُسقط من «المعلّق» إلا ما لم يتغيّر أثناء الرفع.
        next.pending.settings = cur.pending.settings && cur.settings !== s.settings;
        next.pending.habits = cur.pending.habits.filter(
          (id) => cur.habits.find((h) => h.id === id) !== s.habits.find((h) => h.id === id),
        );
        next.pending.days = cur.pending.days.filter((day) => cur.days[day] !== s.days[day]);
        for (const row of saved) {
          if (!next.pending.days.includes(row.day)) next.days[row.day] = row;
        }
        return next;
      });
      setStatus("saved");
    } catch {
      setStatus(online() ? "error" : "offline");
    }
  }, [userId, commit]);

  const schedule = useCallback(
    (tag: string) => {
      clearTimeout(timers.current[tag]);
      timers.current[tag] = setTimeout(() => void flush(), PUSH_DELAY);
    },
    [flush],
  );

  // ─── التحميل ───
  // النسخة المحلية تُقرأ فور معرفة المستخدم، أثناء العرض لا في أثر (M12)؛ الضيف لا خادم له.
  const [localFor, setLocalFor] = useState<string | null>(null);
  if (userId && localFor !== userId) {
    setLocalFor(userId);
    setState(loadLocal(userId));
    setRemoteLoaded(userId === GUEST_ID);
    setLoadError(false);
  }
  useLayoutEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (!userId || userId === GUEST_ID) return;
    let alive = true;
    (async () => {
      try {
        const remote = await pullRemote(userId, from, today);
        if (!alive) return;
        commit((cur) => mergeRemote(cur, remote));
        setLoadError(false);
      } catch {
        if (alive) setLoadError(true);
      } finally {
        if (alive) setRemoteLoaded(true);
      }
      void flush();
    })();
    void fetchQuranActivity(userId, from, today).then((q) => {
      if (alive) setQuran(q);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- نعيد التحميل عند تغيّر المستخدم أو المدى فقط
  }, [userId, from, today]);

  // ─── عودة الاتصال ───
  useEffect(() => {
    const on = () => void flush();
    const off = () => setStatus("offline");
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [flush]);

  // رفع ما تبقّى عند مغادرة الصفحة.
  useEffect(() => {
    const t = timers.current;
    return () => {
      for (const k of Object.keys(t)) clearTimeout(t[k]);
      void flush();
    };
  }, [flush]);

  // ─── الإجراءات ───
  const getDay = useCallback(
    (day: string): MuhasabaDay => state?.days[day] ?? emptyDay(day),
    [state],
  );

  const updateDay = useCallback(
    (day: string, fn: (d: MuhasabaDay) => MuhasabaDay) => {
      commit((s) => {
        const cur = s.days[day] ?? emptyDay(day);
        const next = fn(cur);
        if (next === cur) return s;
        return {
          ...s,
          days: { ...s.days, [day]: next },
          pending: {
            ...s.pending,
            days: s.pending.days.includes(day) ? s.pending.days : [...s.pending.days, day],
          },
        };
      });
      schedule(`day:${day}`);
    },
    [commit, schedule],
  );

  const updateSettings = useCallback(
    (patch: Partial<MuhasabaSettings>) => {
      commit((s) => ({
        ...s,
        settings: { ...s.settings, ...patch },
        pending: { ...s.pending, settings: true },
      }));
      schedule("settings");
    },
    [commit, schedule],
  );

  const saveHabits = useCallback(
    (changed: Habit[]) => {
      if (changed.length === 0) return;
      commit((s) => {
        const map = new Map(s.habits.map((h) => [h.id, h]));
        for (const h of changed) map.set(h.id, h);
        const ids = new Set([...s.pending.habits, ...changed.map((h) => h.id)]);
        return { ...s, habits: [...map.values()], pending: { ...s.pending, habits: [...ids] } };
      });
      schedule("habits");
    },
    [commit, schedule],
  );

  const addHabit = useCallback(
    (input: { title: string; preset_key?: string | null; days?: number[] | null }) => {
      const s = stateRef.current;
      const title = input.title.trim().slice(0, 40);
      if (!title || !s) return;
      if (
        input.preset_key &&
        s.habits.some((h) => h.preset_key === input.preset_key && !h.archived_at)
      )
        return;
      // عادة جاهزة محذوفة سابقاً: نعيدها بدل إنشاء نسخة ثانية (الفهرس فريد).
      const archived = input.preset_key
        ? s.habits.find((h) => h.preset_key === input.preset_key)
        : undefined;
      const position = s.habits.filter((h) => !h.archived_at).length;
      const habit: Habit = archived
        ? { ...archived, archived_at: null, paused: false, position, days: input.days ?? null }
        : {
            id: newId(),
            title,
            preset_key: input.preset_key ?? null,
            days: input.days && input.days.length > 0 && input.days.length < 7 ? input.days : null,
            position,
            paused: false,
            archived_at: null,
            created_at: new Date().toISOString(),
          };
      saveHabits([habit]);
    },
    [saveHabits],
  );

  /** البدء لأول مرة: إعدادات + عادات البداية المختارة. */
  const completeOnboarding = useCallback(
    (input: {
      track_prayers: boolean;
      track_quran: boolean;
      presets: string[];
      reminder_enabled: boolean;
      reminder_time: string;
    }) => {
      const s = stateRef.current;
      const now = new Date().toISOString();
      const existing = new Set(s?.habits.map((h) => h.preset_key));
      let pos = s?.habits.filter((h) => !h.archived_at).length ?? 0;
      const habits: Habit[] = input.presets
        .filter((k) => !existing.has(k))
        .map((k) => ({
          id: newId(),
          title: HABIT_PRESETS.find((p) => p.key === k)?.title ?? k,
          preset_key: k,
          days: null,
          position: pos++,
          paused: false,
          archived_at: null,
          created_at: now,
        }));
      saveHabits(habits);
      updateSettings({
        onboarded_at: now,
        track_prayers: input.track_prayers,
        track_quran: input.track_quran,
        reminder_enabled: input.reminder_enabled,
        reminder_time: input.reminder_time,
      });
    },
    [saveHabits, updateSettings],
  );

  const pendingCount = state
    ? state.pending.days.length + state.pending.habits.length + (state.pending.settings ? 1 : 0)
    : 0;

  return {
    ready: state !== null,
    remoteLoaded,
    loadError,
    today,
    state,
    settings: state?.settings,
    habits: state?.habits ?? [],
    days: state ? Object.values(state.days) : [],
    quran,
    status,
    pendingCount,
    getDay,
    updateDay,
    updateSettings,
    saveHabits,
    addHabit,
    completeOnboarding,
    retry: flush,
  };
}

export type MuhasabaApi = ReturnType<typeof useMuhasaba>;
