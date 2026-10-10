import { createFileRoute, Link } from "@tanstack/react-router";
import { exportTextFile } from "@/lib/quran/export-file";
import { dayKey } from "@/lib/quran/activity";
import { useMemo, useRef, useState } from "react";
import { EmptyState, Icon, Screen, ScreenHeader } from "@/components/zen/quran/shell";
import { icons } from "@/components/zen/quran/shell-icons";
import {
  BOOKMARK_TAGS,
  clearBookmarks,
  exportBookmarks,
  importBookmarks,
  removeBookmark,
  tagChipClass,
  tagLabel,
  toArabicDigits,
  updateBookmark,
  useBookmarks,
  type Bookmark,
  type BookmarkTag,
} from "@/lib/quran";
import { SURAH_META } from "@/lib/quran/metadata";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authed/mushaf/bookmarks")({
  head: () => ({
    meta: [
      { title: "العلامات — Zen" },
      { name: "description", content: "آياتك المحفوظة مع الملاحظات والتصنيفات، محفوظة على جهازك." },
    ],
  }),
  component: BookmarksScreen,
});

type Filter = "all" | BookmarkTag;

function BookmarksScreen() {
  const { items: bookmarks } = useBookmarks();
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<Bookmark | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const filtered = useMemo(
    () => (filter === "all" ? bookmarks : bookmarks.filter((b) => b.tag === filter)),
    [bookmarks, filter],
  );

  const counts = useMemo(() => {
    const map = new Map<BookmarkTag, number>();
    for (const b of bookmarks) map.set(b.tag, (map.get(b.tag) ?? 0) + 1);
    return map;
  }, [bookmarks]);

  const download = async () => {
    const name = `zen-bookmarks-${dayKey()}.json`;
    try {
      const r = await exportTextFile(name, exportBookmarks(), { title: "تصدير العلامات" });
      if (r === "shared") setNotice("تم تجهيز ملف العلامات للحفظ أو المشاركة");
      else if (r === "downloaded") setNotice("تم تنزيل ملف العلامات");
    } catch {
      setNotice("تعذّر تصدير العلامات على هذا الجهاز");
    }
  };

  return (
    <Screen>
      <ScreenHeader
        title="العلامات"
        subtitle={`${toArabicDigits(bookmarks.length)} آية محفوظة على جهازك`}
        backTo="/mushaf"
        action={
          bookmarks.length === 0 ? undefined : (
            <button
              onClick={() => void download()}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-soft disabled:opacity-60"
              aria-label="تصدير"
            >
              <Icon d={icons.download} size={18} />
            </button>
          )
        }
      />

      {/* Tag filter — only meaningful once something is saved */}
      {bookmarks.length > 0 && (
        <div className="flex flex-wrap gap-2 px-5">
          <FilterChip
            label="الكل"
            count={bookmarks.length}
            active={filter === "all"}
            onClick={() => setFilter("all")}
          />
          {BOOKMARK_TAGS.map((t) => (
            <FilterChip
              key={t.key}
              label={t.label}
              count={counts.get(t.key) ?? 0}
              active={filter === t.key}
              onClick={() => setFilter(t.key)}
            />
          ))}
        </div>
      )}

      {notice && (
        <div className="mt-4 px-5">
          <div className="rounded-2xl border border-primary/40 bg-primary/10 px-4 py-2.5 text-[0.6875rem] text-primary">
            {notice}
          </div>
        </div>
      )}

      {/* List */}
      <div className="mt-5 space-y-3 px-5">
        {filtered.map((b) => (
          <article
            key={b.id}
            className="rounded-3xl border border-border/60 bg-card/70 p-4 text-right shadow-soft backdrop-blur-xl"
          >
            <div className="flex items-center justify-between">
              <span
                className={`rounded-full border px-2.5 py-0.5 text-[0.625rem] font-medium ${tagChipClass(b.tag)}`}
              >
                {tagLabel(b.tag)}
              </span>
              <span className="text-[0.625rem] tabular-nums text-muted-foreground">
                صفحة {toArabicDigits(b.page)}، جزء {toArabicDigits(b.juz)}
              </span>
            </div>

            <Link
              to="/mushaf/read"
              search={{ surah: b.surah, ayah: b.ayah, mode: "surah" }}
              className="mt-2 block"
            >
              <div className="text-[0.6875rem] text-muted-foreground">
                سورة {SURAH_META[b.surah - 1].nameAr}، الآية {toArabicDigits(b.ayah)}
              </div>
              <p className="mt-1.5 line-clamp-3 font-quran text-[1rem] leading-[2]">{b.text}</p>
            </Link>

            {b.note && (
              <p className="mt-2 rounded-2xl border border-border/50 bg-background/60 p-2.5 text-[0.7188rem] leading-relaxed text-foreground/80">
                {b.note}
              </p>
            )}

            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={() => setEditing(b)}
                className="flex-1 rounded-full border border-border/60 bg-background/70 py-2 text-[0.6875rem] font-medium"
              >
                تعديل الملاحظة والتصنيف
              </button>
              <Link
                to="/mushaf/tafsir"
                search={{ surah: b.surah, ayah: b.ayah }}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-background/70 text-muted-foreground"
                aria-label="التفسير"
              >
                <Icon d={icons.info} size={15} />
              </Link>
              <button
                onClick={() => removeBookmark(b.surah, b.ayah)}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-destructive/40 bg-destructive/10 text-destructive"
                aria-label="حذف"
              >
                <Icon d={icons.trash} size={15} />
              </button>
            </div>
          </article>
        ))}

        {!filtered.length && (
          <EmptyState
            icon={icons.bookmark}
            title={bookmarks.length ? "لا علامات في هذا التصنيف" : "لا علامات بعد"}
            hint="اضغط على أي آية في المصحف ثم اختر «حفظ» لتظهر هنا."
          />
        )}
      </div>

      {/* Import / clear */}
      <div
        className={`mt-7 grid gap-3 px-5 ${bookmarks.length > 0 ? "grid-cols-2" : "grid-cols-1"}`}
      >
        <button
          onClick={() => fileRef.current?.click()}
          className="rounded-2xl border border-border/60 bg-card/70 py-3 text-[0.75rem] font-medium shadow-soft"
        >
          استيراد نسخة
        </button>
        {bookmarks.length > 0 && (
          <button
            onClick={() => setConfirmClear(true)}
            className="rounded-2xl border border-destructive/40 bg-destructive/10 py-3 text-[0.75rem] font-medium text-destructive"
          >
            حذف كل العلامات
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            try {
              const added = importBookmarks(await file.text());
              setNotice(`تم استيراد ${toArabicDigits(added)} علامة`);
            } catch {
              setNotice("الملف غير صالح — تأكّد أنه ملف تصدير من زِن");
            }
            e.target.value = "";
          }}
        />
      </div>

      <p className="mt-4 px-6 text-center text-[0.625rem] leading-relaxed text-muted-foreground">
        العلامات محفوظة داخل جهازك فقط. صدّرها قبل تفريغ بيانات التطبيق أو تغيير الجهاز.
      </p>

      {/* Edit dialog */}
      <EditDialog bookmark={editing} onClose={() => setEditing(null)} />

      {/* Clear confirmation */}
      <Dialog open={confirmClear} onOpenChange={setConfirmClear}>
        <DialogContent
          className="max-w-sm rounded-3xl border-border/60 bg-card/95 backdrop-blur-2xl sm:rounded-3xl"
          dir="rtl"
        >
          <DialogHeader className="text-right">
            <DialogTitle className="font-display text-lg">حذف كل العلامات؟</DialogTitle>
          </DialogHeader>
          <p className="text-[0.75rem] leading-relaxed text-muted-foreground">
            سيُحذف {toArabicDigits(bookmarks.length)} علامة نهائيًا. لا يمكن التراجع.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setConfirmClear(false)}
              className="rounded-2xl border border-border/60 bg-background/70 py-2.5 text-[0.75rem] font-medium"
            >
              إلغاء
            </button>
            <button
              onClick={() => {
                clearBookmarks();
                setConfirmClear(false);
                setNotice("تم حذف كل العلامات");
              }}
              className="rounded-2xl bg-destructive py-2.5 text-[0.75rem] font-medium text-destructive-foreground"
            >
              حذف
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </Screen>
  );
}

