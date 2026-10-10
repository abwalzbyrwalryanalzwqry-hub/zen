import { useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArchiveRestore, CalendarDays, ClipboardList, Loader2, Pencil, Trash2 } from "lucide-react";
import { EmptyState } from "@/components/zen/common/EmptyState";
import { QueryError } from "@/components/zen/QueryError";
import { ConfirmDialog } from "./ConfirmDialog";
import { DayPreviewSheet } from "./DayPreviewSheet";
import { intlLocale, useLocale, useT } from "@/lib/i18n";
import { toast } from "@/lib/toast";
import { dailyErrorText } from "@/hooks/use-daily-record";
import {
  deleteDailyRecord,
  fetchDailyHistory,
  fetchDailyTrash,
  reopenDailyRecord,
  restoreDailyRecord,
  type HistoryDay,
  type TrashDay,
} from "@/lib/daily-record-api";
import { ensureRegisterDict } from "@/lib/register-i18n";

ensureRegisterDict();

/** حجم الصفحة في قائمة الأيام (الخادم يقبل حتى 30). */
const PAGE = 30;
const TONE: Record<string, string> = {
  open: "bg-gold/15 text-gold-ink",
  completed: "bg-primary/15 text-primary",
  locked: "bg-muted text-muted-foreground",
};

/**
 * قائمة سجلات الحلقة يوماً يوماً (DR-30): عنوان لكل يوم باسمه وتاريخه الميلادي والهجري، الأحدث أعلى،
 * وملخص الحضور والحفظ والمراجعة. «تعديل» يفتح اليوم (والمكتمل يُعاد فتحه بعد تأكيد)، و«حذف» يحذف سجل اليوم
 * كله بعد تأكيد (DR-31) إلى سلّة المحذوفات 30 يوماً مع «استعادة» فورية. المُغلق نهائياً للعرض فقط.
 */
