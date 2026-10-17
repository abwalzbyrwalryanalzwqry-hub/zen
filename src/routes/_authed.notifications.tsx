import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { PhoneFrame } from "@/components/zen/PhoneFrame";
import { BackButton } from "@/components/zen/BackButton";
import { Bell, Check, CheckCheck, Loader2, Settings2, UserPlus, X } from "lucide-react";
import { useSession } from "@/hooks/useSession";
import {
  listMyHalaqaInvites,
  respondHalaqaInvite,
  timeAgo,
  type HalaqaInviteWithHalaqa,
} from "@/lib/zen-api";
import {
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationRow,
} from "@/lib/zen-lms";
import { fetchNotificationsPage, internalLink, notificationTitle } from "@/lib/notifications-page";
import { useT, t as tStatic } from "@/lib/i18n";
import { useOnResume } from "@/hooks/useOnResume";
import { toast } from "@/lib/toast";
import { usePagesDict } from "@/lib/pages-i18n";

export const Route = createFileRoute("/_authed/notifications")({
  head: () => ({
    meta: [
      { title: tStatic("meta.notifications") },
      {
        name: "description",
        content: tStatic("meta.notificationsDesc"),
      },
      { property: "og:title", content: tStatic("meta.notifications") },
      { property: "og:description", content: tStatic("meta.notificationsOg") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: NotificationsScreen,
});

function NotificationsScreen() {
  usePagesDict();
  const { userId } = useSession();
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [invites, setInvites] = useState<HalaqaInviteWithHalaqa[]>([]);
  const [busyInvite, setBusyInvite] = useState<string | null>(null);
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const t = useT();
  const router = useRouter();

  const [tick, setTick] = useState(0);
  useOnResume(() => setTick((n) => n + 1));
  useEffect(() => {
    if (!userId) return;
    void Promise.all([fetchNotificationsPage(userId), listMyHalaqaInvites(userId)])
      .then(([page, inv]) => {
        setRows(page.rows);
        setMore(page.more);
        setInvites(inv);
        setFailed(false); // نجاح بعد فشل سابق (العودة إلى التطبيق) يُخفي رسالة الخطأ
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, [userId, tick]);

  // الصفحة مفتوحة = التنبيهات أمام المستخدم: نسخها في شريط الجوال لم تعد لازمة.
  useEffect(() => {
    void import("@/lib/notify/device").then((m) => m.clearDeliveredNotifications());
  }, [tick]);

  // إشعار فوري وصل والصفحة مفتوحة: تُعاد قراءة القائمة (1.16.1).
  useEffect(() => {
    const onPush = () => setTick((n) => n + 1);
    window.addEventListener("zen:push", onPush);
    return () => window.removeEventListener("zen:push", onPush);
  }, []);

  // «تحميل المزيد»: الدفعة التالية قبل آخر تنبيه ظاهر.
  const loadMore = async () => {
    if (!userId || loadingMore || rows.length === 0) return;
    setLoadingMore(true);
    try {
      const page = await fetchNotificationsPage(userId, rows[rows.length - 1].created_at);
      setRows((r) => [...r, ...page.rows.filter((x) => !r.some((y) => y.id === x.id))]);
      setMore(page.more);
    } catch {
      setFailed(true);
    } finally {
      setLoadingMore(false);
    }
  };

  const qc = useQueryClient();
  const respond = async (inv: HalaqaInviteWithHalaqa, accept: boolean) => {
    setBusyInvite(inv.id);
    setInviteMsg(null);
    try {
      const res = await respondHalaqaInvite(inv.id, accept);
      setInvites((list) => list.filter((x) => x.id !== inv.id));
      setInviteMsg(
        res === "awaiting_guardian"
          ? t("inbox.acceptedPending", { name: inv.halaqa_name })
          : res === "accepted"
            ? t("inbox.joined", { name: inv.halaqa_name })
            : t("inbox.declined", { name: inv.halaqa_name }),
      );
    } catch (e) {
      setInviteMsg(e instanceof Error ? e.message : t("inbox.opFailed"));
    } finally {
      setBusyInvite(null);
      void qc.invalidateQueries({ queryKey: ["more-badges", userId] });
    }
  };

  const setRead = (ids: Set<string> | "all", read: boolean) =>
    setRows((r) => r.map((x) => (ids === "all" || ids.has(x.id) ? { ...x, read } : x)));
  // تفاؤلي مع تراجع عند الفشل (BUG-05): كان الفشل يُبتلع ويبقى العدّاد خاطئاً.
  const readAll = async () => {
    if (!userId) return;
    const unread = new Set(rows.filter((x) => !x.read).map((x) => x.id));
    if (unread.size === 0) return;
    setRead(unread, true);
    try {
      await markAllNotificationsRead(userId);
      void import("@/lib/notify/device").then((m) => m.clearDeliveredNotifications());
    } catch {
      setRead(unread, false);
      toast.error(t("inbox.markFailed"));
    } finally {
      void qc.invalidateQueries({ queryKey: ["unread-notifications", userId] });
      void qc.invalidateQueries({ queryKey: ["more-badges", userId] });
    }
  };

  const openOne = (n: NotificationRow) => {
    // التنبيه يفتح ما يخصّه أولاً (التسميع، الواجب، الدعوة…) كما يفعل الإشعار الفوري،
    // والتعليم مقروءاً في الخلفية: الشبكة البطيئة لا تؤخّر الانتقال (تحليل «المزيد» BUG-06).
    if (!n.read) {
      setRead(new Set([n.id]), true);
      void markNotificationRead(n.id)
        .catch(() => setRead(new Set([n.id]), false))
        .finally(() => {
          void qc.invalidateQueries({ queryKey: ["unread-notifications", userId] });
          void qc.invalidateQueries({ queryKey: ["more-badges", userId] });
        });
    }
    const to = internalLink(n.link);
    if (to) router.history.push(to);
  };

  return (
    <PhoneFrame>
      <div className="flex-1 flex flex-col">
        <header className="px-5 pt-12 pb-3 flex items-center gap-3">
          <BackButton fallback="/more" />
          <div className="flex-1">
            <h1 className="text-xl font-black text-foreground">{t("inbox.title")}</h1>
            <p className="text-xs text-muted-foreground">{t("inbox.sub")}</p>
          </div>
          <Link
            aria-label={t("inbox.settings")}
            to="/settings/notifications"
            className="w-11 h-11 rounded-xl glass flex items-center justify-center"
          >
            <Settings2 className="w-4 h-4 text-foreground" />
          </Link>
          <button
            aria-label={t("inbox.readAll")}
            onClick={readAll}
            className="w-11 h-11 rounded-xl glass flex items-center justify-center"
          >
            <CheckCheck className="w-4 h-4 text-primary" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-2">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
          ) : (
            <>
              {inviteMsg && <p className="text-center text-xs text-primary py-1">{inviteMsg}</p>}
              {invites.map((inv) => (
                <div key={inv.id} className="glass-strong rounded-2xl p-3 space-y-2">
                  <div className="flex items-start gap-3">
                    <UserPlus className="w-4 h-4 mt-0.5 text-gold" />
                    <div className="flex-1">
                      <p className="text-xs font-bold text-foreground">
                        {t("inbox.invite", { name: inv.halaqa_name })}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {t("inbox.inviteFrom", { name: inv.inviter_name })}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground">{timeAgo(inv.created_at)}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => respond(inv, true)}
                      disabled={busyInvite === inv.id}
                      className="py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center gap-1 disabled:opacity-60"
                    >
                      <Check className="w-3.5 h-3.5" /> {t("inbox.accept")}
                    </button>
                    <button
                      onClick={() => respond(inv, false)}
                      disabled={busyInvite === inv.id}
                      className="py-2 rounded-xl glass text-xs text-muted-foreground flex items-center justify-center gap-1 disabled:opacity-60"
                    >
                      <X className="w-3.5 h-3.5" /> {t("inbox.decline")}
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}
          {loading ? null : rows.length === 0 && invites.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground py-12">{t("inbox.empty")}</p>
          ) : (
            rows.map((n) => (
              <button
                key={n.id}
                data-list-row
                onClick={() => openOne(n)}
                className={`w-full text-start glass rounded-2xl p-3 flex items-start gap-3 ${n.read ? "opacity-60" : ""}`}
              >
                <Bell
                  className={`w-4 h-4 mt-0.5 ${n.read ? "text-muted-foreground" : "text-gold"}`}
                />
                <div className="flex-1">
                  <p className="text-xs font-bold text-foreground">{notificationTitle(n)}</p>
                  {n.body && <p className="text-xs text-muted-foreground mt-0.5">{n.body}</p>}
                </div>
                <span className="text-xs text-muted-foreground">{timeAgo(n.created_at)}</span>
              </button>
            ))
          )}
          {failed && (
            <p role="alert" className="text-center text-xs text-destructive py-2">
              {t("inbox.failed")}
            </p>
          )}
          {more && !loading && (
            <button
              type="button"
              onClick={() => void loadMore()}
              disabled={loadingMore}
              className="w-full min-h-11 rounded-2xl glass text-primary text-xs font-bold disabled:opacity-50"
            >
              {loadingMore ? t("common.loading") : t("inbox.more")}
            </button>
          )}
        </div>
      </div>
    </PhoneFrame>
  );
}
