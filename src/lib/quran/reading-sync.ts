/**
 * مزامنة حالة القراءة مع الحساب (H4): العلامات والختمة وسجل القراءة كانت على الجهاز وحده فتضيع بحذف
 * التطبيق أو تغيير الهاتف. تبقى localStorage المصدر الفوري (المصحف يعمل بلا اتصال)، وتُرفع نسخة إلى
 * `quran_reading_state` عبر `sync_quran_state`.
 *
 *  - لكل حقل وقت تعديل على الجهاز؛ الخادم يحفظ الأحدث لكل حقل على حدة («الأحدث يغلب»).
 *  - أول مزامنة على جهاز فيه علامات وعلى الحساب علامات: تُدمج (اتحاد بالمعرّف) فلا تضيع علامة.
 *  - الختمة والسجل في أول مزامنة: ما على الحساب يغلب إن وُجد، وإلا يُرفع ما على الجهاز.
 *  - يُرسل بعد 3 ثوانٍ من آخر تعديل، وعند فتح التطبيق، وعند عودة الاتصال.
 */
import { isOnline, onNetworkChange } from "@/lib/network";

export const SYNC_FIELDS = {
  bookmarks: { key: "zen.quran.bookmarks.v1", event: "zen:quran-bookmarks", shape: "array" },
  khatmah: { key: "zen.khatmah.v1", event: "zen:khatmah", shape: "object" },
  history: { key: "zen.quran.history.v1", event: "zen:quran-history", shape: "object" },
} as const;
export type SyncField = keyof typeof SYNC_FIELDS;
const FIELDS = Object.keys(SYNC_FIELDS) as SyncField[];

export const SYNC_META_KEY = "zen.quran.sync.v1";
const DEBOUNCE_MS = 3000;

type Meta = { at: Partial<Record<SyncField, string>>; pending: Partial<Record<SyncField, true>> };
export type ServerState = Partial<Record<SyncField, unknown>> &
  Partial<Record<`${SyncField}_at`, string | null>>;
export type SyncRpc = (args: Record<string, unknown>) => Promise<ServerState>;
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function readMeta(s: Store): Meta {
  try {
    const v = JSON.parse(s.getItem(SYNC_META_KEY) ?? "null") as Meta | null;
    return v && typeof v === "object"
      ? { at: v.at ?? {}, pending: v.pending ?? {} }
      : { at: {}, pending: {} };
  } catch {
    return { at: {}, pending: {} };
  }
}
const writeMeta = (s: Store, m: Meta) => s.setItem(SYNC_META_KEY, JSON.stringify(m));

function readLocal(s: Store, f: SyncField): unknown {
  try {
    const raw = s.getItem(SYNC_FIELDS[f].key);
    if (raw === null) return undefined;
    const v = JSON.parse(raw) as unknown;
    const ok =
      SYNC_FIELDS[f].shape === "array"
        ? Array.isArray(v)
        : !!v && typeof v === "object" && !Array.isArray(v);
    return ok ? v : undefined;
  } catch {
    return undefined;
  }
}

const isEmpty = (v: unknown) =>
  v === undefined || v === null || (Array.isArray(v) && v.length === 0);

/** اتحاد العلامات بالمعرّف؛ عند التعارض تبقى الأحدث إنشاءً. */
export function mergeBookmarks(a: unknown, b: unknown): unknown[] {
  const map = new Map<string, { id?: string; createdAt?: number }>();
  for (const list of [a, b]) {
    if (!Array.isArray(list)) continue;
    for (const x of list as { id?: string; createdAt?: number }[]) {
      if (!x || typeof x.id !== "string") continue;
      const prev = map.get(x.id);
      if (!prev || (x.createdAt ?? 0) > (prev.createdAt ?? 0)) map.set(x.id, x);
    }
  }
  return [...map.values()].sort((x, y) => (y.createdAt ?? 0) - (x.createdAt ?? 0));
}

