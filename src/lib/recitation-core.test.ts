import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import raw from "@/data/quran-uthmani.json";
import manifest from "@/data/quran-integrity.json";
import {
  CONSENT_REQUIRED_SELF,
  CONSENT_REQUIRED_STUDENT,
  RecitationError,
  audioFormat,
  referenceFrom,
  runCoach,
  runTranscribe,
  runTranscribeChunk,
  LIVE_LIMITS,
  toBase64,
  verifyQuran,
  type QuranData,
  type RecitationDeps,
  type RecitationMessage,
  type RecitationSession,
} from "./recitation-core";
import { MIRRORS } from "../../scripts/check-shared-mirror.mjs";

const DATA = raw as unknown as QuranData;
const SID = "aaaaaaaa-0000-4000-8000-000000000001";
const STUDENT = "s-1";
const IKHLAS = referenceFrom(DATA, "الإخلاص", 1, 4).text;

function fakeDeps(
  over: Partial<RecitationSession> = {},
  opts: { allowed?: boolean; teaches?: boolean; consent?: boolean } = {},
) {
  const session: RecitationSession = {
    id: SID,
    student_id: STUDENT,
    audio_path: `${STUDENT}/x.m4a`,
    surah_name: "الإخلاص",
    from_ayah: 1,
    to_ayah: 4,
    transcript: null,
    ai_score: null,
    ai_analysis: null,
    ...over,
  };
  const saved: Partial<RecitationSession>[] = [];
  const deps = {
    loadSession: vi.fn(async (id: string) => (id === SID ? session : null)),
    teachesStudent: vi.fn(async () => opts.teaches ?? false),
    hasAudioConsent: vi.fn(async () => opts.consent ?? true),
    downloadAudio: vi.fn(async () => new Uint8Array([1, 2, 3])),
    consumeQuota: vi.fn(async () => ({ allowed: opts.allowed ?? true, reason: "daily" })),
    refundQuota: vi.fn(async () => undefined),
    complete: vi.fn(async (_m: RecitationMessage[]) => IKHLAS),
    save: vi.fn(async (_id: string, p: Partial<RecitationSession>) => void saved.push(p)),
    quran: vi.fn(async () => DATA),
  } satisfies RecitationDeps;
  return { deps, saved };
}

