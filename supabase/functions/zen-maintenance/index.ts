// دالة Supabase Edge للصيانة الدورية (تدقيق أكتوبر 2026، المرحلة 2.2): حذف الملفات الصوتية الخام
// للتسميعات الأقدم من 90 يوماً مع إبقاء نتائجها. المنطق في `_shared/maintenance-core.ts`.
//
// النشر: supabase functions deploy zen-maintenance --no-verify-jwt
//   (المجدول يرسل سرّاً لا رمز JWT: MAINTENANCE_SECRET، ومؤقتاً PUSH_DISPATCH_SECRET قبل ضبطه — P1-04.)
// المجدول: الترحيل 20261112100000_audit_phase2_retention (سرّ Vault «zen_maintenance_url»، docs/BACKUP.md).
import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import { safeEqual } from "../_shared/push-core.ts";
import { BODY_LIMITS, BodyTooLargeError, readJsonLimited } from "../_shared/edge-http.ts";
import {
  maintenanceSecret,
  purgeOldAudio,
  RETENTION,
  type AudioCandidate,
  type MaintenanceStore,
} from "../_shared/maintenance-core.ts";

declare const Deno: {
  env: { toObject(): Record<string, string> };
  serve(h: (req: Request) => Response | Promise<Response>): void;
};

const RECITATION_BUCKET = "recitations";
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST فقط" }, 405);
  const env = Deno.env.toObject();
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { secret, legacy } = maintenanceSecret(env);
  if (!secret || !bearer || !safeEqual(bearer, secret)) {
    return json({ error: "forbidden" }, 403);
  }
  if (legacy)
    console.warn("zen-maintenance: MAINTENANCE_SECRET غير مضبوط، والسرّ المشترك مقبول مؤقتاً.");
  try {
    await readJsonLimited(req, BODY_LIMITS.push);
  } catch (e) {
    if (e instanceof BodyTooLargeError) return json({ error: e.message }, 413);
    throw e;
  }

  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const store: MaintenanceStore = {
    async audioCandidates(days, limit) {
      const { data, error } = await admin.rpc("retention_audio_candidates", {
        _days: days,
        _limit: limit,
      });
      if (error) throw new Error("retention_audio_candidates: " + error.message);
      return (data ?? []) as AudioCandidate[];
    },
    async removeObjects(paths) {
      const { data, error } = await admin.storage.from(RECITATION_BUCKET).remove(paths);
      if (error) throw new Error("storage.remove: " + error.message);
      // remove يعيد ما حُذف؛ المسار غير الموجود أصلاً يُعدّ محذوفاً (لا يُترك يتكرّر للأبد).
      const gone = new Set((data ?? []).map((o: { name: string }) => o.name));
      const { data: still } = await admin.rpc("retention_paths_present", { _paths: paths });
      const present = new Set((still ?? []) as string[]);
      return paths.filter((p) => gone.has(p) || !present.has(p));
    },
    async markPurged(ids) {
      const { error } = await admin.rpc("retention_mark_purged", { _ids: ids });
      if (error) throw new Error("retention_mark_purged: " + error.message);
    },
  };

  try {
    return json(await purgeOldAudio(store, RETENTION.audioDays, RETENTION.batch));
  } catch (e) {
    console.error("[zen-maintenance]", e instanceof Error ? e.message : e);
    return json({ error: "تعذّرت الصيانة الآن." }, 502);
  }
});
