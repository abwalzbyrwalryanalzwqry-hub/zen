import { describe, expect, it } from "vitest";
import {
  REVIEW_OUTBOX_KEY,
  flushReviewOutbox,
  queueReview,
  readReviewOutbox,
  type ReviewOutboxItem,
} from "./review-outbox";

function mem() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    m,
  };
}

const item = (over: Partial<ReviewOutboxItem> = {}): ReviewOutboxItem => ({
  student_id: "u1",
  surah_name: "الملك",
  from_ayah: 1,
  to_ayah: 10,
  score: 95,
  queued_at: new Date().toISOString(),
  ...over,
});

describe("صندوق المراجعات الذاتية (M8)", () => {
  it("آخر طلب للمقطع نفسه يستبدل السابق فلا تُطبَّق المراجعة مرتين", () => {
    const s = mem();
    queueReview(item({ score: 80 }), s);
    queueReview(item({ score: 95 }), s);
    queueReview(item({ from_ayah: 11, to_ayah: 20 }), s);
    const all = readReviewOutbox(s);
    expect(all).toHaveLength(2);
    expect(all.find((x) => x.from_ayah === 1)!.score).toBe(95);
  });

  it("يرسل ويحذف، ويُبقي ما فشل بالشبكة، ويُسقط ما رفضه الخادم", async () => {
    const s = mem();
    queueReview(item({ surah_name: "أ" }), s);
    queueReview(item({ surah_name: "ب" }), s);
    queueReview(item({ surah_name: "ج" }), s);
    const r = await flushReviewOutbox(async (i) => {
      if (i.surah_name === "ب") throw new TypeError("Failed to fetch");
      if (i.surah_name === "ج") throw { message: "NOT_ALLOWED" };
    }, s);
    expect(r).toMatchObject({ sent: 1, kept: 1 });
    expect(r.dropped[0].message).toBe("NOT_ALLOWED");
    expect(readReviewOutbox(s).map((x) => x.surah_name)).toEqual(["ب"]);
  });

  it("يُسقط الطلبات الأقدم من 14 يوماً، ويمسح المفتاح عند الفراغ", async () => {
    const s = mem();
    queueReview(item({ queued_at: "2020-01-01T00:00:00Z" }), s);
    const r = await flushReviewOutbox(async () => undefined, s);
    expect(r.sent).toBe(0);
    expect(r.dropped[0].message).toBe("EXPIRED");
    expect(s.m.has(REVIEW_OUTBOX_KEY)).toBe(false);
  });

  it("يتجاهل البيانات التالفة", () => {
    const s = mem();
    s.setItem(REVIEW_OUTBOX_KEY, '[{"student_id":1},null,"x"]');
    expect(readReviewOutbox(s)).toEqual([]);
    s.setItem(REVIEW_OUTBOX_KEY, "{bad");
    expect(readReviewOutbox(s)).toEqual([]);
  });
});