export function createReadingSync(opts: {
  rpc: SyncRpc;
  store: Store;
  emit?: (event: string) => void;
  now?: () => number;
}) {
  const { rpc, store } = opts;
  const now = opts.now ?? Date.now;
  const emit = opts.emit ?? ((e: string) => window.dispatchEvent(new Event(e)));
  let applying = false;
  let running: Promise<void> | null = null;
  let again = false;

  /** تعديل محلي: يُعلَّم الحقل للرفع بوقته. */
  function markChanged(f: SyncField) {
    if (applying) return;
    const m = readMeta(store);
    m.at[f] = new Date(now()).toISOString();
    m.pending[f] = true;
    writeMeta(store, m);
  }

  function applyServer(f: SyncField, value: unknown) {
    applying = true;
    try {
      store.setItem(SYNC_FIELDS[f].key, JSON.stringify(value));
      emit(SYNC_FIELDS[f].event);
    } finally {
      applying = false;
    }
  }

  async function syncOnce(): Promise<void> {
    const m = readMeta(store);
    const args: Record<string, unknown> = {};
    // أول مزامنة لهذا الجهاز: اقرأ ما على الحساب أولاً لندمج بدل أن نستبدل.
    const firstTime = FIELDS.some((f) => !m.at[f] && !isEmpty(readLocal(store, f)));
    let server: ServerState | null = null;
    if (firstTime) server = await rpc({});
    for (const f of FIELDS) {
      const local = readLocal(store, f);
      if (!m.at[f] && !isEmpty(local)) {
        const remote = server?.[f];
        if (f === "bookmarks") {
          const merged = mergeBookmarks(remote, local);
          applyServer(f, merged);
          m.at[f] = new Date(now()).toISOString();
          m.pending[f] = true;
        } else if (isEmpty(remote)) {
          m.at[f] = new Date(now()).toISOString();
          m.pending[f] = true;
        } else {
          continue; // الحساب يغلب: يُطبَّق أدناه من رد الخادم
        }
      }
      if (m.pending[f] && m.at[f]) {
        args[`_${f}`] =
          local === undefined ? (SYNC_FIELDS[f].shape === "array" ? [] : {}) : readLocal(store, f);
        args[`_${f}_at`] = m.at[f];
      }
    }
    writeMeta(store, m);
    const sent = new Set(FIELDS.filter((f) => `_${f}_at` in args));
    const res = await rpc(args);

    const after = readMeta(store);
    for (const f of FIELDS) {
      const at = res[`${f}_at`];
      if (!at) continue;
      const localAt = after.at[f];
      if (sent.has(f) && localAt === m.at[f]) delete after.pending[f]; // لم يتغيّر أثناء الإرسال
      const serverNewer = !localAt || Date.parse(at) > Date.parse(localAt);
      if (serverNewer && !after.pending[f] && res[f] !== null && res[f] !== undefined) {
        applyServer(f, res[f]);
        after.at[f] = at;
      } else if (!after.pending[f]) {
        after.at[f] = localAt && Date.parse(localAt) > Date.parse(at) ? localAt : at;
      }
    }
    writeMeta(store, after);
  }

  /** مزامنة واحدة في كل وقت؛ طلب أثناء الجارية يعيدها بعدها مرة. */
  function sync(): Promise<void> {
    if (running) {
      again = true;
      return running;
    }
    running = syncOnce()
      .catch(() => undefined) // بلا شبكة: يبقى المعلَّق للمرة القادمة
      .finally(() => {
        running = null;
        if (again) {
          again = false;
          void sync();
        }
      });
    return running;
  }

  return { markChanged, sync, readMeta: () => readMeta(store) };
}

/** يبدأ المزامنة للمستخدم المسجَّل: عند الفتح، وبعد كل تعديل، وعند عودة الاتصال. */
export function startReadingSync(rpc: SyncRpc): () => void {
  if (typeof window === "undefined") return () => undefined;
  const engine = createReadingSync({ rpc, store: localStorage });
  let timer: ReturnType<typeof setTimeout> | null = null;
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (isOnline()) void engine.sync();
    }, DEBOUNCE_MS);
  };
  const offs = FIELDS.map((f) => {
    const fn = () => {
      engine.markChanged(f);
      if (engine.readMeta().pending[f]) schedule();
    };
    window.addEventListener(SYNC_FIELDS[f].event, fn);
    return () => window.removeEventListener(SYNC_FIELDS[f].event, fn);
  });
  if (isOnline()) void engine.sync();
  const offNet = onNetworkChange((online) => {
    if (online) void engine.sync();
  });
  return () => {
    if (timer) clearTimeout(timer);
    offs.forEach((o) => o());
    offNet();
  };
}
