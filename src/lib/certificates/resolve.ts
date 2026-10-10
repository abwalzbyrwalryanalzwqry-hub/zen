/**
 * اقتراح القالب بالأولوية المطلوبة: قالب النوع ← قالب الحلقة ← قالب المركز ← قالب النظام. قالب النوع الخاص
 * بالحلقة يسبق قالب النوع العام في المركز. المؤرشف لا يُقترح.
 */
import type { TemplateRow } from "./api";
import { SYSTEM_TEMPLATES } from "./templates";

export type TemplatePick = { kind: "center"; id: string } | { kind: "system"; key: string };

export function pickTemplate(
  rows: readonly Pick<TemplateRow, "id" | "halaqa_id" | "type_key" | "archived" | "updated_at">[],
  o: { typeKey: string | null; halaqaId: string | null },
): TemplatePick {
  const live = rows
    .filter((r) => !r.archived)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const byType = live.filter((r) => o.typeKey && r.type_key === o.typeKey);
  const hit =
    byType.find((r) => r.halaqa_id && r.halaqa_id === o.halaqaId) ??
    byType.find((r) => !r.halaqa_id) ??
    live.find((r) => !r.type_key && r.halaqa_id && r.halaqa_id === o.halaqaId) ??
    live.find((r) => !r.type_key && !r.halaqa_id);
  if (hit) return { kind: "center", id: hit.id };
  const sys =
    SYSTEM_TEMPLATES.find((s) => o.typeKey && s.types.includes(o.typeKey)) ?? SYSTEM_TEMPLATES[0];
  return { kind: "system", key: sys.key };
}

export const pickKey = (p: TemplatePick | null) =>
  p ? (p.kind === "center" ? `c:${p.id}` : `s:${p.key}`) : "";
export function parsePick(s: string | undefined | null): TemplatePick | null {
  if (!s) return null;
  if (s.startsWith("c:")) return { kind: "center", id: s.slice(2) };
  if (s.startsWith("s:") && SYSTEM_TEMPLATES.some((x) => x.key === s.slice(2)))
    return { kind: "system", key: s.slice(2) };
  return null;
}
