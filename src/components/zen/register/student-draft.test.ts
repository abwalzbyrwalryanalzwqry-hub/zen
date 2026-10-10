import { describe, expect, it } from "vitest";
import type { DayStudent } from "@/lib/daily-record";
import { suggestion, workDraft } from "./student-draft";

const student = (p: Partial<DayStudent> = {}): DayStudent => ({
  student_id: "s1",
  name: "أحمد",
  avatar: null,
  status: null,
  reason: null,
  version: 0,
  note: null,
  evaluation: null,
  memorize: null,
  review: null,
  last_memorize: null,
  last_review: null,
  absences_30d: 0,
  ...p,
});

describe("التكملة من آخر تسجيل (1.35.0)", () => {
  it("يبدأ بعد آخر آية سجّلها المعلّم في السورة نفسها، والنهاية للمعلّم", () => {
    const s = student({
      last_memorize: { surah_name: "النجم", from_ayah: 1, to_ayah: 39, session_date: "2026-10-07" },
    });
    expect(suggestion(s, "memorize", "forward")).toEqual({
      fromSurah: 53,
      fromAyah: 40,
      toSurah: 53,
    });
  });

  it("آخر تسجيل سورة كاملة: يبدأ من أول السورة التالية دون أن يملأها كلها (الخطأ المبلَّغ عنه)", () => {
    // بيانات الإنتاج: حفظ «ق 1–45» ومراجعة «الواقعة 1–96» في اتجاه من الناس صعوداً.
    const s = student({
      last_memorize: { surah_name: "ق", from_ayah: 1, to_ayah: 45, session_date: "2026-10-07" },
      last_review: { surah_name: "الواقعة", from_ayah: 1, to_ayah: 96, session_date: "2026-10-07" },
      memorize_dir: "backward",
      review_dir: "backward",
    });
    expect(suggestion(s, "memorize", "backward")).toEqual({
      fromSurah: 49,
      fromAyah: 1,
      toSurah: 49,
    });
    expect(suggestion(s, "review", "backward")).toEqual({
      fromSurah: 55,
      fromAyah: 1,
      toSurah: 55,
    });
    expect(suggestion(s, "memorize", "backward").toAyah).toBeUndefined();
  });

  it("المراجعة تتبع آخر مراجعة لا آخر حفظ، وما سُجّل اليوم يبقى كما هو", () => {
    const s = student({
      last_memorize: { surah_name: "الملك", from_ayah: 1, to_ayah: 10, session_date: "2026-10-07" },
      last_review: { surah_name: "البقرة", from_ayah: 1, to_ayah: 100, session_date: "2026-10-07" },
    });
    expect(suggestion(s, "review", "forward")).toEqual({ fromSurah: 2, fromAyah: 101, toSurah: 2 });
    const today = student({
      last_memorize: { surah_name: "الملك", from_ayah: 1, to_ayah: 10, session_date: "2026-10-07" },
      memorize: {
        segments: [{ surah_name: "الملك", from_ayah: 11, to_ayah: 20 }],
        score: 5,
        error_type: null,
        notes: null,
      },
    });
    expect(workDraft(today, "memorize").range).toEqual({
      fromSurah: 67,
      fromAyah: 11,
      toSurah: 67,
      toAyah: 20,
    });
  });

  it("بلا تسجيل سابق: لا اقتراح (أو أول الناس في الاتجاه العكسي)", () => {
    expect(suggestion(student(), "memorize", "forward")).toEqual({});
    expect(suggestion(student(), "memorize", "backward")).toEqual({
      fromSurah: 114,
      fromAyah: 1,
      toSurah: 114,
    });
  });
});
