// سجلات المصحف للمعلّم (M5: من zen-api.ts دون تغيير السلوك؛ يُعاد تصديرها منه).

import { supabase } from "@/integrations/supabase/client";

const db = supabase;

export type MushafRecord = {
  id: string;
  student_id: string;
  teacher_id: string | null;
  halaqa_id: string | null;
  page: number;
  kind: "memorize" | "review" | "consolidate";
  session_date: string;
  rating: number | null;
  notes: string | null;
  created_at: string;
};

/* ─────────── Mushaf records ─────────── */

export async function listMushafRecords(opts: {
  studentId?: string;
  page?: number;
  limit?: number;
}): Promise<MushafRecord[]> {
  let q = db
    .from("mushaf_records")
    .select("*")
    .order("session_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (opts.studentId) q = q.eq("student_id", opts.studentId);
  if (opts.page) q = q.eq("page", opts.page);
  const { data } = await q.limit(opts.limit ?? 200);
  return (data as MushafRecord[]) ?? [];
}

export async function addMushafRecord(input: {
  student_id: string;
  teacher_id: string;
  halaqa_id?: string | null;
  page: number;
  kind: MushafRecord["kind"];
  session_date: string;
  rating?: number | null;
  notes?: string | null;
}) {
  const { error } = await db.from("mushaf_records").insert(input);
  if (error) throw error;
}

export async function deleteMushafRecord(id: string) {
  const { error } = await db.from("mushaf_records").delete().eq("id", id);
  if (error) throw error;
}

export const MUSHAF_KIND_LABEL: Record<MushafRecord["kind"], string> = {
  memorize: "حفظ",
  review: "مراجعة",
  consolidate: "تثبيت",
};
