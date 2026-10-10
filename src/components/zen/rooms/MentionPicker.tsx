import { filterCandidates, type MentionCandidate } from "@/lib/mentions";

/** قائمة الأسماء فوق خانة الكتابة عند كتابة @ (9.6). */
export function MentionPicker(props: {
  candidates: MentionCandidate[];
  query: string;
  onPick: (c: MentionCandidate) => void;
}) {
  const list = filterCandidates(props.candidates, props.query);
  if (!list.length) return null;
  return (
    <ul
      role="listbox"
      aria-label="أشر إلى"
      className="glass-strong rounded-2xl p-1 mb-2 max-h-48 overflow-y-auto"
    >
      {list.map((c) => (
        <li key={c.user_id}>
          <button
            role="option"
            aria-selected={false}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => props.onPick(c)}
            className="w-full text-start px-3 py-2 rounded-xl text-sm hover:bg-accent flex items-center gap-2"
          >
            <span className="flex-1">{c.name}</span>
            {c.mod && <span className="text-[0.625rem] text-muted-foreground">المعلّم</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}
