/**
 * منطق تحليل التسميع (المرحلة 6.2): تفريغ التلاوة ثم ملاحظات المعلّم الآلي. يعمل في دالة Edge
 * «zen-recitation» فيخدم الويب ونسخة Android بمسار واحد. نسخة مطابقة حرفياً في
 * `supabase/functions/_shared/recitation-core.ts` (يفحصها `scripts/check-shared-mirror.mjs`).
 *
 * - الصلاحية: صاحب الجلسة أو معلّمه (`teaches_student`) فقط.
 * - الموافقة (تدقيق أكتوبر 2026، P0-05): لا يُرسل صوت ولا تفريغ إلى المزوّد إلا بموافقة صاحب الصوت
 *   (`has_recitation_ai_consent`)، حتى لو طلب المعلّم التحليل.
 * - النص المرجعي من المتن المحلي الموثَّق (SHA-256)، لا من العميل ولا من النموذج (HANDOFF القاعدة 1).
 * - الدرجة تُحسب هنا بمقارنة الكلمات (`summarizeDiff`) لا بحكم النموذج (القاعدة 29).
 */
import { summarizeDiff } from "./tajweed-diff.ts";
import { findSurah } from "./quran-meta.ts";

export type QuranData = {
  edition: string;
  totalAyahs: number;
  juzStarts: [number, number][];
  surahs: { n: number; name: string; ayahs: string[] }[];
};

export type RecitationSession = {
  id: string;
  student_id: string;
  audio_path: string | null;
  surah_name: string;
  from_ayah: number;
  to_ayah: number;
  transcript: string | null;
  ai_score: number | null;
  ai_analysis: { weakSpots?: string[]; coach?: string; analyzed_at?: string } | null;
};

export type RecitationMessage = { role: "system" | "user"; content: unknown };

export type RecitationFeature = "transcribe" | "coach" | "live_recite";

export interface RecitationDeps {
  loadSession(id: string): Promise<RecitationSession | null>;
  teachesStudent(teacher: string, student: string): Promise<boolean>;
  /** موافقة صاحب الصوت على التحليل الآلي. أي خطأ في التحقق يُرمى = رفض. */
  hasAudioConsent(user: string): Promise<boolean>;
  downloadAudio(path: string): Promise<Uint8Array | null>;
  consumeQuota(
    user: string,
    feature: RecitationFeature,
    daily: number,
    minute: number,
  ): Promise<{ allowed: boolean; reason?: string | null }>;
  refundQuota(user: string, feature: RecitationFeature): Promise<void>;
  complete(messages: RecitationMessage[]): Promise<string>;
  save(id: string, patch: Partial<RecitationSession>): Promise<void>;
  quran(): Promise<QuranData>;
}

/** خطأ برسالة عربية تُعرض للمستخدم ورمز HTTP. */
export class RecitationError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export const RECITATION_LIMITS = { transcribe: 40, coach: 40, minute: 8 } as const;
/**
 * التسميع المباشر (8.4): مقاطع 5–8 ثوانٍ. حدّ الدقيقة 12 مقطعاً (≈ دقيقة متصلة)،
 * والحدّ اليومي 450 مقطعاً (≈ 45 دقيقة تلاوة).
 */
export const LIVE_LIMITS = { daily: 450, minute: 12, maxBytes: 400 * 1024 } as const;
export const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** يرفض المتن إن اختلفت بصمته عن البيان الموثَّق. */
export async function verifyQuran(data: QuranData, expectedSha256: string): Promise<QuranData> {
  if ((await sha256Hex(JSON.stringify(data))) !== expectedSha256)
    throw new RecitationError("تعذّر التحقق من سلامة نص المصحف.", 500);
  return data;
}

/** النص المرجعي لمقطع: يقصّ النطاق على عدد آيات السورة. */
export function referenceFrom(
  data: QuranData,
  surahName: string,
  fromAyah: number,
  toAyah: number,
) {
  const meta = findSurah(surahName);
  if (!meta) throw new RecitationError("لم يُتعرَّف على السورة.");
  const from = Math.max(1, Math.min(fromAyah, meta.ayahs));
  const to = Math.max(from, Math.min(toAyah, meta.ayahs));
  const ayat = data.surahs.find((s) => s.n === meta.n)?.ayahs.slice(from - 1, to) ?? [];
  if (ayat.length === 0) throw new RecitationError("نطاق الآيات غير صالح.");
  return { text: ayat.join(" "), label: `سورة ${meta.name} [${from}–${to}]` };
}

export function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function audioFormat(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "webm";
  return ["webm", "ogg", "mp3", "m4a", "wav"].includes(ext) ? ext : "webm";
}

