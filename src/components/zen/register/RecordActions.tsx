import { lazy, Suspense, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  CheckCheck,
  Loader2,
  Lock,
  MoreHorizontal,
  NotebookPen,
  QrCode,
  RotateCcw,
  Share2,
} from "lucide-react";
import { useT } from "@/lib/i18n";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { HalaqaNote } from "./DailyRecordHeader";
import { ensureRegisterDict } from "@/lib/register-i18n";

ensureRegisterDict();

const AttendanceCodePanel = lazy(() =>
  import("@/components/zen/AttendanceCodePanel").then((m) => ({ default: m.AttendanceCodePanel })),
);

/**
 * الشريط السفلي الثابت للسجل اليومي (1.14.0): الإجراء التالي دائماً في متناول الإبهام — «الجميع حاضر» ما بقي من
 * لم يُسجَّل، و«إنهاء سجل اليوم» للمفتوح، و«إعادة فتح للتعديل» للمكتمل — وزر «المزيد» يفتح نصف شاشة بالباقي:
 * ملاحظة الحلقة، والمشاركة، ورمز الحضور، والإغلاق النهائي.
 */
export function RecordBar({
  status,
  hasRecord,
  canEdit,
  canLock,
  writable,
  busy,
  unmarked,
  note,
  canShare,
  onAllPresent,
  onFinish,
  onReopen,
  onLock,
  onShare,
  onSaveNote,
  halaqa,
  onCodeClosed,
}: {
  /** لرمز الحضور في نصف شاشة (1.14.0). */
  halaqa: string;
  /** بعد إغلاق رمز الحضور: تحديث السجل بمن سجّل بالرمز. */
  onCodeClosed?: () => void;
  status: string | null;
  hasRecord: boolean;
  canEdit: boolean;
  canLock: boolean;
  writable: boolean;
  busy: string | null;
  unmarked: number;
  note: string | null;
  canShare: boolean;
  onAllPresent: () => void;
  onFinish: () => void;
  onReopen: () => void;
  onLock: () => void;
  onShare: () => void;
  onSaveNote: (v: string | null) => Promise<boolean>;
}) {
  const t = useT();
  const [more, setMore] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const spin = (k: string, Icon: typeof Lock) =>
    busy === k ? (
      <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
    ) : (
      <Icon className="w-4 h-4" aria-hidden="true" />
    );
  const showAll = writable && unmarked > 0;
  const showFinish = hasRecord && status === "open" && canEdit;
  const showReopen = hasRecord && status === "completed" && canEdit;
  const base =
    "w-full min-h-12 rounded-2xl px-3 text-sm font-bold flex items-center gap-2.5 text-start disabled:opacity-50";
  const item = `${base} bg-muted/50 text-foreground`;
  const close = (fn: () => void) => () => {
    setMore(false);
    fn();
  };
  return (
    <>
      <div
        className="shrink-0 border-t border-border/60 bg-background/95 px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur flex items-center gap-2"
        role="toolbar"
        aria-label={t("dailyRecord.bar.label")}
      >
        {showAll && (
          <button
            type="button"
            onClick={onAllPresent}
            disabled={busy === "bulk"}
            className={`min-h-12 rounded-2xl text-sm font-bold flex items-center justify-center gap-1.5 disabled:opacity-50 px-3 ${
              showFinish
                ? "bg-primary/12 text-primary"
                : "flex-1 gradient-primary text-primary-foreground"
            }`}
          >
            {spin("bulk", CheckCheck)}
            {t("dailyRecord.bulk.allPresent", { n: unmarked })}
          </button>
        )}
        {showFinish && (
          <button
            type="button"
            onClick={onFinish}
            className="flex-1 min-h-12 rounded-2xl gradient-primary text-primary-foreground text-sm font-bold flex items-center justify-center gap-1.5"
          >
            <CheckCheck className="w-4 h-4" aria-hidden="true" /> {t("dailyRecord.finish.cta")}
          </button>
        )}
        {showReopen && (
          <button
            type="button"
            onClick={onReopen}
            disabled={!!busy}
            className="flex-1 min-h-12 rounded-2xl glass text-sm font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            {spin("reopen", RotateCcw)} {t("dailyRecord.reopen")}
          </button>
        )}
        {!showAll && !showFinish && !showReopen && <div className="flex-1" />}
        <button
          type="button"
          onClick={() => setMore(true)}
          aria-haspopup="dialog"
          aria-label={t("dailyRecord.bar.more")}
          className="min-h-12 min-w-12 rounded-2xl bg-muted/60 text-foreground flex items-center justify-center"
        >
          <MoreHorizontal className="w-5 h-5" aria-hidden="true" />
        </button>
      </div>

      <Sheet open={more} onOpenChange={setMore}>
        <SheetContent title={t("dailyRecord.bar.more")} snap="auto">
          <ul className="grid gap-1.5" role="list">
            {(writable || note) && hasRecord && (
              <li>
                <button type="button" className={item} onClick={close(() => setNoteOpen(true))}>
                  <NotebookPen className="w-4 h-4 text-primary" aria-hidden="true" />
                  <span className="flex-1 min-w-0">
                    <span className="block">{t("dailyRecord.notes.label")}</span>
                    {note && (
                      <span className="block truncate text-xs font-normal text-muted-foreground">
                        {note}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            )}
            {canShare && (
              <li>
                <button type="button" className={item} onClick={close(onShare)}>
                  <Share2 className="w-4 h-4" aria-hidden="true" /> {t("dailyRecord.share.cta")}
                </button>
              </li>
            )}
            <li>
              <button
                type="button"
                className={item}
                aria-haspopup="dialog"
                onClick={close(() => setCodeOpen(true))}
              >
                <QrCode className="w-4 h-4" aria-hidden="true" /> {t("dailyRecord.attendanceCode")}
              </button>
            </li>
            {hasRecord && status === "completed" && canLock && (
              <li>
                <button
                  type="button"
                  disabled={!!busy}
                  className={`${base} bg-destructive/10 text-destructive`}
                  onClick={close(onLock)}
                >
                  {spin("lock", Lock)}
                  <span className="flex-1">
                    <span className="block">{t("dailyRecord.lock.cta")}</span>
                    <span className="block text-xs font-normal">{t("dailyRecord.lock.hint")}</span>
                  </span>
                </button>
              </li>
            )}
          </ul>
        </SheetContent>
      </Sheet>
      <Sheet open={noteOpen} onOpenChange={setNoteOpen}>
        <SheetContent title={t("dailyRecord.notes.label")} snap="auto">
          <HalaqaNote
            value={note}
            writable={writable}
            saving={busy === "notes"}
            onSave={onSaveNote}
          />
        </SheetContent>
      </Sheet>
      <Sheet
        open={codeOpen}
        onOpenChange={(o) => {
          setCodeOpen(o);
          if (!o) onCodeClosed?.();
        }}
      >
        <SheetContent
          title={t("attendanceCode.title")}
          snap="auto"
          footer={
            <Link
              to="/teacher/attendance-code"
              search={{ halaqa }}
              className="min-h-11 rounded-2xl glass text-sm font-bold flex items-center justify-center"
            >
              {t("dailyRecord.code.fullScreen")}
            </Link>
          }
        >
          {codeOpen && halaqa && (
            <Suspense fallback={null}>
              <AttendanceCodePanel halaqa={halaqa} />
            </Suspense>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
