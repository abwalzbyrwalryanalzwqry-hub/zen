import { useState } from "react";
import { useAsync } from "@/hooks/use-async";
import { useConfirm } from "@/hooks/useConfirm";
import { useT, intlLocale } from "@/lib/i18n";
import { CalendarClock, Copy, Loader2, Plus, Trash2, X } from "lucide-react";
import {
  STAFF_ROLE_LABEL,
  WEEKDAYS,
  addScheduleSlot,
  claimStaffCode,
  createStaffCode,
  deleteScheduleSlot,
  listCenterStaff,
  listSchedule,
  removeStaff,
  slotLabel,
  type ScheduleSlot,
  type StaffMember,
  type StaffRole,
} from "@/lib/center";
export { StudentReportExport, WeeklySummaryCard } from "./center/StudentReportCards";

export function Shell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="absolute inset-0 z-30 bg-background/70 backdrop-blur-sm flex items-end"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full glass-strong rounded-t-3xl p-5 pb-6 anim-float-in max-h-[85%] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-black text-foreground">{title}</h2>
          <button onClick={onClose} aria-label="إغلاق">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const errText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

/** إدارة طاقم المركز: لمنشئ المركز. */
export function StaffSheet({ centerId, onClose }: { centerId: string; onClose: () => void }) {
  const staffQ = useAsync(`center-staff:${centerId}`, () => listCenterStaff(centerId));
  const staff: StaffMember[] = staffQ.data ?? [];
  const loading = staffQ.loading;
  const load = staffQ.reload;
  const [role, setRole] = useState<StaffRole>("supervisor");
  const [code, setCode] = useState<{ code: string; role: StaffRole; expires_at: string } | null>(
    null,
  );
  const [actionErr, setErr] = useState<string | null>(null);
  const err = actionErr ?? (staffQ.error ? errText(staffQ.error, "تعذّر التحميل") : null);
  const [busy, setBusy] = useState(false);
  const t = useT();
  const [dialog, ask] = useConfirm();

  // إزالة عضو بتأكيد (تحليل «المزيد» — المرحلة 5، centers-remove): كانت بلمسة واحدة على أيقونة صغيرة.
  const remove = async (s: StaffMember) => {
    const ok = await ask({
      title: t("centers.staff.removeTitle", { name: s.name }),
      description: t("centers.staff.removeBody"),
      confirmLabel: t("centers.staff.remove"),
    });
    if (!ok) return;
    setErr(null);
    try {
      await removeStaff(centerId, s.user_id);
      void load();
    } catch (e) {
      setErr(errText(e, t("centers.staff.removeFailed")));
    }
  };

  const issue = async () => {
    setBusy(true);
    setErr(null);
    try {
      setCode(await createStaffCode(centerId, role));
    } catch (e) {
      setErr(errText(e, "تعذّر إصدار الرمز"));
    }
    setBusy(false);
  };

  return (
    <Shell title="طاقم المركز" onClose={onClose}>
      <p className="text-[0.6875rem] text-muted-foreground mb-3 leading-relaxed">
        المشرف التعليمي يرى لوحة المركز ومؤشراته وتقارير طلابه ولا يعدّلها، ويصدر شهائد حلقاته.
        المدير يرى اللوحة ويدير مواعيد الحلقات وغرفها أيضاً. لا يرى أيٌّ منهما المحاسبة الشخصية ولا
        المحادثات ولا أرقام الهواتف.
      </p>
      <div className="flex gap-2 mb-2">
        {(["supervisor", "manager"] as StaffRole[]).map((r) => (
          <button
            key={r}
            onClick={() => setRole(r)}
            className={`flex-1 py-2 rounded-xl text-xs font-medium ${
              role === r ? "bg-primary text-white" : "glass text-foreground"
            }`}
          >
            {STAFF_ROLE_LABEL[r]}
          </button>
        ))}
      </div>
      <button
        onClick={issue}
        disabled={busy}
        className="w-full py-2.5 rounded-xl bg-gradient-to-br from-primary to-primary-glow text-white text-sm font-medium flex items-center justify-center gap-2"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
        إصدار رمز انضمام
      </button>
      {code && (
        <div className="mt-3 glass rounded-2xl p-3 text-center">
          <p className="text-[0.6875rem] text-muted-foreground">
            رمز {STAFF_ROLE_LABEL[code.role]} — صالح لمرة واحدة حتى{" "}
            {new Date(code.expires_at).toLocaleString(intlLocale())}
          </p>
          <div className="flex items-center justify-center gap-2 mt-1">
            <p className="text-xl font-black tracking-widest text-primary" dir="ltr">
              {code.code}
            </p>
            <button
              onClick={() => void navigator.clipboard?.writeText(code.code)}
              aria-label="نسخ الرمز"
            >
              <Copy className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>
      )}
      {err && (
        <p role="alert" className="text-xs text-destructive mt-2">
          {err}
        </p>
      )}

      <h3 className="text-sm font-bold text-foreground mt-5 mb-2">الأعضاء</h3>
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin text-primary mx-auto" />
      ) : staff.length === 0 ? (
        <p className="text-[0.6875rem] text-muted-foreground">لا يوجد أعضاء بعد.</p>
      ) : (
        <div className="space-y-2">
          {staff.map((s) => (
            <div key={s.user_id} className="flex items-center gap-2 glass rounded-xl px-3 py-2">
              <p className="flex-1 text-xs text-foreground truncate">{s.name}</p>
              <span className="text-[0.625rem] px-2 py-0.5 rounded-full bg-primary/15 text-primary">
                {STAFF_ROLE_LABEL[s.role]}
              </span>
              <button
                type="button"
                onClick={() => void remove(s)}
                aria-label={t("centers.staff.removeAria", { name: s.name })}
                className="min-h-11 min-w-11 -me-2 rounded-xl flex items-center justify-center text-muted-foreground hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Trash2 className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}
      {dialog}
    </Shell>
  );
}

/** الانضمام إلى طاقم مركز برمز. */
export function JoinStaffSheet({
  onClose,
  onJoined,
}: {
  onClose: () => void;
  onJoined: () => void;
}) {
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!code.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await claimStaffCode(code);
      onJoined();
    } catch (e) {
      setErr(errText(e, "الرمز غير صحيح"));
    }
    setBusy(false);
  };
  return (
    <Shell title="الانضمام إلى طاقم مركز" onClose={onClose}>
      <p className="text-[0.6875rem] text-muted-foreground mb-3">
        اطلب الرمز من منشئ المركز. يُستخدم الرمز مرة واحدة.
      </p>
      <input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="رمز الانضمام"
        dir="ltr"
        className="w-full glass rounded-xl px-3 py-2.5 text-sm outline-none mb-2 text-center tracking-widest uppercase"
      />
      {err && <p className="text-[0.6875rem] text-destructive mb-2">{err}</p>}
      <button
        onClick={submit}
        disabled={busy}
        className="w-full py-2.5 rounded-xl bg-gradient-to-br from-primary to-primary-glow text-white text-sm font-medium flex items-center justify-center gap-2"
      >
        {busy && <Loader2 className="w-4 h-4 animate-spin" />} انضمام
      </button>
    </Shell>
  );
}

/** مواعيد الحلقة الأسبوعية. التعديل لمعلّم الحلقة ومنشئ المركز ومديره (تفرضه قاعدة البيانات). */
export function ScheduleEditor({ halaqaId, canEdit }: { halaqaId: string; canEdit: boolean }) {
  const slotsQ = useAsync(`slots:${halaqaId}`, () =>
    listSchedule(halaqaId).catch((): ScheduleSlot[] => []),
  );
  const slots = slotsQ.data ?? [];
  const load = slotsQ.reload;
  const [adding, setAdding] = useState(false);
  const [weekday, setWeekday] = useState(new Date().getDay());
  const [start, setStart] = useState("16:00");
  const [end, setEnd] = useState("17:00");
  const [location, setLocation] = useState("");
  const [url, setUrl] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [slotErr, setSlotErr] = useState<string | null>(null);
  const t = useT();
  const [dialog, ask] = useConfirm();

  const save = async () => {
    setErr(null);
    try {
      await addScheduleSlot(halaqaId, {
        weekday,
        start_time: start,
        end_time: end,
        location: location || null,
        online_url: url || null,
      });
      setAdding(false);
      setLocation("");
      setUrl("");
      void load();
    } catch (e) {
      setErr(errText(e, "تعذّر الحفظ"));
    }
  };

  const removeSlot = async (slot: ScheduleSlot) => {
    const ok = await ask({
      title: t("centers.slot.deleteTitle"),
      description: slotLabel(slot),
      confirmLabel: t("centers.slot.delete"),
    });
    if (!ok) return;
    setSlotErr(null);
    try {
      await deleteScheduleSlot(slot.id);
      void load();
    } catch (e) {
      // كان الخطأ يُبتلع فيبدو الحذف ناجحاً ثم يعود الموعد.
      setSlotErr(errText(e, t("centers.slot.deleteFailed")));
    }
  };

  if (!canEdit && slots.length === 0) return null;

  return (
    <div className="glass rounded-xl p-2.5">
      <div className="flex items-center gap-1.5 mb-1.5">
        <CalendarClock className="w-3.5 h-3.5 text-primary" />
        <p className="flex-1 text-[0.6875rem] font-bold text-foreground">المواعيد الأسبوعية</p>
        {canEdit && !adding && (
          <button
            onClick={() => setAdding(true)}
            className="text-[0.625rem] text-primary font-medium"
          >
            + موعد
          </button>
        )}
      </div>
      {slots.length === 0 && !adding && (
        <p className="text-[0.625rem] text-muted-foreground">لم تُحدَّد مواعيد بعد.</p>
      )}
      {slots.map((s) => (
        <div key={s.id} className="flex items-center gap-2 py-0.5">
          <p className="flex-1 text-[0.6875rem] text-foreground">
            {slotLabel(s)}
            {s.location ? ` · ${s.location}` : ""}
            {s.online_url ? " · عن بُعد" : ""}
          </p>
          {canEdit && (
            <button
              type="button"
              onClick={() => void removeSlot(s)}
              aria-label={t("centers.slot.deleteAria", { slot: slotLabel(s) })}
              className="min-h-11 min-w-11 -me-2 rounded-xl flex items-center justify-center text-muted-foreground hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Trash2 className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
        </div>
      ))}
      {slotErr && (
        <p role="alert" className="text-xs text-destructive mt-1">
          {slotErr}
        </p>
      )}
      {dialog}
      {adding && (
        <div className="mt-2 space-y-1.5">
          <select
            value={weekday}
            onChange={(e) => setWeekday(Number(e.target.value))}
            className="w-full glass rounded-lg px-2 py-1.5 text-xs outline-none"
          >
            {WEEKDAYS.map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </select>
          <div className="flex gap-1.5 items-center">
            <label className="text-[0.625rem] text-muted-foreground">من</label>
            <input
              type="time"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="flex-1 glass rounded-lg px-2 py-1.5 text-xs outline-none"
            />
            <label className="text-[0.625rem] text-muted-foreground">إلى</label>
            <input
              type="time"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="flex-1 glass rounded-lg px-2 py-1.5 text-xs outline-none"
            />
          </div>
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="المكان (اختياري)"
            className="w-full glass rounded-lg px-2 py-1.5 text-xs outline-none"
          />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="رابط الحلقة عن بُعد https:// (اختياري)"
            dir="ltr"
            className="w-full glass rounded-lg px-2 py-1.5 text-xs outline-none"
          />
          {err && <p className="text-[0.625rem] text-destructive">{err}</p>}
          <div className="flex gap-1.5">
            <button
              onClick={save}
              className="flex-1 py-1.5 rounded-lg bg-primary text-white text-[0.6875rem] font-medium"
            >
              حفظ
            </button>
            <button
              onClick={() => setAdding(false)}
              className="flex-1 py-1.5 rounded-lg glass text-[0.6875rem]"
            >
              إلغاء
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
