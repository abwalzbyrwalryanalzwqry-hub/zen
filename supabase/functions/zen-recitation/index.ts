// دالة Supabase Edge لتحليل التسميع (المرحلة 6.2): تفريغ التلاوة (transcribe) وملاحظات المعلّم الآلي
// (coach) وتفريغ مقاطع التسميع المباشر (transcribe_chunk، 8.4). تخدم الويب ونسخة Android بمسار واحد. المنطق في `_shared/recitation-core.ts`
// (نسخة مطابقة من `src/lib/recitation-core.ts`).
//
// النشر: supabase functions deploy zen-recitation
// الأسرار: LOVABLE_API_KEY أو OPENAI_API_KEY أو GEMINI_API_KEY (مثل zen-ai).
import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import { chatCompleteWith, type ChatMessage } from "../_shared/ai-core.ts";
import { checkAiAccess } from "../_shared/ai-access.ts";
import { BODY_LIMITS, BodyTooLargeError, readJsonLimited } from "../_shared/edge-http.ts";
import {
  RecitationError,
  runCoach,
  runTranscribe,
  runTranscribeChunk,
  verifyQuran,
  type QuranData,
  type RecitationDeps,
  type RecitationSession,
} from "../_shared/recitation-core.ts";
import quranRaw from "../_shared/quran-uthmani.json" with { type: "json" };
import integrity from "../_shared/quran-integrity.json" with { type: "json" };

declare const Deno: {
  env: { toObject(): Record<string, string> };
  serve(h: (req: Request) => Response | Promise<Response>): void;
};

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

let quran: Promise<QuranData> | null = null;
const SESSION_COLUMNS =
  "id, student_id, audio_path, surah_name, from_ayah, to_ayah, transcript, ai_score, ai_analysis";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST فقط" }, 405);
  const env = Deno.env.toObject();
  const userClient = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: u } = await userClient.auth.getUser();
  if (!u?.user) return json({ error: "سجّل الدخول لتحليل التسميع." }, 401);
  const userId = u.user.id;
  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  let body: {
    action?: string;
    sessionId?: unknown;
    audio?: unknown;
    format?: unknown;
  };
  try {
    body = (await readJsonLimited(req, BODY_LIMITS.recitation)) as {
      action?: string;
      sessionId?: unknown;
      audio?: unknown;
      format?: unknown;
    };
  } catch (e) {
    if (e instanceof BodyTooLargeError) return json({ error: e.message }, 413);
    throw e;
  }

  // N-05: التحليل الآلي خلف مفتاح `recite_ai` (مطفأ حتى اجتياز بوابة التقييم). موافقة الصوت تبقى كما هي.
  const denied = await checkAiAccess((fn, args) => admin.rpc(fn, args), userId, "recite_ai");
  if (denied) return json({ error: denied.message, code: denied.code }, denied.status);

  const deps: RecitationDeps = {
    async loadSession(id) {
      const { data, error } = await admin
        .from("recitation_sessions")
        .select(SESSION_COLUMNS)
        .eq("id", id)
        .maybeSingle();
      if (error) throw new RecitationError("تعذّر قراءة جلسة التسميع.", 502);
      return data as RecitationSession | null;
    },
    async teachesStudent(teacher, student) {
      const { data, error } = await admin.rpc("teaches_student", {
        _teacher: teacher,
        _student: student,
      });
      if (error) throw new RecitationError("تعذّر التحقق من الصلاحية.", 502);
      return data === true;
    },
    async hasAudioConsent(user) {
      const { data, error } = await admin.rpc("has_recitation_ai_consent", { _user: user });
      if (error) throw new RecitationError("تعذّر التحقق من الموافقة.", 502);
      return data === true;
    },
    async downloadAudio(path) {
      const { data, error } = await admin.storage.from("recitations").download(path);
      return error || !data ? null : new Uint8Array(await data.arrayBuffer());
    },
    async consumeQuota(user, feature, daily, minute) {
      const { data, error } = await admin.rpc("consume_ai_quota", {
        _user_id: user,
        _feature: feature,
        _daily_limit: daily,
        _minute_limit: minute,
      });
      // فشل التحقق من الحصة لا يفتح الباب.
      if (error) throw new RecitationError("تعذّر التحقق من حصة الاستخدام.", 502);
      return data as { allowed: boolean; reason?: string | null };
    },
    async refundQuota(user, feature) {
      await admin.rpc("refund_ai_quota", { _user_id: user, _feature: feature });
    },
    async complete(messages) {
      return (await chatCompleteWith(messages as ChatMessage[], env, { timeoutMs: 90_000 })).text;
    },
    async save(id, patch) {
      const { error } = await admin.from("recitation_sessions").update(patch).eq("id", id);
      if (error) throw new RecitationError("تعذّر حفظ نتيجة التحليل.", 502);
    },
    quran() {
      quran ??= verifyQuran(
        quranRaw as unknown as QuranData,
        (integrity as { sha256: string }).sha256,
      );
      return quran;
    },
  };

  try {
    if (body.action === "transcribe")
      return json(await runTranscribe(deps, userId, body.sessionId));
    if (body.action === "coach") return json(await runCoach(deps, userId, body.sessionId));
    // التسميع المباشر (8.4): مقطع 5–8 ثوانٍ، نص فقط، والمطابقة على الجهاز.
    if (body.action === "transcribe_chunk")
      return json(await runTranscribeChunk(deps, userId, body));
    return json({ error: "إجراء غير معروف." }, 400);
  } catch (e) {
    if (e instanceof RecitationError) return json({ error: e.message }, e.status);
    console.error("[zen-recitation]", e);
    return json({ error: "تعذّر تحليل التلاوة الآن. أعد المحاولة بعد قليل." }, 502);
  }
});
