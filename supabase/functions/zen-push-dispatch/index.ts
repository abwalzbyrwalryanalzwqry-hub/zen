// دالة Supabase Edge لإرسال الإشعارات الفورية (المرحلة 6.4): تحلّ محلّ `POST /api/push/dispatch`
// و`kickPush` في الخادم، فتعمل دون نشر الويب. المنطق في `_shared/push-core.ts`.
//
// النشر: supabase functions deploy zen-push-dispatch --no-verify-jwt
//   (المجدول يرسل سرّاً لا رمز JWT؛ الدالة تتحقق بنفسها من السرّ أو من جلسة المستخدم.)
// الأسرار: PUSH_DISPATCH_SECRET وFCM_SERVICE_ACCOUNT (Android فقط، لا Web Push منذ 6.10). المجدول: الترحيل 20261014100000_push_dispatch_cron (docs/PUSH.md).
import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import {
  dispatchPlan,
  dispatchPush,
  safeEqual,
  type ClaimedPush,
  type DispatchMode,
  type PushStore,
} from "../_shared/push-core.ts";
import { BODY_LIMITS, BodyTooLargeError, readJsonLimited } from "../_shared/edge-http.ts";
import { parseServiceAccount } from "../_shared/fcm.server.ts";

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
  const auth = req.headers.get("Authorization") ?? "";
  const bearer = auth.replace(/^Bearer\s+/i, "");

  let mode: DispatchMode | null = null;
  let kicker: string | null = null;
  if (env.PUSH_DISPATCH_SECRET && bearer && safeEqual(bearer, env.PUSH_DISPATCH_SECRET)) {
    mode = "cron";
  } else if (bearer) {
    const userClient = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });
    const { data } = await userClient.auth.getUser();
    if (data?.user) {
      mode = "kick";
      kicker = data.user.id;
    }
  }
  if (!mode) return json({ error: "forbidden" }, 403);

  const fcm = parseServiceAccount(env.FCM_SERVICE_ACCOUNT);
  if (!fcm)
    return mode === "cron" ? json({ error: "push keys missing" }, 503) : json({ sent: false });

  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  // تدقيق 1.4: «kick» من المستخدم بحدّ 6/دقيقة (push_kick_allowed). ما يتجاوزه يرسله المجدول بعد دقيقة،
  // فالرفض صامت (sent: false) لا خطأ يظهر للمستخدم.
  if (mode === "kick") {
    const { data: allowed, error } = await admin.rpc("push_kick_allowed", { _user: kicker });
    if (error || allowed !== true) return json({ sent: false, throttled: true });
  }
  const store: PushStore = {
    async enqueueReminders() {
      const { error } = await admin.rpc("enqueue_daily_reminders", {});
      if (error) throw new Error("enqueue_daily_reminders: " + error.message);
    },
    async claim(limit) {
      const { data, error } = await admin.rpc("claim_push_batch", { _limit: limit });
      if (error) throw new Error("claim_push_batch: " + error.message);
      return (data ?? []) as ClaimedPush[];
    },
    async finish(id, delivered, gone) {
      await admin.rpc("finish_push", { _id: id, _delivered: delivered, _gone: gone });
    },
  };
  let body: { reminders?: unknown };
  try {
    body = (await readJsonLimited(req, BODY_LIMITS.push)) as { reminders?: unknown };
  } catch (e) {
    if (e instanceof BodyTooLargeError) return json({ error: e.message }, 413);
    throw e;
  }
  try {
    const sum = await dispatchPush(store, fcm, dispatchPlan(mode, body));
    return json(mode === "cron" ? sum : { sent: true, delivered: sum.delivered });
  } catch (e) {
    console.error("[zen-push-dispatch]", e instanceof Error ? e.message : e);
    return json({ error: "تعذّر الإرسال الآن." }, 502);
  }
});
