import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PhoneFrame } from "@/components/zen/PhoneFrame";
import { BackButton } from "@/components/zen/BackButton";
import {
  BookOpenCheck,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Plus,
  Star,
  Trash2,
  X,
  Search,
} from "lucide-react";
import { useSession } from "@/hooks/useSession";
import { MushafPage, PageNumberPlate } from "@/components/zen/MushafPage";
import { useMushafPage } from "@/hooks/useMushafPage";
import { MUSHAF_TOTAL_PAGES, juzOfPage, hizbOfPage, surahsOnPage } from "@/lib/mushaf15";
import { SURAHS } from "@/lib/quran-meta";
import {
  MUSHAF_KIND_LABEL,
  addMushafRecord,
  deleteMushafRecord,
  isTeacher as isTeacherCheck,
  listMushafRecords,
  listMyStudents,
  type MushafRecord,
  type Profile,
} from "@/lib/zen-api";
import { localDayKey } from "@/lib/local-day";
import { useAsync } from "@/hooks/use-async";
import { intlLocale } from "@/lib/i18n";

/**
 * سجل الحفظ والمراجعة لكل صفحة من المصحف (ميزة زِن الأصلية، كانت شاشة «المصحف» السابقة):
 * المعلّم يسجّل لطلابه حفظ الصفحة أو مراجعتها أو تثبيتها بتقييم وملاحظة، والطالب يرى سجلاته.
 * القراءة نفسها صارت في قارئ المصحف (/mushaf/read) المنقول من منار.
 */
