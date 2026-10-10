import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* تحميل السور في مدير عام: يستمر بعد مغادرة الشاشة، ويُلغى فعلاً عند الطلب. */

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true, convertFileSrc: (u: string) => u },
}));

const written = new Map<string, string>();
vi.mock("@capacitor/filesystem", () => ({
  Directory: { Data: "DATA" },
  Filesystem: {
    mkdir: async () => undefined,
    stat: async ({ path }: { path: string }) => {
      if (!written.has(path)) throw new Error("missing");
      return { size: 4096 };
    },
    writeFile: async ({ path, data }: { path: string; data: string }) => {
      written.set(path, data);
    },
    getUri: async ({ path }: { path: string }) => ({ uri: `file:///${path}` }),
    rmdir: async () => undefined,
  },
}));

class FakeFileReader {
  result: string | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readAsDataURL() {
    this.result = "data:audio/mpeg;base64,AAAA";
    queueMicrotask(() => this.onload?.());
  }
}

const store = new Map<string, string>();
let fetchGate: Promise<void> = Promise.resolve();
const signals: AbortSignal[] = [];

beforeEach(() => {
  written.clear();
  store.clear();
  signals.length = 0;
  fetchGate = Promise.resolve();
  vi.stubGlobal("FileReader", FakeFileReader);
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    },
    dispatchEvent: () => true,
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: { signal?: AbortSignal }) => {
      if (init?.signal) signals.push(init.signal);
      await fetchGate;
      if (init?.signal?.aborted) throw new DOMException("aborted", "AbortError");
      return new Response(new Blob([new Uint8Array(5000)]), { status: 200 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const reciter = { id: "t", folder: "Test_64kbps", nameAr: "اختبار" } as never;
const tick = () => new Promise((r) => setTimeout(r, 0));
async function until(cond: () => boolean) {
  for (let i = 0; i < 200 && !cond(); i++) await tick();
}

describe("مدير تحميل السور", () => {
  it("يكمل التحميل ويسجّل السورة دون أي مكوّن معروض", async () => {
    const m = await import("@/lib/quran/recitation-offline");
    const done = vi.fn();
    m.setDownloadManagerEvents({ onDone: done });
    m.startDownload(reciter, 112, 4);
    await until(() => done.mock.calls.length > 0);
    expect(done).toHaveBeenCalledOnce();
    expect(m.isDownloaded("Test_64kbps", 112)).toBe(true);
    // البسملة + ٤ آيات
    expect(written.size).toBe(5);
  });

  it("لا يبدأ تحميلاً مكرراً للسورة نفسها", async () => {
    const m = await import("@/lib/quran/recitation-offline");
    let open!: () => void;
    fetchGate = new Promise((r) => (open = r));
    m.startDownload(reciter, 113, 5);
    m.startDownload(reciter, 113, 5);
    await tick();
    expect(signals.length).toBeLessThanOrEqual(m.DOWNLOAD_CONCURRENCY);
    open();
    m.cancelAllDownloads();
  });

  it("الإلغاء يقطع الطلبات الجارية ولا يسجّل السورة", async () => {
    const m = await import("@/lib/quran/recitation-offline");
    let open!: () => void;
    fetchGate = new Promise((r) => (open = r));
    const done = vi.fn();
    m.setDownloadManagerEvents({ onDone: done });
    m.startDownload(reciter, 114, 6);
    await until(() => signals.length > 0);
    m.cancelDownload("Test_64kbps", 114);
    expect(signals.every((s) => s.aborted)).toBe(true);
    open();
    await tick();
    await tick();
    expect(done).not.toHaveBeenCalled();
    expect(m.isDownloaded("Test_64kbps", 114)).toBe(false);
  });
});
