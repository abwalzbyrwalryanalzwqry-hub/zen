/**
 * اشتراك لحظي واحد على مستوى التطبيق (M6).
 *
 * كان شريط التنقل وقائمة المحادثات وقائمة الغرف والإشعارات تفتح كلٌّ قناته، وبعضها يستمع لجداول كاملة
 * بلا مرشّح (`messages` و`room_messages`)، وشريط التنقل يعيد الاشتراك مع كل تغيير مسار. كل حدث في
 * جدول كامل يُقيَّم على خادم Realtime لكل مشترك (RLS)، فيتضاعف الحمل مع عدد المستخدمين.
 *
 * الآن قناة واحدة لكل مستخدم `zen-live:{uid}` بمرشّحات:
 *  - `messages` بـ `chat_id=in.(محادثاتي)`، و`room_messages` بـ `room_id=in.(غرفي)`.
 *  - `chats` (إدراج فقط، نادر) لاكتشاف محادثة جديدة فتُحدَّث قائمة المحادثات المرشَّحة.
 * المستمعون يشتركون في القناة نفسها بعدّاد مراجع، وتُغلق بعد مهلة قصيرة من آخر مستمع حتى لا تُهدم
 * وتُبنى عند كل تنقّل بين الشاشات. شاشة المحادثة والغرفة المفتوحة تبقى بقناتها المرشَّحة بمعرّفها.
 *
 * الإشعارات والتطبيق في الخلفية تصل من FCM وحده (القاعدتان 28 و33)، فلا اشتراك لحظي في
 * `notifications` (لم يكن الجدول في نشر Realtime أصلاً، ولا عامل خدمة يُظهر تنبيهاً).
 */
import { GUEST_ID } from "@/lib/offline/guest";

export type LiveEvent =
  | { kind: "message"; type: "INSERT" | "UPDATE"; row: Record<string, unknown> }
  | { kind: "room_message"; type: "INSERT"; row: Record<string, unknown> }
  | { kind: "chat"; type: "INSERT"; row: Record<string, unknown> };

type Listener = (e: LiveEvent) => void;

/** أقصى عدد قيم في مرشّح `in` لدى Supabase Realtime. */
export const REALTIME_IN_LIMIT = 100;
const TEARDOWN_MS = 5_000;

type Channel = {
  on: (...args: unknown[]) => Channel;
  subscribe: () => Channel;
};

export type HubClient = {
  channel: (name: string) => Channel;
  removeChannel: (c: Channel) => unknown;
  from: (t: string) => {
    select: (c: string) => PromiseLike<{ data: { id: string }[] | null; error: unknown }>;
  };
  rpc: (fn: string) => PromiseLike<{ data: unknown; error: unknown }>;
};

/** مرشّح `in` لقائمة معرّفات، أو null إن كانت فارغة (لا اشتراك بلا مرشّح). */
export function inFilter(column: string, ids: readonly string[]): string | null {
  const list = [...new Set(ids)].sort().slice(0, REALTIME_IN_LIMIT);
  return list.length ? `${column}=in.(${list.join(",")})` : null;
}

