/**
 * طبقة «دون اتصال» فوق fetch الخاص بعميل Supabase (العمل الهجين):
 *
 *  - كل قراءة ناجحة (GET على /rest/v1، ودوال RPC للقراءة فقط) تُحفظ في Cache Storage مفصولةً
 *    لكل مستخدم (من `sub` في رمز الدخول)، فإذا انقطعت الشبكة أُعيدت آخر نسخة معروفة بدل الخطأ.
 *  - الكتابة لا تُخزَّن ولا تُزوَّر: تفشل كما هي، والوحدات المحلية أولاً (محاسبتي، الاختبارات)
 *    تحفظ على الجهاز وتزامن لاحقاً كما كانت.
 *  - في وضع الضيف لا يخرج أي طلب بيانات إلى الخادم؛ طلبات المصادقة وحدها تمرّ (لتسجيل الدخول).
 *  - عند تسجيل الخروج تُحذف الحافظة كلها (`clearOfflineCache`).
 *  - الحجم والصلاحية والوسائط حسب `cache-policy.ts` (H7): 30 يوماً، و400 مدخل/25MB بسياسة LRU،
 *    ولا صوت ولا ملف أكبر من 512KB. وكل نسخة معروضة من الحافظة تُسجَّل لشريط «آخر تحديث منذ…».
 */
import { isGuest } from "./guest";
import {
  clearIndex,
  evictionPlan,
  isExpired,
  noteFreshRead,
  noteServedFromCache,
  readIndex,
  shouldCache,
  writeIndex,
} from "./cache-policy";
import { isOnline } from "@/lib/network";
import { storedUserId } from "./stored-session";

export const API_CACHE = "zen-api-v1";
const CACHE_ORIGIN = "https://zen-offline.cache";
const NETWORK_TIMEOUT_MS = 15_000;
/**
 * شبكة بطيئة (1.16.0): قراءة لها نسخة على الجهاز لا تنتظر أكثر من هذا؛ تُعرض النسخة فوراً ويكمل الطلب
 * الحيّ في الخلفية فيحدّث النسخة للمرة التالية. بلا نسخة يبقى الانتظار حتى NETWORK_TIMEOUT_MS.
 */
export const SLOW_NETWORK_MS = 2_500;

/**
 * دوال RPC للقراءة فقط (STABLE في الترحيلات) تُخزَّن نسختها للعمل دون اتصال. كل دالة STABLE يستدعيها
 * التطبيق إما هنا أو في `NO_CACHE_RPC` بسببٍ مكتوب؛ يفرض ذلك `read-rpc.test.ts` من الترحيلات نفسها.
 */
export const READ_RPC = new Set([
  "am_app_owner",
  "app_health",
  "at_risk_students",
  "can_post_in_chat",
  "center_dashboard",
  "center_drilldown",
  "center_fee_overview",
  "center_halaqa_league",
  "center_kpis",
  "center_period_compare",
  "center_record_quality",
  "center_staff_list",
  "center_students",
  "center_teacher_quality",
  "cert_brand",
  "cert_get",
  "cert_get_many",
  "cert_honor",
  "cert_list",
  "cert_stats",
  "cert_studio_context",
  "cert_templates",
  "chat_context",
  "daily_record_anomalies",
  "daily_record_audit_list",
  "daily_record_history",
  "daily_record_trash_list",
  "daily_record_week",
  "due_reviews",
  "guardian_ai_consents_list",
  "guardian_child_overview",
  "guardian_pending_invites",
  "guardian_today_queue",
  "halaqa_register_sheet",
  "has_role",
  "is_app_owner",
  "manages_halaqa",
  "more_badges",
  "my_ai_consent",
  "my_ai_usage",
  "my_analytics_consent",
  "my_chat_contacts",
  "my_chat_contacts_detailed",
  "my_fee_centers",
  "my_guardian_children",
  "my_halaqa_leagues",
  "my_halaqa_schedule",
  "my_halaqa_student_ids",
  "my_home_context",
  "my_inbox",
  "my_login_info",
  "my_managed_centers",
  "my_remote_recitations",
  "my_rooms",
  "my_today_queue",
  "open_message_reports",
  "progress_stats",
  "report_identity",
  "storage_usage",
  "student_daily_overview",
  "student_fee_statement",
  "student_guardians",
  "student_report",
  "supervised_chats",
  "teacher_home_kpis",
  "teacher_remote_queue",
  "teacher_student_week",
  "teaches_student",
  "unread_counts",
  "unread_total",
  "usage_summary",
]);

