import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { PhoneFrame } from "@/components/zen/PhoneFrame";
import { ZenLogo } from "@/components/zen/ZenLogo";
import { useSession } from "@/hooks/useSession";

export const Route = createFileRoute("/")({
  component: Splash,
});

function Splash() {
  const navigate = useNavigate();
  const { session, guest, loading } = useSession();

  useEffect(() => {
    if (loading) return;
    let seen: string | null = null;
    try {
      // eslint-disable-next-line no-restricted-properties -- الحزمة الأولى بلا هامش (القرار 0010)، والخطأ ملتقَط هنا
      seen = localStorage.getItem("zen-onboarded"); // التخزين المعطَّل يرمي (في الحزمة الأولى، فلا @/lib/storage هنا)
    } catch {
      /* كأنه لم يرَ الترحيب */
    }
    // صاحب الحساب أو الضيف يدخل فوراً (كانت 1.4 ثانية انتظار ثابتة في كل فتح، 1.16.0)؛ الشعار يبقى
    // لحظة لمن يرى الترحيب أو الدخول.
    const signed = !!(session || guest);
    const t = setTimeout(
      () => {
        if (signed) navigate({ to: "/today", replace: true });
        else navigate({ to: seen ? "/auth/login" : "/onboarding", replace: true });
      },
      signed ? 0 : 600,
    );
    return () => clearTimeout(t);
  }, [navigate, session, guest, loading]);

  return (
    <PhoneFrame>
      <div className="flex-1 flex flex-col items-center justify-center gap-8 px-8">
        <div className="anim-float-in">
          <ZenLogo size={160} />
        </div>
        <div className="text-center anim-float-in" style={{ animationDelay: "150ms" }}>
          <h1 className="text-4xl font-black tracking-tight text-foreground">
            زِن <span className="text-gradient-gold">Zen</span>
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">تعلّم القرآن بذكاء وهدوء</p>
        </div>
        <div
          className="absolute bottom-16 flex items-center gap-1.5 anim-float-in"
          style={{ animationDelay: "400ms" }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-primary anim-typing-dot" />
          <span
            className="w-1.5 h-1.5 rounded-full bg-primary anim-typing-dot"
            style={{ animationDelay: "150ms" }}
          />
          <span
            className="w-1.5 h-1.5 rounded-full bg-primary anim-typing-dot"
            style={{ animationDelay: "300ms" }}
          />
        </div>
        <p className="absolute bottom-6 text-[0.6875rem] text-muted-foreground/70 font-light">﷽</p>
      </div>
    </PhoneFrame>
  );
}
