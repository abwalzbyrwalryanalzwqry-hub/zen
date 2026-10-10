import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { LegalPage } from "@/components/zen/LegalPage";
import { PRIVACY } from "@/content/legal";
import { LEGAL_META } from "@/content/legal-meta";

// النص في src/content/legal.ts (المصدر نفسه للصفحة العامة في site/، تدقيق 2.1).
export const Route = createFileRoute("/legal/privacy")({
  head: () => ({
    meta: [
      { title: `${LEGAL_META.privacy.title} — Zen` },
      { name: "description", content: LEGAL_META.privacy.description },
    ],
  }),
  component: () => <LegalPage doc={PRIVACY} icon={ShieldCheck} />,
});
