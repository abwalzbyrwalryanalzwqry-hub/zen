import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ClipboardList, Loader2, Medal, MessageCircle } from "lucide-react";
import { getOrCreateDirectChat } from "@/lib/zen-api";
import { useT } from "@/lib/i18n";

/**
 * إجراءات المعلّم السريعة في صفحة الطالب (فحص الأقسام P2): واجب جديد مُعبَّأ باسمه، ومراسلته مباشرة،
 * بدل الرجوع إلى «طلابي» ثم البحث عنه في القائمة.
 */
export function StudentQuickActions({ me, studentId }: { me: string; studentId: string }) {
  const t = useT();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const message = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const chatId = await getOrCreateDirectChat(me, studentId);
      void navigate({ to: "/chats/$chatId", params: { chatId } });
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  const cls =
    "flex-1 min-h-11 rounded-2xl glass text-primary text-xs font-bold inline-flex items-center justify-center gap-1.5";
  return (
    <div className="px-3 pb-2 space-y-1">
      <div className="flex gap-2">
        <Link to="/teacher" search={{ tab: "assign", student: studentId }} className={cls}>
          <ClipboardList className="w-4 h-4" aria-hidden="true" />
          {t("studentActions.assign")}
        </Link>
        <button type="button" onClick={() => void message()} disabled={busy} className={cls}>
          {busy ? (
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          ) : (
            <MessageCircle className="w-4 h-4" aria-hidden="true" />
          )}
          {t("studentActions.message")}
        </button>
        {/* «شهائد الطالب»: الخادم يعرض منها ما يحق للمستخدم رؤيته فقط. */}
        <Link to="/certificates" search={{ student: studentId }} className={cls}>
          <Medal className="w-4 h-4" aria-hidden="true" />
          {t("studentActions.certificates")}
        </Link>
      </div>
      {failed && (
        <p role="alert" className="text-center text-[0.6875rem] text-destructive">
          {t("contacts.cannotStart")}
        </p>
      )}
    </div>
  );
}