function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-[0.6875rem] font-medium transition active:scale-95 ${
        active
          ? "border-primary/50 bg-primary/10 text-primary"
          : "border-border/60 bg-card/70 text-muted-foreground"
      }`}
    >
      {label}
      <span className="mr-1.5 tabular-nums">{toArabicDigits(count)}</span>
    </button>
  );
}

function EditDialog({ bookmark, onClose }: { bookmark: Bookmark | null; onClose: () => void }) {
  const [note, setNote] = useState("");
  const [tag, setTag] = useState<BookmarkTag>("tadabbur");
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  // Sync the form when a different bookmark is opened.
  if (bookmark && loadedFor !== bookmark.id) {
    setLoadedFor(bookmark.id);
    setNote(bookmark.note ?? "");
    setTag(bookmark.tag);
  }

  return (
    <Dialog open={!!bookmark} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-md rounded-3xl border-border/60 bg-card/95 backdrop-blur-2xl sm:rounded-3xl"
        dir="rtl"
      >
        <DialogHeader className="text-right">
          <DialogTitle className="font-display text-lg">
            {bookmark
              ? `سورة ${SURAH_META[bookmark.surah - 1].nameAr}، الآية ${toArabicDigits(bookmark.ayah)}`
              : ""}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          {BOOKMARK_TAGS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTag(t.key)}
              className={`rounded-full border px-3 py-1.5 text-[0.6875rem] font-medium transition active:scale-95 ${
                tag === t.key ? t.chip : "border-border/60 bg-background/70 text-muted-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          placeholder="ملاحظتك على الآية… (تدبّر، سبب حفظ، تذكير)"
          className="w-full rounded-2xl border border-border/60 bg-background/70 p-3 text-[0.7812rem] leading-relaxed outline-none focus:border-primary/50"
          dir="rtl"
        />

        <button
          onClick={() => {
            if (bookmark) updateBookmark(bookmark.surah, bookmark.ayah, { note: note.trim(), tag });
            onClose();
          }}
          className="gradient-primary rounded-2xl py-3 text-[0.7812rem] font-medium text-primary-foreground shadow-glow"
        >
          حفظ التغييرات
        </button>
      </DialogContent>
    </Dialog>
  );
}