/** رسالتا رفض التحليل بلا موافقة (403): للطالب نفسه، وللمعلّم الذي يحلّل تسجيل طالبه. */
export const CONSENT_REQUIRED_SELF =
  "التحليل الآلي يرسل صوتك إلى خدمة ذكاء اصطناعي خارجية، ويحتاج موافقتك أولاً.";
export const CONSENT_REQUIRED_STUDENT =
  "لم يوافق الطالب على التحليل الآلي لتسجيلاته. استمع إلى التسجيل وقيّمه يدوياً.";

async function requireConsent(deps: RecitationDeps, owner: string, caller: string) {
  // خطأ التحقق نفسه يُرمى (502) فلا يمرّ شيء دون إجابة صريحة بنعم.
  if (!(await deps.hasAudioConsent(owner)))
    throw new RecitationError(
      owner === caller ? CONSENT_REQUIRED_SELF : CONSENT_REQUIRED_STUDENT,
      403,
    );
}

async function authorize(deps: RecitationDeps, userId: string, sessionId: unknown) {
  if (typeof sessionId !== "string" || !UUID.test(sessionId))
    throw new RecitationError("معرّف جلسة التسميع غير صالح.");
  const session = await deps.loadSession(sessionId);
  if (!session) throw new RecitationError("جلسة التسميع غير موجودة.", 404);
  if (session.student_id !== userId && !(await deps.teachesStudent(userId, session.student_id)))
    throw new RecitationError("لا تملك صلاحية تحليل هذا التسميع.", 403);
  await requireConsent(deps, session.student_id, userId);
  return session;
}

async function withQuota<T>(
  deps: RecitationDeps,
  userId: string,
  feature: RecitationFeature,
  run: () => Promise<T>,
): Promise<T> {
  const live = feature === "live_recite";
  const q = await deps.consumeQuota(
    userId,
    feature,
    live ? LIVE_LIMITS.daily : RECITATION_LIMITS[feature as "transcribe" | "coach"],
    live ? LIVE_LIMITS.minute : RECITATION_LIMITS.minute,
  );
  if (!q.allowed)
    throw new RecitationError(
      q.reason === "minute"
        ? "طلبات كثيرة في وقت قصير. انتظر قليلاً ثم أعد المحاولة."
        : "بلغت حدّ الاستخدام اليومي لتحليل التسميع. عد غداً.",
      429,
    );
  try {
    return await run();
  } catch (e) {
    // فشل النموذج أو التخزين لا يستهلك حصة المستخدم.
    await deps.refundQuota(userId, feature).catch(() => undefined);
    throw e;
  }
}

export type TranscribeResult = {
  transcript: string;
  reference: string;
  label: string;
  score: number;
  weakSpots: string[];
};

/** يفرّغ تسجيل الجلسة ويحسب الدرجة ومواضع الضعف ويحفظها. */
export async function runTranscribe(
  deps: RecitationDeps,
  userId: string,
  sessionId: unknown,
): Promise<TranscribeResult> {
  const session = await authorize(deps, userId, sessionId);
  if (!session.audio_path) throw new RecitationError("لا يوجد تسجيل صوتي في هذه الجلسة.");
  const reference = referenceFrom(
    await deps.quran(),
    session.surah_name,
    session.from_ayah,
    session.to_ayah,
  );
  return withQuota(deps, userId, "transcribe", async () => {
    const audio = await deps.downloadAudio(session.audio_path as string);
    if (!audio) throw new RecitationError("تعذّر تحميل التسجيل من التخزين.", 502);
    if (audio.byteLength === 0) throw new RecitationError("التسجيل الصوتي فارغ.");
    if (audio.byteLength > MAX_AUDIO_BYTES)
      throw new RecitationError("التسجيل أكبر من 8 ميغابايت، سجّل مقطعاً أقصر.");

    const transcript = (
      await deps.complete([
        {
          role: "system",
          content:
            "أنت نظام تفريغ صوتي للتلاوة القرآنية. اكتب حرفياً ما نطقه القارئ فقط، بدون تشكيل وبدون أي شرح أو ترقيم أو أرقام آيات. لا تُصحّح الأخطاء ولا تُكمل ما لم يُنطق. إن لم تسمع كلاماً واضحاً فاكتب: لا يوجد كلام واضح.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              // تفريغ أعمى (تدقيق أكتوبر 2026، P1-06): لا يُعطى النموذج النص الصحيح، وإلا مال إلى كتابته فأخفى
              // أخطاء الطالب. المقارنة بالنص المرجعي بعد التفريغ في summarizeDiff على الخادم، كالتسميع المباشر.
              text: "فرّغ هذا التسجيل حرفياً كما نُطق، ولو خالف ما تتوقعه من نص القرآن.",
            },
            {
              type: "input_audio",
              input_audio: {
                data: toBase64(audio),
                format: audioFormat(session.audio_path as string),
              },
            },
          ],
        },
      ])
    ).trim();

    const diff = summarizeDiff(reference.text, transcript);
    await deps.save(session.id, {
      transcript,
      ai_score: diff.score,
      ai_analysis: { weakSpots: diff.weakSpots, analyzed_at: new Date().toISOString() },
    });
    return {
      transcript,
      reference: reference.text,
      label: reference.label,
      score: diff.score,
      weakSpots: diff.weakSpots,
    };
  });
}