export function createRealtimeHub(client: HubClient) {
  const listeners = new Set<Listener>();
  let uid: string | null = null;
  let channel: Channel | null = null;
  let chatIds: string[] = [];
  let roomIds: string[] = [];
  let teardown: ReturnType<typeof setTimeout> | null = null;
  let generation = 0;

  const emit = (e: LiveEvent) => {
    for (const l of listeners) l(e);
  };

  async function loadIds(): Promise<void> {
    // المحادثات بسياسة «المشارك يقرأ»، والغرف عبر my_rooms (لا قراءة مباشرة لـ halaqa_rooms).
    const [c, r] = await Promise.all([client.from("chats").select("id"), client.rpc("my_rooms")]);
    if (c.error && r.error) throw new Error("ids");
    if (!c.error) chatIds = (c.data ?? []).map((x) => x.id);
    if (!r.error) {
      roomIds = ((r.data as { room_id?: string }[] | null) ?? [])
        .map((x) => x.room_id)
        .filter((x): x is string => typeof x === "string");
    }
  }

  function close() {
    if (channel) void client.removeChannel(channel);
    channel = null;
  }

  function open(user: string) {
    close();
    let ch = client.channel(`zen-live:${user}`);
    const pg = (
      filter: Record<string, string>,
      fn: (p: { new: Record<string, unknown> }) => void,
    ) => {
      ch = ch.on("postgres_changes", { schema: "public", ...filter }, fn);
    };
    pg({ event: "INSERT", table: "chats" }, (p) => {
      emit({ kind: "chat", type: "INSERT", row: p.new });
      void refresh(); // محادثة جديدة: وسّع مرشّح الرسائل
    });
    const msgs = inFilter("chat_id", chatIds);
    if (msgs) {
      pg({ event: "INSERT", table: "messages", filter: msgs }, (p) =>
        emit({ kind: "message", type: "INSERT", row: p.new }),
      );
      pg({ event: "UPDATE", table: "messages", filter: msgs }, (p) =>
        emit({ kind: "message", type: "UPDATE", row: p.new }),
      );
    }
    const rooms = inFilter("room_id", roomIds);
    if (rooms) {
      pg({ event: "INSERT", table: "room_messages", filter: rooms }, (p) =>
        emit({ kind: "room_message", type: "INSERT", row: p.new }),
      );
    }
    channel = ch.subscribe();
  }

  /** يعيد قراءة المعرّفات ويبني القناة من جديد إن تغيّرت. */
  async function refresh(): Promise<void> {
    if (!uid) return;
    const gen = ++generation;
    const before = `${inFilter("chat_id", chatIds)}|${inFilter("room_id", roomIds)}`;
    try {
      await loadIds();
    } catch {
      return; // بلا شبكة: تبقى القناة الحالية
    }
    if (gen !== generation || !uid || !listeners.size) return;
    const after = `${inFilter("chat_id", chatIds)}|${inFilter("room_id", roomIds)}`;
    if (!channel || before !== after) open(uid);
  }

  return {
    /** يشترك مستمعٌ لمستخدم معيّن، ويعيد دالة الإلغاء. */
    subscribe(user: string, fn: Listener): () => void {
      if (teardown) {
        clearTimeout(teardown);
        teardown = null;
      }
      listeners.add(fn);
      if (uid !== user) {
        uid = user;
        chatIds = [];
        roomIds = [];
        close();
        void refresh();
      } else if (!channel) {
        void refresh();
      }
      return () => {
        listeners.delete(fn);
        if (listeners.size) return;
        teardown = setTimeout(() => {
          teardown = null;
          if (!listeners.size) {
            close();
            uid = null;
          }
        }, TEARDOWN_MS);
      };
    },
    /** بعد إنشاء محادثة أو الانضمام إلى غرفة من هذا الجهاز. */
    refresh,
    /** للاختبار. */
    state: () => ({ uid, chatIds, roomIds, open: !!channel, listeners: listeners.size }),
  };
}

let shared: ReturnType<typeof createRealtimeHub> | null = null;

/** المحور المشترك للتطبيق (عميل Supabase يُحمَّل عند أول استعمال). */
export async function realtimeHub() {
  if (!shared) {
    const { supabase } = await import("@/integrations/supabase/client");
    shared = createRealtimeHub(supabase as unknown as HubClient);
  }
  return shared;
}

/** اشتراك من مكوّن React: يعيد دالة إلغاء متزامنة حتى لو لم يُحمَّل المحور بعد. */
export function subscribeLive(user: string, fn: Listener): () => void {
  // الضيف بلا حساب: لا اتصال لحظي يخرج من الجهاز.
  if (user === GUEST_ID) return () => undefined;
  let off: (() => void) | null = null;
  let cancelled = false;
  void realtimeHub().then((hub) => {
    if (!cancelled) off = hub.subscribe(user, fn);
  });
  return () => {
    cancelled = true;
    off?.();
  };
}
