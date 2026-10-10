import { useCallback, useEffect, useRef, useState } from "react";
import {
  CHUNK_MS,
  MAX_CHUNKS,
  addPending,
  blobToBase64,
  initialLive,
  mimeToFormat,
  resolveChunk,
  type LiveState,
} from "@/lib/quran/live-recite";
import { transcribeChunk } from "@/lib/recitation-client";

/**
 * تسجيل مقطّع للتسميع المباشر (8.4): مسجّل جديد كل 6 ثوانٍ على البث نفسه، فيكون كل مقطع ملفاً
 * مستقلاً قابلاً للتفريغ. المقاطع تُرسل بالتوازي وتُضمّ بترتيبها.
 */
export function useLiveRecite() {
  const [state, setState] = useState<LiveState>(initialLive);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef(false);
  const countRef = useRef(0);

  const stopAll = useCallback(() => {
    activeRef.current = false;
    if (timerRef.current) clearTimeout(timerRef.current);
    const rec = recRef.current;
    if (rec && rec.state === "recording") rec.stop(); // يرسل المقطع الأخير
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setRecording(false);
  }, []);

  const send = useCallback(
    async (blob: Blob, mime: string) => {
      if (blob.size < 1_000) return; // صمت أو مقطع فارغ
      let index = -1;
      setState((s) => {
        const r = addPending(s);
        index = r.index;
        return r.state;
      });
      try {
        const { text } = await transcribeChunk(await blobToBase64(blob), mimeToFormat(mime));
        setState((s) => resolveChunk(s, index, text));
      } catch (e) {
        setState((s) => resolveChunk(s, index, null));
        const msg = e instanceof Error ? e.message : "تعذّر تفريغ المقطع.";
        setError(msg);
        // الحصة أو الاتصال: لا فائدة من الاستمرار.
        if (/حدّ|كثيرة|اتصال/.test(msg)) stopAll();
      }
    },
    [stopAll],
  );

  // كل مقطع يبدأ التالي عند توقّفه (دالة داخلية تستدعي نفسها بدل الإشارة إلى startSegment قبل تعريفها).
  const startSegment = useCallback(() => {
    function next() {
      const stream = streamRef.current;
      if (!stream || !activeRef.current) return;
      if (countRef.current >= MAX_CHUNKS) {
        setError("بلغت حدّ الجلسة الواحدة (10 دقائق).");
        stopAll();
        return;
      }
      countRef.current++;
      const rec = new MediaRecorder(stream);
      const parts: BlobPart[] = [];
      rec.ondataavailable = (e) => e.data.size > 0 && parts.push(e.data);
      rec.onstop = () => {
        const mime = rec.mimeType || "audio/webm";
        void send(new Blob(parts, { type: mime }), mime);
        next();
      };
      recRef.current = rec;
      rec.start();
      timerRef.current = setTimeout(() => rec.state === "recording" && rec.stop(), CHUNK_MS);
    }
    next();
  }, [send, stopAll]);

  const start = useCallback(async () => {
    setError(null);
    setState(initialLive());
    countRef.current = 0;
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("لم يُسمح باستخدام الميكروفون.");
      return;
    }
    activeRef.current = true;
    setRecording(true);
    startSegment();
  }, [startSegment]);

  useEffect(() => () => stopAll(), [stopAll]);

  const pending = state.chunks.some((c) => c === undefined);
  return { state, recording, pending, error, start, stop: stopAll };
}
