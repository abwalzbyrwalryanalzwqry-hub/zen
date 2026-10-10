import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toArabicDigits } from "@/lib/quran";
import { HIZB_META, JUZ_META } from "@/lib/quran/juz-metadata";
import { SURAH_META } from "@/lib/quran/metadata";
import { PAGE_COUNT, pageOf } from "@/lib/quran/page-math";
import { parseAyahRef } from "@/lib/quran/search-service";
import { useT } from "@/lib/i18n";
import { ensureMushafDict } from "@/lib/quran/mushaf-i18n";

// قاموس القارئ الكسول: يُضاف متزامناً قبل أول رسم.
void ensureMushafDict();

type Tab = "page" | "ayah" | "juz" | "hizb";
const TABS: Tab[] = ["page", "ayah", "juz", "hizb"];

const toLatin = (v: string) =>
  v.replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660)).trim();

/**
 * انتقال موحَّد: صفحة، أو سورة وآية («البقرة 255» أو «2:255»)، أو جزء، أو حزب.
 * الرقم خارج المدى يُرفض برسالة واضحة (كان يُقيَّد صامتاً إلى ١ أو ٦٠٤).
 */
export function GoToDialog({
  open,
  onOpenChange,
  page,
  onGo,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  page: number;
  /** الوجهة: صفحة، مع الآية المقصودة إن وُجدت. */
  onGo: (target: { page: number; surah?: number; ayah?: number }) => void;
}) {
  const t = useT();
  const [tab, setTab] = useState<Tab>("page");
  const [value, setValue] = useState(String(page));
  const [error, setError] = useState<string | null>(null);
  const [shownOpen, setShownOpen] = useState(open);
  if (open !== shownOpen) {
    setShownOpen(open);
    if (open) {
      setValue(tab === "page" ? String(page) : "");
      setError(null);
    }
  }

  const submit = () => {
    const raw = toLatin(value);
    const n = /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
    if (tab === "page") {
      if (!(n >= 1 && n <= PAGE_COUNT)) return setError(t("mushafReader.goto.pageRange"));
      return onGo({ page: n });
    }
    if (tab === "juz") {
      const j = JUZ_META[n - 1];
      if (!j) return setError(t("mushafReader.goto.juzRange"));
      return onGo({ page: j.startPage, surah: j.start.surah, ayah: j.start.ayah });
    }
    if (tab === "hizb") {
      const h = HIZB_META[n - 1];
      if (!h) return setError(t("mushafReader.goto.hizbRange"));
      return onGo({ page: h.startPage, surah: h.start.surah, ayah: h.start.ayah });
    }
    const ref = parseAyahRef(value);
    if (!ref) return setError(t("mushafReader.goto.ayahInvalid"));
    onGo({ page: pageOf(ref.surah, ref.ayah), surah: ref.surah, ayah: ref.ayah });
  };

  const preview = (() => {
    if (tab !== "ayah") return null;
    const ref = parseAyahRef(value);
    return ref
      ? t("mushafReader.goto.ayahPreview", {
          surah: SURAH_META[ref.surah - 1].nameAr,
          ayah: toArabicDigits(ref.ayah),
          page: toArabicDigits(pageOf(ref.surah, ref.ayah)),
        })
      : null;
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-sm rounded-3xl border-border/60 bg-card/95 backdrop-blur-2xl sm:rounded-3xl"
        dir="rtl"
      >
        <DialogHeader className="text-right">
          <DialogTitle className="font-display text-xl">{t("mushafReader.goto.title")}</DialogTitle>
        </DialogHeader>
        <div
          className="grid grid-cols-4 gap-1 rounded-full border border-border/60 p-1"
          role="tablist"
        >
          {TABS.map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              onClick={() => {
                setTab(k);
                setValue(k === "page" ? String(page) : "");
                setError(null);
              }}
              className={`rounded-full py-1.5 text-[0.6875rem] font-medium transition ${
                tab === k ? "gradient-primary text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              {t(`mushafReader.goto.tab.${k}`)}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="grid gap-2"
        >
          <label className="text-[0.6875rem] text-muted-foreground" htmlFor="goto-value">
            {t(`mushafReader.goto.hint.${tab}`)}
          </label>
          <input
            id="goto-value"
            autoFocus
            type="text"
            inputMode={tab === "ayah" ? "text" : "numeric"}
            autoComplete="off"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            aria-invalid={!!error}
            className="w-full rounded-2xl border border-border/60 bg-background/70 px-4 py-3 text-center text-lg tabular-nums outline-none focus:border-primary/50"
            dir={tab === "ayah" ? "rtl" : "ltr"}
          />
          {error ? (
            <p className="text-[0.6875rem] text-destructive" role="alert">
              {error}
            </p>
          ) : preview ? (
            <p className="text-[0.6875rem] text-primary">{preview}</p>
          ) : null}
          <button
            type="submit"
            className="gradient-primary rounded-2xl py-3 text-sm font-medium text-primary-foreground shadow-glow transition active:scale-[0.98]"
          >
            {t("mushafReader.goto.go")}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
