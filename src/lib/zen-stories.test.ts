import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// خادم وهمي: online=true يعيد القصص، وإلا يرمي كما يفعل fetch بلا اتصال.
const server = { online: true };
const SERVER = [
  { id: "u-1", slug: "adam", title: "آدم", timeline: [{ t: "خلق آدم" }], sort_order: 1 },
  { id: "u-2", slug: "nuh", title: "نوح", timeline: [{ t: "السفينة" }], sort_order: 2 },
];
vi.mock("@/integrations/supabase/client", () => {
  const q = (rows: () => unknown[]) => {
    let filter: ((r: { id: string }) => boolean) | null = null;
    const api = {
      select: () => api,
      order: () => {
        if (!server.online) throw new TypeError("Failed to fetch");
        return Promise.resolve({ data: rows(), error: null });
      },
      eq: (_c: string, v: string) => ((filter = (r) => r.id === v), api),
      maybeSingle: () => {
        if (!server.online) throw new TypeError("Failed to fetch");
        return Promise.resolve({
          data: (rows() as { id: string }[]).find(filter!) ?? null,
          error: null,
        });
      },
    };
    return api;
  };
  return { supabase: { from: () => q(() => SERVER) } };
});

const SEED = {
  stories: [{ id: "seed-1", slug: "adam", title: "آدم", timeline: [{ t: "مضمَّن" }] }],
};

function memory(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
  };
}

beforeEach(() => {
  vi.resetModules();
  server.online = true;
  vi.stubGlobal("window", { localStorage: memory() });
  vi.stubGlobal("fetch", async () => new Response(JSON.stringify(SEED)));
});
afterEach(() => vi.unstubAllGlobals());

describe("القصص بلا اتصال (1.35.0)", () => {
  it("قصة لم تُفتح من قبل تُقرأ بلا اتصال من نسخة الجهاز بعد وصول القائمة مرة", async () => {
    const m = await import("./zen-stories");
    expect((await m.listStories()).map((s) => s.id)).toEqual(["u-1", "u-2"]);
    server.online = false;
    const s = await m.getStory("u-2");
    expect(s?.title).toBe("نوح");
    expect(s?.timeline.length).toBe(1);
    expect((await m.listStories()).map((s) => s.id)).toEqual(["u-1", "u-2"]);
  });

  it("بلا نسخة جهاز: القائمة والنص من النسخة المضمَّنة", async () => {
    const m = await import("./zen-stories");
    server.online = false;
    expect((await m.listStories()).map((s) => s.id)).toEqual(["seed-1"]);
    expect((await m.getStory("seed-1"))?.timeline[0]).toEqual({ t: "مضمَّن" });
  });

  it("معرّف خادم بلا نص محفوظ يُطابَق مع المضمَّنة بالاسم المعتمد (slug)", async () => {
    const m = await import("./zen-stories");
    window.localStorage.setItem(
      m.STORIES_LOCAL_KEY,
      JSON.stringify([{ id: "u-1", slug: "adam", timeline: [] }]),
    );
    server.online = false;
    expect((await m.getStory("u-1"))?.id).toBe("seed-1");
  });
});
