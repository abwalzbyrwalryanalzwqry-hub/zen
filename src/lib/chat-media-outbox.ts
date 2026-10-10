/**
 * صندوق إرسال الصور والرسائل الصوتية (M9). كانت النصوص وحدها تُحفظ بلا اتصال (F3)، أما التسجيل
 * الصوتي أو الصورة فتضيع إن انقطع الاتصال أثناء الرفع. الآن يُحفظ الملف في IndexedDB (الملفات أكبر
 * من أن تحفظ في localStorage)، ويظهر في الصادر مثل النص، ويُرفع ويُرسل عند عودة الاتصال.
 *
 * إعادة المحاولة لا تكرّر شيئاً:
 *  - مسار الملف ثابت من `client_id` ({chat}/{sender}/{client_id}.{ext})، فرفعٌ وصل قبل الانقطاع يُعدّ
 *    ناجحاً عند المحاولة التالية (الخادم يرد «موجود» بدل نسخة ثانية).
 *  - صف الرسالة يحمل `client_id` نفسه، والفهرس الفريد على الخادم يمنع تكرارها.
 */
import { t } from "@/lib/i18n";
import type { OutboxItem } from "@/lib/chat-outbox";

export type MediaKind = "image" | "voice";
export type MediaBlobRecord = {
  client_id: string;
  blob: Blob;
  duration?: number | null;
  created_at: string;
};

export interface BlobStore {
  put(r: MediaBlobRecord): Promise<void>;
  get(id: string): Promise<MediaBlobRecord | undefined>;
  delete(id: string): Promise<void>;
  all(): Promise<MediaBlobRecord[]>;
}

const DB = "zen-media-outbox";
const STORE = "blobs";

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

/** مخزن IndexedDB على الجهاز (WebView). */
export function idbBlobStore(): BlobStore {
  let dbp: Promise<IDBDatabase> | null = null;
  const open = () =>
    (dbp ??= new Promise((res, rej) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: "client_id" });
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    }));
  const tx = async (mode: IDBTransactionMode) =>
    (await open()).transaction(STORE, mode).objectStore(STORE);
  return {
    put: async (r) => void (await req((await tx("readwrite")).put(r))),
    get: async (id) => (await req((await tx("readonly")).get(id))) as MediaBlobRecord | undefined,
    delete: async (id) => void (await req((await tx("readwrite")).delete(id))),
    all: async () => (await req((await tx("readonly")).getAll())) as MediaBlobRecord[],
  };
}

let shared: BlobStore | null = null;
export const mediaStore = (): BlobStore => (shared ??= idbBlobStore());

/** نص العنصر في الصادر حتى يُرسل. */
export const pendingLabel = (kind: MediaKind) =>
  t(kind === "voice" ? "chat.pendingVoice" : "chat.pendingImage");

/** المسار الثابت للمرفق من معرّف العميل (سياسات التخزين تشترط {chat}/{sender}/…). */
export function mediaPathFor(chatId: string, senderId: string, clientId: string, ext: string) {
  return `${chatId}/${senderId}/${clientId}.${ext}`;
}

/** رفعٌ سبق أن وصل: Storage يرد 409 أو «already exists». */
export function isAlreadyUploaded(e: unknown): boolean {
  const o = (e ?? {}) as { statusCode?: string | number; status?: number; message?: string };
  return (
    String(o.statusCode ?? o.status ?? "") === "409" ||
    /already exists|duplicate/i.test(String(o.message ?? ""))
  );
}

export type MediaSender = {
  upload: (path: string, blob: Blob) => Promise<void>;
  insert: (row: {
    chat_id: string;
    sender_id: string;
    kind: MediaKind;
    media_path: string;
    duration: number | null;
    client_id: string;
  }) => Promise<void>;
  ext: (mime: string) => string | undefined;
};

/** يرفع الملف (أو يتجاوزه إن رُفع) ثم يُدرج الرسالة، ويحذف الملف من الجهاز بعد النجاح. */
export async function deliverMedia(
  item: OutboxItem,
  senderId: string,
  send: MediaSender,
  store: BlobStore = mediaStore(),
): Promise<void> {
  if (!item.kind) throw new Error("NOT_MEDIA");
  const rec = await store.get(item.client_id);
  if (!rec) throw new Error("MEDIA_MISSING");
  const ext = send.ext(rec.blob.type || "application/octet-stream");
  if (!ext) throw new Error("UNSUPPORTED_MEDIA");
  const path = mediaPathFor(item.chat_id, senderId, item.client_id, ext);
  try {
    await send.upload(path, rec.blob);
  } catch (e) {
    if (!isAlreadyUploaded(e)) throw e;
  }
  await send.insert({
    chat_id: item.chat_id,
    sender_id: senderId,
    kind: item.kind,
    media_path: path,
    duration: item.kind === "voice" ? (rec.duration ?? null) : null,
    client_id: item.client_id,
  });
  await store.delete(item.client_id);
}

/** يحذف ملفات الصادر الأقدم من صلاحية الصادر نفسه (لن يُعاد إرسالها). */
export async function pruneMedia(
  maxAgeMs: number,
  store: BlobStore = mediaStore(),
  now = Date.now(),
): Promise<number> {
  let n = 0;
  for (const r of await store.all()) {
    if (now - Date.parse(r.created_at) > maxAgeMs) {
      await store.delete(r.client_id);
      n++;
    }
  }
  return n;
}
