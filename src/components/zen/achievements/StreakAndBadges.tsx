import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Award, BookOpenCheck, Check, Flame, Loader2, Medal, Share2, Trophy } from "lucide-react";
import {
  BADGE_GROUP_LABEL,
  groupBadges,
  juzOrdinal,
  logWird,
  streakMessage,
  unlogWird,
  type Achievements,
  type Certificate,
} from "@/lib/achievements";
import { quranUnits, unitProgress } from "@/lib/achievements/divisions";
import { certificateText, shareCertificate } from "@/lib/achievements/certificate";
import { StoryShareButton } from "@/components/zen/StoryShare";
import { shareMilestone, shareableMilestones, type Milestone } from "@/lib/achievements/milestone";
import { certQrPayload, formatVerifyCode } from "@/lib/achievements/verify";
import { isoDate } from "@/lib/center";
import { useAchievements } from "@/hooks/useAchievements";
import { errText } from "@/components/zen/achievements/err";

/** بطاقة السلسلة وتسجيل الورد. compact: للصفحة «اليوم» مع رابط «إنجازاتي». */
export function StreakCard({
  userId,
  data,
  onChange,
  compact = false,
}: {
  userId: string;
  data: Achievements | null;
  onChange: () => void;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [pages, setPages] = useState("");
  const [err, setErr] = useState<string | null>(null);
  if (!data) return null;
  const s = data.streak;
  const today = isoDate(new Date());

  const toggle = async () => {
    setBusy(true);
    setErr(null);
    try {
      if (s.wird_today) await unlogWird(userId, today);
      else {
        const n = pages.trim() ? Number(pages) : null;
        if (n != null && (!Number.isInteger(n) || n < 1 || n > 604))
          throw new Error("عدد الصفحات بين 1 و604.");
        await logWird(userId, today, n);
        setPages("");
      }
      onChange();
    } catch (e) {
      setErr(errText(e, "تعذّر الحفظ"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="glass-strong rounded-3xl p-4">
      <div className="flex items-center gap-3">
        <div
          className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
            s.today ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"
          }`}
        >
          <Flame className="w-6 h-6" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-foreground">
            {s.current > 0 ? `${s.current} يوماً متتالية` : "أيام الالتزام"}
          </p>
          <p className="text-[0.6875rem] text-muted-foreground leading-relaxed">
            {streakMessage(s)}
          </p>
        </div>
        {compact && (
          <Link to="/achievements" className="text-[0.6875rem] font-bold text-primary shrink-0">
            إنجازاتي
          </Link>
        )}
      </div>
      {!compact && (
        <div className="grid grid-cols-3 gap-2 mt-3">
          <Mini label="هذا الشهر" value={`${s.active_30} يوماً`} />
          <Mini label="أفضل سلسلة" value={`${s.best} يوماً`} />
          <Mini label="صفحات محفوظة" value={String(data.memorized_pages)} />
        </div>
      )}
      <div className="flex items-center gap-2 mt-3">
        {!s.wird_today && (
          <input
            inputMode="numeric"
            value={pages}
            onChange={(e) => setPages(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="صفحات (اختياري)"
            className="w-32 h-9 rounded-xl bg-background/60 border border-border px-3 text-xs"
            aria-label="عدد صفحات الورد"
          />
        )}
        <button
          onClick={toggle}
          disabled={busy}
          className={`flex-1 h-9 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 ${
            s.wird_today ? "glass text-foreground" : "bg-primary text-primary-foreground"
          }`}
        >
          {busy ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : s.wird_today ? (
            <>
              <Check className="w-4 h-4" /> قرأت وردي اليوم (تراجع)
            </>
          ) : (
            <>
              <BookOpenCheck className="w-4 h-4" /> قرأت وردي اليوم
            </>
          )}
        </button>
      </div>
      {err && <p className="text-[0.6875rem] text-destructive mt-2">{err}</p>}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass rounded-2xl px-2 py-2 text-center">
      <p className="text-sm font-black text-foreground">{value}</p>
      <p className="text-[0.625rem] text-muted-foreground">{label}</p>
    </div>
  );
}

/** شبكة الأجزاء الثلاثين بتقدّم كل جزء، ثم الأوسمة مجمّعة. */
export function BadgesView({ data }: { data: Achievements }) {
  const juz = quranUnits().filter((u) => u.kind === "juz");
  const earned = new Set(data.badges.filter((b) => b.kind === "juz").map((b) => b.no));
  const groups = groupBadges(data.badges).filter((g) => g.kind !== "juz");
  return (
    <div className="glass-strong rounded-3xl p-4 space-y-4">
      <div>
        <p className="text-xs font-bold text-foreground mb-2 flex items-center gap-1.5">
          <Medal className="w-4 h-4 text-primary" /> الأجزاء
        </p>
        <div className="grid grid-cols-6 gap-1.5">
          {juz.map((u) => {
            const p = unitProgress(u, data.memorized);
            const done = earned.has(u.no);
            const pct = Math.round((p.done / p.total) * 100);
            return (
              <div
                key={u.no}
                title={`الجزء ${juzOrdinal(u.no)}: ${p.done} من ${p.total} صفحة`}
                className={`relative aspect-square rounded-xl flex items-center justify-center text-[0.6875rem] font-black overflow-hidden ${
                  done ? "bg-primary text-primary-foreground" : "bg-primary/5 text-foreground"
                }`}
              >
                {!done && pct > 0 && (
                  <span
                    className="absolute inset-x-0 bottom-0 bg-primary/25"
                    style={{ height: `${pct}%` }}
                    aria-hidden
                  />
                )}
                <span className="relative">{u.no}</span>
              </div>
            );
          })}
        </div>
      </div>
      {groups.map((g) => (
        <div key={g.kind}>
          <p className="text-xs font-bold text-foreground mb-2">
            {BADGE_GROUP_LABEL[g.kind]} ({g.items.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {g.items.map((b) => (
              <span
                key={`${b.kind}-${b.no}`}
                className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2.5 py-1 text-[0.6875rem] font-bold"
              >
                <Award className="w-3 h-3" /> {b.label}
              </span>
            ))}
          </div>
        </div>
      ))}
      <ShareMilestones badges={data.badges} />
      {data.badges.length === 0 && (
        <p className="text-[0.6875rem] text-muted-foreground">
          تُمنح الأوسمة عند اكتمال صفحات سورة أو حزب أو جزء في سجل المصحف، وعند 7 و30 و100 يوم
          التزام متتالية.
        </p>
      )}
    </div>
  );
}

/** «شارك إنجازك» (11.4): ختم الأجزاء وسلاسل 30 يوماً فأكثر فقط. */
function ShareMilestones({ badges }: { badges: Achievements["badges"] }) {
  const list = shareableMilestones(badges);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  if (list.length === 0) return null;
  const share = async (m: Milestone) => {
    setBusy(m.key);
    setMsg(null);
    try {
      const r = await shareMilestone(m);
      if (r === "downloaded") setMsg("حُفظت الصورة.");
    } catch (e) {
      setMsg(errText(e, "تعذّرت المشاركة"));
    } finally {
      setBusy(null);
    }
  };
  return (
    <div aria-label="شارك إنجازك" role="group">
      <p className="text-xs font-bold text-foreground mb-2 flex items-center gap-1.5">
        <Share2 className="w-4 h-4 text-primary" /> شارك إنجازك
      </p>
      <div className="flex flex-wrap gap-1.5">
        {list.slice(0, 6).map((m) => (
          <button
            key={m.key}
            onClick={() => void share(m)}
            disabled={busy != null}
            className="inline-flex items-center gap-1 rounded-full glass px-2.5 py-1 text-[0.6875rem] font-bold text-primary disabled:opacity-50"
          >
            {busy === m.key ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Share2 className="w-3 h-3" />
            )}
            {m.headline}
          </button>
        ))}
      </div>
      {msg && <p className="text-[0.625rem] text-muted-foreground mt-1">{msg}</p>}
    </div>
  );
}

const CERT_STATUS: Record<Certificate["status"], string> = {
  pending: "بانتظار اعتماد المعلّم",
  approved: "معتمدة",
  rejected: "لم تُعتمد",
};

export function CertificatesList({ certs, canShare }: { certs: Certificate[]; canShare: boolean }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  if (certs.length === 0) return null;
  const share = async (c: Certificate) => {
    setBusy(c.id);
    setMsg(null);
    try {
      const r = await shareCertificate(c);
      if (r === "downloaded") setMsg("نُزّلت صورة الشهادة.");
    } catch (e) {
      setMsg(errText(e, "تعذّر إنشاء الصورة"));
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="glass-strong rounded-3xl p-4">
      <p className="text-xs font-bold text-foreground mb-2 flex items-center gap-1.5">
        <Trophy className="w-4 h-4 text-primary" /> الشهادات
      </p>
      <div className="space-y-2">
        {certs.map((c) => (
          <div key={c.id} className="glass rounded-2xl px-3 py-2 flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-foreground">الجزء {juzOrdinal(c.juz)}</p>
              <p className="text-[0.625rem] text-muted-foreground">
                {CERT_STATUS[c.status]}
                {c.teacher_note ? ` · ${c.teacher_note}` : ""}
              </p>
              {c.status === "approved" && c.verify_code && (
                <p className="text-[0.625rem] text-muted-foreground font-mono" dir="ltr">
                  {formatVerifyCode(c.verify_code)}
                </p>
              )}
            </div>
            {canShare && c.status === "approved" && <JuzStory c={c} />}
            {canShare && c.status === "approved" && (
              <button
                onClick={() => share(c)}
                disabled={busy === c.id}
                className="h-8 px-3 rounded-xl bg-primary text-primary-foreground text-[0.6875rem] font-bold flex items-center gap-1"
              >
                {busy === c.id ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Share2 className="w-3.5 h-3.5" />
                )}
                مشاركة صورة
              </button>
            )}
          </div>
        ))}
      </div>
      {msg && <p className="text-[0.6875rem] text-muted-foreground mt-2">{msg}</p>}
    </div>
  );
}

/** قالب القصة لشهادة الجزء (1.20.0). */
function JuzStory({ c }: { c: Certificate }) {
  const x = useMemo(() => certificateText(c), [c]);
  const base = useMemo(
    () => ({
      title: x.title,
      body: x.body,
      place: x.place,
      date: x.date,
      serial: x.serial,
      verifyCode: c.verify_code ? formatVerifyCode(c.verify_code) : null,
    }),
    [x, c.verify_code],
  );
  return (
    <StoryShareButton
      fullName={x.name}
      base={base}
      qrPayload={c.verify_code ? certQrPayload(c.verify_code) : null}
      fileName={`zen-story-juz${c.juz}-${c.serial}.png`}
      shareText={x.body}
    />
  );
}

/** ملخّص قصير لإنجازات طالب: لولي الأمر والمعلّم. */
export function AchievementsSummary({ studentId }: { studentId: string }) {
  const { data, err } = useAchievements(studentId);
  if (err) return <p className="text-[0.6875rem] text-destructive px-1">{err}</p>;
  if (!data) return null;
  const juz = data.badges.filter((b) => b.kind === "juz").length;
  const others = data.badges.filter((b) => b.kind !== "juz" && b.kind !== "streak").length;
  const approved = data.certificates.filter((c) => c.status === "approved").length;
  return (
    <div className="glass-strong rounded-3xl p-4">
      <p className="text-xs font-bold text-foreground mb-2 flex items-center gap-1.5">
        <Medal className="w-4 h-4 text-primary" /> الإنجازات
      </p>
      <div className="grid grid-cols-4 gap-2">
        <Mini label="سلسلة" value={String(data.streak.current)} />
        <Mini label="هذا الشهر" value={String(data.streak.active_30)} />
        <Mini label="أجزاء" value={String(juz)} />
        <Mini label="شهادات" value={String(approved)} />
      </div>
      {others > 0 && (
        <p className="text-[0.625rem] text-muted-foreground mt-2">و{others} وسام سورة وحزب.</p>
      )}
    </div>
  );
}
