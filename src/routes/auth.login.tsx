import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { PhoneFrame } from "@/components/zen/PhoneFrame";
import { ZenLogo } from "@/components/zen/ZenLogo";
import {
  AtSign,
  Check,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import {
  MIN_PASSWORD_LENGTH,
  passwordRuleError,
  resetWithRecoveryCode,
  signInWithUsername,
  signUpWithUsername,
  type NewAccount,
} from "@/lib/auth";
import { USERNAME_MAX, looksLikeEmail, normalizeUsername, usernameError } from "@/lib/username";
import { setGuest } from "@/lib/offline/guest";
import { prefersSignup } from "@/lib/onboarding";

export const Route = createFileRoute("/auth/login")({
  // ?u= من «تبديل الحساب» (GAP-09): يملأ اسم المستخدم ويبدأ بالدخول.
  validateSearch: (s: Record<string, unknown>): { u?: string } =>
    typeof s.u === "string" && s.u.trim() && s.u.length <= 254 ? { u: s.u.trim() } : {},
  head: () => ({ meta: [{ title: "تسجيل الدخول — Zen" }] }),
  component: LoginScreen,
});

type Mode = "signin" | "signup" | "recover";

const field =
  "glass-strong rounded-2xl h-14 flex items-center px-4 gap-3 focus-within:ring-2 ring-primary/40 transition-all";
const input =
  "flex-1 min-w-0 bg-transparent outline-none text-base text-foreground placeholder:text-muted-foreground/50";
const label = "block text-xs font-medium text-muted-foreground pr-2 mb-2";

function LoginScreen() {
  // من اختار دوره في الترحيب (3.11) يبدأ بـ«حساب جديد».
  const { u } = Route.useSearch();
  const [mode, setMode] = useState<Mode>(() => (!u && prefersSignup() ? "signup" : "signin"));
  const [name, setName] = useState("");
  const [username, setUsername] = useState(u ?? "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [code, setCode] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<(NewAccount & { title: string }) | null>(null);
  const navigate = useNavigate();

  const isEmail = mode === "signin" && looksLikeEmail(username);
  const unameErr = username.trim() && !isEmail ? usernameError(username) : null;
  // الدخول بكلمة قائمة يكفيه الطول؛ كلمة جديدة (حساب أو استرداد) تحتاج حرفاً ورقماً (C4).
  const pwOk =
    mode === "signin"
      ? password.length >= MIN_PASSWORD_LENGTH
      : passwordRuleError(password) === null;
  const confirmOk = mode === "signin" || confirm === password;
  const canSubmit =
    !loading &&
    username.trim() !== "" &&
    (isEmail || !unameErr) &&
    pwOk &&
    confirmOk &&
    (mode !== "recover" || code.replace(/[^A-Za-z0-9]/g, "").length === 16);

  const switchMode = (m: Mode) => {
    setMode(m);
    setError(null);
    setPassword("");
    setConfirm("");
  };

  const submit = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    try {
      if (mode === "signin") {
        await signInWithUsername(username, password);
        navigate({ to: "/today", replace: true });
      } else if (mode === "signup") {
        const acc = await signUpWithUsername(username, password, name);
        setCreated({ ...acc, title: "تم إنشاء حسابك" });
      } else {
        const acc = await resetWithRecoveryCode(username, code, password);
        setCreated({ ...acc, title: "تم تعيين كلمة المرور" });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر إتمام العملية.");
    } finally {
      setLoading(false);
    }
  };

  if (created) {
    return (
      <RecoveryCodeScreen
        account={created}
        title={created.title}
        onDone={() => navigate({ to: "/today", replace: true })}
      />
    );
  }

  const heading =
    mode === "signin" ? "تسجيل الدخول" : mode === "signup" ? "حساب جديد" : "نسيت كلمة المرور";

  return (
    <PhoneFrame>
      <div className="flex-1 flex flex-col p-6 pt-12 overflow-y-auto">
        <div className="flex flex-col items-center gap-3">
          <ZenLogo size={72} glow={false} />
          <h1 className="text-2xl font-black text-foreground">{heading}</h1>
          <p className="text-xs text-muted-foreground text-center">
            باسم مستخدم وكلمة مرور فقط، بلا بريد ولا رقم هاتف.
          </p>
        </div>

        {mode !== "recover" && (
          <div
            role="tablist"
            aria-label="نوع العملية"
            className="mt-6 glass rounded-2xl p-1 grid grid-cols-2 gap-1"
          >
            {(["signin", "signup"] as const).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                onClick={() => switchMode(m)}
                className={`h-10 rounded-xl text-sm font-medium transition-colors ${
                  mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                }`}
              >
                {m === "signin" ? "تسجيل الدخول" : "إنشاء حساب"}
              </button>
            ))}
          </div>
        )}

        <form
          className="mt-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {mode === "signup" && (
            <div>
              <label htmlFor="zen-name" className={label}>
                الاسم الظاهر (اختياري)
              </label>
              <div className={field}>
                <UserRound className="w-5 h-5 text-primary" aria-hidden />
                <input
                  id="zen-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="اسمك كما يراه معلّمك"
                  autoComplete="name"
                  maxLength={60}
                  className={input}
                />
              </div>
            </div>
          )}

          <div>
            <label htmlFor="zen-username" className={label}>
              اسم المستخدم
            </label>
            <div className={field}>
              <AtSign className="w-5 h-5 text-primary" aria-hidden />
              <input
                id="zen-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="مثال: ahmad_2015 أو أحمد.ع"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                maxLength={mode === "signin" ? 120 : USERNAME_MAX + 4}
                aria-invalid={!!unameErr}
                aria-describedby="zen-username-hint"
                className={input}
              />
            </div>
            <p
              id="zen-username-hint"
              className={`text-[0.6875rem] pr-2 mt-1.5 ${unameErr ? "text-destructive" : "text-muted-foreground"}`}
            >
              {unameErr ??
                (mode === "signup"
                  ? username.trim()
                    ? `ستدخل باسم: ${normalizeUsername(username)}`
                    : "حروف عربية أو إنجليزية وأرقام و _ و . — احفظه جيداً."
                  : "")}
            </p>
          </div>

          {mode === "recover" && (
            <div>
              <label htmlFor="zen-code" className={label}>
                رمز الاسترداد
              </label>
              <div className={field}>
                <KeyRound className="w-5 h-5 text-primary" aria-hidden />
                <input
                  id="zen-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="XXXX-XXXX-XXXX-XXXX"
                  autoComplete="one-time-code"
                  autoCapitalize="characters"
                  spellCheck={false}
                  dir="ltr"
                  maxLength={24}
                  className={`${input} text-left tracking-widest`}
                />
              </div>
            </div>
          )}

          <div>
            <label htmlFor="zen-password" className={label}>
              {mode === "recover" ? "كلمة المرور الجديدة" : "كلمة المرور"}
            </label>
            <div className={field}>
              <Lock className="w-5 h-5 text-primary" aria-hidden />
              <input
                id="zen-password"
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={
                  mode === "signin"
                    ? `${MIN_PASSWORD_LENGTH} أحرف على الأقل`
                    : `${MIN_PASSWORD_LENGTH} أحرف على الأقل، حرف ورقم`
                }
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                className={input}
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                aria-label={showPw ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                className="text-muted-foreground"
              >
                {showPw ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {mode !== "signin" && (
            <div>
              <label htmlFor="zen-password2" className={label}>
                تأكيد كلمة المرور
              </label>
              <div className={field}>
                <Lock className="w-5 h-5 text-primary" aria-hidden />
                <input
                  id="zen-password2"
                  type={showPw ? "text" : "password"}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  aria-invalid={confirm !== "" && !confirmOk}
                  className={input}
                />
              </div>
              {confirm !== "" && !confirmOk && (
                <p className="text-[0.6875rem] text-destructive pr-2 mt-1.5">
                  كلمتا المرور غير متطابقتين.
                </p>
              )}
            </div>
          )}

          {mode === "signup" && (
            <div className="glass rounded-2xl p-3 flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-primary mt-0.5 shrink-0" aria-hidden />
              <p className="text-[0.6875rem] text-muted-foreground leading-relaxed">
                معلّم؟ أنشئ حسابك هنا، ثم اختر «أنا معلّم» في الصفحة الرئيسية وأدخل رمز الدعوة (أو
                رمز المؤسس لأول معلّم).
              </p>
            </div>
          )}

          {error && (
            <p role="alert" className="text-xs text-destructive text-center px-4">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full bg-primary text-primary-foreground rounded-2xl h-14 font-medium flex items-center justify-center gap-3 disabled:opacity-60 disabled:cursor-not-allowed enabled:glow-primary transition-all"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" aria-label="جارٍ الإرسال" />
            ) : mode === "signin" ? (
              "دخول"
            ) : mode === "signup" ? (
              "إنشاء الحساب"
            ) : (
              "تعيين كلمة المرور"
            )}
          </button>

          {mode === "signin" && (
            <div className="text-center text-[0.75rem] text-muted-foreground leading-relaxed">
              نسيت كلمة المرور؟{" "}
              <button
                type="button"
                onClick={() => switchMode("recover")}
                className="text-primary font-medium"
              >
                استخدم رمز الاسترداد
              </button>
              <span className="block">أو اطلب من معلّم حلقتك تعيين كلمة مرور جديدة.</span>
            </div>
          )}
          {mode === "recover" && (
            <button
              type="button"
              onClick={() => switchMode("signin")}
              className="w-full text-center text-sm text-primary font-medium"
            >
              العودة إلى تسجيل الدخول
            </button>
          )}

          <p className="text-[0.6875rem] text-muted-foreground text-center leading-relaxed">
            بمتابعتك، فأنت توافق على{" "}
            <Link to="/legal/terms" className="text-gold">
              شروط الاستخدام
            </Link>{" "}
            و
            <Link to="/legal/privacy" className="text-gold">
              سياسة الخصوصية
            </Link>
          </p>
        </form>

        <button
          type="button"
          onClick={() => {
            setGuest(true);
            navigate({ to: "/today", replace: true });
          }}
          className="mt-auto pt-6 text-center text-sm text-muted-foreground font-medium"
        >
          متابعة دون حساب (المصحف والأذكار دون اتصال)
        </button>
      </div>
    </PhoneFrame>
  );
}

