import { supabase } from "@/integrations/supabase/client";

/** «صحة التطبيق» (المرحلة 7.7): لصاحب التطبيق وحده، والخادم يرفض غيره. */
export type AppHealth = {
  days: number;
  errors24h: number;
  errorsPeriod: number;
  usersPeriod: number;
  hourly: { hour: string; errors: number }[];
  top: {
    message: string;
    url: string | null;
    source: string;
    occurrences: number;
    users: number;
    last_seen: string;
  }[];
  alerts: { hour: string; errors: number; threshold: number }[];
};

const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0)) || 0;
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** يحوّل ردّ app_health؛ null لغير صاحب التطبيق. */
export function parseAppHealth(raw: unknown): AppHealth | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  if (r.status !== "ok") return null;
  return {
    days: num(r.days),
    errors24h: num(r.errors_24h),
    errorsPeriod: num(r.errors_period),
    usersPeriod: num(r.users_period),
    hourly: arr<{ hour: string; errors: unknown }>(r.hourly).map((h) => ({
      hour: h.hour,
      errors: num(h.errors),
    })),
    top: arr<AppHealth["top"][number]>(r.top).map((t) => ({
      ...t,
      occurrences: num(t.occurrences),
      users: num(t.users),
    })),
    alerts: arr<AppHealth["alerts"][number]>(r.alerts),
  };
}

/** 24 عموداً للساعات الماضية (الأقدم أولاً)، والساعات بلا أخطاء صفر. */
export function hourlyBuckets(
  hourly: AppHealth["hourly"],
  now = new Date(),
): { hour: Date; errors: number }[] {
  const end = new Date(now);
  end.setMinutes(0, 0, 0);
  const byHour = new Map(hourly.map((h) => [new Date(h.hour).getTime(), h.errors]));
  return Array.from({ length: 24 }, (_, i) => {
    const hour = new Date(end.getTime() - (23 - i) * 3_600_000);
    return { hour, errors: byHour.get(hour.getTime()) ?? 0 };
  });
}

export async function isAppOwner(): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_app_owner");
  return !error && data === true;
}

export async function fetchAppHealth(days = 7): Promise<AppHealth | null> {
  const { data, error } = await supabase.rpc("app_health", { _days: days });
  if (error) throw error;
  return parseAppHealth(data);
}
