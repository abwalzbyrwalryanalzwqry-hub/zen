import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import { useT } from "@/lib/i18n";

/** شريط البحث داخل المحادثة: الاستعلام وعدد النتائج والتنقّل بينها (الأحدث أولاً). */
export function ChatSearchBar({
  query,
  setQuery,
  count,
  index,
  onPrev,
  onNext,
  onClose,
}: {
  query: string;
  setQuery: (v: string) => void;
  count: number;
  index: number;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const has = query.trim().length > 0;
  return (
    <div role="search" className="glass-strong px-3 py-2 flex items-center gap-2 anim-float-in">
      <Search className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (e.shiftKey) onNext();
            else onPrev();
          } else if (e.key === "Escape") onClose();
        }}
        placeholder={t("chat.search.placeholder")}
        aria-label={t("chat.search.placeholder")}
        className="flex-1 min-w-0 min-h-11 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
      />
      {has && (
        <span className="text-xs text-muted-foreground tabular-nums shrink-0" aria-live="polite">
          {count ? t("chat.search.count", { i: index + 1, n: count }) : t("chat.search.none")}
        </span>
      )}
      <button
        type="button"
        onClick={onPrev}
        disabled={!count}
        aria-label={t("chat.search.older")}
        className="min-h-11 min-w-11 rounded-xl flex items-center justify-center hover:bg-accent disabled:opacity-40"
      >
        <ChevronUp className="w-4 h-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={!count}
        aria-label={t("chat.search.newer")}
        className="min-h-11 min-w-11 rounded-xl flex items-center justify-center hover:bg-accent disabled:opacity-40"
      >
        <ChevronDown className="w-4 h-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={onClose}
        aria-label={t("chat.search.close")}
        className="min-h-11 min-w-11 rounded-xl flex items-center justify-center hover:bg-accent"
      >
        <X className="w-4 h-4" aria-hidden="true" />
      </button>
    </div>
  );
}

/** زر النزول إلى آخر المحادثة، مع عدد الرسائل التي وصلت أثناء القراءة في الأعلى. */
export function JumpToBottom({ count, onClick }: { count: number; onClick: () => void }) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={count ? t("chat.jump.new", { n: count }) : t("chat.jump.bottom")}
      className="absolute bottom-3 end-4 min-h-11 min-w-11 rounded-full glass-strong shadow-soft flex items-center justify-center text-primary anim-float-in"
    >
      <ChevronDown className="w-5 h-5" aria-hidden="true" />
      {count > 0 && (
        <span className="absolute -top-1.5 -end-1.5 min-w-5 h-5 px-1 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center tabular-nums">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </button>
  );
}
