import { parseMentions } from "@/lib/mentions";

/** نص رسالة الغرفة مع إبراز الإشارات «@الاسم» (9.6). */
export function MentionText({ text, me }: { text: string; me?: string | null }) {
  return (
    <>
      {parseMentions(text).map((s, i) =>
        s.kind === "text" ? (
          <span key={i}>{s.text}</span>
        ) : (
          <span
            key={i}
            className={`font-bold ${s.id === me ? "bg-gold/25 rounded px-0.5" : "text-primary"}`}
            data-mention={s.id}
          >
            @{s.name}
          </span>
        ),
      )}
    </>
  );
}
