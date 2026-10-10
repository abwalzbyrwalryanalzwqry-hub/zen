import { useT, t as tStatic } from "@/lib/i18n";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileUp, Loader2, Printer, Users } from "lucide-react";
import { PhoneFrame } from "@/components/zen/PhoneFrame";
import { BackButton } from "@/components/zen/BackButton";
import { listHalaqat } from "@/lib/zen-api";
import { printHtml } from "@/lib/native-file";
import {
  MAX_IMPORT,
  buildImport,
  bulkRowError,
  importStudents,
  loginCardsHtml,
  parseDelimited,
  readImportFile,
  type BulkResult,
  type ImportRow,
} from "@/lib/bulk-import";
import { usePagesDict } from "@/lib/pages-i18n";

/** استيراد الطلاب جماعياً (9.3): /teacher/import?halaqa= */
export const Route = createFileRoute("/_authed/teacher_/import")({
  validateSearch: (s: Record<string, unknown>): { halaqa?: string } =>
    typeof s.halaqa === "string" && /^[0-9a-f-]{36}$/i.test(s.halaqa) ? { halaqa: s.halaqa } : {},
  head: () => ({ meta: [{ title: tStatic("meta.import") }] }),
  component: ImportScreen,
});

function ImportScreen() {
  usePagesDict();
  const t = useT();
  const search = Route.useSearch();
  const halaqat = useQuery({ queryKey: ["import-halaqat"], queryFn: () => listHalaqat() });
  const [halaqa, setHalaqa] = useState(search.halaqa ?? "");
  const [paste, setPaste] = useState("");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BulkResult | null>(null);
  const [sentRows, setSentRows] = useState<ImportRow[]>([]);

  // أول حلقة افتراضياً حين لا يحدّدها الرابط (أثناء العرض، M12).
  if (!halaqa && halaqat.data?.[0]) setHalaqa(halaqat.data[0].id);
  const halaqaName = halaqat.data?.find((h) => h.id === halaqa)?.name ?? t("importPage.halaqa");
  const valid = useMemo(() => rows.filter((r) => !r.error), [rows]);

  const load = (table: string[][]) => {
    setResult(null);
    const built = buildImport(table);
    if (!built.length) setErr(t("importPage.noNames"));
    else if (built.length > MAX_IMPORT)
      setErr(t("importPage.tooMany", { max: MAX_IMPORT, n: built.length }));
    else setErr(null);
    setRows(built.length > MAX_IMPORT ? [] : built);
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      load(await readImportFile(f));
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("importPage.readFailed"));
      setRows([]);
    }
  };

  const submit = async () => {
    if (!halaqa || !valid.length) return;
    setBusy(true);
    setErr(null);
    try {
      setResult(await importStudents(halaqa, valid));
      setSentRows(valid);
      setRows([]);
      setPaste("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("importPage.failed"));
    } finally {
      setBusy(false);
    }
  };

  const created = result
    ? result.rows.flatMap((r) =>
        r.ok
          ? [
              {
                name: r.name,
                username: r.username,
                password: sentRows[r.row - 1]?.password ?? "",
                recovery_code: r.recovery_code,
              },
            ]
          : [],
      )
    : [];

  return (
    <PhoneFrame>
      <div className="flex-1 flex flex-col">
        <header className="px-4 pt-12 pb-3 flex items-center gap-3">
          <BackButton fallback="/more" />
          <div className="flex-1">
            <h1 className="text-lg font-black">{t("importPage.title")}</h1>
            <p className="text-xs text-muted-foreground">
              {t("importPage.subtitle", { max: MAX_IMPORT })}
            </p>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto px-4 pb-8 space-y-3">
          <select
            aria-label={t("importPage.halaqa")}
            value={halaqa}
            onChange={(e) => setHalaqa(e.target.value)}
            className="w-full min-h-11 rounded-2xl glass px-3 py-2 text-sm"
          >
            {(halaqat.data ?? []).map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>

          <div className="glass rounded-3xl p-4 space-y-3">
            <p className="text-xs text-muted-foreground">{t("importPage.columns")}</p>
            <label className="w-full rounded-2xl bg-primary/10 text-primary py-3 text-sm font-bold flex items-center justify-center gap-2 cursor-pointer focus-within:ring-2 focus-within:ring-primary">
              <FileUp className="w-4 h-4" aria-hidden="true" /> {t("importPage.pickFile")}
              <input
                type="file"
                accept=".xlsx,.csv,.tsv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="sr-only"
                aria-label={t("importPage.file")}
                onChange={(e) => void onFile(e.target.files?.[0])}
              />
            </label>
            <textarea
              aria-label={t("importPage.pasteLabel")}
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              placeholder={t("importPage.pastePlaceholder")}
              rows={4}
              className="w-full rounded-2xl bg-background/70 px-3 py-2 text-sm"
            />
            {paste.trim() && (
              <button
                onClick={() => load(parseDelimited(paste))}
                className="w-full min-h-11 rounded-2xl glass py-2 text-xs font-bold"
              >
                {t("importPage.previewPaste")}
              </button>
            )}
          </div>

          {err && (
            <p role="alert" className="text-xs text-destructive text-center">
              {err}
            </p>
          )}

          {rows.length > 0 && (
            <section aria-label={t("importPage.preview")} className="space-y-2">
              <p className="text-xs font-bold">
                {t("importPage.previewCount", {
                  ok: valid.length,
                  bad: rows.length - valid.length,
                })}
              </p>
              <ul className="space-y-1.5">
                {rows.map((r) => (
                  <li
                    key={r.line}
                    data-line={r.line}
                    className={`rounded-2xl px-3 py-2 text-xs flex gap-2 ${r.error ? "bg-destructive/10" : "glass"}`}
                  >
                    <span className="text-muted-foreground tabular-nums w-6">{r.line}</span>
                    <span className="flex-1 font-bold truncate">{r.name || "—"}</span>
                    <span dir="ltr" className="font-mono">
                      {r.username}
                    </span>
                    {r.error && <span className="basis-full text-destructive">{r.error}</span>}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => void submit()}
                disabled={busy || !valid.length}
                className="w-full rounded-2xl gradient-primary text-primary-foreground py-3 text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Users className="w-4 h-4" aria-hidden="true" />
                )}
                {t("importPage.create", { n: valid.length, halaqa: halaqaName })}
              </button>
            </section>
          )}

          {result && (
            <section
              aria-label={t("importPage.result")}
              className="glass rounded-3xl p-4 space-y-2"
            >
              <p role="status" className="text-sm font-bold">
                {t("importPage.created", { n: result.created })}
                {result.failed ? ` · ${t("importPage.createFailed", { n: result.failed })}` : ""}
              </p>
              {result.rows
                .filter((r) => !r.ok)
                .map((r) => (
                  <p key={r.row} className="text-xs text-destructive">
                    {r.name} ({r.username}): {bulkRowError(r.error)}
                  </p>
                ))}
              {created.length > 0 && (
                <>
                  <p className="text-xs text-muted-foreground">{t("importPage.passwordsOnce")}</p>
                  <button
                    onClick={() =>
                      void printHtml(
                        loginCardsHtml(created, halaqaName),
                        t("importPage.cardsFile", { halaqa: halaqaName }),
                      )
                    }
                    className="w-full rounded-2xl bg-primary text-primary-foreground py-2.5 text-sm font-bold flex items-center justify-center gap-2"
                  >
                    <Printer className="w-4 h-4" aria-hidden="true" /> {t("importPage.print")}
                  </button>
                </>
              )}
            </section>
          )}
        </div>
      </div>
    </PhoneFrame>
  );
}
