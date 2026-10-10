import { describe, expect, it } from "vitest";
import type { ProgressRow } from "@/lib/zen-api";
import { entryFeedbackPrompt, logSummary, weeklyPlanPrompt } from "./progress-report";

const row: ProgressRow = {
  id: "1",
  user_id: "u",
  surah_name: "الملك",
  from_ayah: 1,
  to_ayah: 10,
  memorization_type: "new",
  rating: 4,
  feedback: "أحسنت يا أحمد بن علي، رقم أبيك 777123456",
  notes: "حفظت مع أخي محمد في بيت جدي",
  reviewed_by: null,
  created_at: "2026-10-02T02:00:00Z",
  updated_at: "2026-10-02T02:00:00Z",
};

describe("مطالبات الحفظ بلا نص حرّ (تدقيق 1.7، القاعدة 29)", () => {
  it("لا ملاحظات الطالب ولا ملاحظة المعلّم في أي مطالبة", () => {
    for (const p of [entryFeedbackPrompt(row), logSummary([row]), weeklyPlanPrompt([row])]) {
      expect(p).not.toContain("أحمد");
      expect(p).not.toContain("777123456");
      expect(p).not.toContain("محمد");
      expect(p).toContain("الملك");
    }
  });
  it("التقييم الرقمي يبقى سياقاً", () => {
    expect(entryFeedbackPrompt(row)).toContain("4/5");
  });
});
