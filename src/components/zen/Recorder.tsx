import { useEffect, useRef, useState } from "react";
import { Mic, Square, Play, Pause, RotateCcw } from "lucide-react";

export type RecorderResult = { blob: Blob; seconds: number };

/** Simple in-app voice recorder with a live level meter (PRD §8.1). */
export function Recorder({
  onReady,
  disabled,
}: {
  onReady: (r: RecorderResult | null) => void;
  disabled?: boolean;
}) {
  const [state, setState] = useState<"idle" | "recording" | "ready">("idle");
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);

  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const cleanup = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  useEffect(() => () => cleanup(), []);

  const start = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        let peak = 0;
        for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i] - 128));
        setLevel(Math.min(1, peak / 60));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();

      chunksRef.current = [];
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        setUrl(URL.createObjectURL(blob));
        setState("ready");
        onReady({ blob, seconds });
        cleanup();
        ctx.close();
      };
      recRef.current = rec;
      rec.start();
      setSeconds(0);
      setState("recording");
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      setError("تعذّر الوصول إلى الميكروفون. تحقق من إذن التسجيل في المتصفح.");
    }
  };

  const stop = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    recRef.current?.stop();
  };

  const reset = () => {
    setUrl(null);
    setSeconds(0);
    setState("idle");
    setPlaying(false);
    onReady(null);
  };

  const mmss = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <div className="glass rounded-3xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {state === "recording"
            ? "جارٍ التسجيل…"
            : state === "ready"
              ? "التسجيل جاهز"
              : "سجّل تسميعك"}
        </span>
        <span className="font-mono text-sm text-primary">{mmss}</span>
      </div>

      <div className="flex items-end gap-1 h-10">
        {Array.from({ length: 28 }).map((_, i) => {
          const h =
            state === "recording" ? 10 + level * 100 * (0.4 + Math.abs(Math.sin(i + seconds))) : 8;
          return (
            <div
              key={i}
              className="flex-1 rounded-full bg-primary/60 transition-all duration-150"
              style={{ height: `${Math.min(40, h)}px` }}
            />
          );
        })}
      </div>

      {error && <p className="text-xs text-gold">{error}</p>}

      <div className="flex items-center gap-2">
        {state !== "recording" && state !== "ready" && (
          <button
            onClick={start}
            disabled={disabled}
            className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-primary text-primary-foreground py-3 text-sm font-semibold disabled:opacity-50"
          >
            <Mic className="w-4 h-4" /> ابدأ التسجيل
          </button>
        )}
        {state === "recording" && (
          <button
            onClick={stop}
            className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-gold text-gold-foreground py-3 text-sm font-semibold"
          >
            <Square className="w-4 h-4" /> إيقاف
          </button>
        )}
        {state === "ready" && url && (
          <>
            <audio ref={audioRef} src={url} onEnded={() => setPlaying(false)} className="hidden" />
            <button
              onClick={() => {
                if (!audioRef.current) return;
                if (playing) {
                  audioRef.current.pause();
                  setPlaying(false);
                } else {
                  void audioRef.current.play();
                  setPlaying(true);
                }
              }}
              className="flex-1 flex items-center justify-center gap-2 rounded-2xl glass-strong py-3 text-sm font-semibold"
            >
              {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />} استماع
            </button>
            <button
              aria-label="إعادة التسجيل"
              onClick={reset}
              className="rounded-2xl glass-strong px-4 py-3 text-sm text-muted-foreground"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
