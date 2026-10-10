import { useQuery } from "@tanstack/react-query";
import { useLocale, useT } from "@/lib/i18n";
import { fetchStorageUsage, formatBytes } from "@/lib/server-storage";
import { QueryError } from "@/components/zen/QueryError";

/** بطاقة حجم قاعدة البيانات والتخزين في لوحة صاحب التطبيق (المرحلة 2.3). */
export function ServerStorageCard() {
  const t = useT();
  const locale = useLocale();
  const q = useQuery({ queryKey: ["storage-usage"], queryFn: fetchStorageUsage, retry: false });
  if (q.isError) return <QueryError compact onRetry={() => void q.refetch()} />;
  if (!q.data) return null;
  const u = q.data;
  const pct = (r: number) => `${Math.min(100, Math.round(r * 100))}%`;
  const bar = (r: number, label: string) => (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.min(100, Math.round(r * 100))}
      className="h-2 rounded-full bg-secondary/60 overflow-hidden"
    >
      <div
        className={`h-full rounded-full ${r >= 0.8 ? "bg-destructive" : "bg-primary"}`}
        style={{ width: pct(r) }}
      />
    </div>
  );
  return (
    <section aria-label={t("serverStorage.title")} className="glass rounded-3xl p-4 space-y-3">
      <h2 className="text-sm font-bold">{t("serverStorage.title")}</h2>
      {u.warn && (
        <p role="alert" className="text-xs text-destructive">
          {t("serverStorage.warn")}
        </p>
      )}
      <div className="space-y-1">
        <div className="flex justify-between text-xs">
          <span>{t("serverStorage.db")}</span>
          <span className="tabular-nums">
            {formatBytes(u.dbBytes, locale)} · {pct(u.dbRatio)}
          </span>
        </div>
        {bar(u.dbRatio, t("serverStorage.db"))}
      </div>
      <div className="space-y-1">
        <div className="flex justify-between text-xs">
          <span>{t("serverStorage.files")}</span>
          <span className="tabular-nums">
            {formatBytes(u.storageBytes, locale)} · {pct(u.storageRatio)}
          </span>
        </div>
        {bar(u.storageRatio, t("serverStorage.files"))}
      </div>
      <ul className="text-xs divide-y divide-border">
        {u.buckets.map((b) => (
          <li key={b.id} className="flex justify-between py-1.5">
            <span dir="ltr">{b.id}</span>
            <span className="tabular-nums">{formatBytes(b.bytes, locale)}</span>
          </li>
        ))}
      </ul>
      <p className="text-[0.6875rem] text-muted-foreground">
        {t("serverStorage.retention", { purged: u.purged30d, pending: u.pendingPurge })}
      </p>
    </section>
  );
}
