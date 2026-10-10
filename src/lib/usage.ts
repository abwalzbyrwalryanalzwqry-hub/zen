/**
 * تحليلات تحترم الخصوصية (المرحلة 13.4). لا يُرسل شيء بلا موافقة صريحة، ولا تتبّع لمن دون 13
 * (يرفضه الخادم أيضاً). كل حدث يُرسل **مرة واحدة في اليوم** على الأكثر من الجهاز، والخادم يخزّن
 * عدّاداً مجمّعاً بلا أي معرّف (usage_daily). الإخفاق صامت دائماً.
 */
import { lazyRpc as rpc } from "@/integrations/supabase/lazy";
import { nativePlatform } from "@/lib/native";

export type UsageEvent =
  | "app_open"
  | "mushaf_open"
  | "assistant_ask"
  | "exam_done"
  | "recite_done"
  | "room_join"
  | "session_recorded"
  | "share_card"
  // قفل التطبيق 1.29.0: أعداد مجمّعة بلا معرّف (كم جهازاً يستعمل القفل، وكم استعادة، وكم عطل PIN).
  | "lock_active"
  | "lock_recovered"
  | "lock_pin_unavailable";

export type AnalyticsConsent = { granted: boolean; age_13_plus: boolean; eligible: boolean };

const CONSENT_KEY = "zen-usage-consent";
const SENT_KEY = "zen-usage-sent";

type Sent = { day: string; events: string[] };

/** اليوم بتوقيت UTC (كما يعدّ الخادم). */
export function utcDay(now = new Date()): string {
  // مقصود: العدّادات المجمّعة تُعدّ بيوم UTC على الخادم.
  // eslint-disable-next-line no-restricted-syntax
  return now.toISOString().slice(0, 10);
}

/** يُرسل الحدث إن لم يُرسل اليوم؛ يعيد الحالة الجديدة أو null إن سبق. */
export function markSent(prev: Sent | null, event: string, day: string): Sent | null {
  const base = prev && prev.day === day ? prev : { day, events: [] };
  if (base.events.includes(event)) return null;
  return { day, events: [...base.events, event] };
}

function read<T>(k: string): T | null {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}
function write(k: string, v: unknown) {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* تخزين غير متاح */
  }
}

export function localConsent(): boolean {
  return read<boolean>(CONSENT_KEY) === true;
}

let queue: UsageEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

async function flush() {
  timer = null;
  const events = queue;
  queue = [];
  if (!events.length) return;
  try {
    await rpc("track_usage", { _events: events, _platform: nativePlatform() ?? "other" });
  } catch {
    /* صامت */
  }
}

/** يسجّل استعمال ميزة (مرة في اليوم) إن وافق المستخدم على هذا الجهاز. */
export function track(event: UsageEvent): void {
  if (!localConsent()) return;
  const next = markSent(read<Sent>(SENT_KEY), event, utcDay());
  if (!next) return;
  write(SENT_KEY, next);
  queue.push(event);
  if (!timer) timer = setTimeout(() => void flush(), 3000);
}

export async function fetchAnalyticsConsent(): Promise<AnalyticsConsent> {
  const { data, error } = await rpc("my_analytics_consent");
  if (error) throw error;
  const d = (data ?? {}) as Partial<AnalyticsConsent>;
  const c = { granted: !!d.granted, age_13_plus: !!d.age_13_plus, eligible: d.eligible !== false };
  write(CONSENT_KEY, c.granted ? true : null);
  return c;
}

export async function setAnalyticsConsent(
  granted: boolean,
  age13Plus: boolean,
): Promise<AnalyticsConsent> {
  const { data, error } = await rpc("set_analytics_consent", {
    _granted: granted,
    _age_13_plus: age13Plus,
  });
  if (error) throw error;
  const d = (data ?? {}) as Partial<AnalyticsConsent>;
  const c = { granted: !!d.granted, age_13_plus: !!d.age_13_plus, eligible: d.eligible !== false };
  write(CONSENT_KEY, c.granted ? true : null);
  if (!c.granted) write(SENT_KEY, null);
  return c;
}

export type UsageRow = { day: string; event: string; platform: string; count: number };
export type UsageSummary = { days: number; rows: UsageRow[]; consented: number; accounts: number };

export async function amAppOwner(): Promise<boolean> {
  const { data, error } = await rpc("am_app_owner");
  if (error) return false;
  return data === true;
}

export async function fetchUsageSummary(days = 30): Promise<UsageSummary> {
  const { data, error } = await rpc("usage_summary", { _days: days });
  if (error) throw error;
  return data as unknown as UsageSummary;
}

/** مجموع كل حدث في المدة، مرتّباً تنازلياً. */
export function totalsByEvent(rows: UsageRow[]): { event: string; total: number }[] {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.event, (m.get(r.event) ?? 0) + Number(r.count));
  return [...m.entries()]
    .map(([event, total]) => ({ event, total }))
    .sort((a, b) => b.total - a.total || a.event.localeCompare(b.event));
}
