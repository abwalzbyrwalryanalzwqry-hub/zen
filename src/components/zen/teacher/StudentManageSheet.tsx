import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Loader2, Pencil, UserMinus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/zen/register/ConfirmDialog";
import { useT } from "@/lib/i18n";
import { toast } from "@/lib/toast";
import { getStudentLoginInfo } from "@/lib/auth";
import {
  manageErrorCode,
  myHalaqatOfStudent,
  teacherRemoveStudent,
  teacherUpdateStudent,
} from "@/lib/teacher-students-api";

const FIELD =
  "w-full min-h-11 rounded-xl border border-border/60 bg-background/70 px-3 text-sm text-foreground outline-none focus:border-primary/60";

/**
 * إدارة طالب من المعلّم: تعديل الاسم (لحساب أنشأه معلّم؛ صاحب الحساب المسجَّل بنفسه يدير اسمه)،
 * وكلمة المرور من صفحة الطالب، وإزالته من حلقة أو من كل الحلقات بتأكيد. لا يُحذف حساب الطالب ولا سجله.
 */
export function StudentManageSheet({
  me,
  student,
  onClose,
  onRemoved,
}: {
  me: string;
  student: { id: string; name: string } | null;
  onClose: () => void;
  /** بعد الإزالة من كل حلقات المعلّم (مثلاً للرجوع من صفحة الطالب). */
  onRemoved?: () => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const id = student?.id ?? "";
  const info = useQuery({
    queryKey: ["student-login-info", id],
    enabled: !!id,
    queryFn: () => getStudentLoginInfo(id),
  });
  const groups = useQuery({
    queryKey: ["student-manage-halaqat", me, id],
    enabled: !!id,
    queryFn: () => myHalaqatOfStudent(me, id),
  });
  const [name, setName] = useState(student?.name ?? "");
  const [shownFor, setShownFor] = useState(id);
  const [busy, setBusy] = useState<string | null>(null);
  const [ask, setAsk] = useState<{ halaqa: string | null; label: string } | null>(null);
  if (id !== shownFor) {
    setShownFor(id);
    setName(student?.name ?? "");
    setAsk(null);
  }
  if (!student) return null;

  const errText = (e: unknown) => t(`studentManage.errors.${manageErrorCode(e)}`);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["teacher-board", me] });
    void qc.invalidateQueries({ queryKey: ["teacher-students-extra", me] });
    void qc.invalidateQueries({ queryKey: ["profile", id] });
    void qc.invalidateQueries({ queryKey: ["student-manage-halaqat", me, id] });
    void qc.invalidateQueries({ queryKey: ["daily-record"] });
  };
  const trimmed = name.trim().replace(/\s+/g, " ");
  const canRename = !!info.data?.managed;

  const rename = async () => {
    if (trimmed.length < 2 || trimmed === student.name) return;
    setBusy("rename");
    try {
      const r = await teacherUpdateStudent(student.id, trimmed);
      toast.success(t("studentManage.renamed", { name: r.name }));
      refresh();
      onClose();
    } catch (e) {
      toast.error(errText(e));
    } finally {
      setBusy(null);
    }
  };
  const remove = async () => {
    if (!ask) return;
    setBusy("remove");
    try {
      await teacherRemoveStudent(student.id, ask.halaqa);
      toast.success(t("studentManage.removed", { name: student.name, from: ask.label }));
      const all = !ask.halaqa || (groups.data?.length ?? 0) <= 1;
      setAsk(null);
      refresh();
      if (all) {
        onClose();
        onRemoved?.();
      }
    } catch (e) {
      toast.error(errText(e));
      setAsk(null);
    } finally {
      setBusy(null);
    }
  };

  const list = groups.data ?? [];
  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-md max-h-[92dvh] overflow-y-auto rounded-3xl bg-card p-4 gap-4">
        <DialogHeader className="text-start px-8">
          <DialogTitle className="text-base font-black">
            {t("studentManage.title", { name: student.name })}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {info.data?.username
              ? t("studentManage.username", { u: info.data.username })
              : t("studentManage.subtitle")}
          </DialogDescription>
        </DialogHeader>

        <section className="rounded-2xl border border-border/50 bg-muted/20 p-3 space-y-2">
          <h3 className="text-sm font-black text-foreground flex items-center gap-1.5">
            <Pencil className="w-4 h-4 text-primary" aria-hidden="true" />
            {t("studentManage.editName")}
          </h3>
          {info.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin text-primary" aria-hidden="true" />
          ) : canRename ? (
            <div className="flex gap-2">
              <input
                aria-label={t("studentManage.nameLabel")}
                value={name}
                maxLength={60}
                onChange={(e) => setName(e.target.value)}
                className={FIELD}
              />
              <button
                type="button"
                disabled={busy === "rename" || trimmed.length < 2 || trimmed === student.name}
                onClick={() => void rename()}
                className="min-h-11 px-4 rounded-xl gradient-primary text-primary-foreground text-sm font-bold flex items-center gap-1.5 disabled:opacity-50"
              >
                {busy === "rename" && (
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                )}
                {t("studentManage.save")}
              </button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{t("studentManage.selfManaged")}</p>
          )}
          {trimmed.length > 0 && trimmed.length < 2 && canRename && (
            <p className="text-xs text-destructive">{t("studentManage.errors.invalid_name")}</p>
          )}
        </section>

        {info.data?.can_set_password && (
          <Link
            to="/quran/student/$userId"
            params={{ userId: student.id }}
            onClick={onClose}
            className="min-h-11 rounded-2xl glass px-3 text-sm font-bold text-foreground flex items-center gap-2"
          >
            <KeyRound className="w-4 h-4 text-gold-ink" aria-hidden="true" />
            {t("studentManage.password")}
          </Link>
        )}

        <section className="rounded-2xl border border-destructive/30 bg-destructive/5 p-3 space-y-2">
          <h3 className="text-sm font-black text-destructive flex items-center gap-1.5">
            <UserMinus className="w-4 h-4" aria-hidden="true" />
            {t("studentManage.removeTitle")}
          </h3>
          <p className="text-xs text-muted-foreground">{t("studentManage.removeHint")}</p>
          {groups.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin text-primary" aria-hidden="true" />
          ) : groups.isError ? (
            <p className="text-xs text-destructive">{t("studentManage.errors.unknown")}</p>
          ) : (
            <div className="grid gap-1.5">
              {list.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => setAsk({ halaqa: h.id, label: h.name })}
                  className="min-h-11 rounded-xl bg-background/70 border border-border/50 px-3 text-sm font-bold text-destructive text-start"
                >
                  {t("studentManage.removeFrom", { halaqa: h.name })}
                </button>
              ))}
              {list.length !== 1 && (
                <button
                  type="button"
                  onClick={() => setAsk({ halaqa: null, label: t("studentManage.allMine") })}
                  className="min-h-11 rounded-xl bg-destructive text-destructive-foreground px-3 text-sm font-bold"
                >
                  {t("studentManage.removeAll")}
                </button>
              )}
            </div>
          )}
        </section>

        <ConfirmDialog
          open={!!ask}
          title={t("studentManage.confirmTitle", { name: student.name, from: ask?.label ?? "" })}
          body={t("studentManage.confirmBody")}
          confirmLabel={t("studentManage.confirm")}
          destructive
          busy={busy === "remove"}
          onCancel={() => setAsk(null)}
          onConfirm={() => void remove()}
        />
      </DialogContent>
    </Dialog>
  );
}
