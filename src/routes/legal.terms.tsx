import { createFileRoute } from "@tanstack/react-router";
import { ScrollText } from "lucide-react";
import { LegalPage } from "@/components/zen/LegalPage";
import { TERMS } from "@/content/legal";
import { LEGAL_META } from "@/content/legal-meta";

// النص في src/content/legal.ts (المصدر نفسه للصفحة العامة في site/، تدقيق 2.1).
export const Route = createFileRoute("/legal/terms")({
  head: () => ({
    meta: [
      { title: `${LEGAL_META.terms.title} — Zen` },
      { name: "description", content: LEGAL_META.terms.description },
    ],
  }),
  component: () => <LegalPage doc={TERMS} icon={ScrollText} />,
});
