import { Fragment, type ReactNode } from "react";
import { AyahCard } from "@/components/zen/AyahCard";
import { splitAnswer } from "@/lib/ai-core";

/**
 * عرض آمن لردود المساعد (A7): عناوين وقوائم وخط عريض، بلا HTML خام. مراجع [[سورة:آية]] تصبح
 * بطاقات آيات من المصحف المضمَّن.
 */
export function AiMarkdown({ text }: { text: string }) {
  return (
    <div className="text-sm leading-relaxed space-y-1.5">
      {splitAnswer(text).map((p, i) =>
        p.kind === "ayah" ? (
          <AyahCard key={i} refr={p.ref} />
        ) : (
          <Fragment key={i}>{blocks(p.text)}</Fragment>
        ),
      )}
    </div>
  );
}

function inline(s: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|`([^`]+)`/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    out.push(
      m[1] ? (
        <strong key={m.index}>{m[1]}</strong>
      ) : (
        <code key={m.index} className="px-1 rounded bg-muted text-[0.8em]">
          {m[2]}
        </code>
      ),
    );
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}

function blocks(text: string): ReactNode[] {
  const lines = text.split("\n");
  const out: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const L = list;
    out.push(
      L.ordered ? (
        <ol key={out.length} className="list-decimal ps-5 space-y-0.5">
          {L.items.map((x, i) => (
            <li key={i}>{inline(x)}</li>
          ))}
        </ol>
      ) : (
        <ul key={out.length} className="list-disc ps-5 space-y-0.5">
          {L.items.map((x, i) => (
            <li key={i}>{inline(x)}</li>
          ))}
        </ul>
      ),
    );
    list = null;
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*(?:[-*•])\s+(.*)$/);
    const num = line.match(/^\s*(?:\d+|[٠-٩]+)[.)]\s+(.*)$/);
    if (bullet || num) {
      const ordered = !!num;
      if (!list || list.ordered !== ordered) {
        flush();
        list = { ordered, items: [] };
      }
      list.items.push((bullet ?? num)![1]);
      continue;
    }
    flush();
    if (!line.trim()) continue;
    const h = line.match(/^#{1,4}\s+(.*)$/);
    out.push(
      h ? (
        <p key={out.length} className="font-bold text-foreground">
          {inline(h[1])}
        </p>
      ) : (
        <p key={out.length}>{inline(line)}</p>
      ),
    );
  }
  flush();
  return out;
}