/** دوال قراءة لا تُحفظ نسختها عمداً. */
export const NO_CACHE_RPC: Record<string, string> = {
  ai_access_denial:
    "لدوال Edge وحدها (service_role): نسخة src/lib/ai-access.ts مرآة للخادم ولا يستدعيها العميل.",
  export_my_data: "تصدير كامل للحساب: كبير، ويُطلب حيّاً دائماً",
  delete_my_account_check: "فحص قبل الحذف: نتيجة قديمة قد تسمح بما يجب رفضه",
  student_login_info: "بيانات دخول الطلاب: لا تبقى على الجهاز",
  search_my_messages: "بحث المحادثات يحتاج الخادم كالمحادثة نفسها",
  my_storage_objects: "قائمة ملفات الحذف: يجب أن تكون حيّة",
  halaqa_report_data:
    "نسخة جهاز خاصة تغطي النطاقات الأضيق وتُدمج معها أوراق السجل (reports/offline.ts)",
  daily_record_sheet:
    "له نسخة جهاز خاصة تُعرض بتنبيه وتُبنى عليها التعديلات (daily-record-cache.ts)",
  cert_assets:
    "صور الهوية والتواقيع (حتى 1 ميغابايت لكل صورة): تُطلب حيّة ولا تُخزَّن نسخ منها على الجهاز",
  cert_batch: "مسودة دفعة تُستأنف لتُصدر: نسخة قديمة قد تعيد طلاباً حُذفوا منها",
  cert_audit_log: "سجل التدقيق يُقرأ حيّاً دائماً",
  audit_sample:
    "عيّنة التدقيق تُراجَع وتُؤكَّد على الخادم: نسخة قديمة قد تُظهر سجلاً لم يُراجَع وقد رُوجع",
  center_fee_receipts:
    "إيصالات تنتظر التأكيد: نسخة قديمة قد تعرض إيصالاً بُتّ فيه فيُؤكَّد مرتين في الواجهة",
};

type Kind = "auth" | "read" | "write";

function classify(url: URL, method: string): Kind {
  const p = url.pathname;
  if (p.startsWith("/auth/v1")) return "auth";
  if (p.startsWith("/rest/v1/rpc/")) {
    return READ_RPC.has(p.slice("/rest/v1/rpc/".length)) ? "read" : "write";
  }
  if (p.startsWith("/rest/v1") && (method === "GET" || method === "HEAD")) return "read";
  if (p.startsWith("/storage/v1/object") && method === "GET") return "read";
  return "write";
}

/** معرّف المستخدم من رمز الدخول (دون تحقق؛ للفصل بين حسابات الجهاز فقط). */
export function userKeyFromAuth(auth: string | null): string {
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : "";
  const part = token.split(".")[1];
  if (!part) return "anon";
  try {
    const json = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof json.sub === "string" && json.sub ? json.sub : "anon";
  } catch {
    return "anon";
  }
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function cacheKeyFor(
  user: string,
  method: string,
  url: string,
  headers: Headers,
  body: string,
): Promise<string> {
  const vary = [
    headers.get("accept") ?? "",
    headers.get("prefer") ?? "",
    headers.get("range") ?? "",
  ];
  const digest = await sha256([method, url, ...vary, body].join("\n"));
  return `${CACHE_ORIGIN}/${encodeURIComponent(user)}/${digest}`;
}

function hasCacheStorage(): boolean {
  return typeof caches !== "undefined";
}

function offlineError(): TypeError {
  return new TypeError("Failed to fetch (offline)");
}

async function withTimeout(p: Promise<Response>, ms: number): Promise<Response> {
  let t: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<Response>((_, reject) => {
        t = setTimeout(() => reject(offlineError()), ms);
      }),
    ]);
  } finally {
    if (t) clearTimeout(t);
  }
}

