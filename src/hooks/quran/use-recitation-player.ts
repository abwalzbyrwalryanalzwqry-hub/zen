import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useKeepAwake } from "@/hooks/quran/use-keep-awake";
import { onNativePlaybackAction, syncNativePlayback } from "@/lib/native-playback";
import { useReadingPrefs } from "@/lib/quran/reading-prefs";
import { SURAH_META } from "@/lib/quran/metadata";
import {
  ayahAudioUrl,
  needsBasmalaIntro,
  useRecitationPrefs,
  type Reciter,
} from "@/lib/quran/recitations";
import { localBasmalaSrc } from "@/lib/quran/recitation-offline";
import { isAbort, resolveSrc } from "@/lib/quran/recitation-source";
import { toArabicDigits } from "@/lib/quran/format";
import { useLatest } from "@/hooks/use-latest";
import {
  ayahCount,
  isRangeEnd,
  nextTrack,
  normalizeRange,
  sleepStopsBefore,
  type PlayerRange,
  type PlayerTrack,
  type SleepTimer,
} from "@/lib/quran/recitation-queue";

export type { PlayerRange, PlayerTrack, SleepTimer } from "@/lib/quran/recitation-queue";
export { nextTrack } from "@/lib/quran/recitation-queue";

export type PlayerStatus = "idle" | "loading" | "playing" | "paused" | "error";

/**
 * Verse-by-verse recitation player.
 * Plays from downloaded files when available and streams otherwise,
 * honouring the user's repeat / continuous / speed preferences.
 * محرّك واحد للتطبيق كله عبر RecitationPlayerProvider، فتستمر التلاوة بين الشاشات.
 */
