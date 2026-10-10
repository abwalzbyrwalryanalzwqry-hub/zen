/**
 * تحليل التسميع من العميل (المرحلة 6.2): دالة Edge «zen-recitation» في الويب وAndroid.
 * الواجهة `{ data: { sessionId } }` كما كانت دوال الخادم السابقة.
 */
import { callEdge } from "@/lib/server-call";
import type { TranscribeResult } from "@/lib/recitation-core";

const opts = {
  offlineMessage: "تحليل التلاوة يحتاج اتصالاً بالإنترنت. التسجيل محفوظ، حلّله لاحقاً.",
  fallbackMessage: "تعذّر تحليل التلاوة الآن.",
};

export function transcribeRecitation(input: { data: { sessionId: string } }) {
  return callEdge<TranscribeResult>(
    "zen-recitation",
    { action: "transcribe", sessionId: input.data.sessionId },
    opts,
  );
}

export function coachRecitation(input: { data: { sessionId: string } }) {
  return callEdge<{ text: string }>(
    "zen-recitation",
    { action: "coach", sessionId: input.data.sessionId },
    opts,
  );
}

/** مقطع من التسميع المباشر (8.4): نص مسموع فقط، والمطابقة على الجهاز. */
export function transcribeChunk(audio: string, format: string) {
  return callEdge<{ text: string }>(
    "zen-recitation",
    { action: "transcribe_chunk", audio, format },
    {
      offlineMessage: "التسميع المباشر يحتاج اتصالاً بالإنترنت.",
      fallbackMessage: "تعذّر تفريغ المقطع.",
    },
  );
}
