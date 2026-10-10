import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, Send } from "lucide-react";
import { useSession } from "@/hooks/useSession";
import { listStudentGuardians, type StudentGuardian } from "@/lib/guardian";
import { getOrCreateDirectChat, sendMessage } from "@/lib/zen-api";
import { useT } from "@/lib/i18n";

/**
 * إرسال رسالة المتعثّر في محادثة وليّ الأمر داخل التطبيق (بقايا فحص الأقسام P2): النص ظاهر للمعلّم قبل
 * الإرسال، والإرسال بنقرة صريحة لكل وليّ أمر، وبدء المحادثة يمرّ بشرط can_start_chat المعتاد.
 */
export function GuardianSend({ studentId, text }: { studentId: string; text: string }) {
  const t = useT();
  const { userId } = useSession();
  const [list, setList] = useState<StudentGuardian[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [sent, setSent] = useState<Record<string, string>>({});
  const [error, setError] = useState(false);

  const load = async () => {
    setError(false);
    setList(await listStudentGuardians(studentId));
  };
  const send = async (g: StudentGuardian) => {
    if (!userId) return;
    setBusy(g.guardian_id);
    setError(false);
    try {
      const chatId = await getOrCreateDirectChat(userId, g.guardian_id);
      await sendMessage(chatId, userId, text, crypto.randomUUID());
      setSent((s) => ({ ...s, [g.guardian_id]: chatId }));
    } catch {
      setError(true);
    } finally {
      setBusy(null);
    }
  };

  if (list === null)
    return (
      <button
        type="button"
        onClick={() => void load()}
        className="w-full rounded-xl glass text-primary py-2 text-xs font-bold inline-flex items-center justify-center gap-1.5"
      >
        <Send className="w-3.5 h-3.5" aria-hidden="true" />
        {t("guardianSend.open")}
      </button>
    );
  if (list.length === 0)
    return <p className="text-[0.625rem] text-muted-foreground">{t("guardianSend.none")}</p>;
  return (
    <div className="space-y-1.5">
      {list.map((g) =>
        sent[g.guardian_id] ? (
          <p
            key={g.guardian_id}
            role="status"
            className="text-center text-[0.6875rem] text-primary"
          >
            {t("guardianSend.sent", { name: g.name })}{" "}
            <Link
              to="/chats/$chatId"
              params={{ chatId: sent[g.guardian_id] }}
              className="underline font-bold"
            >
              {t("guardianSend.openChat")}
            </Link>
          </p>
        ) : (
          <button
            key={g.guardian_id}
            type="button"
            onClick={() => void send(g)}
            disabled={busy !== null}
            className="w-full rounded-xl glass text-primary py-2 text-xs font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            {busy === g.guardian_id ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="w-3.5 h-3.5" aria-hidden="true" />
            )}
            {t("guardianSend.to", { name: g.name })}
          </button>
        ),
      )}
      {error && (
        <p role="alert" className="text-center text-[0.625rem] text-destructive">
          {t("guardianSend.failed")}
        </p>
      )}
    </div>
  );
}