/** ملاحظات تدريب من نتيجة التفريغ المحفوظة؛ المدخلات كلها من قاعدة البيانات لا من العميل. */
export async function runCoach(
  deps: RecitationDeps,
  userId: string,
  sessionId: unknown,
): Promise<{ text: string }> {
  const session = await authorize(deps, userId, sessionId);
  if (session.transcript == null || session.ai_score == null)
    throw new RecitationError("حلّل التلاوة أولاً.");
  const reference = referenceFrom(
    await deps.quran(),
    session.surah_name,
    session.from_ayah,
    session.to_ayah,
  );
  const weakSpots = session.ai_analysis?.weakSpots ?? [];
  return withQuota(deps, userId, "coach", async () => {
    const text = (
      await deps.complete([
        {
          role: "system",
          content:
            "أنت معلم تجويد. حلّل الفرق بين النص القرآني الصحيح وما نطقه الطالب، وقدّم بالعربية: سطر تقييم موجز، ثم قائمة قصيرة بمواضع الخطأ مع التصحيح، ثم تمرينين عمليين للتدريب. لا تتجاوز ٨ أسطر ولا تُصدر أحكاماً قاسية.",
        },
        {
          role: "user",
          content: `المقطع: ${reference.label}\nالنص الصحيح: ${reference.text.slice(0, 2000)}\nما نطقه الطالب: ${(session.transcript as string).slice(0, 2000)}\nدرجة التطابق الآلية: ${session.ai_score}/100\nمواضع الاختلاف: ${weakSpots.join(" | ") || "لا شيء"}`,
        },
      ])
    ).trim();
    const coach = text || "تعذّر توليد الملاحظات الآن.";
    await deps.save(session.id, { ai_analysis: { ...(session.ai_analysis ?? {}), coach } });
    return { text: coach };
  });
}

export type ChunkResult = { text: string };

const CHUNK_FORMATS = ["webm", "ogg", "mp3", "m4a", "wav"];

/**
 * تفريغ مقطع قصير من التسميع المباشر (8.4). «النموذج يسمع، والمطابقة تحكم»: يعيد نصاً فقط،
 * ولا يُعطى النص المرجعي كي لا ينسخه؛ المحاذاة على الجهاز (`src/lib/quran/align.ts`).
 * لا يُخزَّن الصوت ولا النص على الخادم.
 */
export async function runTranscribeChunk(
  deps: RecitationDeps,
  userId: string,
  input: { audio?: unknown; format?: unknown },
): Promise<ChunkResult> {
  if (typeof input.audio !== "string" || !input.audio)
    throw new RecitationError("المقطع الصوتي مفقود.");
  // المقطع صوت المتصل نفسه دائماً.
  await requireConsent(deps, userId, userId);
  const format =
    typeof input.format === "string" && CHUNK_FORMATS.includes(input.format)
      ? input.format
      : "webm";
  // طول base64 ≈ 4/3 من البايتات.
  if (input.audio.length > Math.ceil((LIVE_LIMITS.maxBytes * 4) / 3) + 4)
    throw new RecitationError("المقطع أطول من المسموح (8 ثوانٍ تقريباً).", 413);
  const audio = input.audio;
  return withQuota(deps, userId, "live_recite", async () => {
    const text = (
      await deps.complete([
        {
          role: "system",
          content:
            "أنت نظام تفريغ صوتي لمقطع قصير من تلاوة قرآنية. اكتب حرفياً ما نُطق فقط، بدون تشكيل ولا ترقيم ولا شرح. لا تُصحّح ولا تُكمل. إن لم تسمع كلاماً فأعد نصاً فارغاً.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: "فرّغ هذا المقطع حرفياً." },
            { type: "input_audio", input_audio: { data: audio, format } },
          ],
        },
      ])
    ).trim();
    return {
      text: /لا يوجد كلام/.test(text)
        ? ""
        : text
            .replace(/[^\u0621-\u0652\s]/g, " ")
            .replace(/\s+/g, " ")
            .trim(),
    };
  });
}
