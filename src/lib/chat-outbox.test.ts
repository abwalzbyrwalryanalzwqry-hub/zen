import { describe, expect, it } from "vitest";
import {
  isPermanentSendError,
  newOutboxItem,
  OUTBOX_MAX_AGE_MS,
  readOutbox,
  reconcileOutbox,
  throttle,
  writeOutbox,
} from "./chat-outbox";

function memStore() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    size: () => m.size,
  };
}

describe("صندوق الرسائل الصادرة", () => {
  it("يحفظ الرسائل غير المرسلة ويستعيدها لكل محادثة", () => {
    const s = memStore();
    const a = newOutboxItem("c1", "السلام عليكم");
    writeOutbox("c1", [a], s);
    expect(readOutbox("c1", s)).toEqual([a]);
    expect(readOutbox("c2", s)).toEqual([]);
    writeOutbox("c1", [], s);
    expect(s.size()).toBe(0);
  });

  it("يتجاهل القديم جداً والتالف", () => {
    const s = memStore();
    const old = { ...newOutboxItem("c1", "قديم"), created_at: new Date(0).toISOString() };
    writeOutbox("c1", [old], s);
    expect(readOutbox("c1", s, OUTBOX_MAX_AGE_MS + 10)).toEqual([]);
    s.setItem("zen.outbox.c1", "{not json");
    expect(readOutbox("c1", s)).toEqual([]);
  });

  it("يحذف ما وصل إلى الخادم بالمعرّف نفسه", () => {
    const a = newOutboxItem("c1", "أ");
    const b = newOutboxItem("c1", "ب");
    expect(reconcileOutbox([a, b], [{ client_id: a.client_id }, { client_id: null }])).toEqual([b]);
    expect(a.client_id).not.toBe(b.client_id);
  });

  it("يميّز الرفض الدائم من انقطاع الشبكة", () => {
    expect(isPermanentSendError(new Error("new row violates row-level security policy"))).toBe(
      true,
    );
    expect(isPermanentSendError({ message: "CONTACT_INFO_BLOCKED" })).toBe(true);
    expect(isPermanentSendError(new Error("Failed to fetch"))).toBe(false);
  });

  it("يحدّ حدث الكتابة", () => {
    let t = 0;
    const ok = throttle(2500, () => t);
    expect(ok()).toBe(true);
    t = 1000;
    expect(ok()).toBe(false);
    t = 2600;
    expect(ok()).toBe(true);
  });
});