export const Route = createFileRoute("/_authed/mushaf/records")({
  head: () => ({
    meta: [
      { title: "سجل الحفظ — Zen" },
      {
        name: "description",
        content: "سجّل الحفظ والمراجعة اليومية لكل طالب على صفحات مصحف المدينة ٦٠٤.",
      },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { page?: number } => {
    const n = Number(search.page);
    return { page: Number.isFinite(n) && n >= 1 && n <= 604 ? Math.floor(n) : undefined };
  },
  component: MushafScreen,
});

const TOTAL_PAGES = MUSHAF_TOTAL_PAGES;
const LAST_PAGE_KEY = "zen-mushaf-page";

const NO_RECORDS: MushafRecord[] = [];
const NO_STUDENTS: Profile[] = [];

function MushafScreen() {
  const { userId, guest } = useSession();
  const search = Route.useSearch();
  // الصفحة من الرابط، وإلا آخر صفحة محفوظة — عند أول عرض لا في أثر (M12).
  const [page, setPage] = useState(() => {
    if (search.page) return search.page;
    const saved = Number(localStorage.getItem(LAST_PAGE_KEY));
    return saved >= 1 && saved <= TOTAL_PAGES ? saved : 1;
  });
  const [reloadKey, setReloadKey] = useState(0);
  const pageState = useMushafPage(page, reloadKey);
  const surahNames =
    pageState.status === "ready"
      ? surahsOnPage(pageState.data)
          .map((n) => SURAHS[n - 1]?.name)
          .filter(Boolean)
          .join("، ")
      : "";
  // الضيف يقرأ المصحف فقط؛ سجلات التتبّع للمعلّم والطالب بحسابهما.
  const dataQ = useAsync(userId ? `records:${userId}:${guest}:${page}` : null, async () => {
    if (guest) return { teacher: false, records: [] as MushafRecord[], students: [] as Profile[] };
    const t = await isTeacherCheck(userId as string);
    try {
      const [recs, studs] = await Promise.all([
        listMushafRecords(t ? { page } : { page, studentId: userId as string }),
        t ? listMyStudents() : Promise.resolve([]),
      ]);
      return { teacher: t, records: recs, students: studs };
    } catch {
      // دون اتصال ولا نسخة محفوظة لهذه الصفحة: تبقى القراءة متاحة بلا سجلات.
      return { teacher: t, records: [] as MushafRecord[], students: [] as Profile[] };
    }
  });
  const teacher = dataQ.latest?.teacher ?? false;
  const records = dataQ.data?.records ?? NO_RECORDS;
  const students = dataQ.latest?.students ?? NO_STUDENTS;
  const loading = dataQ.loading;
  const refresh = dataQ.reload;
  const [showSheet, setShowSheet] = useState(false);
  const [jump, setJump] = useState("");

  useEffect(() => {
    localStorage.setItem(LAST_PAGE_KEY, String(page));
  }, [page]);

  const nameOf = useMemo(() => {
    const map: Record<string, string> = {};
    students.forEach((s) => (map[s.id] = s.name));
    return map;
  }, [students]);

  const go = (p: number) => setPage(Math.min(TOTAL_PAGES, Math.max(1, p)));

  return (
    <PhoneFrame>
      <div className="flex-1 flex flex-col">
        <header className="px-5 pt-12 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BackButton fallback="/mushaf" />
            <div>
              <h1 className="text-2xl font-black text-foreground">سجل الحفظ</h1>
              <p className="text-xs text-muted-foreground mt-1">
                صفحة {page} من {TOTAL_PAGES}، الجزء {juzOfPage(page)}، الحزب {hizbOfPage(page)}
              </p>
            </div>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center glow-primary">
            <BookOpenCheck className="w-5 h-5 text-white" />
          </div>
        </header>

        {/* Jump bar */}
        <div className="px-5">
          <div className="glass rounded-2xl h-11 flex items-center px-3 gap-2">
            <Search className="w-4 h-4 text-muted-foreground" />
            <input
              value={jump}
              onChange={(e) => setJump(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && jump) {
                  go(Number(jump));
                  setJump("");
                }
              }}
              inputMode="numeric"
              placeholder="انتقل إلى صفحة (١–٦٠٤)…"
              className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
            />
            <button
              onClick={() => {
                if (jump) {
                  go(Number(jump));
                  setJump("");
                }
              }}
              className="text-[0.6875rem] px-3 py-1 rounded-full bg-primary/15 text-primary font-medium"
            >
              انتقال
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 mt-3 pb-4 space-y-3">
          {/* الصفحة: مصحف المدينة ١٥ سطراً، نصّاً بخط مجمع الملك فهد */}
          <div className="mx-2 rounded-3xl bg-mushaf-paper border border-gold/30 shadow-lg px-3 pt-3 pb-2">
            {surahNames && (
              <div className="flex items-center justify-between pb-2 text-[0.6875rem] text-[#6b5a36]">
                <span className="truncate">{surahNames}</span>
                <span className="shrink-0">الجزء {juzOfPage(page)}</span>
              </div>
            )}
            <MushafPage page={page} state={pageState} onRetry={() => setReloadKey((k) => k + 1)} />
            {pageState.status === "ready" && (
              <div className="pt-2">
                <PageNumberPlate page={page} />
              </div>
            )}
          </div>

          {/* Pager */}
          <div className="flex items-center gap-2 px-2">
            <button
              onClick={() => go(page + 1)}
              disabled={page >= TOTAL_PAGES}
              className="flex-1 glass rounded-2xl py-2.5 flex items-center justify-center gap-1 text-xs font-medium disabled:opacity-60"
            >
              <ChevronRight className="w-4 h-4" /> السابقة
            </button>
            <span className="glass rounded-2xl px-4 py-2.5 text-xs font-black text-primary">
              {page}
            </span>
            <button
              onClick={() => go(page - 1)}
              disabled={page <= 1}
              className="flex-1 glass rounded-2xl py-2.5 flex items-center justify-center gap-1 text-xs font-medium disabled:opacity-60"
            >
              التالية <ChevronLeft className="w-4 h-4" />
            </button>
          </div>

          <Link
            to="/mushaf/read"
            search={{ page, mode: "mushaf" }}
            className="mx-2 w-[calc(100%-1rem)] glass rounded-2xl text-sm font-medium py-3 flex items-center justify-center gap-2 text-primary"
          >
            <BookOpenCheck className="w-4 h-4" /> افتح الصفحة في قارئ المصحف
          </Link>

          {teacher && (
            <button
              onClick={() => setShowSheet(true)}
              className="mx-2 w-[calc(100%-1rem)] rounded-2xl bg-gradient-to-br from-primary to-primary-glow text-white text-sm font-medium py-3 flex items-center justify-center gap-2 glow-primary"
            >
              <Plus className="w-4 h-4" /> تسجيل حفظ / مراجعة لهذه الصفحة
            </button>
          )}

          {/* Records */}
          {!guest && (
            <div className="px-2">
              <p className="text-sm font-medium text-foreground mb-2">سجلات الصفحة {page}</p>
              {loading ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                </div>
              ) : records.length === 0 ? (
                <p className="text-center text-xs text-muted-foreground py-6">
                  لا توجد تسجيلات لهذه الصفحة بعد.
                </p>
              ) : (
                <div className="space-y-2">
                  {records.map((r) => (
                    <div key={r.id} className="glass rounded-2xl p-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {teacher ? (nameOf[r.student_id] ?? "طالب") : "تسجيلي"}
                          </p>
                          <p className="text-[0.625rem] text-muted-foreground">
                            {MUSHAF_KIND_LABEL[r.kind]}،{" "}
                            {new Date(r.session_date).toLocaleDateString(intlLocale())}
                          </p>
                        </div>
                        {teacher && (
                          <button
                            aria-label="حذف السجل"
                            onClick={async () => {
                              await deleteMushafRecord(r.id);
                              void refresh();
                            }}
                            className="text-muted-foreground"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      {r.notes && (
                        <p className="text-[0.6875rem] text-muted-foreground mt-1">📝 {r.notes}</p>
                      )}
                      {r.rating != null && (
                        <div className="mt-1.5 flex items-center gap-1">
                          {Array.from({ length: 5 }).map((_, k) => (
                            <Star
                              key={k}
                              className={`w-3 h-3 ${k < (r.rating ?? 0) ? "fill-gold text-gold" : "text-muted-foreground/40"}`}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {showSheet && userId && (
          <RecordSheet
            page={page}
            teacherId={userId}
            students={students}
            onClose={() => setShowSheet(false)}
            onSaved={() => {
              setShowSheet(false);
              void refresh();
            }}
          />
        )}
      </div>
    </PhoneFrame>
  );
}

function RecordSheet({
  page,
  teacherId,
  students,
  onClose,
  onSaved,
}: {
  page: number;
  teacherId: string;
  students: Profile[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [studentId, setStudentId] = useState(students[0]?.id ?? "");
  const [kind, setKind] = useState<MushafRecord["kind"]>("memorize");
  const [date, setDate] = useState(localDayKey());
  const [rating, setRating] = useState(0);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    if (saving) return;
    if (!studentId) {
      setErr("اختر طالباً أولاً");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await addMushafRecord({
        student_id: studentId,
        teacher_id: teacherId,
        page,
        kind,
        session_date: date,
        rating: rating || null,
        notes: notes.trim() || null,
      });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "تعذّر الحفظ");
    } finally {
      setSaving(false);
    }
  };

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
          <h2 className="text-lg font-black text-foreground">تسجيل الصفحة {page}</h2>
          <button onClick={onClose}>
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <label className="block text-[0.6875rem] text-muted-foreground mb-1">الطالب</label>
        <select
          value={studentId}
          onChange={(e) => setStudentId(e.target.value)}
          className="w-full glass rounded-xl px-3 py-2.5 text-sm outline-none mb-3"
        >
          {students.length === 0 && <option value="">لا يوجد طلاب في حلقاتك</option>}
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        <label className="block text-[0.6875rem] text-muted-foreground mb-1">النوع</label>
        <div className="grid grid-cols-3 gap-2 mb-3">
          {(["memorize", "review", "consolidate"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`py-2 rounded-xl text-xs font-medium transition-colors ${kind === k ? "bg-primary text-primary-foreground" : "glass text-muted-foreground"}`}
            >
              {MUSHAF_KIND_LABEL[k]}
            </button>
          ))}
        </div>

        <label className="block text-[0.6875rem] text-muted-foreground mb-1">التاريخ</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full glass rounded-xl px-3 py-2.5 text-sm outline-none mb-3"
        />

        <label className="block text-[0.6875rem] text-muted-foreground mb-1">التقييم</label>
        <div className="flex items-center gap-1.5 mb-3">
          {Array.from({ length: 5 }).map((_, k) => (
            <button key={k} onClick={() => setRating(k + 1)}>
              <Star
                className={`w-6 h-6 ${k < rating ? "fill-gold text-gold" : "text-muted-foreground/40"}`}
              />
            </button>
          ))}
        </div>

        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="ملاحظات المعلم…"
          className="w-full glass rounded-xl px-3 py-2 text-xs outline-none resize-none mb-3"
        />

        {err && <p className="text-[0.6875rem] text-destructive mb-2">{err}</p>}

        <button
          onClick={save}
          disabled={saving}
          className="w-full py-3 rounded-2xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60"
        >
          {saving ? "جارٍ الحفظ…" : "حفظ التسجيل"}
        </button>
      </div>
    </div>
  );
}
