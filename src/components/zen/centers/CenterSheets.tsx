import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import {
  addCenter,
  addHalaqa,
  inviteStudentToHalaqa,
  listStudents,
  type Profile,
} from "@/lib/zen-api";
import { generateTempPassword, teacherCreateStudent, type CreatedStudent } from "@/lib/auth";
import { suggestUsername, usernameError } from "@/lib/username";
import { NewStudentCredentials } from "@/components/zen/LoginSecurity";

export function SheetShell({
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
          <button onClick={onClose}>
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function CenterSheet({
  userId,
  onClose,
  onSaved,
}: {
  userId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [desc, setDesc] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    if (saving) return;
    if (name.trim().length < 2) {
      setErr("اكتب اسم المركز");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await addCenter({
        name: name.trim(),
        city: city.trim() || null,
        description: desc.trim() || null,
        created_by: userId,
      });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "تعذّر الحفظ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SheetShell title="مركز جديد" onClose={onClose}>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="اسم المركز"
        className="w-full glass rounded-xl px-3 py-2.5 text-sm outline-none mb-2"
      />
      <input
        value={city}
        onChange={(e) => setCity(e.target.value)}
        placeholder="المدينة"
        className="w-full glass rounded-xl px-3 py-2.5 text-sm outline-none mb-2"
      />
      <textarea
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        rows={2}
        placeholder="وصف مختصر…"
        className="w-full glass rounded-xl px-3 py-2 text-xs outline-none resize-none mb-3"
      />
      {err && <p className="text-[0.6875rem] text-destructive mb-2">{err}</p>}
      <button
        onClick={save}
        disabled={saving}
        className="w-full py-3 rounded-2xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60"
      >
        {saving ? "جارٍ الحفظ…" : "حفظ المركز"}
      </button>
    </SheetShell>
  );
}

export function HalaqaSheet({
  centerId,
  teacherId,
  onClose,
  onSaved,
}: {
  centerId: string;
  teacherId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [schedule, setSchedule] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    if (saving) return;
    if (name.trim().length < 2) {
      setErr("اكتب اسم الحلقة");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await addHalaqa({
        center_id: centerId,
        name: name.trim(),
        teacher_id: teacherId,
        schedule: schedule.trim() || null,
      });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "تعذّر الحفظ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SheetShell title="حلقة جديدة" onClose={onClose}>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="اسم الحلقة"
        className="w-full glass rounded-xl px-3 py-2.5 text-sm outline-none mb-2"
      />
      <input
        value={schedule}
        onChange={(e) => setSchedule(e.target.value)}
        placeholder="الموعد (مثال: يومياً بعد المغرب)"
        className="w-full glass rounded-xl px-3 py-2.5 text-sm outline-none mb-3"
      />
      {err && <p className="text-[0.6875rem] text-destructive mb-2">{err}</p>}
      <button
        onClick={save}
        disabled={saving}
        className="w-full py-3 rounded-2xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60"
      >
        {saving ? "جارٍ الحفظ…" : "حفظ الحلقة"}
      </button>
    </SheetShell>
  );
}

export function StudentSheet({
  halaqaId,
  onClose,
  onSaved,
}: {
  halaqaId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [tab, setTab] = useState<"new" | "existing">("new");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [usernameEdited, setUsernameEdited] = useState(false);
  const [password, setPassword] = useState(() => generateTempPassword());
  const [created, setCreated] = useState<(CreatedStudent & { password: string }) | null>(null);
  const [all, setAll] = useState<Profile[]>([]);
  const [pick, setPick] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    void listStudents().then((s) => {
      setAll(s);
      setPick(s[0]?.id ?? "");
    });
  }, []);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setErr(null);
    setOk(null);
    try {
      if (tab === "new") {
        const res = await teacherCreateStudent({ halaqaId, username, password, name });
        // لا إغلاق تلقائي: بيانات الدخول تظهر مرة واحدة حتى ينسخها المعلّم.
        setCreated({ ...res, password });
        setName("");
        setUsername("");
        setUsernameEdited(false);
        setPassword(generateTempPassword());
      } else {
        if (!pick) {
          setErr("اختر طالباً");
          setSaving(false);
          return;
        }
        await inviteStudentToHalaqa(halaqaId, pick);
        setOk("أُرسلت الدعوة. ينضمّ الطالب إلى الحلقة بعد موافقته.");
        setTimeout(onSaved, 1400);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "تعذّرت العملية");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SheetShell title="إضافة طالب" onClose={created ? onSaved : onClose}>
      <div className="grid grid-cols-2 gap-2 mb-3">
        {(["new", "existing"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`py-2 rounded-xl text-xs font-medium ${tab === t ? "bg-primary text-primary-foreground" : "glass text-muted-foreground"}`}
          >
            {t === "new" ? "طالب جديد" : "دعوة طالب مسجّل"}
          </button>
        ))}
      </div>

      {tab === "new" ? (
        <>
          {created && (
            <NewStudentCredentials
              name={created.name}
              username={created.username}
              password={created.password}
              recoveryCode={created.recoveryCode}
            />
          )}
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!usernameEdited) setUsername(suggestUsername(e.target.value));
            }}
            placeholder="اسم الطالب"
            aria-label="اسم الطالب"
            className="w-full glass rounded-xl px-3 py-2.5 text-sm outline-none mb-2"
          />
          <input
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              setUsernameEdited(true);
            }}
            placeholder="اسم المستخدم للدخول"
            aria-label="اسم المستخدم"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="w-full glass rounded-xl px-3 py-2.5 text-sm outline-none mb-1"
          />
          {username && usernameError(username) && (
            <p className="text-[0.625rem] text-destructive mb-1">{usernameError(username)}</p>
          )}
          <div className="flex gap-2 mb-2 mt-1">
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-label="كلمة المرور المؤقتة"
              dir="ltr"
              autoCapitalize="none"
              spellCheck={false}
              className="flex-1 glass rounded-xl px-3 py-2.5 text-sm outline-none"
            />
            <button
              type="button"
              onClick={() => setPassword(generateTempPassword())}
              className="glass rounded-xl px-3 text-[0.6875rem]"
            >
              كلمة أخرى
            </button>
          </div>
          <p className="text-[0.625rem] text-muted-foreground mb-3">
            يدخل الطالب باسم المستخدم وكلمة المرور المؤقتة، ثم يختار كلمة مرور خاصة به. لا يحتاج
            بريداً ولا رقم هاتف.
          </p>
        </>
      ) : (
        <>
          <p className="text-[0.625rem] text-muted-foreground mb-2">
            لا يُضاف الطالب المسجّل مباشرة: تصله دعوة في تنبيهاته، ولا ترى بياناته إلا بعد موافقته.
          </p>
          <select
            value={pick}
            onChange={(e) => setPick(e.target.value)}
            className="w-full glass rounded-xl px-3 py-2.5 text-sm outline-none mb-3"
          >
            {all.length === 0 && <option value="">لا يوجد طلاب</option>}
            {all.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </>
      )}

      {err && <p className="text-[0.6875rem] text-destructive mb-2">{err}</p>}
      {ok && <p className="text-[0.6875rem] text-primary mb-2">{ok}</p>}

      <button
        onClick={save}
        disabled={saving}
        className="w-full py-3 rounded-2xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60 flex items-center justify-center gap-2"
      >
        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
        {tab === "new" ? "إنشاء الطالب" : "إرسال دعوة"}
      </button>
    </SheetShell>
  );
}
