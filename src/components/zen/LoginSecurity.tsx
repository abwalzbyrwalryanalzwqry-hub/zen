import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { Link } from "@tanstack/react-router";
import { Check, Copy, KeyRound, Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import {
  MIN_PASSWORD_LENGTH,
  changeMyPassword,
  passwordRuleError,
  generateTempPassword,
  getMyLoginInfo,
  getStudentLoginInfo,
  regenerateRecoveryCode,
  teacherSetStudentPassword,
  type LoginInfo,
  type StudentLoginInfo,
} from "@/lib/auth";

const inputCls = "w-full glass rounded-xl px-3 py-2.5 text-sm outline-none";

export function CopyButton({ text, label }: { text: string; label: string }) {
  const t = useT();
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 2000);
        } catch {
          /* الحافظة غير متاحة: النص ظاهر ويمكن نسخه يدوياً */
        }
      }}
      className="glass rounded-xl px-3 min-h-11 text-xs font-medium flex items-center gap-1.5"
    >
      {done ? (
        <Check className="w-3.5 h-3.5" aria-hidden="true" />
      ) : (
        <Copy className="w-3.5 h-3.5" aria-hidden="true" />
      )}
      {done ? t("loginSec.copied") : label}
    </button>
  );
}

/** تنبيه أعلى الصفحة الشخصية إن عيّن المعلّم كلمة المرور: غيّرها بنفسك. */
export function MustChangePasswordBanner() {
  const t = useT();
  const [info, setInfo] = useState<LoginInfo | null>(null);
  useEffect(() => {
    void getMyLoginInfo().then(setInfo);
  }, []);
  if (!info?.must_change_password) return null;
  return (
    <Link
      to="/account"
      hash="zen-login-security"
      className="mx-3 mt-2 glass-strong rounded-2xl p-3 flex items-start gap-2 border border-gold/40"
    >
      <ShieldAlert className="w-4 h-4 text-gold mt-0.5 shrink-0" aria-hidden />
      <span className="text-xs text-foreground leading-relaxed">
        {t("loginSec.mustChangeBanner")}
      </span>
    </Link>
  );
}

/** في الصفحة الشخصية: اسم المستخدم، وتغيير كلمة المرور، ورمز استرداد جديد. */
export function LoginSecuritySettings() {
  const t = useT();
  const [info, setInfo] = useState<LoginInfo | null>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [newCode, setNewCode] = useState<string | null>(null);
  const [codePw, setCodePw] = useState("");

  useEffect(() => {
    void getMyLoginInfo().then(setInfo);
  }, []);

  if (!info) return null;

  const canChange =
    !busy && current.length > 0 && passwordRuleError(next) === null && next === confirm;

  const change = async () => {
    if (!canChange) return;
    setBusy(true);
    setMsg(null);
    try {
      await changeMyPassword(info.username, current, next);
      setCurrent("");
      setNext("");
      setConfirm("");
      setInfo({ ...info, must_change_password: false });
      setMsg({ ok: true, text: t("loginSec.changed") });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : t("loginSec.changeFailed") });
    } finally {
      setBusy(false);
    }
  };

  const regen = async () => {
    if (busy || !codePw) return;
    setBusy(true);
    setMsg(null);
    try {
      setNewCode(await regenerateRecoveryCode(codePw));
      setCodePw("");
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : t("loginSec.codeFailed") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="zen-login-security-title" id="zen-login-security">
      <h2
        id="zen-login-security-title"
        className="text-xs font-bold text-muted-foreground mb-2 px-2"
      >
        {t("loginSec.title")}
      </h2>
      <div className="glass-strong rounded-3xl p-4 space-y-4">
        {info.username && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t("loginSec.username")}</span>
            <span className="text-sm font-bold text-foreground" data-testid="my-username">
              {info.username}
            </span>
          </div>
        )}
        {info.must_change_password && (
          <p className="text-xs text-gold leading-relaxed">{t("loginSec.mustChange")}</p>
        )}

        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void change();
          }}
        >
          <p className="text-sm font-medium text-foreground">{t("loginSec.changeTitle")}</p>
          <input
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            placeholder={t("loginSec.current")}
            autoComplete="current-password"
            aria-label={t("loginSec.current")}
            className={inputCls}
          />
          <input
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            placeholder={t("loginSec.newPlaceholder", { n: MIN_PASSWORD_LENGTH })}
            autoComplete="new-password"
            aria-label={t("loginSec.new")}
            className={inputCls}
          />
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={t("loginSec.confirmPlaceholder")}
            autoComplete="new-password"
            aria-label={t("loginSec.confirm")}
            className={inputCls}
          />
          {confirm !== "" && confirm !== next && (
            <p className="text-xs text-destructive">{t("loginSec.mismatch")}</p>
          )}
          <button
            type="submit"
            disabled={!canChange}
            className="w-full min-h-11 rounded-xl bg-primary text-primary-foreground py-2.5 text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
            {t("loginSec.save")}
          </button>
        </form>

        {info.username && (
          <div className="space-y-2 border-t border-border/40 pt-3">
            <p className="text-sm font-medium text-foreground">{t("loginSec.recovery")}</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {t("loginSec.recoveryHint")}
            </p>
            {newCode ? (
              <div className="glass rounded-2xl p-3 flex items-center justify-between gap-2">
                <span dir="ltr" className="font-mono font-black tracking-widest text-foreground">
                  {newCode}
                </span>
                <CopyButton text={newCode} label={t("loginSec.copy")} />
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  type="password"
                  value={codePw}
                  onChange={(e) => setCodePw(e.target.value)}
                  placeholder={t("loginSec.codePw")}
                  autoComplete="current-password"
                  aria-label={t("loginSec.codePwLabel")}
                  className={`${inputCls} flex-1`}
                />
                <button
                  type="button"
                  onClick={() => void regen()}
                  disabled={busy || !codePw}
                  className="glass rounded-xl px-3 min-h-11 text-xs font-medium flex items-center gap-1.5 disabled:opacity-50"
                >
                  <RefreshCw className="w-3.5 h-3.5" aria-hidden />
                  {t("loginSec.newCode")}
                </button>
              </div>
            )}
          </div>
        )}

        {msg && (
          <p
            role={msg.ok ? "status" : "alert"}
            className={`text-xs ${msg.ok ? "text-primary" : "text-destructive"}`}
          >
            {msg.text}
          </p>
        )}
      </div>
    </section>
  );
}

