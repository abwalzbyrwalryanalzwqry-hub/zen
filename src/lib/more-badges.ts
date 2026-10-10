/**
 * شارات «المزيد» (تحليل «المزيد» GAP-01): أعداد من الخادم (`more_badges()`) تُرسم بجانب المدخل المعني،
 * فلا تبقى القائمة صامتة عن إشعار غير مقروء أو دعوة تنتظر أو طلاب متعثّرين.
 */
import { rpc } from "@/integrations/supabase/rpc";

export type MoreBadges = { notifications: number; invites: number; at_risk: number };

export const NO_BADGES: MoreBadges = { notifications: 0, invites: 0, at_risk: 0 };

const n = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) && x > 0 ? Math.floor(x) : 0;
};

export function parseBadges(raw: unknown): MoreBadges {
  const r = (raw ?? {}) as Record<string, unknown>;
  return { notifications: n(r.notifications), invites: n(r.invites), at_risk: n(r.at_risk) };
}

export async function fetchMoreBadges(): Promise<MoreBadges> {
  const { data, error } = await rpc("more_badges");
  if (error) throw error;
  return parseBadges(data);
}

/**
 * عدد الشارة لمدخل بمفتاحه، أو 0. الدعوات تظهر في صفحة الإشعارات نفسها، فتُجمع معها.
 */
export function badgeFor(linkKey: string, b: MoreBadges): number {
  if (linkKey === "notifications") return b.notifications + b.invites;
  if (linkKey === "atRisk") return b.at_risk;
  return 0;
}

/** «99+» بدل أرقام طويلة تكسر الصف. */
export function badgeText(count: number): string {
  return count > 99 ? "99+" : String(count);
}