export function createOfflineFetch(
  base: typeof fetch,
  { slowMs = SLOW_NETWORK_MS }: { slowMs?: number } = {},
): typeof fetch {
  return async (input, init) => {
    const req = new Request(input, init);
    const url = new URL(req.url);
    const method = req.method.toUpperCase();
    const kind = classify(url, method);

    if (kind === "auth") return base(input, init);
    // الضيف لا يملك حساباً: لا طلب بيانات يخرج من الجهاز.
    if (isGuest()) throw offlineError();

    const tokenUser = userKeyFromAuth(req.headers.get("authorization"));
    // جلسة الجهاز (رمز منتهٍ لم يُجدَّد لانقطاع الشبكة): الطلب يخرج بمفتاح التطبيق العام فيعيد الخادم
    // قوائم فارغة بحسب RLS أو يرفض الكتابة. لا نرسله: القراءة من نسخة صاحب الجلسة، والكتابة خطأ شبكة
    // فتذهب إلى صندوق الإرسال وتُرسل بعد التجديد.
    const deviceUser = tokenUser === "anon" ? storedUserId() : null;
    if (kind === "write") {
      if (deviceUser) throw offlineError();
      return base(input, init);
    }
    if (!hasCacheStorage()) {
      if (deviceUser) throw offlineError();
      return base(input, init);
    }

    const body = method === "GET" || method === "HEAD" ? "" : await req.clone().text();
    const user = deviceUser ?? tokenUser;
    const key = await cacheKeyFor(user, method, req.url, req.headers, body);

    const fromCache = async (): Promise<Response | null> => {
      try {
        const index = readIndex();
        const entry = index[key];
        const cache = await caches.open(API_CACHE);
        if (isExpired(entry, Date.now())) {
          // نسخة أقدم من 30 يوماً (أو بلا فهرس): لا تُعرض بيانات قديمة جداً كأنها حالية.
          if (entry) {
            delete index[key];
            writeIndex(index);
          }
          void cache.delete(key).catch(() => undefined);
          return null;
        }
        const hit = await cache.match(key);
        if (!hit) return null;
        index[key] = { ...entry!, usedAt: Date.now() };
        writeIndex(index);
        noteServedFromCache(entry!.savedAt);
        const headers = new Headers(hit.headers);
        headers.set("x-zen-offline", "1");
        headers.set("x-zen-cached-at", new Date(entry!.savedAt).toISOString());
        return new Response(await hit.blob(), { status: hit.status, headers });
      } catch {
        return null;
      }
    };

    if (!isOnline() || deviceUser) {
      const cached = await fromCache();
      if (cached) return cached;
      throw offlineError();
    }

    const afterLive = async (res: Response): Promise<Response> => {
      if (res.ok) {
        noteFreshRead();
        const lenHeader = res.headers.get("content-length");
        const declared = lenHeader === null ? null : Number(lenHeader);
        if (shouldCache(url.pathname, res.headers.get("content-type"), declared)) {
          void storeInCache(key, res.clone());
        }
      } else if (res.status >= 500) {
        const cached = await fromCache();
        if (cached) return cached;
      }
      return res;
    };

    const live = withTimeout(base(input, init), NETWORK_TIMEOUT_MS);
    let res: Response;
    try {
      const quick = await settleWithin(live, slowMs);
      if (quick) res = quick;
      else {
        const cached = await fromCache();
        if (cached) {
          // الحيّ يكمل في الخلفية ويحدّث النسخة.
          void live.then(afterLive).catch(() => undefined);
          return cached;
        }
        res = await live;
      }
    } catch (e) {
      const cached = await fromCache();
      if (cached) return cached;
      throw e;
    }
    return afterLive(res);
  };
}

/** نتيجة الوعد إن استقرّ خلال `ms`، وإلا null (والخطأ يُرمى كما هو). */
async function settleWithin(p: Promise<Response>, ms: number): Promise<Response | null> {
  let t: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([p, new Promise<null>((r) => (t = setTimeout(() => r(null), ms)))]);
  } finally {
    clearTimeout(t);
  }
}

/** يحفظ النسخة ويحدّث الفهرس، ثم يحذف المنتهي والأقدم استعمالاً فوق الحدّ. */
async function storeInCache(key: string, res: Response): Promise<void> {
  try {
    const blob = await res.blob();
    const cache = await caches.open(API_CACHE);
    await cache.put(key, new Response(blob, { status: res.status, headers: res.headers }));
    const now = Date.now();
    const index = readIndex();
    index[key] = { savedAt: now, usedAt: now, size: blob.size };
    const evict = evictionPlan(index, now);
    for (const k of evict) {
      delete index[k];
      void cache.delete(k).catch(() => undefined);
    }
    writeIndex(index);
  } catch {
    /* الحافظة ممتلئة: القراءة الحيّة تكفي */
  }
}

export async function clearOfflineCache(): Promise<void> {
  clearIndex();
  if (!hasCacheStorage()) return;
  try {
    await caches.delete(API_CACHE);
  } catch {
    /* لا شيء يُحذف */
  }
}
