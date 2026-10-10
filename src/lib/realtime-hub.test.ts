import { afterEach, describe, expect, it, vi } from "vitest";
import { createRealtimeHub, inFilter, REALTIME_IN_LIMIT, type HubClient } from "./realtime-hub";

type Sub = { args: unknown[] };

function fakeClient(chats: string[], rooms: string[]) {
  const channels: { name: string; subs: Sub[]; removed: boolean }[] = [];
  const handlers: ((p: { new: Record<string, unknown> }) => void)[] = [];
  const client: HubClient = {
    channel(name: string) {
      const rec = { name, subs: [] as Sub[], removed: false };
      channels.push(rec);
      const ch = {
        on: (...args: unknown[]) => {
          rec.subs.push({ args });
          handlers.push(args[2] as (p: { new: Record<string, unknown> }) => void);
          return ch;
        },
        subscribe: () => ch,
      };
      (ch as unknown as { rec: typeof rec }).rec = rec;
      return ch;
    },
    removeChannel(c) {
      (c as unknown as { rec: { removed: boolean } }).rec.removed = true;
    },
    from: () => ({
      select: async () => ({ data: chats.map((id) => ({ id })), error: null }),
    }),
    rpc: async () => ({ data: rooms.map((room_id) => ({ room_id })), error: null }),
  };
  return { client, channels, handlers };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => vi.useRealTimers());

describe("محور Realtime المشترك (M6)", () => {
  it("مرشّح in مرتّب بلا تكرار وبحدّ Realtime، ولا مرشّح لقائمة فارغة", () => {
    expect(inFilter("chat_id", ["b", "a", "b"])).toBe("chat_id=in.(a,b)");
    expect(inFilter("chat_id", [])).toBeNull();
    const many = Array.from({ length: 150 }, (_, i) => `id${String(i).padStart(3, "0")}`);
    expect(inFilter("x", many)!.split(",")).toHaveLength(REALTIME_IN_LIMIT);
  });

  it("قناة واحدة لكل المستمعين، كل جداولها مرشَّحة بمعرّفات المستخدم", async () => {
    const { client, channels } = fakeClient(["c1", "c2"], ["r1"]);
    const hub = createRealtimeHub(client);
    hub.subscribe("u1", () => undefined);
    hub.subscribe("u1", () => undefined);
    await flush();
    expect(channels).toHaveLength(1);
    expect(channels[0].name).toBe("zen-live:u1");
    const filters = channels[0].subs.map((s) => s.args[1] as Record<string, string>);
    const byTable = (t: string) => filters.filter((f) => f.table === t);
    expect(byTable("messages").every((f) => f.filter === "chat_id=in.(c1,c2)")).toBe(true);
    expect(byTable("messages")).toHaveLength(2);
    expect(byTable("room_messages")[0].filter).toBe("room_id=in.(r1)");
    // لا جدول كامل بلا مرشّح سوى إدراج المحادثات (نادر، لاكتشاف محادثة جديدة).
    const unfiltered = filters.filter((f) => !f.filter).map((f) => `${f.table}:${f.event}`);
    expect(unfiltered).toEqual(["chats:INSERT"]);
  });

  it("الأحداث تصل لكل المستمعين، والإلغاء يغلق القناة بعد مهلة لا فوراً", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { client, channels, handlers } = fakeClient(["c1"], []);
    const hub = createRealtimeHub(client);
    const a = vi.fn();
    const off = hub.subscribe("u1", a);
    await vi.waitFor(() => expect(channels).toHaveLength(1));
    const msgInsert = channels[0].subs.findIndex(
      (s) => (s.args[1] as { table: string; event: string }).table === "messages",
    );
    handlers[msgInsert]({ new: { id: "m1", chat_id: "c1" } });
    expect(a).toHaveBeenCalledWith({
      kind: "message",
      type: "INSERT",
      row: { id: "m1", chat_id: "c1" },
    });

    off();
    // تنقّل بين شاشتين: مستمع جديد قبل انتهاء المهلة يُبقي القناة نفسها.
    hub.subscribe("u1", () => undefined);
    vi.advanceTimersByTime(10_000);
    expect(channels[0].removed).toBe(false);
    expect(channels).toHaveLength(1);
  });

  it("آخر مستمع يغلق القناة بعد المهلة", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { client, channels } = fakeClient(["c1"], []);
    const hub = createRealtimeHub(client);
    const off = hub.subscribe("u1", () => undefined);
    await vi.waitFor(() => expect(channels).toHaveLength(1));
    off();
    vi.advanceTimersByTime(4_000);
    expect(channels[0].removed).toBe(false);
    vi.advanceTimersByTime(2_000);
    expect(channels[0].removed).toBe(true);
    expect(hub.state().uid).toBeNull();
  });
});
