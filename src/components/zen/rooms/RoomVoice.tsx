import { useState } from "react";
import { Loader2, Mic, Play, Square, X } from "lucide-react";
import { roomVoiceUrl } from "@/lib/rooms";

/** مشغّل الرسالة الصوتية: الرابط الموقّع يُطلب عند الضغط فقط (5 دقائق). */
export function RoomVoicePlayer({
  path,
  seconds,
}: {
  path: string;
  seconds: number | null | undefined;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  if (url)
    return <audio src={url} controls autoPlay className="w-56 h-9 mt-1" aria-label="رسالة صوتية" />;
  return (
    <button
      onClick={() => {
        setBusy(true);
        roomVoiceUrl(path)
          .then(setUrl)
          .catch(() => setErr(true))
          .finally(() => setBusy(false));
      }}
      className="mt-1 flex items-center gap-2 rounded-full bg-background/60 px-3 py-1.5 text-xs"
      aria-label={`تشغيل رسالة صوتية ${seconds ?? ""} ثانية`}
    >
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
      <span className="tabular-nums">{seconds ?? "…"} ث</span>
      {err && <span className="text-destructive">تعذّر التشغيل</span>}
    </button>
  );
}

/** زر التسجيل في خانة الكتابة، ويتحوّل أثناء التسجيل إلى عدّاد وإيقاف/إلغاء. */
export function RoomVoiceButton(props: {
  recording: boolean;
  seconds: number;
  busy: boolean;
  onStart: () => void;
  onStop: (cancel?: boolean) => void;
}) {
  if (props.busy)
    return (
      <span
        className="w-11 h-11 flex items-center justify-center"
        role="status"
        aria-label="يُرسل الصوت"
      >
        <Loader2 className="w-4 h-4 animate-spin" />
      </span>
    );
  if (!props.recording)
    return (
      <button
        onClick={props.onStart}
        aria-label="تسجيل رسالة صوتية"
        className="w-11 h-11 rounded-2xl glass flex items-center justify-center"
      >
        <Mic className="w-4 h-4" />
      </button>
    );
  return (
    <div className="flex items-center gap-1" role="group" aria-label="تسجيل جارٍ">
      <span className="text-xs tabular-nums text-destructive w-10 text-center">
        {props.seconds}/60
      </span>
      <button
        onClick={() => props.onStop(true)}
        aria-label="إلغاء التسجيل"
        className="w-9 h-9 rounded-xl glass flex items-center justify-center"
      >
        <X className="w-4 h-4" />
      </button>
      <button
        onClick={() => props.onStop(false)}
        aria-label="إيقاف وإرسال"
        className="w-11 h-11 rounded-2xl bg-destructive text-white flex items-center justify-center"
      >
        <Square className="w-4 h-4" />
      </button>
    </div>
  );
}