export function RecordHistory({
  halaqa,
  onOpenDay,
}: {
  halaqa: string;
  onOpenDay: (date: string) => void;
}) {
  const t = useT();
  const locale = useLocale();
  const qc = useQueryClient();
  const key = ["daily-record", halaqa, "history"] as const;
  const list = useInfiniteQuery({
    queryKey: key,
    enabled: !!halaqa,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => fetchDailyHistory(halaqa, pageParam, PAGE),
    getNextPageParam: (last) => (last.length < PAGE ? undefined : last[last.length - 1].date),
  });
  const [ask, setAsk] = useState<HistoryDay | null>(null);
  // إعادة فتح يوم مكتمل تغيّر حالته، فتُسأل أولاً (لا تُعاد بلمسة «تعديل» وحدها).
  const [reopenAsk, setReopenAsk] = useState<HistoryDay | null>(null);
  const trash = useQuery({
    queryKey: ["daily-record", halaqa, "trash"],
    enabled: !!halaqa,
    queryFn: () => fetchDailyTrash(halaqa),
  });
  const [busy, setBusy] = useState<string | null>(null);
  // معاينة اليوم في نصف شاشة (1.14.0) قبل التعديل.
  const [preview, setPreview] = useState<HistoryDay | null>(null);
  const days = list.data?.pages.flat() ?? [];

  // بلا حدّ: الأيام الأقدم تُحمَّل تلقائياً عند بلوغ آخر القائمة (والزر يبقى بديلاً للوحة المفاتيح وقارئ الشاشة).
  const sentinel = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = list;
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasNextPage || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !isFetchingNextPage) void fetchNextPage();
      },
      { rootMargin: "400px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const asDate = (d: string) => new Date(`${d}T00:00:00Z`);
  const title = new Intl.DateTimeFormat(intlLocale(locale), {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  // التقويم خيارٌ لا امتداد في الوسم: intlLocale يعيد وسماً بامتداد -u-nu-latn، وإضافة -u- ثانٍ وسمٌ غير صالح.
  const safeHijri = (d: string) => {
    try {
      return new Intl.DateTimeFormat(intlLocale(locale), {
        calendar: "islamic-umalqura",
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(asDate(d));
    } catch {
      return "";
    }
  };

  const edit = (d: HistoryDay) => (d.status === "completed" ? setReopenAsk(d) : onOpenDay(d.date));
  const reopen = async (d: HistoryDay) => {
    setReopenAsk(null);
    setBusy(d.id);
    try {
      await reopenDailyRecord(d.id, d.version);
      void qc.invalidateQueries({ queryKey: ["daily-record", halaqa] });
      onOpenDay(d.date);
    } catch (e) {
      toast.error(dailyErrorText(e));
      void list.refetch();
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!ask) return;
    setBusy(ask.id);
    try {
      const r = await deleteDailyRecord(ask.id, ask.version);
      const trashId = r.trash_id;
      toast.success(
        t("dailyRecord.history.deleted", { date: title.format(asDate(ask.date)) }),
        trashId
          ? {
              duration: 10_000,
              action: {
                label: t("dailyRecord.trash.restore"),
                onClick: () => void restore(trashId),
              },
            }
          : undefined,
      );
      setAsk(null);
      void qc.invalidateQueries({ queryKey: ["daily-record", halaqa] });
    } catch (e) {
      toast.error(dailyErrorText(e));
      setAsk(null);
      void list.refetch();
    } finally {
      setBusy(null);
    }
  };

  const restore = async (id: string) => {
    setBusy(id);
    try {
      const r = await restoreDailyRecord(id);
      toast.success(t("dailyRecord.trash.restored", { date: title.format(asDate(r.date)) }));
      void qc.invalidateQueries({ queryKey: ["daily-record", halaqa] });
    } catch (e) {
      toast.error(dailyErrorText(e));
      void trash.refetch();
    } finally {
      setBusy(null);
    }
  };
  const trashDays = trash.data ?? [];

  if (list.isPending)
    return (
      <div className="flex justify-center py-10" role="status" aria-label={t("common.loading")}>
        <Loader2 className="w-5 h-5 animate-spin text-primary" aria-hidden="true" />
      </div>
    );
  if (list.isError) return <QueryError onRetry={() => void list.refetch()} />;
  if (!days.length && !trashDays.length)
    return (
      <EmptyState
        icon={ClipboardList}
        title={t("dailyRecord.history.empty")}
        hint={t("dailyRecord.history.emptyHint")}
      />
    );

  return (
    <section aria-label={t("dailyRecord.history.label")} className="space-y-2">
      <ul className="space-y-2">
        {days.map((d) => {
          const h = safeHijri(d.date);
          return (
            <li key={d.id} className="glass rounded-3xl p-3.5 space-y-2.5">
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 shrink-0 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                  <CalendarDays className="w-5 h-5" aria-hidden="true" />
                </div>
                <button
                  type="button"
                  onClick={() => setPreview(d)}
                  aria-haspopup="dialog"
                  aria-label={t("dailyRecord.preview.open", { date: title.format(asDate(d.date)) })}
                  className="flex-1 min-w-0 min-h-11 text-start"
                >
                  <h3 className="text-sm font-black text-foreground">
                    {title.format(asDate(d.date))}
                  </h3>
                  {h && <p className="text-xs text-muted-foreground">{h}</p>}
                </button>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${TONE[d.status] ?? ""}`}
                >
                  {t(`dailyRecord.status.${d.status}`)}
                </span>
              </div>
              <dl className="grid grid-cols-3 gap-1.5 text-center">
                {(
                  [
                    // «حاضر» وحده و«متأخر» وحده (كان «حاضر» يشمل المتأخرين فيُعدّون مرتين).
                    ["present", d.present],
                    ["late", d.late],
                    ["absent", d.absent],
                    ["excused", d.excused],
                    ["memorized", d.memorized],
                    ["reviewed", d.reviewed],
                  ] as const
                ).map(([k, n]) => (
                  <div key={k} className="rounded-2xl bg-muted/50 px-1 py-1.5">
                    <dt className="text-xs text-muted-foreground">
                      {t(`dailyRecord.summary.${k}`)}
                    </dt>
                    <dd className="text-sm font-black text-foreground tabular-nums">{n}</dd>
                  </div>
                ))}
              </dl>
              {d.notes && <p className="text-xs text-muted-foreground line-clamp-2">{d.notes}</p>}
              {d.editable ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy === d.id}
                    onClick={() => edit(d)}
                    className="flex-1 min-h-11 rounded-2xl gradient-primary text-primary-foreground text-sm font-bold flex items-center justify-center gap-1.5 disabled:opacity-60"
                  >
                    {busy === d.id && !ask ? (
                      <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Pencil className="w-4 h-4" aria-hidden="true" />
                    )}
                    {t("dailyRecord.history.edit")}
                  </button>
                  <button
                    type="button"
                    disabled={busy === d.id}
                    onClick={() => setAsk(d)}
                    className="min-h-11 px-4 rounded-2xl glass text-sm font-bold text-destructive flex items-center justify-center gap-1.5 disabled:opacity-60"
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                    {t("dailyRecord.history.delete")}
                  </button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground" role="note">
                  {d.status === "locked"
                    ? t("dailyRecord.history.lockedNote")
                    : t("dailyRecord.history.oldNote")}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      <div ref={sentinel} aria-hidden="true" />
      <DayPreviewSheet
        halaqa={halaqa}
        day={preview}
        title={preview ? title.format(asDate(preview.date)) : ""}
        onClose={() => setPreview(null)}
        onEdit={() => {
          const d = preview;
          setPreview(null);
          if (d) edit(d);
        }}
      />
      {list.hasNextPage && (
        <button
          type="button"
          disabled={list.isFetchingNextPage}
          onClick={() => void list.fetchNextPage()}
          className="w-full min-h-11 rounded-2xl glass text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {list.isFetchingNextPage && (
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          )}
          {t("dailyRecord.history.more")}
        </button>
      )}
      {trashDays.length > 0 && (
        <TrashList
          days={trashDays}
          busy={busy}
          format={(d) => title.format(asDate(d))}
          onRestore={restore}
        />
      )}
      <ConfirmDialog
        open={!!reopenAsk}
        title={t("dailyRecord.history.reopenTitle", {
          date: reopenAsk ? title.format(asDate(reopenAsk.date)) : "",
        })}
        body={t("dailyRecord.history.reopenBody")}
        confirmLabel={t("dailyRecord.history.reopenConfirm")}
        onCancel={() => setReopenAsk(null)}
        onConfirm={() => reopenAsk && void reopen(reopenAsk)}
      />
      <ConfirmDialog
        open={!!ask}
        title={t("dailyRecord.history.deleteTitle", {
          date: ask ? title.format(asDate(ask.date)) : "",
        })}
        body={t("dailyRecord.history.deleteBody")}
        confirmLabel={t("dailyRecord.history.deleteConfirm")}
        destructive
        busy={!!ask && busy === ask.id}
        onCancel={() => setAsk(null)}
        onConfirm={() => void remove()}
      />
    </section>
  );
}

/** «المحذوفة مؤخراً»: أيام في سلّة المحذوفات تُستعاد بلمسة خلال 30 يوماً من حذفها. */
function TrashList({
  days,
  busy,
  format,
  onRestore,
}: {
  days: readonly TrashDay[];
  busy: string | null;
  format: (date: string) => string;
  onRestore: (id: string) => void;
}) {
  const t = useT();
  const locale = useLocale();
  const until = new Intl.DateTimeFormat(intlLocale(locale), { day: "numeric", month: "long" });
  return (
    <section aria-label={t("dailyRecord.trash.label")} className="space-y-2 pt-2">
      <h3 className="text-xs font-black text-muted-foreground px-1 flex items-center gap-1.5">
        <ArchiveRestore className="w-4 h-4" aria-hidden="true" />
        {t("dailyRecord.trash.label")}
      </h3>
      <ul className="space-y-2">
        {days.map((d) => (
          <li
            key={d.id}
            className="rounded-2xl border border-dashed border-border/70 p-3 flex items-center gap-2"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-foreground truncate">{format(d.date)}</p>
              <p className="text-xs text-muted-foreground">
                {d.restorable
                  ? t("dailyRecord.trash.until", { date: until.format(new Date(d.expires_at)) })
                  : t("dailyRecord.trash.blocked")}
              </p>
            </div>
            <button
              type="button"
              disabled={!d.restorable || busy === d.id}
              onClick={() => onRestore(d.id)}
              className="min-h-11 px-3 rounded-2xl bg-primary/12 text-primary text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
            >
              {busy === d.id ? (
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              ) : (
                <ArchiveRestore className="w-4 h-4" aria-hidden="true" />
              )}
              {t("dailyRecord.trash.restore")}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** تبويبات السجل اليومي: تسجيل اليوم، والسجلات السابقة، وسجل الإنجاز، والتدقيق (1.18.0). */
export type RegisterView = "history" | "achievement" | "audit";
const TAB_LABEL = {
  today: "dailyRecord.history.tabToday",
  history: "dailyRecord.history.tabList",
  achievement: "dailyRecord.history.tabAchievement",
  audit: "dailyRecord.history.tabAudit",
} as const;

export function RegisterTabs({
  view,
  onChange,
}: {
  view: RegisterView | undefined;
  onChange: (v: RegisterView | undefined) => void;
}) {
  const t = useT();
  return (
    <div
      role="tablist"
      aria-label={t("dailyRecord.history.label")}
      className="grid grid-cols-4 gap-1 rounded-2xl glass p-1"
    >
      {([undefined, "history", "achievement", "audit"] as const).map((v) => {
        const on = view === v;
        return (
          <button
            key={v ?? "today"}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(v)}
            className={`min-h-11 rounded-xl px-1 text-xs font-bold leading-tight transition-colors ${on ? "gradient-primary text-primary-foreground shadow-soft" : "text-muted-foreground"}`}
          >
            {t(TAB_LABEL[v ?? "today"])}
          </button>
        );
      })}
    </div>
  );
}