/** في صفحة الطالب عند معلّمه: اسم المستخدم وتعيين كلمة مرور جديدة. */
export function TeacherPasswordCard({ studentId }: { studentId: string }) {
  const t = useT();
  const [info, setInfo] = useState<StudentLoginInfo | null>(null);
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    void getStudentLoginInfo(studentId).then(setInfo);
  }, [studentId]);

  if (!info || !info.can_set_password) return null;

  const save = async () => {
    if (busy || passwordRuleError(pw) !== null) return;
    setBusy(true);
    setErr(null);
    try {
      await teacherSetStudentPassword(studentId, pw);
      setDone(pw);
      setOpen(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("loginSec.setFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="glass-strong rounded-3xl" data-testid="teacher-password-card">
      <summary className="px-4 py-3 text-xs font-bold text-foreground cursor-pointer flex items-center gap-2">
        <KeyRound className="w-4 h-4 text-primary" aria-hidden />
        {t("loginSec.studentTitle")}
      </summary>
      <div className="px-4 pb-4 space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{t("loginSec.username")}</span>
          <span className="font-bold text-foreground">{info.username ?? "—"}</span>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">{t("loginSec.studentHint")}</p>

        {done && (
          <div className="glass rounded-2xl p-3 space-y-2" role="status">
            <p className="text-xs text-primary">{t("loginSec.studentDone")}</p>
            <div className="flex items-center justify-between gap-2">
              <span dir="ltr" className="font-mono font-black tracking-wider text-foreground">
                {done}
              </span>
              <CopyButton
                text={t("loginSec.studentCopy", { username: info.username ?? "", password: done })}
                label={t("loginSec.copy")}
              />
            </div>
          </div>
        )}

        {!open ? (
          <button
            type="button"
            onClick={() => {
              setPw(generateTempPassword());
              setOpen(true);
              setDone(null);
            }}
            className="w-full min-h-11 rounded-xl bg-primary/15 text-primary py-2.5 text-xs font-bold"
          >
            {t("loginSec.setNew")}
          </button>
        ) : (
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                dir="ltr"
                aria-label={t("loginSec.studentNew")}
                autoComplete="off"
                spellCheck={false}
                className={`${inputCls} flex-1 font-mono text-start`}
              />
              <button
                type="button"
                onClick={() => setPw(generateTempPassword())}
                aria-label={t("loginSec.regenerate")}
                className="glass rounded-xl min-w-11 px-3 flex items-center justify-center"
              >
                <RefreshCw className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
            {pw.length > 0 && passwordRuleError(pw) !== null && (
              <p className="text-xs text-destructive">
                {t("loginSec.rule", { n: MIN_PASSWORD_LENGTH })}
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void save()}
                disabled={busy || passwordRuleError(pw) !== null}
                className="flex-1 rounded-xl bg-primary text-primary-foreground py-2.5 text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
                {t("loginSec.confirmSet")}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-3 min-h-11 rounded-xl glass text-xs"
              >
                {t("common.cancel")}
              </button>
            </div>
          </div>
        )}
        {err && (
          <p role="alert" className="text-xs text-destructive">
            {err}
          </p>
        )}
      </div>
    </details>
  );
}

/**
 * بيانات دخول طالب أنشأه المعلّم الآن (المرحلة 6.1). تُعرض مرة واحدة: كلمة المرور ورمز الاسترداد
 * لا يُحفظان في التطبيق، فيُنسخان أو يُكتبان للطالب قبل الإغلاق.
 */
export function NewStudentCredentials({
  name,
  username,
  password,
  recoveryCode,
}: {
  name: string;
  username: string;
  password: string;
  recoveryCode: string;
}) {
  const t = useT();
  const all = t("loginSec.newAll", { name, username, password, code: recoveryCode });
  const row = (label: string, value: string) => (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium select-all" dir="ltr">
        {value}
      </span>
    </div>
  );
  return (
    <div className="glass-strong rounded-2xl p-3 mb-3 border border-primary/30" role="status">
      <p className="text-xs font-medium mb-1 flex items-center gap-1.5">
        <KeyRound className="w-4 h-4 text-primary" aria-hidden />
        {t("loginSec.newCreated", { name })}
      </p>
      {row(t("loginSec.username"), username)}
      {row(t("loginSec.tempPassword"), password)}
      {row(t("loginSec.recovery"), recoveryCode)}
      <p className="text-xs text-muted-foreground my-2 leading-relaxed">{t("loginSec.newHint")}</p>
      <CopyButton text={all} label={t("loginSec.copyAll")} />
    </div>
  );
}
