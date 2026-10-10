import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PhoneFrame } from "@/components/zen/PhoneFrame";
import { BackButton } from "@/components/zen/BackButton";
import { BottomNav } from "@/components/zen/BottomNav";
import { BookHeart, CheckCircle2, Loader2, Search, Star } from "lucide-react";
import { useSession } from "@/hooks/useSession";
import {
  listStories,
  listStoryProgress,
  localStoryProgress,
  type Story,
  type StoryProgress,
} from "@/lib/zen-lms";
import { useT, t as tStatic } from "@/lib/i18n";
import { usePagesDict } from "@/lib/pages-i18n";
import { matchesStory } from "@/lib/stories-filter";

export const Route = createFileRoute("/_authed/stories/")({
  head: () => ({
    meta: [
      { title: tStatic("meta.stories") },
      { name: "description", content: tStatic("meta.storiesDesc") },
      { property: "og:title", content: tStatic("meta.stories") },
      { property: "og:description", content: tStatic("meta.storiesOg") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StoriesScreen,
});

type Filter = "all" | "ulul" | "unread" | "done";
const FILTERS: { id: Filter; key: string }[] = [
  { id: "all", key: "storiesPage.filterAll" },
  { id: "ulul", key: "storiesPage.filterUlulAzm" },
  { id: "unread", key: "storiesPage.filterUnread" },
  { id: "done", key: "storiesPage.filterDone" },
];

function StoriesScreen() {
  usePagesDict();
  const t = useT();
  const { userId } = useSession();
  const [stories, setStories] = useState<Story[]>([]);
  const [progress, setProgress] = useState<Record<string, StoryProgress>>({});
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    (async () => {
      const s = await listStories();
      setStories(s);
      const remote = userId ? await listStoryProgress(userId).catch(() => []) : [];
      setProgress(
        Object.fromEntries([...localStoryProgress(), ...remote].map((x) => [x.story_id, x])),
      );
      setLoading(false);
    })();
  }, [userId]);

  const visible = useMemo(
    () =>
      stories.filter((s) => {
        const p = progress[s.id];
        if (filter === "ulul" && !s.ulul_azm) return false;
        if (filter === "done" && !p?.completed) return false;
        if (filter === "unread" && p) return false;
        return matchesStory(s, query);
      }),
    [stories, progress, filter, query],
  );
  const done = stories.filter((s) => progress[s.id]?.completed).length;

  return (
    <PhoneFrame>
      <div className="flex-1 flex flex-col">
        <header className="px-5 pt-12 pb-3 flex items-center gap-3">
          <BackButton fallback="/more" />
          <div className="flex-1">
            <h1 className="text-xl font-black text-foreground">{t("storiesPage.title")}</h1>
            <p className="text-[0.6875rem] text-muted-foreground">{t("storiesPage.subtitle")}</p>
          </div>
          <BookHeart className="w-5 h-5 text-gold" />
        </header>

        {!loading && stories.length > 0 && (
          <div className="px-3 pb-2 space-y-2">
            <div className="glass rounded-2xl px-3 py-2">
              <div className="flex items-center justify-between text-[0.6875rem]">
                <span className="font-bold text-foreground">
                  {t("storiesPage.progress", { done, total: stories.length })}
                </span>
                <span className="text-primary">{Math.round((done / stories.length) * 100)}%</span>
              </div>
              <div className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${(done / stories.length) * 100}%` }}
                />
              </div>
            </div>
            <label className="glass rounded-2xl px-3 py-2 flex items-center gap-2">
              <Search className="w-4 h-4 text-muted-foreground" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("storiesPage.searchPlaceholder")}
                aria-label={t("storiesPage.searchLabel")}
                className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
              />
            </label>
            <div
              role="group"
              aria-label={t("storiesPage.filtersLabel")}
              className="flex gap-1.5 overflow-x-auto"
            >
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={filter === f.id}
                  onClick={() => setFilter(f.id)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-[0.6875rem] font-semibold ${
                    filter === f.id
                      ? "bg-primary text-primary-foreground"
                      : "glass-strong text-muted-foreground"
                  }`}
                >
                  {t(f.key)}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-2">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
          ) : stories.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground py-12">
              {t("storiesPage.empty")}
            </p>
          ) : visible.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground py-12">
              {t("storiesPage.noMatch")}
            </p>
          ) : (
            visible.map((s, i) => {
              const p = progress[s.id];
              const n = stories.indexOf(s) + 1;
              return (
                <Link
                  key={s.id}
                  to="/stories/$storyId"
                  params={{ storyId: s.id }}
                  className="glass rounded-3xl p-4 flex items-center gap-3 anim-float-in"
                  style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}
                >
                  <div
                    className={`w-11 h-11 shrink-0 rounded-2xl flex items-center justify-center text-white font-black ${
                      s.ulul_azm
                        ? "bg-gradient-to-br from-amber-500 to-orange-600"
                        : "bg-gradient-to-br from-emerald-500 to-teal-600"
                    }`}
                  >
                    {n}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground">{s.title}</p>
                    <p className="text-[0.6875rem] text-muted-foreground line-clamp-1">{s.intro}</p>
                    {(s.ulul_azm || s.people || (p && !p.completed)) && (
                      <p className="mt-0.5 text-[0.625rem] text-muted-foreground line-clamp-1">
                        {s.ulul_azm && (
                          <span className="text-gold font-bold">{t("storiesPage.ululAzm")} · </span>
                        )}
                        {p && !p.completed
                          ? t("storiesPage.resume", { n: p.last_step + 1 })
                          : s.people}
                      </p>
                    )}
                  </div>
                  {p?.completed && (
                    <span className="flex items-center gap-1 text-[0.625rem] text-gold font-bold">
                      {p.quiz_score != null ? (
                        <>
                          <Star className="w-3.5 h-3.5" /> {p.quiz_score}%
                        </>
                      ) : (
                        <CheckCircle2
                          className="w-3.5 h-3.5"
                          aria-label={t("storiesPage.completed")}
                        />
                      )}
                    </span>
                  )}
                </Link>
              );
            })
          )}
        </div>

        <BottomNav />
      </div>
    </PhoneFrame>
  );
}
