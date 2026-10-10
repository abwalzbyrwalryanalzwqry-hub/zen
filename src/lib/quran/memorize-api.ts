import { supabase } from "@/integrations/supabase/client";
import { SURAHS } from "@/lib/quran-meta";
import {
  isNetworkError,
  queueReview,
  startReviewOutbox,
  type ReviewOutboxItem,
} from "@/lib/quran/review-outbox";

/** نتيجة «أتقنتُها»: كرت المراجعة من الخادم، أو `queued` إن حُفظ للإرسال لاحقاً (M8). */
export type MasteredResult = { due_date?: string; queued?: false } | { queued: true } | null;

async function sendReview(i: ReviewOutboxItem) {
  const { data, error } = await supabase.rpc("apply_review", {
    _student_id: i.student_id,
    _surah_name: i.surah_name,
    _from_ayah: i.from_ayah,
    _to_ayah: i.to_ayah,
    _score: i.score,
  });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

/** يُستدعى مرة عند فتح التطبيق: يرسل المراجعات المحفوظة الآن وكلما عاد الاتصال. */
export const startSelfReviewSync = () => startReviewOutbox(sendReview);

/**
 * «أتقنتُها» (8.1): تمرّ بـ apply_review وحدها (القاعدة 4) كمراجعة ذاتية بدرجة 95،
 * فيُنشأ أو يُحدَّث كرت المراجعة المتباعدة للمقطع بالاسم نفسه الذي يستعمله التسميع.
 */
export async function markMastered(
  userId: string,
  surah: number,
  from: number,
  to: number,
  /** اسم الكرت كما هو مخزَّن (من طابور اليوم)، حتى لا يُنشأ كرت مكرّر بهمزة مختلفة. */
  surahName?: string,
): Promise<MasteredResult> {
  const name = surahName ?? SURAHS.find((s) => s.n === surah)?.name;
  if (!name) throw new Error("سورة غير معروفة.");
  const item: ReviewOutboxItem = {
    student_id: userId,
    surah_name: name,
    from_ayah: from,
    to_ayah: to,
    score: 95,
    queued_at: new Date().toISOString(),
  };
  try {
    return (await sendReview(item)) as MasteredResult;
  } catch (e) {
    // بلا اتصال: يُحفظ على الجهاز ويُرسل عند عودته، فلا يضيع جهد الطالب.
    if (!isNetworkError(e)) throw e;
    queueReview(item);
    return { queued: true };
  }
}
