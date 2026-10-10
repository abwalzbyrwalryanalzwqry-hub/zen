import { t } from "@/lib/i18n";

/** مدة منذ وقتٍ بنصوص القاموس («3 ساعة»، «2 يوم»). للعرض في شريط «آخر تحديث منذ…» (3.9). */
export function agoText(since: number, now = Date.now()): string {
  const s = Math.max(0, (now - since) / 1000);
  if (s < 60) return t("time.justNow");
  if (s < 3600) return t("time.minutes", { n: Math.floor(s / 60) });
  if (s < 86400) return t("time.hours", { n: Math.floor(s / 3600) });
  return t("time.days", { n: Math.floor(s / 86400) });
}
