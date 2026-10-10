import { describe, expect, it, vi } from "vitest";
import {
  deliverMedia,
  isAlreadyUploaded,
  mediaPathFor,
  pruneMedia,
  type BlobStore,
  type MediaBlobRecord,
  type MediaSender,
} from "./chat-media-outbox";
import { newOutboxItem } from "./chat-outbox";

function memStore(): BlobStore & { m: Map<string, MediaBlobRecord> } {
  const m = new Map<string, MediaBlobRecord>();
  return {
    m,
    put: async (r) => void m.set(r.client_id, r),
    get: async (id) => m.get(id),
    delete: async (id) => void m.delete(id),
    all: async () => [...m.values()],
  };
}

const sender = (over: Partial<MediaSender> = {}): MediaSender & { calls: string[] } => {
  const calls: string[] = [];
  return {
    calls,
    upload: vi.fn(async (p: string) => void calls.push(`up:${p}`)),
    insert: vi.fn(async (r) => void calls.push(`ins:${r.client_id}:${r.duration}`)),
    ext: (m) => ({ "audio/webm": "webm", "image/jpeg": "jpg" })[m],
    ...over,
  };
};

describe("صندوق الصور والرسائل الصوتية (M9)", () => {
  it("يرفع إلى مسار ثابت من client_id ثم يُدرج ويحذف الملف من الجهاز", async () => {
    const store = memStore();
    const item = newOutboxItem("c1", "…", null, "voice");
    await store.put({
      client_id: item.client_id,
      blob: new Blob(["x"], { type: "audio/webm" }),
      duration: 7,
      created_at: item.created_at,
    });
    const s = sender();
    await deliverMedia(item, "u1", s, store);
    expect(s.calls).toEqual([
      `up:${mediaPathFor("c1", "u1", item.client_id, "webm")}`,
      `ins:${item.client_id}:7`,
    ]);
    expect(store.m.size).toBe(0);
  });

  it("رفعٌ وصل قبل الانقطاع لا يمنع الإرسال عند المحاولة التالية", async () => {
    const store = memStore();
    const item = newOutboxItem("c1", "…", null, "image");
    await store.put({
      client_id: item.client_id,
      blob: new Blob(["x"], { type: "image/jpeg" }),
      created_at: item.created_at,
    });
    const s = sender({
      upload: async () => {
        throw { statusCode: "409", message: "The resource already exists" };
      },
    });
    await deliverMedia(item, "u1", s, store);
    expect(s.insert).toHaveBeenCalledWith(
      expect.objectContaining({ duration: null, kind: "image" }),
    );
  });

  it("فشل الشبكة يُبقي الملف على الجهاز لإعادة المحاولة", async () => {
    const store = memStore();
    const item = newOutboxItem("c1", "…", null, "image");
    await store.put({
      client_id: item.client_id,
      blob: new Blob(["x"], { type: "image/jpeg" }),
      created_at: item.created_at,
    });
    const s = sender({
      upload: async () => {
        throw new TypeError("Failed to fetch");
      },
    });
    await expect(deliverMedia(item, "u1", s, store)).rejects.toThrow("Failed to fetch");
    expect(store.m.size).toBe(1);
  });

  it("ملف مفقود أو نوع غير مدعوم خطأ دائم", async () => {
    const store = memStore();
    const item = newOutboxItem("c1", "…", null, "image");
    await expect(deliverMedia(item, "u1", sender(), store)).rejects.toThrow("MEDIA_MISSING");
    await store.put({
      client_id: item.client_id,
      blob: new Blob(["x"], { type: "application/pdf" }),
      created_at: item.created_at,
    });
    await expect(deliverMedia(item, "u1", sender(), store)).rejects.toThrow("UNSUPPORTED_MEDIA");
  });

  it("يميّز «موجود مسبقاً» ويحذف الملفات المنتهية", async () => {
    expect(isAlreadyUploaded({ statusCode: 409 })).toBe(true);
    expect(isAlreadyUploaded({ message: "Duplicate" })).toBe(true);
    expect(isAlreadyUploaded(new Error("Failed to fetch"))).toBe(false);
    const store = memStore();
    await store.put({ client_id: "old", blob: new Blob([]), created_at: "2020-01-01T00:00:00Z" });
    await store.put({ client_id: "new", blob: new Blob([]), created_at: new Date().toISOString() });
    expect(await pruneMedia(7 * 86400_000, store)).toBe(1);
    expect([...store.m.keys()]).toEqual(["new"]);
  });
});
