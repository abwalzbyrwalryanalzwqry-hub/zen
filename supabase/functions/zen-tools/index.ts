// دالة Supabase Edge لأدوات الذكاء المساعدة (المرحلة 6.3): ملخّص أسبوع الطالب للمعلّم
// (weekly_summary)، وتعليل خطة الحفظ (plan_rationale)، ومساعد المحاسبة (muhasaba_coach)،
// ومسودّات المعلّم (draft_week_plan، draft_guardian_note — المرحلة 12.3).
// المنطق في `_shared/tools-core.ts` (نسخة مطابقة من `src/lib/tools-core.ts`).
//
// النشر: supabase functions deploy zen-tools
// الأسرار: LOVABLE_API_KEY أو OPENAI_API_KEY أو GEMINI_API_KEY (مثل zen-ai).
// الخصوصية: نص المحاسبة يُرسل للنموذج فقط، ولا يُخزَّن ولا يُطبع في السجلات.
import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import { chatCompleteWith, providersFromEnv } from "../_shared/ai-core.ts";
import { checkAiAccess, type AiFeature } from "../_shared/ai-access.ts";
import { BODY_LIMITS, BodyTooLargeError, readJsonLimited } from "../_shared/edge-http.ts";
import {
  ToolError,
  runDraftGuardianNote,
  runDraftWeekPlan,
  runMuhasabaCoach,
  runPlanRationale,
  runWeeklySummary,
  type ToolDeps,
  type WeekFacts,
} from "../_shared/tools-core.ts";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST فقط" }, 405);
  const env = Deno.env.toObject();
  // جلسة المستدعي: `teacher_student_week` يتحقق بها من أنه معلّم الطالب.
  const userClient = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: u } = await userClient.auth.getUser();
  if (!u?.user) return json({ error: "سجّل الدخول لاستخدام المساعد." }, 401);
  const userId = u.user.id;
  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  let body: Record<string, unknown>;
  try {
    body = (await readJsonLimited(req, BODY_LIMITS.tools)) as Record<string, unknown>;
  } catch (e) {
    if (e instanceof BodyTooLargeError) return json({ error: e.message }, 413);
    throw e;
  }

  // N-02/N-03: أدوات الطالب (المحاسبة وتعليل الخطة) ذكاء نصّي يحتاج الموافقة ولا يعمل للقاصر؛ وأدوات المعلّم
  // (حقائق مجهّلة) ممنوعة على الحساب المرتبط بوليّ أمر. الإجراء غير المعروف يُرفض بعد هذا بـ 400.
  const FEATURE: Record<string, AiFeature> = {
    muhasaba_coach: "text",
    plan_rationale: "text",
    weekly_summary: "teacher",
    draft_week_plan: "teacher",
    draft_guardian_note: "teacher",
  };
  const feature = typeof body.action === "string" ? FEATURE[body.action] : undefined;
  if (!feature) return json({ error: "إجراء غير معروف." }, 400);
  const denied = await checkAiAccess((fn, args) => admin.rpc(fn, args), userId, feature);
  if (denied) return json({ error: denied.message, code: denied.code }, denied.status);

  const deps: ToolDeps = {
    aiConfigured: providersFromEnv(env).length > 0,
    async weekFacts(student, days) {
      const { data, error } = await userClient.rpc("teacher_student_week", {
        _student: student,
        _days: days,
      });
      if (error || !data) throw new Error(error?.message ?? "no data");
      return data as WeekFacts;
    },
    async consumeQuota(user, feature, daily, minute) {
      const { data, error } = await admin.rpc("consume_ai_quota", {
        _user_id: user,
        _feature: feature,
        _daily_limit: daily,
        _minute_limit: minute,
      });
      if (error) throw new ToolError("تعذّر التحقق من حصة الاستخدام.", 502);
      return data as { allowed: boolean; reason?: string | null };
    },
    async refundQuota(user, feature) {
      await admin.rpc("refund_ai_quota", { _user_id: user, _feature: feature });
    },
    async complete(messages, timeoutMs) {
      return (await chatCompleteWith(messages, env, { timeoutMs })).text;
    },
  };

  try {
    if (body.action === "weekly_summary")
      return json(await runWeeklySummary(deps, userId, body as never));
    if (body.action === "plan_rationale")
      return json(await runPlanRationale(deps, userId, body as never));
    if (body.action === "muhasaba_coach")
      return json(await runMuhasabaCoach(deps, userId, body as never));
    // 12.3: مسودّات للمعلّم؛ لا إرسال ولا إنشاء دون اعتماده في الواجهة.
    if (body.action === "draft_week_plan")
      return json(await runDraftWeekPlan(deps, userId, body as never));
    if (body.action === "draft_guardian_note")
      return json(await runDraftGuardianNote(deps, userId, body as never));
    return json({ error: "إجراء غير معروف." }, 400);
  } catch (e) {
    if (e instanceof ToolError) return json({ error: e.message }, e.status);
    console.error("[zen-tools]", body.action, e instanceof Error ? e.name : "error");
    return json({ error: "تعذّر الوصول إلى المساعد الآن." }, 502);
  }
});
