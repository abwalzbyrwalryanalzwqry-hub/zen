/**
 * صندوق إرسال المراجعات الذاتية (M8). «أتقنتُها» و«راجعتها» تمرّ بـ apply_review (القاعدة 4)،
 * وكانت تفشل بلا اتصال فيضيع جهد الطالب. الآن يُحفظ الطلب على الجهاز ويُرسل عند عودة الاتصال.
 *
 *  - مفتاح المقطع (الطالب، السورة، من، إلى): آخر طلب للمقطع يستبدل السابق، فلا تُطبَّق مراجعة
 *    المقطع نفسه مرتين عند إعادة الإرسال.
 *  - يُحذف الطلب بعد قبول الخادم، ويبقى إن فشلت الشبكة، ويُسقط (مع سببه) إن رفضه الخادم.
 *  - طلبات أقدم من 14 يوماً تُسقط: جدول المراجعة يكون قد تغيّر كثيراً.
 * سجل الحلقة للمعلّم له صندوقه الخاص (halaqa-register.ts).
 */
import { onNetworkChange, isOnline } from "@/lib/network";

export type ReviewOutboxItem = {
  student_id: string;
  surah_name: string;
  from_ayah: number;
  to_ayah: number;
  score: number;
  queued_at: string;
};

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export const REVIEW_OUTBOX_KEY = "zen.review.outbox.v1";
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

function store(): Store | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

const keyOf = (i: ReviewOutboxItem) =>
  `${i.student_id}|${i.surah_name}|${i.from_ayah}|${i.to_ayah}`;

export function readReviewOutbox(s: Store | null = store()): ReviewOutboxItem[] {
  if (!s) return [];
  try {
    const v = JSON.parse(s.getItem(REVIEW_OUTBOX_KEY) ?? "[]") as ReviewOutboxItem[];
    return Array.isArray(v)
      ? v.filter(
          (x) =>
            x &&
            typeof x.student_id === "string" &&
            typeof x.surah_name === "string" &&
            Number.isInteger(x.from_ayah) &&
            Number.isInteger(x.to_ayah) &&
            typeof x.score === "number",
        )
      : [];
  } catch {
    return [];
  }
}

function write(items: ReviewOutboxItem[], s: Store | null) {
  if (!s) return;
  if (items.length) s.setItem(REVIEW_OUTBOX_KEY, JSON.stringify(items));
  else s.removeItem(REVIEW_OUTBOX_KEY);
  if (typeof window !== "undefined") window.dispatchEvent(new Event("zen:review-outbox"));
}

export function queueReview(item: ReviewOutboxItem, s: Store | null = store()) {
  const rest = readReviewOutbox(s).filter((x) => keyOf(x) !== keyOf(item));
  write([...rest, item], s);
}

export function errorText(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e)
    return String((e as { message: unknown }).message);
  return String(e);
}

export const isNetworkError = (e: unknown) =>
  !isOnline() || /fetch|network|offline|timeout|اتصال/i.test(errorText(e));

export type Sender = (i: ReviewOutboxItem) => Promise<unknown>;

/** يرسل المعلّق بالترتيب. */
export async function flushReviewOutbox(
  send: Sender,
  s: Store | null = store(),
  now = Date.now(),
): Promise<{
  sent: number;
  kept: number;
  dropped: Array<{ item: ReviewOutboxItem; message: string }>;
}> {
  const keep: ReviewOutboxItem[] = [];
  const dropped: Array<{ item: ReviewOutboxItem; message: string }> = [];
  let sent = 0;
  for (const item of readReviewOutbox(s)) {
    if (now - Date.parse(item.queued_at) > MAX_AGE_MS) {
      dropped.push({ item, message: "EXPIRED" });
      continue;
    }
    try {
      await send(item);
      sent++;
    } catch (e) {
      if (isNetworkError(e)) keep.push(item);
      else dropped.push({ item, message: errorText(e) });
    }
  }
  write(keep, s);
  return { sent, kept: keep.length, dropped };
}

let flushing: Promise<unknown> | null = null;

/** يرسل الصندوق عند بدء التطبيق وكلما عاد الاتصال. */
export function startReviewOutbox(send: Sender): () => void {
  const run = () => {
    if (flushing || !isOnline() || !readReviewOutbox().length) return;
    flushing = flushReviewOutbox(send).finally(() => {
      flushing = null;
    });
  };
  run();
  return onNetworkChange((online) => {
    if (online) run();
  });
}
