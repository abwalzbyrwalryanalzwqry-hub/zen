import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  Database,
  FileOutput,
  HardDrive,
  Headphones,
  Loader2,
  Send,
  Trash2,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { PhoneFrame } from "@/components/zen/PhoneFrame";
import { BackButton } from "@/components/zen/BackButton";
import { t as tt, useT } from "@/lib/i18n";
import { useConfirm } from "@/hooks/useConfirm";
import { QueryError } from "@/components/zen/QueryError";
import {
  clearExportFiles,
  clearOfflineData,
  clearRecitations,
  formatBytes,
  storageUsage,
  type StorageUsage,
} from "@/lib/storage-usage";
import {
  RECITATION_CAPS_MB,
  getRecitationCapMb,
  setRecitationCapMb,
} from "@/lib/quran/recitation-offline";

type Which = "rec" | "data" | "exports";
const CONFIRM = {
  rec: "storage.confirmRecitations",
  data: "storage.confirmData",
  exports: "storage.confirmExports",
} as const;
const LABEL = {
  rec: "storage.clearRecitations",
  data: "storage.clearData",
  exports: "storage.clearExports",
} as const;
const CLEAR: Record<Which, () => Promise<unknown>> = {
  rec: clearRecitations,
  data: clearOfflineData,
  exports: clearExportFiles,
};

export const Route = createFileRoute("/_authed/storage")({
  head: () => ({ meta: [{ title: `${tt("storage.title")} — Zen` }] }),
  component: StoragePage,
});