describe("تحليل التسميع في Edge (المرحلة 6.2)", () => {
  it("المتن الموثَّق يمر، والمعدَّل يُرفض", async () => {
    await expect(verifyQuran(DATA, manifest.sha256)).resolves.toBe(DATA);
    const bad = { ...DATA, totalAyahs: 1 };
    await expect(verifyQuran(bad, manifest.sha256)).rejects.toThrow("سلامة");
  });

  it("النص المرجعي يقصّ النطاق ويرفض السورة المجهولة", () => {
    expect(referenceFrom(DATA, "سورة الإخلاص", 3, 99).label).toBe("سورة الإخلاص [3–4]");
    expect(referenceFrom(DATA, "الفاتحة", 1, 7).text.split(" ").length).toBeGreaterThan(25);
    expect(() => referenceFrom(DATA, "غير موجودة", 1, 1)).toThrow(RecitationError);
  });

  it("صاحب الجلسة يفرّغ: الدرجة من المقارنة وتُحفظ", async () => {
    const { deps, saved } = fakeDeps();
    const r = await runTranscribe(deps, STUDENT, SID);
    expect(r.score).toBe(100);
    expect(r.label).toBe("سورة الإخلاص [1–4]");
    expect(saved[0]).toMatchObject({ transcript: IKHLAS, ai_score: 100 });
    const msg = deps.complete.mock.calls[0][0][1].content as {
      type: string;
      input_audio?: unknown;
    }[];
    expect(msg[1]).toEqual({ type: "input_audio", input_audio: { data: "AQID", format: "m4a" } });
  });

  it("غير صاحب الجلسة ولا معلّمه يُرفض قبل أي حصة", async () => {
    const { deps } = fakeDeps();
    await expect(runTranscribe(deps, "stranger", SID)).rejects.toMatchObject({ status: 403 });
    expect(deps.consumeQuota).not.toHaveBeenCalled();
    const t = fakeDeps({}, { teaches: true });
    await expect(runTranscribe(t.deps, "teacher", SID)).resolves.toMatchObject({ score: 100 });
    expect(t.deps.teachesStudent).toHaveBeenCalledWith("teacher", STUDENT);
  });

  it("معرّف غير صالح، وجلسة غير موجودة، وبلا تسجيل", async () => {
    const { deps } = fakeDeps();
    await expect(runTranscribe(deps, STUDENT, "x")).rejects.toThrow("غير صالح");
    await expect(runTranscribe(deps, STUDENT, SID.replace("1", "2"))).rejects.toMatchObject({
      status: 404,
    });
    const n = fakeDeps({ audio_path: null });
    await expect(runTranscribe(n.deps, STUDENT, SID)).rejects.toThrow("تسجيل");
  });

  it("الحصة: الرفض 429، وفشل النموذج يعيدها", async () => {
    const q = fakeDeps({}, { allowed: false });
    await expect(runTranscribe(q.deps, STUDENT, SID)).rejects.toMatchObject({ status: 429 });
    const f = fakeDeps();
    f.deps.complete.mockRejectedValueOnce(new Error("down"));
    await expect(runTranscribe(f.deps, STUDENT, SID)).rejects.toThrow("down");
    expect(f.deps.refundQuota).toHaveBeenCalledWith(STUDENT, "transcribe");
    expect(f.deps.save).not.toHaveBeenCalled();
  });

  it("التسجيل الكبير يُرفض وتُعاد الحصة", async () => {
    const { deps } = fakeDeps();
    deps.downloadAudio.mockResolvedValueOnce(new Uint8Array(8 * 1024 * 1024 + 1));
    await expect(runTranscribe(deps, STUDENT, SID)).rejects.toThrow("8 ميغابايت");
    expect(deps.refundQuota).toHaveBeenCalled();
  });

  it("الملاحظات تحتاج تفريغاً سابقاً وتحفظ مع التحليل", async () => {
    const before = fakeDeps();
    await expect(runCoach(before.deps, STUDENT, SID)).rejects.toThrow("حلّل التلاوة أولاً");
    const { deps, saved } = fakeDeps({
      transcript: "قل هو الله احد",
      ai_score: 40,
      ai_analysis: { weakSpots: ["الله الصمد"] },
    });
    deps.complete.mockResolvedValueOnce("  أحسنت  ");
    await expect(runCoach(deps, STUDENT, SID)).resolves.toEqual({ text: "أحسنت" });
    expect(saved[0]).toEqual({ ai_analysis: { weakSpots: ["الله الصمد"], coach: "أحسنت" } });
    expect(deps.consumeQuota).toHaveBeenCalledWith(STUDENT, "coach", 40, 8);
  });

  it("أدوات مساعدة", () => {
    expect(toBase64(new TextEncoder().encode("zen"))).toBe("emVu");
    expect(audioFormat("a/b.WAV")).toBe("wav");
    expect(audioFormat("a/b.xyz")).toBe("webm");
  });

  it("نسخ دوال Edge مطابقة حرفياً لأصولها", () => {
    for (const [src, copy] of MIRRORS)
      expect(readFileSync(copy, "utf8"), copy).toBe(readFileSync(src, "utf8"));
  });
});

describe("التسميع المباشر: transcribe_chunk (8.4)", () => {
  it("يعيد نصاً فقط، بلا النص المرجعي في الطلب، وبحصة live_recite", async () => {
    const { deps, saved } = fakeDeps();
    deps.complete.mockResolvedValueOnce("قل هو الله أحد ۝ (1)");
    const r = await runTranscribeChunk(deps, STUDENT, { audio: "AAAA", format: "webm" });
    expect(r).toEqual({ text: "قل هو الله أحد" });
    expect(deps.consumeQuota).toHaveBeenCalledWith(
      STUDENT,
      "live_recite",
      LIVE_LIMITS.daily,
      LIVE_LIMITS.minute,
    );
    const sent = JSON.stringify(deps.complete.mock.calls[0][0]);
    expect(sent).not.toContain("ٱللَّهُ");
    expect(sent).toContain('"format":"webm"');
    expect(saved).toEqual([]);
  });
  it("مقطع مفقود أو كبير يُرفض قبل استهلاك الحصة", async () => {
    const { deps } = fakeDeps();
    await expect(runTranscribeChunk(deps, STUDENT, {})).rejects.toThrow("مفقود");
    const big = "A".repeat(Math.ceil((LIVE_LIMITS.maxBytes * 4) / 3) + 100);
    await expect(runTranscribeChunk(deps, STUDENT, { audio: big })).rejects.toMatchObject({
      status: 413,
    });
    expect(deps.consumeQuota).not.toHaveBeenCalled();
  });
  it("الحصة المستنفدة 429، وفشل النموذج يستردّ المقطع، والصمت نص فارغ", async () => {
    const a = fakeDeps({}, { allowed: false });
    await expect(runTranscribeChunk(a.deps, STUDENT, { audio: "AAAA" })).rejects.toMatchObject({
      status: 429,
    });
    const b = fakeDeps();
    b.deps.complete.mockRejectedValueOnce(new Error("down"));
    await expect(runTranscribeChunk(b.deps, STUDENT, { audio: "AAAA" })).rejects.toThrow("down");
    expect(b.deps.refundQuota).toHaveBeenCalledWith(STUDENT, "live_recite");
    const c = fakeDeps();
    c.deps.complete.mockResolvedValueOnce("لا يوجد كلام واضح");
    await expect(
      runTranscribeChunk(c.deps, STUDENT, { audio: "AAAA", format: "exe" }),
    ).resolves.toEqual({ text: "" });
    expect(JSON.stringify(c.deps.complete.mock.calls[0][0])).toContain('"format":"webm"');
  });
});

