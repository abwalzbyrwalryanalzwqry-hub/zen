import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  Check,
  FileText,
  Scale,
  Shield,
  CodeXml,
  Copy,
  Globe,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Send,
  type LucideIcon,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { PhoneFrame } from "@/components/zen/PhoneFrame";
import { BackButton } from "@/components/zen/BackButton";
import { useT, t as tStatic } from "@/lib/i18n";
import { APP_VERSION } from "@/lib/app-version";
import { SettingsSection } from "@/components/zen/more/SettingsSection";
import { ListRow } from "@/components/zen/more/ListRow";
import {
  DEVELOPER_CONTACTS,
  DEVELOPER_NAME,
  type DeveloperContact,
  type DeveloperContactKey,
} from "@/lib/developer";
import { isOnline } from "@/lib/network";
import { usePagesDict } from "@/lib/pages-i18n";

export const Route = createFileRoute("/_authed/about")({
  head: () => ({ meta: [{ title: tStatic("meta.about") }] }),
  component: AboutPage,
});

const ICONS: Record<DeveloperContactKey, LucideIcon> = {
  phone: Phone,
  email: Mail,
  whatsapp: MessageCircle,
  facebook: Globe,
  telegram: Send,
  address: MapPin,
};

/** «عن زِن» (تحليل «المزيد» IA-04/05/08): الإصدار المحقون، والخصوصية والشروط، والمصادر والتراخيص، ثم المطوّر.
 * بيانات المطوّر: بيانات ثابتة داخل الحزمة، تعمل دون اتصال، ولا يُرسل منها شيء. */
function AboutPage() {
  usePagesDict();
  const t = useT();
  return (
    <PhoneFrame>
      <div className="flex-1 flex flex-col">
        <header className="px-5 pt-12 pb-3 flex items-center gap-3">
          <BackButton fallback="/more" />
          <h1 className="flex-1 min-w-0 text-xl font-black text-foreground">
            {t("aboutApp.title")}
          </h1>
        </header>

        <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 pb-8 space-y-4">
          <section
            aria-labelledby="about-app-name"
            className="mx-2 glass-strong rounded-3xl p-5 flex items-center gap-4"
          >
            <div
              className="w-16 h-16 shrink-0 rounded-3xl bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center text-white text-2xl font-black"
              aria-hidden="true"
            >
              Z
            </div>
            <div className="flex-1 min-w-0">
              <h2 id="about-app-name" className="text-lg font-black text-foreground">
                {t("aboutApp.name")}
              </h2>
              <p className="text-xs text-muted-foreground">{t("aboutApp.tagline")}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("aboutApp.version")}{" "}
                <bdi dir="ltr" className="font-mono text-foreground">
                  {APP_VERSION}
                </bdi>
              </p>
            </div>
          </section>

          <p className="px-3 text-xs leading-relaxed text-muted-foreground">
            {t("aboutApp.offlineMushaf")}
          </p>

          <SettingsSection id="aboutApp" title={t("aboutApp.section")}>
            <ListRow
              to="/legal/privacy"
              icon={Shield}
              label={t("more.links.privacy.label")}
              hint={t("more.links.privacy.hint")}
            />
            <ListRow
              to="/legal/terms"
              icon={FileText}
              label={t("more.links.terms.label")}
              hint={t("more.links.terms.hint")}
            />
            <ListRow
              to="/mushaf/sources"
              icon={BookOpen}
              label={t("aboutApp.sources.label")}
              hint={t("aboutApp.sources.hint")}
            />
            <ListRow
              to="/about/licenses"
              icon={Scale}
              label={t("aboutApp.licenses.title")}
              hint={t("aboutApp.licenses.hint")}
            />
          </SettingsSection>

          <section
            aria-label={t("about.title")}
            className="mx-2 glass-strong rounded-3xl p-5 flex items-center gap-4 relative overflow-hidden"
          >
            <div
              className="absolute -end-10 -top-10 w-32 h-32 rounded-full bg-primary/25 blur-3xl"
              aria-hidden="true"
            />
            <div
              className="relative w-16 h-16 shrink-0 rounded-3xl bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center text-white glow-primary"
              aria-hidden="true"
            >
              <CodeXml className="w-7 h-7" />
            </div>
            <div className="relative flex-1 min-w-0">
              <p className="text-xs font-bold text-muted-foreground">
                {t("about.fields.developer")}
              </p>
              <p className="text-lg font-black text-foreground break-words">{DEVELOPER_NAME}</p>
              <span className="mt-1.5 inline-flex items-center px-2 py-1 rounded-full bg-gold/15 border border-gold/30 text-xs text-gold font-medium">
                {t("about.role")}
              </span>
            </div>
          </section>

          <section className="space-y-2" aria-labelledby="about-contact">
            <h2 id="about-contact" className="text-xs font-bold text-muted-foreground px-2">
              {t("about.contact")}
            </h2>
            <ul className="glass rounded-3xl divide-y divide-border/60 overflow-hidden">
              {DEVELOPER_CONTACTS.map((c) => (
                <ContactRow key={c.key} c={c} />
              ))}
            </ul>
          </section>

          <p className="px-3 text-xs leading-relaxed text-muted-foreground">{t("about.note")}</p>
        </div>
      </div>
    </PhoneFrame>
  );
}