function useRecitationPlayerEngine() {
  const { prefs, reciter } = useRecitationPrefs();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const repeatsRef = useRef(0);
  const trackRef = useRef<PlayerTrack | null>(null);
  /** مصدر الآية المنتظرة بعد انتهاء البسملة التمهيدية. */
  const pendingRef = useRef<{ src: string; offline: boolean } | null>(null);
  /** يزداد مع كل تحميل مصدر؛ الوعود القديمة تتجاهل نتيجتها. */
  const loadIdRef = useRef(0);
  const rangeRef = useRef<PlayerRange | null>(null);
  const loopsRef = useRef(0);
  /** تحميل مسبق للآية التالية حتى لا يتوقف الصوت بين الآيات. */
  const preloadRef = useRef<HTMLAudioElement | null>(null);

  const [track, setTrack] = useState<PlayerTrack | null>(null);
  const [status, setStatus] = useState<PlayerStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [position, setPosition] = useState({ current: 0, duration: 0 });
  const [range, setRangeState] = useState<PlayerRange | null>(null);
  const sleepRef = useRef<SleepTimer>(null);
  const [sleep, setSleepState] = useState<SleepTimer>(null);

  // Keep a ref in sync so the `ended` handler always sees the live track.
  useEffect(() => {
    trackRef.current = track;
  }, [track]);

  /** ينتقل من البسملة إلى الآية المنتظرة. يُعيد false إن لم تكن هناك آية منتظرة. */
  const playPending = useCallback((): boolean => {
    const audio = audioRef.current;
    const pending = pendingRef.current;
    if (!audio || !pending) return false;
    pendingRef.current = null;
    const id = ++loadIdRef.current;
    setOffline(pending.offline);
    audio.src = pending.src;
    audio.playbackRate = prefs.rate;
    void audio.play().catch((e: unknown) => {
      if (id !== loadIdRef.current || isAbort(e)) return;
      setStatus("error");
      setError(
        pending.offline
          ? "تعذّر تشغيل الملف المحمّل — أعد تحميل السورة"
          : "تعذّر تشغيل التلاوة — تأكّد من اتصال الإنترنت أو حمّل السورة للاستماع بدون إنترنت",
      );
    });
    return true;
  }, [prefs.rate]);

  const startTrack = useCallback(
    (next: PlayerTrack) => {
      const audio = audioRef.current;
      if (!audio) return;
      const clampedAyah = Math.min(ayahCount(next.surah), Math.max(1, next.ayah));
      const target = { surah: next.surah, ayah: clampedAyah };
      const { src, offline: isOffline } = resolveSrc(reciter, target.surah, target.ayah);
      setTrack(target);
      trackRef.current = target;
      setOffline(isOffline);
      setError(null);
      setStatus("loading");
      // البسملة قبل الآية الأولى، ثم تُشغَّل الآية عند انتهائها.
      if (needsBasmalaIntro(target.surah, target.ayah)) {
        pendingRef.current = { src, offline: isOffline };
        audio.src = localBasmalaSrc(reciter.folder, target.surah) ?? ayahAudioUrl(reciter, 1, 1);
      } else {
        pendingRef.current = null;
        audio.src = src;
      }
      const id = ++loadIdRef.current;
      audio.playbackRate = prefs.rate;
      void audio.play().catch((e: unknown) => {
        if (id !== loadIdRef.current || isAbort(e)) return;
        if (pendingRef.current) {
          playPending();
          return;
        }
        setStatus("error");
        setError(
          isOffline
            ? "تعذّر تشغيل الملف المحمّل — أعد تحميل السورة"
            : "تعذّر تشغيل التلاوة — تأكّد من اتصال الإنترنت أو حمّل السورة للاستماع بدون إنترنت",
        );
      });
    },
    [playPending, prefs.rate, reciter],
  );

  const advance = useCallback(
    (direction: 1 | -1) => {
      const cur = trackRef.current;
      if (!cur) return;
      repeatsRef.current = 0;
      let surah = cur.surah;
      let ayah = cur.ayah + direction;
      if (ayah > ayahCount(surah)) {
        if (!prefs.continuous || surah >= 114) {
          setStatus("paused");
          return;
        }
        surah += 1;
        ayah = 1;
      }
      if (ayah < 1) {
        if (surah <= 1) {
          ayah = 1;
        } else {
          surah -= 1;
          ayah = ayahCount(surah);
        }
      }
      startTrack({ surah, ayah });
    },
    [prefs.continuous, startTrack],
  );

  const playPendingRef = useRef(playPending);
  useEffect(() => {
    playPendingRef.current = playPending;
  }, [playPending]);

  // One audio element for the whole session.
  useEffect(() => {
    const audio = new Audio();
    audio.preload = "auto";
    audioRef.current = audio;

    const onPlaying = () => setStatus("playing");
    const onPause = () => setStatus((s) => (s === "playing" ? "paused" : s));
    const onWaiting = () => setStatus((s) => (s === "playing" ? "loading" : s));
    const onTime = () =>
      setPosition({ current: audio.currentTime || 0, duration: audio.duration || 0 });
    const onError = () => {
      // تعذّرت البسملة (مثلاً بدون إنترنت والفاتحة غير محمّلة): تُتجاوز إلى الآية.
      if (playPendingRef.current()) return;
      setStatus("error");
      setError("تعذّر تحميل الملف الصوتي — تحقّق من الاتصال أو اختر قارئًا آخر");
    };

    audio.addEventListener("playing", onPlaying);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("error", onError);

    return () => {
      audio.removeEventListener("playing", onPlaying);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("error", onError);
      audio.pause();
      audio.src = "";
      audioRef.current = null;
    };
  }, []);

  // `ended` depends on the current preferences, so it is bound separately.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onEnded = () => {
      const cur = trackRef.current;
      if (!cur) return;
      if (playPending()) return;
      const r = rangeRef.current;
      // داخل المقطع: تكرار كل آية حسب المقطع، وخارجه حسب تفضيل «تكرار الآية».
      const perAyah =
        r?.ayahTimes ?? (prefs.repeat === "ayah" ? Math.max(1, prefs.repeatCount) : 1);
      if (repeatsRef.current < perAyah - 1) {
        repeatsRef.current += 1;
        audio.currentTime = 0;
        void audio.play().catch(() => setStatus("paused"));
        return;
      }
      repeatsRef.current = 0;
      if (prefs.repeat === "range" && !rangeRef.current && cur.ayah >= ayahCount(cur.surah)) {
        startTrack({ surah: cur.surah, ayah: 1 });
        return;
      }
      const nxt = nextTrack(cur, {
        continuous: prefs.continuous,
        range: r,
        loopsDone: loopsRef.current,
      });
      if (r && isRangeEnd(cur, r)) loopsRef.current += 1;
      if (sleepStopsBefore(sleepRef.current, cur, nxt)) {
        sleepRef.current = null;
        setSleepState(null);
        setStatus("paused");
        return;
      }
      if (!nxt) {
        if (r) {
          rangeRef.current = null;
          setRangeState(null);
        }
        setStatus("paused");
        return;
      }
      startTrack(nxt);
    };
    audio.addEventListener("ended", onEnded);
    return () => audio.removeEventListener("ended", onEnded);
  }, [playPending, prefs.continuous, prefs.repeat, prefs.repeatCount, startTrack]);

  // تحميل مسبق للآية التالية أثناء تلاوة الحالية (للبث فقط؛ الملف المحمّل محلي).
  useEffect(() => {
    if (status !== "playing" || !track) return;
    const nxt = nextTrack(track, {
      continuous: prefs.continuous,
      range: rangeRef.current,
      loopsDone: loopsRef.current,
    });
    if (!nxt) return;
    const { src, offline: isLocal } = resolveSrc(reciter, nxt.surah, nxt.ayah);
    if (isLocal) return;
    const pre = preloadRef.current ?? new Audio();
    preloadRef.current = pre;
    if (pre.src === src) return;
    pre.preload = "auto";
    pre.muted = true;
    pre.src = src;
    pre.load();
  }, [prefs.continuous, reciter, status, track]);

  // Live playback-rate changes.
  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = prefs.rate;
  }, [prefs.rate]);

  // Switching reciter mid-ayah reloads the same position.
  useEffect(() => {
    const cur = trackRef.current;
    if (!cur) return;
    if (status === "playing" || status === "loading") startTrack(cur);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reciter.id]);

  // Lock-screen / notification metadata where the WebView supports it.
  useEffect(() => {
    const cur = track;
    const ms = (navigator as Navigator & { mediaSession?: MediaSession }).mediaSession;
    if (!ms || !cur) return;
    try {
      ms.metadata = new MediaMetadata({
        title: `سورة ${SURAH_META[cur.surah - 1].nameAr}، الآية ${toArabicDigits(cur.ayah)}`,
        artist: reciter.nameAr,
        album: "زِن — القرآن الكريم",
      });
      ms.setActionHandler("play", () => void audioRef.current?.play());
      ms.setActionHandler("pause", () => audioRef.current?.pause());
      ms.setActionHandler("nexttrack", () => advance(1));
      ms.setActionHandler("previoustrack", () => advance(-1));
    } catch {
      /* MediaSession is optional */
    }
  }, [advance, reciter.nameAr, track]);

  // M14: الإشعار وشاشة القفل على أندرويد (خدمة أمامية تُبقي التلاوة والشاشة مطفأة).
  const nativeTitle = track
    ? `سورة ${SURAH_META[track.surah - 1].nameAr}، الآية ${toArabicDigits(track.ayah)}`
    : null;
  useEffect(() => {
    syncNativePlayback(
      nativeTitle && status !== "idle" && status !== "error"
        ? {
            title: nativeTitle,
            subtitle: reciter.nameAr,
            playing: status === "playing" || status === "loading",
          }
        : null,
    );
  }, [nativeTitle, reciter.nameAr, status]);

  const play = useCallback(
    (surah: number, ayah = 1) => {
      rangeRef.current = null;
      loopsRef.current = 0;
      setRangeState(null);
      startTrack({ surah, ayah });
    },
    [startTrack],
  );

  /**
   * يتلو المقطع من `from` إلى `to` ويكرّره `times` مرة (٠ = بلا حدّ).
   * `extra.toSurah` يمدّ المقطع إلى سورة لاحقة، و`extra.ayahTimes` يكرّر كل آية فيه.
   */
  const playRange = useCallback(
    (
      surah: number,
      from: number,
      to: number,
      times: number,
      extra: { toSurah?: number; ayahTimes?: number } = {},
    ) => {
      const r = normalizeRange({ surah, from, to, times, ...extra });
      rangeRef.current = r;
      loopsRef.current = 0;
      repeatsRef.current = 0;
      setRangeState(r);
      startTrack({ surah: r.surah, ayah: r.from });
    },
    [startTrack],
  );

  /** مؤقّت النوم: دقائق، أو «نهاية السورة»، أو null للإلغاء. */
  const setSleep = useCallback((value: number | "surah" | null) => {
    const timer: SleepTimer =
      value === null
        ? null
        : value === "surah"
          ? { kind: "surah" }
          : { kind: "minutes", minutes: value, until: Date.now() + value * 60_000 };
    sleepRef.current = timer;
    setSleepState(timer);
  }, []);

  // المؤقّت بالدقائق يوقف التلاوة في موعده ولو في منتصف آية طويلة.
  useEffect(() => {
    if (sleep?.kind !== "minutes") return;
    const id = window.setTimeout(
      () => {
        audioRef.current?.pause();
        sleepRef.current = null;
        setSleepState(null);
      },
      Math.max(0, sleep.until - Date.now()),
    );
    return () => window.clearTimeout(id);
  }, [sleep]);

  const clearRange = useCallback(() => {
    rangeRef.current = null;
    loopsRef.current = 0;
    setRangeState(null);
  }, []);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!trackRef.current) return;
    if (audio.paused) {
      void audio.play().catch(() => setStatus("error"));
    } else {
      audio.pause();
    }
  }, []);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    repeatsRef.current = 0;
    pendingRef.current = null;
    rangeRef.current = null;
    loopsRef.current = 0;
    setRangeState(null);
    sleepRef.current = null;
    setSleepState(null);
    if (preloadRef.current) preloadRef.current.src = "";
    setStatus("idle");
    setTrack(null);
    trackRef.current = null;
  }, []);

  const advanceRef = useLatest(advance);
  const stopRef = useLatest(stop);
  useEffect(
    () =>
      onNativePlaybackAction((a) => {
        const audio = audioRef.current;
        if (a === "play") void audio?.play().catch(() => setStatus("paused"));
        else if (a === "pause") audio?.pause();
        else if (a === "next") advanceRef.current(1);
        else if (a === "prev") advanceRef.current(-1);
        else stopRef.current();
      }),
    [advanceRef, stopRef],
  );
  useEffect(() => () => syncNativePlayback(null), []);

  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (audio && Number.isFinite(seconds)) audio.currentTime = Math.max(0, seconds);
  }, []);

  const isBusy = status === "playing" || status === "loading";

  return useMemo(
    () => ({
      track,
      status,
      error,
      offline,
      position,
      isBusy,
      reciter,
      range,
      sleep,
      setSleep,
      play,
      playRange,
      clearRange,
      toggle,
      stop,
      next: () => advance(1),
      prev: () => advance(-1),
      seek,
    }),
    [
      advance,
      clearRange,
      error,
      isBusy,
      offline,
      play,
      playRange,
      position,
      range,
      reciter,
      seek,
      setSleep,
      sleep,
      status,
      stop,
      toggle,
      track,
    ],
  );
}

export type RecitationPlayer = ReturnType<typeof useRecitationPlayerEngine>;

/**
 * المحرّك نفسه، يركّبه مضيف الجذر (recitation-host.tsx) كسولاً أول مرة يُطلب فيها المشغّل،
 * ثم يبقى مركّباً: عنصر صوت واحد تستمر تلاوته بين الشاشات.
 */
export function RecitationPlayerEngine({ onReady }: { onReady: (p: RecitationPlayer) => void }) {
  const player = useRecitationPlayerEngine();
  const { prefs } = useReadingPrefs();
  // أثناء التلاوة فقط: إطفاء الشاشة يوقف الصوت في WebView على كثير من الأجهزة.
  useKeepAwake(prefs.keepAwake && player.isBusy);
  useEffect(() => {
    onReady(player);
  }, [player, onReady]);
  return null;
}
