import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, Search, Users } from "lucide-react";
import { PhoneFrame } from "@/components/zen/PhoneFrame";
import { PageHeader } from "@/components/zen/common/PageHeader";
import { EmptyState } from "@/components/zen/common/EmptyState";
import { QueryError } from "@/components/zen/QueryError";
import { useSession } from "@/hooks/useSession";
import { colorFor, getOrCreateDirectChat, initialOf } from "@/lib/zen-api";
import { fetchContacts, groupContacts, type Contact } from "@/lib/contacts";
import { useT, t as tStatic } from "@/lib/i18n";

export const Route = createFileRoute("/_authed/chats/new")({
  head: () => ({ meta: [{ title: tStatic("meta.newChat") }] }),
  component: NewChat,
});

/** جهات الاتصال مجمَّعة بصلتها مع بحث (فحص الأقسام C6)، بدل قائمة مسطّحة «معلم/طالب». */
function NewChat() {
  const { userId } = useSession();
  const navigate = useNavigate();
  const t = useT();
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const contacts = useQuery({
    queryKey: ["chat-contacts", userId],
    enabled: !!userId,
    retry: 1,
    staleTime: 5 * 60_000,
    queryFn: fetchContacts,
  });
  const groups = groupContacts(contacts.data ?? [], q);

  const start = async (peerId: string) => {
    if (!userId) return;
    setCreating(peerId);
    setError(null);
    try {
      const chatId = await getOrCreateDirectChat(userId, peerId);
      void navigate({ to: "/chats/$chatId", params: { chatId } });
    } catch {
      setError(t("contacts.cannotStart"));
    } finally {
      setCreating(null);
    }
  };
  const sub = (c: Contact) =>
    c.via ? t(`contacts.via.${c.relation}`, { name: c.via }) : t(`contacts.one.${c.relation}`);

  return (
    <PhoneFrame>
      <div className="flex-1 flex flex-col">
        <PageHeader title={t("contacts.title")} back="/chats" />
        <div className="flex-1 overflow-y-auto px-3 space-y-3 pb-4">
          {(contacts.data?.length ?? 0) > 6 && (
            <label className="glass rounded-2xl flex items-center gap-2 px-3">
              <Search className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t("contacts.search")}
                aria-label={t("contacts.search")}
                className="flex-1 min-w-0 bg-transparent py-2.5 text-sm outline-none"
              />
            </label>
          )}
          {error && (
            <p role="alert" className="text-center text-[0.6875rem] text-destructive py-2">
              {error}
            </p>
          )}
          {contacts.isError ? (
            <QueryError onRetry={() => void contacts.refetch()} />
          ) : contacts.isPending ? (
            <div className="flex justify-center py-10">
              <Loader2
                className="w-6 h-6 animate-spin text-primary"
                aria-label={t("common.loading")}
              />
            </div>
          ) : (contacts.data?.length ?? 0) === 0 ? (
            <EmptyState
              icon={Users}
              title={t("contacts.emptyTitle")}
              hint={t("contacts.emptyHint")}
            />
          ) : groups.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground py-6">
              {t("contacts.noMatch")}
            </p>
          ) : (
            groups.map((g) => (
              <section key={g.relation} aria-labelledby={`grp-${g.relation}`} className="space-y-1">
                <h2
                  id={`grp-${g.relation}`}
                  className="px-2 text-[0.6875rem] font-bold text-muted-foreground"
                >
                  {t(`contacts.groups.${g.relation}`)} · {g.items.length}
                </h2>
                {g.items.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => void start(c.id)}
                    disabled={creating === c.id}
                    className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-accent/60 transition-colors disabled:opacity-50 text-start"
                  >
                    <span
                      aria-hidden="true"
                      className={`w-12 h-12 shrink-0 rounded-2xl bg-gradient-to-br ${colorFor(c.id)} flex items-center justify-center text-white font-black`}
                    >
                      {initialOf(c.name)}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium truncate">{c.name}</span>
                      <span className="block text-[0.6875rem] text-muted-foreground truncate">
                        {sub(c)}
                      </span>
                    </span>
                    {creating === c.id && (
                      <Loader2 className="w-4 h-4 animate-spin text-primary" aria-hidden="true" />
                    )}
                  </button>
                ))}
              </section>
            ))
          )}
        </div>
      </div>
    </PhoneFrame>
  );
}
