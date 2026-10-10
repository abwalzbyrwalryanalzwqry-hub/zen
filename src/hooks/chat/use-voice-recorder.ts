import { useEffect, useRef, useState } from "react";
import { MAX_VOICE_SECONDS } from "@/lib/chat-extras";

/**
 * تسجيل رسالة صوتية (المرحلة 7.6). الإرسال عبر صندوق الوسائط (M9): `onRecorded` يحفظ التسجيل
 * على الجهاز ثم يرسله، فلا يضيع إن انقطع الاتصال.
 */
export function useVoiceRecorder(
  userId: string | null | undefined,
  setError: (e: string | null) => void,
  onRecorded: (blob: Blob, seconds: number) => Promise<void>,
) {
  const [recording, setRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recSecondsRef = useRef(0);
  const cancelledRecRef = useRef(false);

  // إيقاف التسجيل وتحرير الميكروفون عند مغادرة الشاشة
  useEffect(
    () => () => {
      if (recTimerRef.current) clearInterval(recTimerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  const startRecording = async () => {
    if (recording || !userId) return;
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        const seconds = recSecondsRef.current;
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        if (cancelledRecRef.current || seconds < 1 || blob.size === 0) {
          cancelledRecRef.current = false;
          return;
        }
        try {
          await onRecorded(blob, seconds);
        } catch (e) {
          setError(e instanceof Error ? e.message : "تعذّر إرسال الرسالة الصوتية.");
        }
      };
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
      setRecSeconds(0);
      recSecondsRef.current = 0;
      recTimerRef.current = setInterval(() => {
        recSecondsRef.current += 1;
        setRecSeconds(recSecondsRef.current);
        if (recSecondsRef.current >= MAX_VOICE_SECONDS) stopRecording();
      }, 1000);
    } catch {
      setError("تعذّر الوصول إلى الميكروفون. تحقّق من إذن التسجيل في المتصفح.");
    }
  };

  const stopRecording = (cancel = false) => {
    cancelledRecRef.current = cancel;
    if (recTimerRef.current) clearInterval(recTimerRef.current);
    recTimerRef.current = null;
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  };

  return { recording, recSeconds, startRecording, stopRecording };
}
