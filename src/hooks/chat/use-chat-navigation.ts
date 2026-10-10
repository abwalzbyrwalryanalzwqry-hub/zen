import { useMemo, useState, type RefObject } from "react";
import type { MessageWithMedia } from "@/lib/chat-extras";
import { matchesQuery } from "@/lib/chat-search";

const textHits = (messages: MessageWithMedia[], q: string) =>
  q.trim()
    ? messages
        .filter((m) => m.type === "text" && !m.deleted_at && matchesQuery(m.content, q))
        .map((m) => m.id)
    : [];

/**
 * التنقّل داخل المحادثة: البحث في الرسائل المحمَّلة مع التظليل والانتقال بين النتائج، والانتقال إلى
 * أصل الرد مع وميض، وزر النزول إلى الأسفل مع عدّ ما وصل أثناء القراءة في الأعلى.
 */
export function useChatNavigation(o: {
  messages: MessageWithMedia[];
  userId: string | null | undefined;
  scrollRef: RefObject<HTMLDivElement | null>;
  stickToBottomRef: { current: boolean };
}) {
  const { messages, userId, scrollRef, stickToBottomRef } = o;
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hitIdx, setHitIdx] = useState(0);
  const [atBottom, setAtBottom] = useState(true);
  const [unseen, setUnseen] = useState(0);

  const lastMsg = messages[messages.length - 1];
  const [lastSeenId, setLastSeenId] = useState(lastMsg?.id);
  if (lastMsg?.id !== lastSeenId) {
    setLastSeenId(lastMsg?.id);
    if (lastSeenId && !atBottom && lastMsg && lastMsg.sender_id !== userId) setUnseen((n) => n + 1);
  }

  const hits = useMemo(() => textHits(messages, query), [messages, query]);
  const index = Math.min(hitIdx, Math.max(0, hits.length - 1));
  const activeHit = searchOpen ? hits[index] : undefined;

  /** ينتقل إلى رسالة ويومضها (نتيجة بحث أو أصل رد). */
  const jumpTo = (id: string) => {
    const el = document.getElementById(`msg-${id}`);
    if (!el) return;
    stickToBottomRef.current = false;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    const bubble = el.querySelector<HTMLElement>("[data-bubble]") ?? el;
    bubble.classList.remove("msg-flash");
    void bubble.offsetWidth;
    bubble.classList.add("msg-flash");
    window.setTimeout(() => bubble.classList.remove("msg-flash"), 2600);
  };
  const changeQuery = (q: string) => {
    setQuery(q);
    const next = textHits(messages, q);
    setHitIdx(Math.max(0, next.length - 1));
    if (next.length) requestAnimationFrame(() => jumpTo(next[next.length - 1]));
  };
  const stepHit = (d: -1 | 1) => {
    if (!hits.length) return;
    const i = (index + d + hits.length) % hits.length;
    setHitIdx(i);
    jumpTo(hits[i]);
  };
  const closeSearch = () => {
    setSearchOpen(false);
    setQuery("");
    setHitIdx(0);
  };
  const toggleSearch = () => (searchOpen ? closeSearch() : setSearchOpen(true));
  const scrollToBottom = () => {
    stickToBottomRef.current = true;
    setUnseen(0);
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  };
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    stickToBottomRef.current = near;
    if (near !== atBottom) setAtBottom(near);
    if (near && unseen) setUnseen(0);
  };

  return {
    searchOpen,
    query,
    hits,
    index,
    activeHit,
    changeQuery,
    stepHit,
    closeSearch,
    toggleSearch,
    jumpTo,
    atBottom,
    unseen,
    scrollToBottom,
    onScroll,
  };
}
