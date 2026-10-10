import { useId, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Download, Loader2, Trash2 } from "lucide-react";
import {
  FONT_SCALES,
  getFontScale,
  getHighContrast,
  setFontScale,
  setHighContrast,
  type FontScale,
} from "@/lib/a11y";
import { DELETE_CONFIRM_PHRASE, deleteMyAccount, downloadMyData } from "@/lib/account";
import { setAccountKind, type AccountKind } from "@/lib/home";
import { useHomeContext } from "@/hooks/useHomeContext";
import { Switch } from "@/components/zen/more/Switch";
import { useT } from "@/lib/i18n";
import { toast } from "@/lib/toast";

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="text-xs font-bold text-muted-foreground mb-2 px-2">
        {title}
      </h2>
      <div className="glass-strong rounded-3xl p-4 space-y-3">{children}</div>
    </section>
  );
}

/** حجم الخط والتباين العالي. */
export function DisplaySettings() {
  const t = useT();
  const [font, setFont] = useState<FontScale>(() => getFontScale());
  const [hc, setHc] = useState(() => getHighContrast());
  return (
    <Card title={t("accountSettings.display.title")}>
      <div>
        <p id="zen-font-label" className="text-sm text-foreground mb-2">
          {t("accountSettings.display.font")}
        </p>
        <div
          role="radiogroup"
          aria-labelledby="zen-font-label"
          className="grid grid-cols-4 gap-1.5"
        >
          {FONT_SCALES.map((f) => (
            <button
              key={f.value}
              role="radio"
              aria-checked={font === f.value}
              onClick={() => {
                setFont(f.value);
                setFontScale(f.value);
              }}
              className={`rounded-xl min-h-11 py-2 text-xs font-semibold ${
                font === f.value ? "bg-primary text-primary-foreground" : "glass text-foreground"
              }`}
            >
              {t(`accountSettings.display.fonts.${f.value}`)}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span id="zen-hc-label" className="flex-1 text-sm text-foreground">
          {t("accountSettings.display.contrast")}
          <span className="block text-xs text-muted-foreground">
            {t("accountSettings.display.contrastHint")}
          </span>
        </span>
        <Switch
          on={hc}
          labelledBy="zen-hc-label"
          onChange={(v) => {
            setHc(v);
            setHighContrast(v);
          }}
        />
      </div>
    </Card>
  );
}

/** طالب أم ولي أمر؟ تفضيل واجهة لا يغيّر الصلاحيات. لا يظهر للمعلّم. */
export function AccountKindSettings() {
  const { ctx, mode, refetch } = useHomeContext();
  const [busy, setBusy] = useState(false);
  const t = useT();
  if (ctx.is_teacher) return null;
  const pick = async (k: AccountKind) => {
    if (busy) return;
    setBusy(true);
    try {
      await setAccountKind(k);
      await refetch();
    } catch {
      // كان الفشل يُبتلع فيبدو الاختيار بلا أثر (تحليل «المزيد» BUG-07).
      toast.error(t("account.kindFailed"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title={t("accountSettings.kind.title")}>
      <div
        role="radiogroup"
        aria-label={t("accountSettings.kind.label")}
        className="grid grid-cols-2 gap-2"
      >
        {(["student", "guardian"] as const).map((k) => (
          <button
            key={k}
            role="radio"
            aria-checked={mode === k}
            disabled={busy}
            onClick={() => void pick(k)}
            className={`rounded-2xl p-3 text-start ${
              mode === k ? "bg-primary text-primary-foreground" : "glass text-foreground"
            }`}
          >
            <span className="block text-sm font-bold">{t(`accountSettings.kind.${k}`)}</span>
            <span className="block text-xs opacity-80">{t(`accountSettings.kind.${k}Hint`)}</span>
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{t("accountSettings.kind.hint")}</p>
    </Card>
  );
}

/** تصدير البيانات وحذف الحساب. */
export function DataSettings() {
  const t = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [exporting, setExporting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const doExport = async () => {
    setErr(null);
    setExporting(true);
    try {
      await downloadMyData();
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("accountSettings.data.exportFailed"));
    } finally {
      setExporting(false);
    }
  };

  const doDelete = async () => {
    setErr(null);
    setDeleting(true);
    try {
      await deleteMyAccount(phrase);
      queryClient.clear();
      navigate({ to: "/auth/login", replace: true });
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("accountSettings.data.deleteFailed"));
      setDeleting(false);
    }
  };

  return (
    <Card title={t("accountSettings.data.title")}>
      <button
        onClick={() => void doExport()}
        disabled={exporting}
        className="w-full glass rounded-2xl py-3 text-sm font-semibold text-foreground flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {exporting ? (
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
        ) : (
          <Download className="w-4 h-4" aria-hidden="true" />
        )}
        {t("accountSettings.data.export")}
      </button>

      {!confirming ? (
        <button
          onClick={() => setConfirming(true)}
          className="w-full rounded-2xl py-3 text-sm font-semibold text-destructive border border-destructive/40 flex items-center justify-center gap-2"
        >
          <Trash2 className="w-4 h-4" aria-hidden="true" />
          {t("accountSettings.data.delete")}
        </button>
      ) : (
        <div className="space-y-2 rounded-2xl border border-destructive/40 p-3">
          <p className="text-xs text-foreground leading-relaxed">
            {t("accountSettings.data.deleteWarning")}
          </p>
          <label htmlFor="zen-delete-confirm" className="block text-xs text-muted-foreground">
            {t("accountSettings.data.typeToConfirm", { phrase: DELETE_CONFIRM_PHRASE })}
          </label>
          <input
            id="zen-delete-confirm"
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            className="w-full glass rounded-xl px-3 py-2 text-sm outline-none"
            autoComplete="off"
          />
          <div className="flex gap-2">
            <button
              onClick={() => void doDelete()}
              disabled={deleting || phrase.trim() !== DELETE_CONFIRM_PHRASE}
              className="flex-1 rounded-xl bg-destructive text-white py-2.5 text-xs font-bold disabled:opacity-50"
            >
              {deleting ? t("accountSettings.data.deleting") : t("accountSettings.data.deleteNow")}
            </button>
            <button
              onClick={() => {
                setConfirming(false);
                setPhrase("");
              }}
              className="flex-1 rounded-xl glass py-2.5 text-xs"
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
    </Card>
  );
}