/** التنزيلات والتخزين (3.10): ما يشغله التطبيق على الجهاز، وحذف ما يمكن إعادة تنزيله. */
function StoragePage() {
  const t = useT();
  const [busy, setBusy] = useState<Which | null>(null);
  const [capMb, setCapMb] = useState(getRecitationCapMb);
  const [confirmDialog, ask] = useConfirm();

  // BUG-04: أي استثناء كان يُبقي مؤشر التحميل للأبد؛ الآن حالة خطأ بإعادة.
  // مفتاح مستقل: ["storage-usage"] لمساحة الخادم في ServerStorageCard (شكل بيانات آخر).
  const q = useQuery({ queryKey: ["device-storage-usage"], queryFn: storageUsage, retry: false });
  const usage: StorageUsage | null = q.data ?? null;
  const failed = q.isError;
  const refresh = () => void q.refetch();

  const clear = async (which: Which) => {
    const ok = await ask({ title: t(CONFIRM[which]), confirmLabel: t(LABEL[which]) });
    if (!ok) return;
    setBusy(which);
    try {
      await CLEAR[which]();
      toast.success(t("storage.cleared"));
    } catch {
      toast.error(t("storage.clearFailed"));
    } finally {
      setBusy(null);
      refresh();
    }
  };

  return (
    <PhoneFrame>
      <div className="flex-1 flex flex-col">
        <header className="px-5 pt-12 pb-3 flex items-center gap-3">
          <BackButton fallback="/more" />
          <div className="flex-1">
            <h1 className="text-xl font-black text-foreground">{t("storage.title")}</h1>
            <p className="text-xs text-muted-foreground">{t("storage.subtitle")}</p>
          </div>
          <HardDrive className="w-5 h-5 text-gold" aria-hidden="true" />
        </header>

        <div className="flex-1 overflow-y-auto px-3 pb-6 space-y-3">
          {failed && !usage ? (
            <QueryError onRetry={refresh} />
          ) : !usage ? (
            <div
              className="flex justify-center py-12"
              role="status"
              aria-label={t("common.loading")}
            >
              <Loader2 className="w-5 h-5 animate-spin text-primary" aria-hidden="true" />
            </div>
          ) : (
            <>
              {usage.device && (
                <section
                  className="glass-strong rounded-3xl p-4 space-y-2"
                  aria-label={t("storage.device")}
                >
                  <p className="text-sm text-foreground">{t("storage.device")}</p>
                  <div
                    className="h-2 rounded-full bg-muted overflow-hidden"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(
                      (usage.device.usage / Math.max(1, usage.device.quota)) * 100,
                    )}
                    aria-label={t("storage.device")}
                  >
                    <div
                      className="h-full bg-primary"
                      style={{
                        width: `${Math.min(100, (usage.device.usage / Math.max(1, usage.device.quota)) * 100)}%`,
                      }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t("storage.deviceUsage", {
                      used: formatBytes(usage.device.usage),
                      quota: formatBytes(usage.device.quota),
                    })}
                  </p>
                </section>
              )}

              <Row
                icon={Headphones}
                title={t("storage.recitations")}
                detail={t("storage.recitationsDetail", {
                  n: usage.recitations.count,
                  size: formatBytes(usage.recitations.bytes),
                })}
                action={
                  usage.recitations.count > 0 ? (
                    <ClearButton
                      busy={busy === "rec"}
                      label={t("storage.clearRecitations")}
                      onClick={() => void clear("rec")}
                    />
                  ) : null
                }
              >
                <Link
                  to="/mushaf/recitations"
                  className="inline-flex items-center gap-1 min-h-11 text-xs text-primary font-semibold"
                >
                  {t("storage.manageRecitations")}
                  <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
                </Link>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span id="rec-cap-label" className="flex-1">
                    {t("storage.recitationsCap")}
                    <span className="block">{t("storage.recitationsCapHint")}</span>
                  </span>
                  <select
                    aria-labelledby="rec-cap-label"
                    value={capMb}
                    onChange={(e) => {
                      const mb = Number(e.target.value);
                      setCapMb(mb);
                      void setRecitationCapMb(mb).then((n) => {
                        if (n) toast.success(t("storage.recitationsCapTrimmed", { n }));
                        refresh();
                      });
                    }}
                    className="min-h-11 rounded-xl glass px-2 text-foreground text-xs"
                  >
                    {RECITATION_CAPS_MB.map((mb) => (
                      <option key={mb} value={mb}>
                        {mb ? formatBytes(mb * 1024 * 1024) : t("storage.recitationsCapNone")}
                      </option>
                    ))}
                  </select>
                </label>
              </Row>

              <Row
                icon={Database}
                title={t("storage.offlineData")}
                detail={t("storage.offlineDataDetail", {
                  n: usage.offlineData.count,
                  size: formatBytes(usage.offlineData.bytes),
                  cap: formatBytes(usage.offlineData.cap),
                })}
                action={
                  usage.offlineData.count > 0 ? (
                    <ClearButton
                      busy={busy === "data"}
                      label={t("storage.clearData")}
                      onClick={() => void clear("data")}
                    />
                  ) : null
                }
              />

              {usage.exports.count > 0 && (
                <Row
                  icon={FileOutput}
                  title={t("storage.exports")}
                  detail={t("storage.exportsDetail", {
                    n: usage.exports.count,
                    size: formatBytes(usage.exports.bytes),
                  })}
                  action={
                    <ClearButton
                      busy={busy === "exports"}
                      label={t("storage.clearExports")}
                      onClick={() => void clear("exports")}
                    />
                  }
                />
              )}

              {usage.pendingMedia.count > 0 && (
                <Row
                  icon={Send}
                  title={t("storage.pendingMedia")}
                  detail={t("storage.pendingMediaDetail", {
                    n: usage.pendingMedia.count,
                    size: formatBytes(usage.pendingMedia.bytes),
                  })}
                />
              )}

              <p className="text-xs text-muted-foreground px-2 leading-relaxed">
                {t("storage.bundledNote")}
              </p>
            </>
          )}
        </div>
        {confirmDialog}
      </div>
    </PhoneFrame>
  );
}

function Row({
  icon: Icon,
  title,
  detail,
  action,
  children,
}: {
  icon: typeof HardDrive;
  title: string;
  detail: string;
  action?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <section className="glass-strong rounded-3xl p-4 space-y-2" aria-label={title}>
      <div className="flex items-center gap-3">
        <Icon className="w-5 h-5 text-primary shrink-0" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground">{detail}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function ClearButton({
  busy,
  label,
  onClick,
}: {
  busy: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-label={label}
      className="min-h-11 min-w-11 rounded-xl glass flex items-center justify-center text-destructive disabled:opacity-50"
    >
      {busy ? (
        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
      ) : (
        <Trash2 className="w-4 h-4" aria-hidden="true" />
      )}
    </button>
  );
}
