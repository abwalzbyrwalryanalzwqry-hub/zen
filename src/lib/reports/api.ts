/**
 * نداء الخادم الوحيد للتقارير وسجل الإنجاز: `halaqa_report_data` (قراءة فقط من السجل اليومي، بصلاحيته).
 * التصفية بالنطاق والطلاب وأيام الأسبوع على الخادم، فلا تُحمَّل سجلات الحلقة كلها إلى الجهاز. ودون اتصال
 * يُبنى التقرير على الجهاز (1.16.0).
 */
import { rpc } from "@/integrations/supabase/rpc";
import type { ReportData } from "./types";
import type { DaySheet } from "@/lib/daily-record";
import { dailyErrorCode } from "@/lib/daily-record";
import { isOnline } from "@/lib/network";
import { latestSheet, sheetsFor } from "@/lib/daily-record-cache";
import { readDailyOutbox } from "@/lib/daily-record-api";
import { blankDayFrom, overlayOutbox, overlayRecord, readRecordOutbox } from "@/lib/daily-offline";
import { coveringReport, mergeSheets, reportFromSheets, saveReport } from "./offline";

export interface ReportQuery {
  halaqa: string;
  from: string;
  to: string;
  students?: string[] | null;
  weekdays?: number[] | null;
  history?: boolean;
}

async function fetchLive(q: ReportQuery): Promise<ReportData> {
  const { data, error } = await rpc("halaqa_report_data", {
    _halaqa: q.halaqa,
    _from: q.from,
    _to: q.to,
    _students: q.students?.length ? q.students : null,
    _weekdays: q.weekdays?.length && q.weekdays.length < 7 ? q.weekdays : null,
    _history: !!q.history,
  });
  if (error) throw error;
  return data as unknown as ReportData;
}

/** أوراق السجل على الجهاز لهذه الحلقة، وفوقها صندوق الإرسال، وأيام فُتحت دون اتصال ولا ورقة لها. */
function deviceSheets(halaqa: string) {
  const items = readDailyOutbox();
  const records = readRecordOutbox();
  const pendingDates = new Set(
    [...items, ...records].filter((x) => x.halaqa === halaqa).map((x) => x.date),
  );
  const show = (sheet: DaySheet) => overlayRecord(overlayOutbox(sheet, items), records);
  const saved = sheetsFor(halaqa).map((x) => ({
    sheet: show(x.sheet),
    saved_at: x.saved_at,
    pending: pendingDates.has(x.sheet.date),
  }));
  const have = new Set(saved.map((x) => x.sheet.date));
  const base = latestSheet(halaqa);
  const now = new Date().toISOString();
  const local = base
    ? [...pendingDates]
        .filter((d) => !have.has(d) && d >= base.date)
        .map((d) => ({ sheet: show(blankDayFrom(base, d)), saved_at: now, pending: true }))
    : [];
  return [...saved, ...local];
}

const isNetwork = (e: unknown) => dailyErrorCode(e, isOnline()) === "NETWORK";

/**
 * بيانات التقرير: حيّة مع الاتصال (وتُحفظ على الجهاز، وفوقها ما لم يُرسل بعد)، ودون اتصال من أصغر نسخة
 * محفوظة تغطي المطلوب مع أوراق السجل على الجهاز، أو من الأوراق وحدها تقريراً جزئياً (reports/offline.ts).
 */
export async function fetchReportData(q: ReportQuery): Promise<ReportData> {
  try {
    const live = await fetchLive(q);
    saveReport(q, live);
    const pending = deviceSheets(q.halaqa).filter((x) => x.pending);
    return pending.length ? mergeSheets(live, q, pending, live.generated_at) : live;
  } catch (e) {
    if (!isNetwork(e)) throw e;
    const sheets = deviceSheets(q.halaqa);
    const hit = coveringReport(q);
    if (hit) {
      const merged = mergeSheets(hit.data, q, sheets, hit.saved_at);
      return { ...merged, offline_at: hit.saved_at };
    }
    const partial = reportFromSheets(q, sheets);
    if (partial) {
      const latest = sheets
        .map((x) => x.saved_at)
        .sort()
        .at(-1);
      return { ...partial, offline_at: latest, offline_partial: true };
    }
    throw e;
  }
}

export const reportKey = (q: ReportQuery) =>
  [
    "daily-record",
    q.halaqa,
    "report",
    q.from,
    q.to,
    (q.students ?? []).join(","),
    (q.weekdays ?? []).join(","),
    !!q.history,
  ] as const;
