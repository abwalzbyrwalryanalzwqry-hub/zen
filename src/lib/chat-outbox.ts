/**
 * صندوق الرسائل الصادرة (المرحلة 2، البند F3): الرسالة تظهر فوراً ثم تُرسل، وإن انقطع الاتصال
 * تبقى محفوظة على الجهاز ويُعاد إرسالها عند عودته. `client_id` يمنع تكرارها على الخادم.
 */
export type OutboxItem = {
  client_id: string;
  chat_id: string;
  content: string;
  created_at: string;
  status: "sending" | "failed";
  reply_to?: string | null;
  /** صورة أو رسالة صوتية: الملف نفسه في IndexedDB بالمعرّف نفسه (M9). */
  kind?: "image" | "voice";
};

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const KEY = (chatId: string) => `zen.outbox.${chatId}`;
/** رسائل أقدم من هذا لا يُعاد إرسالها تلقائياً (قد تكون فقدت سياقها). */
export const OUTBOX_MAX_AGE_MS = 7 * 24 * 3600 * 1000;

function store(): Store | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

export function readOutbox(chatId: string, s: Store | null = store(), now = Date.now()) {
  if (!s) return [] as OutboxItem[];
  try {
    const raw = JSON.parse(s.getItem(KEY(chatId)) ?? "[]") as OutboxItem[];
    return raw.filter(
      (x) =>
        x &&
        typeof x.client_id === "string" &&
        typeof x.content === "string" &&
        now - Date.parse(x.created_at) < OUTBOX_MAX_AGE_MS,
    );
  } catch {
    return [];
  }
}

export function writeOutbox(chatId: string, items: OutboxItem[], s: Store | null = store()) {
  if (!s) return;
  if (items.length === 0) s.removeItem(KEY(chatId));
  else s.setItem(KEY(chatId), JSON.stringify(items));
}

export function newOutboxItem(
  chatId: string,
  content: string,
  replyTo: string | null = null,
  kind?: "image" | "voice",
): OutboxItem {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
          (Number(c) ^ ((Math.random() * 16) >> (Number(c) / 4))).toString(16),
        );
  return {
    client_id: id,
    chat_id: chatId,
    content,
    created_at: new Date().toISOString(),
    status: "sending",
    reply_to: replyTo,
    ...(kind ? { kind } : {}),
  };
}

/** يحذف من الصندوق ما وصل فعلاً (ظهر في الرسائل بالمعرّف نفسه). */
export function reconcileOutbox(
  items: OutboxItem[],
  delivered: { client_id?: string | null }[],
): OutboxItem[] {
  const ids = new Set(delivered.map((m) => m.client_id).filter(Boolean));
  return items.filter((x) => !ids.has(x.client_id));
}

/** هل الخطأ دائم (رفض صلاحية أو محتوى) فلا فائدة من إعادة المحاولة؟ */
export function isPermanentSendError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
  return /row-level security|CONTACT_INFO_BLOCKED|NOT_ALLOWED|violates check|permission denied/i.test(
    msg,
  );
}

/** يسمح بحدث «يكتب…» مرة كل `ms` على الأكثر (البند F7). */
export function throttle(ms: number, now: () => number = Date.now) {
  let last = -Infinity;
  return () => {
    const t = now();
    if (t - last < ms) return false;
    last = t;
    return true;
  };
}
