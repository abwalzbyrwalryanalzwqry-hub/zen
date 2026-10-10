import { useState } from "react";
import { ClipboardList, Plus } from "lucide-react";
import { checkAyahRange, clampRange, surahByName } from "@/lib/assignment-form";
import { formatAyahRange, formatDay } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { SURAHS } from "@/lib/quran-meta";
import { listHalaqaMembers, type Halaqa, type Profile } from "@/lib/zen-api";
import {
  addAssignment,
  listTeacherAssignments,
  todayISO,
  type Assignment,
  type AssignmentKind,
} from "@/lib/zen-lms";
import { useAsync } from "@/hooks/use-async";

/* ─────────── Assign tab ─────────── */

const WHOLE_HALAQA = "__halaqa__";

export function AssignTab({
  students,
  halaqat,
  teacherId,
  initialStudent,
}: {
  students: Profile[];
  halaqat: Halaqa[];
  teacherId: string;
  /** من «واجب جديد» في صفحة الطالب (?student=). */
  initialStudent?: string;
}) {
  const [studentId, setStudentId] = useState(initialStudent ?? "");
  const [halaqaId, setHalaqaId] = useState("");
  const [kind, setKind] = useState<AssignmentKind>("memorize");
  const [surah, setSurah] = useState("");
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(5);
  const [due, setDue] = useState(todayISO());
  const [instructions, setInstructions] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const listQ = useAsync(`teacher-assignments:${teacherId}`, () =>
    listTeacherAssignments(50)
      .then((rows) => rows.filter((a) => a.teacher_id === teacherId))
      .catch((): Assignment[] => []),
  );
  const list = listQ.data ?? [];
  const reload = listQ.reload;
  const t = useT();
  const pickSurah = (name: string) => {
    setSurah(name);
    const meta = surahByName(name);
    if (meta) [setFrom, setTo].forEach((f, i) => f(clampRange(meta, from, to)[i]));
  };

  const submit = async () => {
    if (!studentId || !surah.trim() || busy) return;
    if (studentId === WHOLE_HALAQA && !halaqaId) {
      setMsg({ ok: false, text: t("assignBulk.pickHalaqaFirst") });
      return;
    }
    const range = checkAyahRange(surah, from, to);
    if (!range.ok) {
      const n = range.surah?.ayahs ?? 0;
      setMsg({
        ok: false,
        text: range.surah ? t("teacherBoard.badRange", { surah, n }) : t("teacherBoard.pickSurah"),
      });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      if (studentId === WHOLE_HALAQA) {
        // واجب واحد لكل طلاب الحلقة (فحص الأقسام P2): كل إسناد بمساره المعتاد (RLS والإشعار).
        const members = await listHalaqaMembers(halaqaId);
        let done = 0;
        for (const m of members) {
          try {
            await addAssignment({
              student_id: m.id,
              teacher_id: teacherId,
              halaqa_id: halaqaId,
              kind,
              surah_name: surah.trim(),
              from_ayah: from,
              to_ayah: to,
              instructions: instructions || null,
              due_date: due,
            });
            done++;
          } catch {
            /* يُحسب في الرسالة */
          }
        }
        setMsg({
          ok: done > 0 && done === members.length,
          text: t("assignBulk.result", { done, total: members.length }),
        });
        if (done > 0) {
          setSurah("");
          setInstructions("");
          await reload();
        }
        return;
      }
      await addAssignment({
        student_id: studentId,
        teacher_id: teacherId,
        halaqa_id: halaqaId || null,
        kind,
        surah_name: surah.trim(),
        from_ayah: from,
        to_ayah: to,
        instructions: instructions || null,
        due_date: due,
      });
      setMsg({ ok: true, text: t("assign.saved") });
      setSurah("");
      setInstructions("");
      await reload();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : t("assign.saveFailed") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="glass rounded-3xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <ClipboardList className="w-4 h-4 text-primary" aria-hidden="true" />
        <p className="text-sm font-bold text-foreground">{t("assign.title")}</p>
      </div>

      <Select value={studentId} onChange={setStudentId} placeholder={t("assign.pickStudent")}>
        <option value={WHOLE_HALAQA} disabled={!halaqaId}>
          {halaqaId ? t("assignBulk.whole") : t("assignBulk.pickHalaqaFirst")}
        </option>
        {students.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </Select>
      <Select value={halaqaId} onChange={setHalaqaId} placeholder={t("assign.halaqaOpt")}>
        {halaqat.map((h) => (
          <option key={h.id} value={h.id}>
            {h.name}
          </option>
        ))}
      </Select>

      <div className="flex gap-2">
        {(["memorize", "review", "test"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={`flex-1 rounded-2xl py-2 text-[0.6875rem] font-bold ${kind === k ? "bg-primary/15 text-primary" : "glass-strong text-muted-foreground"}`}
          >
            {t(`assign.kind.${k}`)}
          </button>
        ))}
      </div>

      <Select value={surah} onChange={pickSurah} placeholder={t("teacherBoard.pickSurah")}>
        {SURAHS.map((x) => (
          <option key={x.n} value={x.name}>
            {x.n}. {x.name} ({x.ayahs})
          </option>
        ))}
      </Select>
      <div className="grid grid-cols-2 gap-2">
        {(
          [
            ["fromAyah", from, setFrom],
            ["toAyah", to, setTo],
          ] as const
        ).map(([key, value, set]) => (
          <label key={key} className="min-w-0 space-y-1">
            <span className="block text-[0.625rem] text-muted-foreground px-1">
              {t(`teacherBoard.${key}`)}
            </span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={surahByName(surah)?.ayahs}
              value={value}
              onChange={(e) => set(Number(e.target.value))}
              className="w-full min-w-0 rounded-2xl glass-strong p-3 text-xs bg-transparent outline-none"
            />
          </label>
        ))}
      </div>
      <input
        type="date"
        value={due}
        onChange={(e) => setDue(e.target.value)}
        className="w-full rounded-2xl glass-strong p-3 text-xs bg-transparent outline-none"
      />
      <textarea
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
        rows={2}
        placeholder={t("assign.notesPh")}
        className="w-full rounded-2xl glass-strong p-3 text-xs bg-transparent outline-none"
      />

      <button
        onClick={submit}
        disabled={busy}
        className="w-full flex items-center justify-center gap-2 rounded-2xl bg-primary text-primary-foreground py-3 text-xs font-bold disabled:opacity-60"
      >
        <Plus className="w-4 h-4" aria-hidden="true" />{" "}
        {busy ? t("assign.saving") : t("assign.submit")}
      </button>
      {msg && (
        <p
          role={msg.ok ? "status" : "alert"}
          className={`text-center text-[0.6875rem] ${msg.ok ? "text-primary" : "text-destructive"}`}
        >
          {msg.text}
        </p>
      )}

      <div className="pt-2 space-y-2 border-t border-border/40">
        <p className="text-[0.6875rem] text-muted-foreground">{t("assign.listTitle")}</p>
        {list.length === 0 ? (
          <p className="text-[0.6875rem] text-muted-foreground">{t("assign.none")}</p>
        ) : (
          list.map((a) => (
            <div key={a.id} className="rounded-2xl glass-strong p-3">
              <p className="text-xs font-bold text-foreground">
                {students.find((s) => s.id === a.student_id)?.name ?? t("assign.student")} ·{" "}
                {t(`assign.kind.${a.kind}`)}
              </p>
              <p className="text-[0.6875rem] text-muted-foreground">
                {[
                  formatAyahRange(a.surah_name, a.from_ayah, a.to_ayah),
                  t("teacherBoard.due", { date: formatDay(a.due_date) }),
                  t(`assign.status.${a.status}`),
                ].join(" · ")}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function Select({
  value,
  onChange,
  placeholder,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-2xl glass-strong p-3 text-xs bg-transparent outline-none text-foreground"
    >
      <option value="">{placeholder}</option>
      {children}
    </select>
  );
}
