import { describe, expect, it } from "vitest";
import { SYNC_FIELDS, createReadingSync, mergeBookmarks, type ServerState } from "./reading-sync";

function mem(init: Record<string, unknown> = {}) {
  const m = new Map<string, string>(Object.entries(init).map(([k, v]) => [k, JSON.stringify(v)]));
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    json: (k: string) => JSON.parse(m.get(k) ?? "null") as unknown,
  };
}

/** خادم وهمي يطبّق قاعدة sync_quran_state: الأحدث يغلب لكل حقل. */
function fakeServer(initial: ServerState = {}) {
  const st: ServerState = { ...initial };
  const calls: Record<string, unknown>[] = [];
  const rpc = async (args: Record<string, unknown>) => {
    calls.push(args);
    for (const f of ["bookmarks", "khatmah", "history"] as const) {
      const at = args[`_${f}_at`] as string | undefined;
      if (at && (!st[`${f}_at`] || Date.parse(at) > Date.parse(st[`${f}_at`]!))) {
        st[f] = args[`_${f}`];
        st[`${f}_at`] = at;
      }
    }
    return { ...st };
  };
  return { st, calls, rpc };
}

const B = SYNC_FIELDS.bookmarks.key;
const K = SYNC_FIELDS.khatmah.key;
let clock = Date.parse("2026-10-01T10:00:00Z");
const now = () => (clock += 1000);

describe("مزامنة حالة القراءة (H4)", () => {
  it("أول مزامنة تدمج علامات الجهاز والحساب، والختمة من الحساب إن وُجدت", async () => {
    const server = fakeServer({
      bookmarks: [{ id: "2:255", createdAt: 5 }],
      bookmarks_at: "2026-09-01T00:00:00Z",
      khatmah: { plan: { days: 30 }, completed: [] },
      khatmah_at: "2026-09-01T00:00:00Z",
    });
    const store = mem({ [B]: [{ id: "1:1", createdAt: 9 }], [K]: { plan: null, completed: [] } });
    const events: string[] = [];
    const sync = createReadingSync({ rpc: server.rpc, store, emit: (e) => events.push(e), now });
    await sync.sync();
    expect((store.json(B) as { id: string }[]).map((x) => x.id)).toEqual(["1:1", "2:255"]);
    expect(server.st.bookmarks).toHaveLength(2);
    expect(store.json(K)).toEqual({ plan: { days: 30 }, completed: [] });
    expect(events).toContain(SYNC_FIELDS.khatmah.event);
    expect(sync.readMeta().pending).toEqual({});
  });

  it("تعديل محلي يُرفع، وتعديل أحدث من جهاز آخر يُطبَّق هنا", async () => {
    const server = fakeServer();
    const store = mem({ [B]: [] });
    const sync = createReadingSync({ rpc: server.rpc, store, emit: () => undefined, now });
    store.setItem(B, JSON.stringify([{ id: "3:1", createdAt: 1 }]));
    sync.markChanged("bookmarks");
    await sync.sync();
    expect(server.st.bookmarks).toEqual([{ id: "3:1", createdAt: 1 }]);

    // جهاز آخر عدّل لاحقاً.
    server.st.bookmarks = [];
    server.st.bookmarks_at = new Date(clock + 60_000).toISOString();
    await sync.sync();
    expect(store.json(B)).toEqual([]);
  });

  it("بلا شبكة يبقى المعلَّق، ويُرفع في المرة التالية", async () => {
    const server = fakeServer();
    let down = true;
    const store = mem();
    const sync = createReadingSync({
      rpc: async (a) => {
        if (down) throw new TypeError("Failed to fetch");
        return server.rpc(a);
      },
      store,
      emit: () => undefined,
      now,
    });
    store.setItem(K, JSON.stringify({ plan: { days: 7 }, completed: [] }));
    sync.markChanged("khatmah");
    await sync.sync();
    expect(sync.readMeta().pending.khatmah).toBe(true);
    down = false;
    await sync.sync();
    expect(server.st.khatmah).toEqual({ plan: { days: 7 }, completed: [] });
    expect(sync.readMeta().pending).toEqual({});
  });

  it("اتحاد العلامات يُبقي الأحدث عند التعارض ويتجاهل التالف", () => {
    expect(
      mergeBookmarks(
        [{ id: "a", createdAt: 1, note: "قديم" }, null, { x: 1 }],
        [
          { id: "a", createdAt: 2, note: "جديد" },
          { id: "b", createdAt: 0 },
        ],
      ),
    ).toEqual([
      { id: "a", createdAt: 2, note: "جديد" },
      { id: "b", createdAt: 0 },
    ]);
  });
});
