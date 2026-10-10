import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Eye, Flag, Loader2 } from "lucide-react";
import {
  listOpenMessageReports,
  listSupervisedChats,
  resolveMessageReport,
  type MessageReport,
  type SupervisedChat,
} from "@/lib/chat-safety";
import { timeAgo } from "@/lib/zen-api";
import { useAsync } from "@/hooks/use-async";

/**
 * للمعلّم وإدارة المركز: بلاغات المحادثات المفتوحة، ومحادثات طلاب الحلقة فيما بينهم (اطلاع فقط).
 * لا يظهر شيء لمن لا يملك أيّاً منهما. ولي الأمر لا يصل إلى هذه البيانات أصلاً (قرار المالك).
 */
export function ChatModeration() {
  const q = useAsync("chat-moderation", async () => {
    const [reports, supervised] = await Promise.all([
      listOpenMessageReports(),
      listSupervisedChats(),
    ]);
    return { reports, supervised };
  });
  const reports: MessageReport[] = q.data?.reports ?? [];
  const supervised: SupervisedChat[] = q.data?.supervised ?? [];
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  if (reports.length === 0 && supervised.length === 0) return null;

  const resolve = async (id: string) => {
    setBusy(id);
    try {
      await resolveMessageReport(id);
      q.setData((d) => d && { ...d, reports: d.reports.filter((x) => x.id !== id) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-5 mt-3 space-y-2">
      {reports.length > 0 && (
        <div className="glass rounded-3xl p-3 border border-destructive/30">
          <p className="text-xs font-bold flex items-center gap-2 mb-2">
            <Flag className="w-3.5 h-3.5 text-destructive" />
            بلاغات المحادثات ({reports.length})
          </p>
          <ul className="space-y-2">
            {reports.map((r) => (
              <li key={r.id} className="rounded-2xl bg-background/40 p-2.5">
                <p className="text-[0.6875rem] text-muted-foreground">
                  من {r.reporter_name} عن رسالة {r.sender_name} · {timeAgo(r.created_at)}
                </p>
                <p className="text-xs mt-1 whitespace-pre-line line-clamp-4">
                  {r.type === "text" ? r.content : r.type === "image" ? "[صورة]" : "[رسالة صوتية]"}
                </p>
                {r.reason && (
                  <p className="text-[0.6875rem] text-muted-foreground mt-1">السبب: {r.reason}</p>
                )}
                <div className="flex gap-2 mt-2">
                  {r.can_open && (
                    <Link
                      to="/chats/$chatId"
                      params={{ chatId: r.chat_id }}
                      className="text-[0.6875rem] px-3 py-1 rounded-full glass"
                    >
                      فتح المحادثة
                    </Link>
                  )}
                  <button
                    onClick={() => void resolve(r.id)}
                    disabled={busy === r.id}
                    className="text-[0.6875rem] px-3 py-1 rounded-full bg-primary text-primary-foreground disabled:opacity-60"
                  >
                    {busy === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : "تمت المراجعة"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {supervised.length > 0 && (
        <div className="glass rounded-3xl p-3">
          <button
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="w-full text-xs font-bold flex items-center gap-2"
          >
            <Eye className="w-3.5 h-3.5 text-primary" />
            <span className="flex-1 text-start">محادثات طلابي ({supervised.length})</span>
            <span className="text-[0.625rem] text-muted-foreground font-normal">
              {open ? "إخفاء" : "عرض"}
            </span>
          </button>
          {open && (
            <ul className="mt-2 space-y-1">
              {supervised.map((c) => (
                <li key={c.chat_id}>
                  <Link
                    to="/chats/$chatId"
                    params={{ chatId: c.chat_id }}
                    className="block rounded-2xl px-2.5 py-2 hover:bg-accent"
                  >
                    <p className="text-xs font-medium truncate">{c.names}</p>
                    <p className="text-[0.6875rem] text-muted-foreground truncate">
                      {c.last_message} · {timeAgo(c.updated_at)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