function RecoveryCodeScreen({
  account,
  title,
  onDone,
}: {
  account: NewAccount;
  title: string;
  onDone: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const text = `Zen\nاسم المستخدم: ${account.username}\nرمز الاسترداد: ${account.recoveryCode}`;
  return (
    <PhoneFrame>
      <div className="flex-1 flex flex-col p-6 pt-14 gap-5">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="w-16 h-16 rounded-3xl bg-primary/10 flex items-center justify-center">
            <KeyRound className="w-8 h-8 text-primary" aria-hidden />
          </div>
          <h1 className="text-xl font-black text-foreground">{title}</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            احفظ رمز الاسترداد في مكان آمن (اكتبه في ورقة أو صوّره). ستحتاجه إن نسيت كلمة المرور،
            ولن يظهر مرة أخرى.
          </p>
        </div>

        <div className="glass-strong rounded-3xl p-4 space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">اسم المستخدم</span>
            <span className="font-bold text-foreground" data-testid="new-username">
              {account.username}
            </span>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground mb-1">رمز الاسترداد</p>
            <p
              dir="ltr"
              data-testid="recovery-code"
              className="font-mono text-lg font-black tracking-widest text-foreground select-all"
            >
              {account.recoveryCode}
            </p>
          </div>
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(text);
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
            className="w-full glass rounded-xl h-10 text-xs font-medium flex items-center justify-center gap-2"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? "تم النسخ" : "نسخ اسم المستخدم والرمز"}
          </button>
        </div>

        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={saved}
            onChange={(e) => setSaved(e.target.checked)}
            className="w-4 h-4 accent-primary"
          />
          حفظت الرمز في مكان آمن
        </label>

        <button
          type="button"
          disabled={!saved}
          onClick={onDone}
          className="mt-auto w-full bg-primary text-primary-foreground rounded-2xl h-14 font-medium disabled:opacity-60"
        >
          متابعة
        </button>
      </div>
    </PhoneFrame>
  );
}