function ContactRow({ c }: { c: DeveloperContact }) {
  const t = useT();
  const Icon = ICONS[c.key];
  const label = t(`about.fields.${c.key}`);
  const [copied, setCopied] = useState(false);
  const pending = useRef<(() => void) | null>(null);
  useEffect(() => () => pending.current?.(), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(c.value);
      setCopied(true);
      toast.success(t("about.copied"));
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(t("about.copyFailed"));
    }
  };

  // لا يُبلغ Android الواجهة إن لم يوجد تطبيق يفتح الرابط، فنراقب مغادرة التطبيق: إن بقي ظاهراً
  // بعد لحظة نعرض تنبيهاً مع زر نسخ بدل أن يمرّ الضغط بصمت.
  const watchLaunch = () => {
    if (c.needsNetwork && !isOnline()) {
      toast.warning(t("about.offline"));
    }
    pending.current?.();
    let left = false;
    const onHide = () => {
      if (document.visibilityState === "hidden") left = true;
    };
    const onBlur = () => {
      left = true;
    };
    document.addEventListener("visibilitychange", onHide);
    document.addEventListener("pause", onBlur);
    window.addEventListener("blur", onBlur);
    const timer = window.setTimeout(() => {
      cleanup();
      if (!left && !c.href?.startsWith("http")) {
        toast.info(t("about.noApp"), {
          action: { label: t("about.copy"), onClick: () => void copy() },
        });
      }
    }, 1800);
    const cleanup = () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onHide);
      document.removeEventListener("pause", onBlur);
      window.removeEventListener("blur", onBlur);
      pending.current = null;
    };
    pending.current = cleanup;
  };

  const body = (
    <>
      <span
        className="w-10 h-10 shrink-0 rounded-2xl bg-primary/10 text-primary flex items-center justify-center"
        aria-hidden="true"
      >
        <Icon className="w-5 h-5" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-xs text-muted-foreground">{label}</span>
        <span className="block text-sm font-bold text-foreground break-words text-start">
          {c.ltr ? <bdi dir="ltr">{c.value}</bdi> : c.value}
        </span>
      </span>
    </>
  );

  return (
    <li className="flex items-center gap-1 pe-2">
      {c.href ? (
        <a
          href={c.href}
          target={c.href.startsWith("http") ? "_blank" : undefined}
          rel="noopener noreferrer"
          onClick={watchLaunch}
          aria-label={`${label}: ${c.value}. ${t(`about.actions.${c.key}`)}`}
          className="flex-1 min-w-0 min-h-14 flex items-center gap-3 ps-4 py-3 hover:bg-primary/5 active:bg-primary/10 transition-colors rounded-e-2xl"
        >
          {body}
        </a>
      ) : (
        <div className="flex-1 min-w-0 min-h-14 flex items-center gap-3 ps-4 py-3">{body}</div>
      )}
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={`${t("about.copy")} ${label}`}
        className="w-11 h-11 shrink-0 rounded-xl flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/5 active:scale-95 transition"
      >
        {copied ? (
          <Check className="w-4 h-4 text-primary" aria-hidden="true" />
        ) : (
          <Copy className="w-4 h-4" aria-hidden="true" />
        )}
      </button>
    </li>
  );
}