describe("موافقة التحليل الآلي للصوت (تدقيق أكتوبر 2026، P0-05)", () => {
  it("بلا موافقة: لا تحميل صوت ولا حصة ولا نموذج، و403 برسالة الطالب", async () => {
    const { deps } = fakeDeps({}, { consent: false });
    const e = await runTranscribe(deps, STUDENT, SID).catch((x) => x);
    expect(e).toBeInstanceOf(RecitationError);
    expect(e.status).toBe(403);
    expect(e.message).toBe(CONSENT_REQUIRED_SELF);
    expect(deps.hasAudioConsent).toHaveBeenCalledWith(STUDENT);
    expect(deps.downloadAudio).not.toHaveBeenCalled();
    expect(deps.consumeQuota).not.toHaveBeenCalled();
    expect(deps.complete).not.toHaveBeenCalled();
  });

  it("المعلّم يحتاج موافقة الطالب لا موافقته هو", async () => {
    const { deps } = fakeDeps({}, { consent: false, teaches: true });
    const e = await runTranscribe(deps, "teacher", SID).catch((x) => x);
    expect(e.status).toBe(403);
    expect(e.message).toBe(CONSENT_REQUIRED_STUDENT);
    expect(deps.hasAudioConsent).toHaveBeenCalledWith(STUDENT);
    expect(deps.complete).not.toHaveBeenCalled();
  });

  it("الملاحظات (تُرسل التفريغ) تحتاج الموافقة كذلك", async () => {
    const { deps } = fakeDeps({ transcript: IKHLAS, ai_score: 100 }, { consent: false });
    await expect(runCoach(deps, STUDENT, SID)).rejects.toMatchObject({ status: 403 });
    expect(deps.complete).not.toHaveBeenCalled();
  });

  it("مقطع التسميع المباشر يحتاج موافقة المتصل قبل الحصة", async () => {
    const { deps } = fakeDeps({}, { consent: false });
    await expect(
      runTranscribeChunk(deps, STUDENT, { audio: "AQID", format: "webm" }),
    ).rejects.toMatchObject({ status: 403 });
    expect(deps.hasAudioConsent).toHaveBeenCalledWith(STUDENT);
    expect(deps.consumeQuota).not.toHaveBeenCalled();
  });

  it("فشل التحقق من الموافقة يُغلق الباب", async () => {
    const { deps } = fakeDeps();
    deps.hasAudioConsent.mockRejectedValueOnce(
      new RecitationError("تعذّر التحقق من الموافقة.", 502),
    );
    await expect(runTranscribe(deps, STUDENT, SID)).rejects.toMatchObject({ status: 502 });
    expect(deps.complete).not.toHaveBeenCalled();
  });

  it("دالة Edge تسأل قاعدة البيانات بدالة الخادم", () => {
    const edge = readFileSync("supabase/functions/zen-recitation/index.ts", "utf8");
    expect(edge).toContain('admin.rpc("has_recitation_ai_consent"');
  });
});

describe("تفريغ أعمى (تدقيق أكتوبر 2026، P1-06)", () => {
  it("طلب التفريغ لا يحوي نص الآيات، والمقارنة بعده بالنص الصحيح", async () => {
    const { deps } = fakeDeps();
    deps.complete.mockResolvedValueOnce("قل هو الله احد الله الصمد");
    const r = await runTranscribe(deps, STUDENT, SID);
    const sent = JSON.stringify(deps.complete.mock.calls[0][0]);
    // ولا كلمة واحدة من النص المرجعي المشكول (كل كلمات الإخلاص).
    for (const w of r.reference.split(" ")) expect(sent).not.toContain(w);
    expect(r.reference.split(" ").length).toBeGreaterThan(10);
    expect(r.score).toBeLessThan(100);
  });
});
