import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  BookOpen,
  ChevronLeft,
  GraduationCap,
  HeartHandshake,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { PhoneFrame } from "@/components/zen/PhoneFrame";
import { ZenLogo } from "@/components/zen/ZenLogo";
import { useT } from "@/lib/i18n";
import { finishOnboarding, type OnboardRole } from "@/lib/onboarding";
import { setGuest } from "@/lib/offline/guest";

export const Route = createFileRoute("/onboarding")({
  component: Onboarding,
});

const ROLES: { role: OnboardRole; icon: LucideIcon }[] = [
  { role: "student", icon: BookOpen },
  { role: "guardian", icon: HeartHandshake },
  { role: "teacher", icon: GraduationCap },
];

/** الترحيب (3.11): شاشة واحدة، دور واحد، أو تجربة دون حساب. */
function Onboarding() {
  const t = useT();
  const navigate = useNavigate();
  const choose = (role: OnboardRole) => {
    finishOnboarding(role);
    void navigate({ to: "/auth/login", replace: true });
  };
  const tryGuest = () => {
    finishOnboarding(null);
    setGuest(true);
    void navigate({ to: "/today", replace: true });
  };
  return (
    <PhoneFrame>
      <div className="flex-1 flex flex-col p-6 pt-12 gap-6">
        <div className="flex flex-col items-center text-center gap-3 anim-float-in">
          <ZenLogo size={88} />
          <h1 className="text-2xl font-black tracking-tight text-foreground">
            {t("onboarding.title")}
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {t("onboarding.subtitle")}
          </p>
        </div>

        <section aria-labelledby="zen-onb-roles" className="space-y-2">
          <h2 id="zen-onb-roles" className="text-xs font-bold text-muted-foreground px-2">
            {t("onboarding.question")}
          </h2>
          {ROLES.map(({ role, icon: Icon }) => (
            <button
              key={role}
              type="button"
              onClick={() => choose(role)}
              className="w-full glass-strong rounded-3xl p-4 min-h-16 flex items-center gap-3 text-start transition-transform active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <span className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                <Icon className="w-6 h-6 text-primary" aria-hidden="true" />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-bold text-foreground">
                  {t(`onboarding.roles.${role}.label`)}
                </span>
                <span className="block text-[0.6875rem] text-muted-foreground">
                  {t(`onboarding.roles.${role}.hint`)}
                </span>
              </span>
              <ChevronLeft
                className="w-5 h-5 text-muted-foreground shrink-0 ltr:rotate-180"
                aria-hidden="true"
              />
            </button>
          ))}
        </section>

        <div className="mt-auto space-y-3">
          <button
            type="button"
            onClick={tryGuest}
            className="w-full glass-strong border border-primary/30 text-primary rounded-2xl h-14 flex items-center justify-center gap-2 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Sparkles className="w-4 h-4" aria-hidden="true" />
            {t("onboarding.guest")}
          </button>
          <p className="text-[0.6875rem] text-muted-foreground text-center">
            {t("onboarding.guestHint")}
          </p>
          <Link
            to="/auth/login"
            onClick={() => finishOnboarding(null)}
            className="block text-center text-sm text-gold font-semibold min-h-11 leading-[2.75rem]"
          >
            {t("onboarding.haveAccount")}
          </Link>
        </div>
      </div>
    </PhoneFrame>
  );
}
