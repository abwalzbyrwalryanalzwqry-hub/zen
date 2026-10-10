import { useEffect, useRef, useState } from "react";
import { MAX_ROOM_VOICE_SECONDS } from "@/lib/rooms";
import { useLatest } from "@/hooks/use-latest";

/** تسجيل رسالة صوتية للغرفة (9.7): حتى 60 ثانية، ويُسلَّم الملف عند الإيقاف (لا عند الإلغاء). */
export function useRoomVoice(
  onDone: (blob: Blob, seconds: number) => void,
  onError: (msg: string) => void,
) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const secRef = useRef(0);
  const cancelRef = useRef(false);
  const doneRef = useLatest(onDone);

  const cleanup = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };
  useEffect(() => cleanup, []);

  const stop = (cancel = false) => {
    cancelRef.current = cancel;
    if (recRef.current?.state === "recording") recRef.current.stop();
    setRecording(false);
  };

  const start = async () => {
    if (recording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const chunks: BlobPart[] = [];
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
      rec.onstop = () => {
        const s = secRef.current;
        cleanup();
        const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
        if (!cancelRef.current && s >= 1 && blob.size > 0) doneRef.current(blob, s);
        cancelRef.current = false;
      };
      recRef.current = rec;
      secRef.current = 0;
      setSeconds(0);
      rec.start();
      setRecording(true);
      timerRef.current = setInterval(() => {
        secRef.current += 1;
        setSeconds(secRef.current);
        if (secRef.current >= MAX_ROOM_VOICE_SECONDS) stop();
      }, 1000);
    } catch {
      cleanup();
      onError("تعذّر الوصول إلى الميكروفون. اسمح للتطبيق بالتسجيل من الإعدادات.");
    }
  };

  return { recording, seconds, start, stop };
}
