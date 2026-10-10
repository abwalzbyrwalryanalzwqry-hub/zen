import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PhoneFrame } from "@/components/zen/PhoneFrame";
import { BackButton } from "@/components/zen/BackButton";
import {
  Building2,
  Plus,
  Loader2,
  ChevronDown,
  UserPlus,
  Trash2,
  GraduationCap,
  LayoutDashboard,
  ShieldCheck,
  KeyRound,
  Users,
} from "lucide-react";
import { JoinStaffSheet, ScheduleEditor, StaffSheet } from "@/components/zen/CenterManagement";
import { HalaqaMotivation } from "@/components/zen/Achievements";
import { type CenterRole } from "@/lib/center";
import { useSession } from "@/hooks/useSession";
import {
  cancelHalaqaInvite,
  colorFor,
  initialOf,
  removeStudentFromHalaqa,
  type Center,
  type Halaqa,
  type HalaqaInvite,
  type Profile,
} from "@/lib/zen-api";
import { CenterSheet, HalaqaSheet, StudentSheet } from "@/components/zen/centers/CenterSheets";
import { loadCentersScreen } from "@/lib/centers-screen";
import { useConfirm } from "@/hooks/useConfirm";
import { QueryError } from "@/components/zen/QueryError";
import { plural, useT, t as tStatic } from "@/lib/i18n";
import { toast } from "@/lib/toast";
export const Route = createFileRoute("/_authed/centers")({
  head: () => ({
    meta: [
      { title: tStatic("meta.centers") },
      { name: "description", content: tStatic("meta.centersDescription") },
      { property: "og:title", content: tStatic("meta.centers") },
      { property: "og:description", content: tStatic("meta.centersDescription") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CentersScreen,
});

type Sheet =
  | null
  | { kind: "center" }
  | { kind: "halaqa"; centerId: string }
  | { kind: "student"; halaqaId: string }
  | { kind: "staff"; centerId: string }
  | { kind: "join" };

const EMPTY: never[] = [];
const NONE: Record<string, never> = {};

function CentersScreen() {
  const { userId } = useSession();
  const [openHalaqa, setOpenHalaqa] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const t = useT();
  const [confirmDialog, ask] = useConfirm();
  const [busyRow, setBusyRow] = useState<string | null>(null);
  // react-query (تحليل «المزيد» ARC-04): ذاكرة بين الزيارات، والفشل حالة خطأ بإعادة لا مؤشر أبدي (BUG-03).
  // التحديث بعد كل إجراء يبقي الشاشة ظاهرة بدل مؤشر التحميل.
  const q = useQuery({
    queryKey: ["centers-screen", userId],
    queryFn: () => loadCentersScreen(userId!),
    enabled: !!userId,
  });
  const d = q.data;
  const teacher = d?.teacher ?? false;
  const centers: Center[] = d?.centers ?? EMPTY;
  const halaqat: Halaqa[] = d?.halaqat ?? EMPTY;
  const members: Record<string, Profile[]> = d?.members ?? NONE;
  const phones: Record<string, string> = d?.phones ?? NONE;
  const invites: Record<string, HalaqaInvite[]> = d?.invites ?? NONE;
  const studentNames: Record<string, string> = d?.studentNames ?? NONE;
  const roles: Record<string, CenterRole> = d?.roles ?? NONE;
  const loading = q.isPending;
  const failed = q.isError && !d;
  const refresh = () => q.refetch();

  // SEC-07: الإجراءات الخطرة بتأكيد ومعالجة خطأ.
  const runRow = async (key: string, op: () => Promise<unknown>, done?: string) => {
    setBusyRow(key);
    try {
      await op();
      if (done) toast.success(done);
      await refresh();
    } catch (e) {
      toast.error(t("centersPage.opFailed", { reason: e instanceof Error ? e.message : "" }));
    } finally {
      setBusyRow(null);
    }
  };
  const removeStudent = async (halaqaId: string, s: Profile) => {
    const ok = await ask({
      title: t("centersPage.removeStudent.title", { name: s.name }),
      description: t("centersPage.removeStudent.body"),
      confirmLabel: t("centersPage.removeStudent.confirm"),
    });
    if (!ok) return;
    await runRow(
      `rm:${halaqaId}:${s.id}`,
      () => removeStudentFromHalaqa(halaqaId, s.id),
      t("centersPage.removeStudent.done", { name: s.name }),
    );
  };
  const cancelInvite = async (inv: HalaqaInvite, name: string) => {
    const ok = await ask({
      title: t("centersPage.cancelInvite.title", { name }),
      confirmLabel: t("centersPage.cancelInvite.confirm"),
      cancelLabel: t("centersPage.cancelInvite.keep"),
    });
    if (!ok) return;
    await runRow(`inv:${inv.id}`, () => cancelHalaqaInvite(inv.id));
  };

  return (
    <PhoneFrame>
      <div className="flex-1 flex flex-col">
        <header className="px-5 pt-12 pb-3 flex items-center gap-3">
          <BackButton fallback="/more" />
          <div className="flex-1">
            <h1 className="text-2xl font-black text-foreground">{t("centersPage.title")}</h1>
            <p className="text-xs text-muted-foreground mt-1">
              {plural("units.centers", centers.length)} · {plural("units.halaqat", halaqat.length)}
            </p>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center glow-primary">
            <Building2 className="w-5 h-5 text-white" aria-hidden="true" />
          </div>
        </header>

        <div className="px-5 flex gap-2">
          {teacher && (
            <button
              onClick={() => setSheet({ kind: "center" })}
              className="flex-1 rounded-2xl bg-gradient-to-br from-primary to-primary-glow text-white text-sm font-medium py-3 flex items-center justify-center gap-2 glow-primary"
            >
              <Plus className="w-4 h-4" aria-hidden="true" /> {t("centersPage.addCenter")}
            </button>
          )}
          <button
            onClick={() => setSheet({ kind: "join" })}
            className={`${teacher ? "" : "flex-1 "}rounded-2xl glass-strong text-primary text-xs font-medium px-3 py-3 flex items-center justify-center gap-1.5`}
          >
            <KeyRound className="w-4 h-4" aria-hidden="true" /> {t("centersPage.joinStaff")}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 mt-3 pb-4 space-y-3">
          {loading ? (
            <div
              className="flex justify-center py-10"
              role="status"
              aria-label={t("common.loading")}
            >
              <Loader2 className="w-5 h-5 animate-spin text-primary" aria-hidden="true" />
            </div>
          ) : failed ? (
            <QueryError onRetry={() => void refresh()} />
          ) : centers.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground py-10">
              {t("centersPage.empty")}
              {teacher && (
                <span className="block mt-1 leading-relaxed">{t("centersPage.emptyTeacher")}</span>
              )}
            </p>
          ) : (
            centers.map((c) => (
              <div key={c.id} className="glass-strong rounded-3xl p-4">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-black text-foreground">{c.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.city ?? "—"}
                      {c.description ? ` · ${c.description}` : ""}
                    </p>
                  </div>
                  {roles[c.id] && (
                    <span className="text-xs px-2 py-1 rounded-full bg-gold/15 text-gold shrink-0 me-1">
                      {t(`centersPage.roles.${roles[c.id]}`)}
                    </span>
                  )}
                  {teacher && (
                    <button
                      onClick={() => setSheet({ kind: "halaqa", centerId: c.id })}
                      className="text-xs px-3 min-h-11 rounded-full bg-primary/15 text-primary font-medium flex items-center gap-1 shrink-0"
                    >
                      <Plus className="w-3 h-3" aria-hidden="true" /> {t("centersPage.addHalaqa")}
                    </button>
                  )}
                </div>

                {roles[c.id] && (
                  <div className="mt-3 flex gap-2">
                    <Link
                      to="/center/$centerId"
                      params={{ centerId: c.id }}
                      className="flex-1 min-h-11 py-2 rounded-xl bg-primary/15 text-primary text-xs font-medium flex items-center justify-center gap-1.5"
                    >
                      <LayoutDashboard className="w-3.5 h-3.5" aria-hidden="true" />{" "}
                      {t("centersPage.dashboard")}
                    </Link>
                    {roles[c.id] === "owner" && (
                      <button
                        onClick={() => setSheet({ kind: "staff", centerId: c.id })}
                        className="flex-1 min-h-11 py-2 rounded-xl glass text-foreground text-xs font-medium flex items-center justify-center gap-1.5"
                      >
                        <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />{" "}
                        {t("centersPage.staff")}
                      </button>
                    )}
                  </div>
                )}

                <div className="mt-3 space-y-2">
                  {halaqat.filter((h) => h.center_id === c.id).length === 0 ? (
                    <p className="text-xs text-muted-foreground">{t("centersPage.noHalaqat")}</p>
                  ) : (
                    halaqat
                      .filter((h) => h.center_id === c.id)
                      .map((h) => {
                        const list = members[h.id] ?? [];
                        const open = openHalaqa === h.id;
                        // الإضافة والحذف لمعلّم الحلقة أو منشئ مركزها فقط (تفرضه قاعدة البيانات).
                        const canManage =
                          teacher && (h.teacher_id === userId || c.created_by === userId);
                        return (
                          <div key={h.id} className="glass rounded-2xl p-3">
                            <button
                              onClick={() => setOpenHalaqa(open ? null : h.id)}
                              aria-expanded={open}
                              className="w-full min-h-11 flex items-center gap-2 text-start rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                            >
                              <GraduationCap
                                className="w-4 h-4 text-gold shrink-0"
                                aria-hidden="true"
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-foreground truncate">
                                  {h.name}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {h.schedule ?? t("centersPage.noSchedule")}
                                  {canManage ? ` · ${plural("units.students", list.length)}` : ""}
                                </p>
                              </div>
                              <ChevronDown
                                aria-hidden="true"
                                className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
                              />
                            </button>

                            {open && (
                              <div className="mt-3 space-y-2">
                                <ScheduleEditor
                                  halaqaId={h.id}
                                  canEdit={
                                    canManage ||
                                    roles[c.id] === "owner" ||
                                    roles[c.id] === "manager"
                                  }
                                />
                                {userId &&
                                  (canManage ||
                                    roles[c.id] === "owner" ||
                                    roles[c.id] === "manager") && (
                                    <HalaqaMotivation halaqaId={h.id} userId={userId} />
                                  )}
                                {canManage && (
                                  <button
                                    onClick={() => setSheet({ kind: "student", halaqaId: h.id })}
                                    className="w-full min-h-11 py-2 rounded-xl glass-strong flex items-center justify-center gap-1.5 text-xs text-primary font-medium"
                                  >
                                    <UserPlus className="w-3.5 h-3.5" aria-hidden="true" />{" "}
                                    {t("centersPage.addStudent")}
                                  </button>
                                )}
                                {canManage && (
                                  <Link
                                    to="/teacher/import"
                                    search={{ halaqa: h.id }}
                                    className="w-full min-h-11 py-2 rounded-xl glass flex items-center justify-center gap-1.5 text-xs text-muted-foreground font-medium"
                                  >
                                    <Users className="w-3.5 h-3.5" aria-hidden="true" />{" "}
                                    {t("centersPage.importStudents")}
                                  </Link>
                                )}
                                {canManage &&
                                  (invites[h.id] ?? []).map((inv) => (
                                    <div
                                      key={inv.id}
                                      className="flex items-center gap-2 rounded-xl glass px-2 py-1.5"
                                    >
                                      <p className="flex-1 text-xs text-muted-foreground truncate">
                                        {t(
                                          inv.status === "awaiting_guardian"
                                            ? "centersPage.invite.awaitingGuardian"
                                            : "centersPage.invite.pending",
                                          {
                                            name:
                                              studentNames[inv.student_id] ??
                                              t("centersPage.invite.student"),
                                          },
                                        )}
                                      </p>
                                      <button
                                        type="button"
                                        disabled={busyRow === `inv:${inv.id}`}
                                        onClick={() =>
                                          void cancelInvite(inv, studentNames[inv.student_id] ?? "")
                                        }
                                        className="min-h-11 px-3 text-xs text-destructive disabled:opacity-50"
                                      >
                                        {t("common.cancel")}
                                      </button>
                                    </div>
                                  ))}
                                {list.length === 0 ? (
                                  <p className="text-xs text-muted-foreground text-center py-2">
                                    {t("centersPage.noStudents")}
                                  </p>
                                ) : (
                                  list.map((s) => (
                                    <div key={s.id} className="flex items-center gap-2">
                                      <div
                                        className={`w-8 h-8 rounded-xl bg-gradient-to-br ${colorFor(s.id)} flex items-center justify-center text-white text-xs font-black`}
                                      >
                                        {initialOf(s.name)}
                                      </div>
                                      <Link
                                        to="/quran/student/$userId"
                                        params={{ userId: s.id }}
                                        className="flex-1 min-w-0"
                                      >
                                        <p className="text-xs text-foreground truncate">{s.name}</p>
                                        <p
                                          className="text-xs text-muted-foreground text-start"
                                          dir="ltr"
                                        >
                                          {phones[s.id] ?? "—"}
                                        </p>
                                      </Link>
                                      {canManage && (
                                        <button
                                          type="button"
                                          aria-label={t("centersPage.removeStudent.aria", {
                                            name: s.name,
                                          })}
                                          disabled={busyRow === `rm:${h.id}:${s.id}`}
                                          onClick={() => void removeStudent(h.id, s)}
                                          className="w-11 h-11 shrink-0 rounded-xl flex items-center justify-center hover:bg-destructive/10 disabled:opacity-50"
                                        >
                                          {busyRow === `rm:${h.id}:${s.id}` ? (
                                            <Loader2
                                              className="w-4 h-4 animate-spin text-muted-foreground"
                                              aria-hidden="true"
                                            />
                                          ) : (
                                            <Trash2
                                              className="w-4 h-4 text-muted-foreground"
                                              aria-hidden="true"
                                            />
                                          )}
                                        </button>
                                      )}
                                    </div>
                                  ))
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {confirmDialog}

        {sheet?.kind === "center" && userId && (
          <CenterSheet
            userId={userId}
            onClose={() => setSheet(null)}
            onSaved={() => {
              setSheet(null);
              void refresh();
            }}
          />
        )}
        {sheet?.kind === "halaqa" && userId && (
          <HalaqaSheet
            centerId={sheet.centerId}
            teacherId={userId}
            onClose={() => setSheet(null)}
            onSaved={() => {
              setSheet(null);
              void refresh();
            }}
          />
        )}
        {sheet?.kind === "staff" && (
          <StaffSheet centerId={sheet.centerId} onClose={() => setSheet(null)} />
        )}
        {sheet?.kind === "join" && (
          <JoinStaffSheet
            onClose={() => setSheet(null)}
            onJoined={() => {
              setSheet(null);
              void refresh();
            }}
          />
        )}
        {sheet?.kind === "student" && (
          <StudentSheet
            halaqaId={sheet.halaqaId}
            onClose={() => setSheet(null)}
            onSaved={() => {
              setSheet(null);
              void refresh();
            }}
          />
        )}
      </div>
    </PhoneFrame>
  );
}
