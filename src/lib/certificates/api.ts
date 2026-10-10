/**
 * نداءات استوديو الشهائد — كلها دوال SECURITY DEFINER تتحقق من الصلاحية على الخادم
 * (supabase/migrations/20261206100000_certificate_studio.sql و20261206110000_certificate_issue.sql).
 */
import { rpc } from "@/integrations/supabase/rpc";
import { t } from "@/lib/i18n";
import type { CertBrand } from "./brand";
import type { Condition, AchievementRef } from "./eligibility";
import type { Design } from "./model";
import type { VarBag } from "./variables";

export type CertStatus =
  "draft" | "ready" | "pending" | "rejected" | "issued" | "revoked" | "archived";

/** لماذا تنتظر الشهادة اعتماد المدير (1.24.0، الخادم: private.cert_approval_reasons). */
export type ApprovalReason = "override" | "ineligible" | "center_policy" | "foreign_signature";

/** فحص الخادم لشروط النوع (private.cert_server_check): ok=null لما لا يعيده الخادم (النِّسب والمعدّلات). */
export interface ServerCheck {
  ok: boolean;
  manual: boolean;
  checks: { kind: string; ok: boolean | null; actual: number | null; need: number | null }[];
}

export interface CertType {
  id: string;
  key: string;
  center_id: string | null;
  name: string;
  category: string;
  text_kind: string;
  param: "surah" | "juz" | "course" | "milestone" | null;
  conditions: Condition[];
  texts: Record<string, string> | null;
  sort: number;
  active: boolean;
}

export interface StudioContext {
  centers: { id: string; name: string; can_manage: boolean; can_view: boolean }[];
  halaqat: {
    id: string;
    name: string;
    center_id: string;
    teacher_id: string | null;
    teacher_name: string | null;
    can_issue: boolean;
    students: number;
  }[];
  types: CertType[];
}

export interface TemplateRow {
  id: string;
  center_id: string;
  halaqa_id: string | null;
  type_key: string | null;
  name: string;
  description: string | null;
  categories: string[];
  design: Design;
  based_on: string | null;
  version: number;
  current_design_id: string | null;
  archived: boolean;
  updated_at: string;
  used: number;
  can_edit: boolean;
}

export interface AssetMeta {
  id: string;
  kind: "logo" | "logo_white" | "stamp" | "signature" | "background" | "decoration" | "image";
  label: string | null;
  signer_name: string | null;
  signer_title: string | null;
  mime: string;
  width: number | null;
  height: number | null;
  archived: boolean;
  created_at: string;
  mine: boolean;
  owner: string | null;
}

export interface AssetBlob {
  id: string;
  kind: string;
  mime: string;
  data_url: string;
  width: number | null;
  height: number | null;
}

export interface BrandInfo {
  center: { id: string; name: string; city: string | null };
  brand: CertBrand | null;
  report_colors: { primary?: string; accent?: string } | null;
  can_edit: boolean;
}

export interface IssueItem {
  student_id: string;
  vars?: VarBag;
  achievement_ref?: AchievementRef;
  eligibility?: unknown;
  override?: boolean;
}

export interface IssuePayload {
  halaqa_id: string;
  type_key: string;
  status?: "draft" | "ready" | "issued";
  template_id?: string | null;
  system_template?: string | null;
  design: Design;
  batch_id?: string | null;
  replaces_id?: string | null;
  issue_date?: string | null;
  period_from?: string | null;
  period_to?: string | null;
  items: IssueItem[];
}

export interface IssuedRef {
  id: string;
  student_id: string;
  student_name?: string;
  status: CertStatus;
  certificate_number: string | null;
  verify_code: string | null;
  reasons?: ApprovalReason[];
}

export interface CertListItem {
  id: string;
  certificate_number: string | null;
  status: CertStatus;
  student_id: string;
  student_name: string;
  center_id: string | null;
  center_name: string | null;
  halaqa_id: string | null;
  halaqa_name: string | null;
  teacher_name: string | null;
  type_key: string | null;
  type_name: string | null;
  template_id: string | null;
  system_template: string | null;
  template_name: string | null;
  issue_date: string | null;
  created_at: string;
  issued_at: string | null;
  revoked_at: string | null;
  revoke_reason: string | null;
  batch_id: string | null;
  replaces_id: string | null;
  replaced_by: string | null;
  verify_code: string | null;
  can_revoke: boolean;
  can_issue: boolean;
  approved_at?: string | null;
  review_note?: string | null;
  reasons?: ApprovalReason[] | null;
  server_check?: ServerCheck | null;
  can_approve?: boolean;
}

export interface CertDetail extends CertListItem {
  /** بصمة SHA-256 للّقطة الصادرة (1.26.0)، تطابق ما في صفحة التحقق. */
  fingerprint?: string | null;
  period_from: string | null;
  period_to: string | null;
  archived_at: string | null;
  design_id: string | null;
  snapshot: {
    vars: VarBag;
    type: { key: string; name: string; category: string; text_kind: string };
    achievement_ref: AchievementRef;
    override: boolean;
    server_check?: ServerCheck;
    approval?: { reasons?: ApprovalReason[]; by?: string; at?: string };
  } | null;
  design: Design | null;
  assets: AssetBlob[];
  approved_by_name?: string | null;
}

export interface CertStats {
  total: number;
  month: number;
  year: number;
  issued: number;
  revoked: number;
  archived: number;
  drafts: number;
  pending?: number;
  /** ما ينتظر اعتماد هذا المستخدم (مدير المركز). */
  to_approve?: number;
  students: number;
  by_type: { key: string; name: string; count: number }[];
  by_halaqa: { id: string; name: string; count: number }[];
  by_template: { key: string; name: string; count: number }[];
  by_month: { month: string; count: number }[];
}

export interface ListQuery {
  center_id?: string;
  halaqa_id?: string;
  student_id?: string;
  type_key?: string;
  batch_id?: string;
  status?: "drafts" | "pending" | "rejected" | "issued" | "revoked" | "archived" | "all" | "active";
  from?: string;
  to?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

const KNOWN = [
  "NOT_ALLOWED",
  "NOT_YOUR_HALAQA",
  "NOT_IN_HALAQA",
  "OVERRIDE_NOT_ALLOWED",
  "UNKNOWN_TYPE",
  "INVALID_DESIGN",
  "UNRESOLVED_BRAND",
  "FOREIGN_ASSET",
  "DUPLICATE_STUDENT",
  "INVALID_REPLACE",
  "BATCH_LOCKED",
  "REASON_REQUIRED",
  "NOT_ISSUED",
  "UNSAFE_SVG",
  "INVALID_IMAGE",
  "INVALID_ITEMS",
  "NOT_FOUND",
  "UNSAFE_DESIGN",
  "STALE",
  "FUTURE_DATE",
  "DATE_TOO_OLD",
  "INVALID_PERIOD",
  "ALREADY_REPLACED",
  "NOT_PENDING",
  "INVALID_REASON",
] as const;

/** رسالة عربية واضحة لرمز الخادم، وإلا «تعذر إنشاء الشهادة حاليًا.». */
export class CertError extends Error {
  code: string;
  constructor(code: string, cause?: unknown) {
    super(
      t(`certificates.err.${code}`) === `certificates.err.${code}`
        ? t("certificates.err.generic")
        : t(`certificates.err.${code}`),
    );
    this.code = code;
    this.cause = cause;
  }
}

export function certErrorCode(e: unknown): string {
  const msg =
    e && typeof e === "object" && "message" in e
      ? String((e as { message: unknown }).message)
      : String(e);
  // الأطول أولاً: «OVERRIDE_NOT_ALLOWED» تحتوي «NOT_ALLOWED».
  return [...KNOWN].sort((a, b) => b.length - a.length).find((k) => msg.includes(k)) ?? "generic";
}

async function call<T>(p: PromiseLike<{ data: unknown; error: unknown }>): Promise<T> {
  const { data, error } = await p;
  if (error) {
    console.warn("[certificates]", error);
    throw new CertError(certErrorCode(error), error);
  }
  return data as T;
}

const j = (v: unknown) => v as never;

export const certApi = {
  context: () => call<StudioContext>(rpc("cert_studio_context")),
  templates: (center: string) => call<TemplateRow[]>(rpc("cert_templates", { _center: center })),
  saveTemplate: (
    tpl: Partial<TemplateRow> & { design: Design; expected_updated_at?: string | null },
    publish: boolean,
  ) =>
    call<{ id: string; version: number; current_design_id: string | null; updated_at: string }>(
      rpc("cert_save_template", { _template: j(tpl), _publish: publish }),
    ),
  templateAction: (
    id: string,
    action: "duplicate" | "archive" | "restore",
    halaqa?: string | null,
  ) =>
    call<string>(
      rpc("cert_template_action", { _id: id, _action: action, _halaqa: halaqa ?? undefined }),
    ),
  assets: (center: string) => call<AssetMeta[]>(rpc("cert_assets", { _center: center })),
  assetData: (center: string, ids: string[]) =>
    ids.length
      ? call<AssetBlob[]>(rpc("cert_assets", { _center: center, _ids: ids }))
      : Promise.resolve([]),
  saveAsset: (
    center: string,
    a: {
      kind: AssetMeta["kind"];
      data_url: string;
      label?: string;
      signer_name?: string;
      signer_title?: string;
      width?: number;
      height?: number;
    },
  ) => call<string>(rpc("cert_save_asset", { _center: center, _asset: j(a) })),
  archiveAsset: (id: string, archived = true) =>
    call<void>(rpc("cert_archive_asset", { _id: id, _archived: archived })),
  brand: (center: string) => call<BrandInfo>(rpc("cert_brand", { _center: center })),
  saveBrand: (center: string, brand: CertBrand) =>
    call<void>(rpc("cert_save_brand", { _center: center, _brand: j(brand) })),
  saveType: (center: string, type: Partial<CertType>) =>
    call<string>(rpc("cert_save_type", { _center: center, _type: j(type) })),
  issue: (p: IssuePayload) =>
    call<{
      batch_id: string;
      design_id: string;
      status: CertStatus;
      pending?: number;
      certificates: IssuedRef[];
    }>(rpc("cert_issue", { _payload: j(p) })),
  finalize: (batch: string, ids?: string[]) =>
    call<{ batch_id: string; pending?: number; certificates: IssuedRef[] }>(
      rpc("cert_finalize", { _batch: batch, _ids: ids }),
    ),
  approve: (ids: string[]) =>
    call<{ certificates: IssuedRef[] }>(rpc("cert_approve", { _ids: ids })),
  reject: (ids: string[], reason: string) =>
    call<{ rejected: number }>(rpc("cert_reject", { _ids: ids, _reason: reason })),
  markReady: (batch: string) => call<number>(rpc("cert_mark_ready", { _batch: batch })),
  discardDrafts: (batch: string) => call<number>(rpc("cert_discard_drafts", { _batch: batch })),
  revoke: (id: string, reason: string) =>
    call<{ ok: boolean }>(rpc("cert_revoke", { _id: id, _reason: reason })),
  archive: (id: string) => call<void>(rpc("cert_archive", { _id: id })),
  list: (q: ListQuery) =>
    call<{ total: number; items: CertListItem[] }>(rpc("cert_list", { _q: j(q) })),
  stats: (center?: string | null, halaqa?: string | null) =>
    call<CertStats>(
      rpc("cert_stats", { _center: center ?? undefined, _halaqa: halaqa ?? undefined }),
    ),
  get: (id: string) => call<CertDetail>(rpc("cert_get", { _id: id })),
  /** لوحة التكريم والإنصاف لحلقة (1.26.0). */
  honor: (halaqa: string, from: string, to?: string) =>
    call<HonorData>(rpc("cert_honor", { _halaqa: halaqa, _from: from, _to: to })),
  /** حتى 200 شهادة بطلب واحد (1.25.0، M6)؛ يعيد بناء CertDetail لكل بند من التصاميم والأصول المشتركة. */
  getMany: async (ids: string[]): Promise<CertDetail[]> => {
    const r = await call<{
      items: Omit<CertDetail, "design" | "assets">[];
      designs: Record<string, Design | null>;
      assets: AssetBlob[];
    }>(rpc("cert_get_many", { _ids: ids }));
    return manyToDetails(r);
  },
  batch: (id: string) =>
    call<{
      batch_id: string;
      halaqa_id: string;
      center_id: string;
      type_key: string;
      template_id: string | null;
      system_template: string | null;
      issue_date: string | null;
      period_from: string | null;
      period_to: string | null;
      status: CertStatus;
      design: Design;
      items: {
        id: string;
        student_id: string;
        student_name: string;
        override: boolean;
        achievement_ref: AchievementRef;
      }[];
    }>(rpc("cert_batch", { _batch: id })),
  audit: (center: string, limit = 50) =>
    call<
      {
        id: number;
        action: string;
        entity_id: string | null;
        details: Record<string, unknown>;
        at: string;
        actor: string | null;
      }[]
    >(rpc("cert_audit_log", { _center: center, _limit: limit })),
};

export const certKeys = {
  all: ["certificates"] as const,
  context: () => ["certificates", "context"] as const,
  templates: (c: string) => ["certificates", "templates", c] as const,
  assets: (c: string) => ["certificates", "assets", c] as const,
  brand: (c: string) => ["certificates", "brand", c] as const,
  list: (q: ListQuery) => ["certificates", "list", q] as const,
  stats: (c?: string | null, h?: string | null) =>
    ["certificates", "stats", c ?? null, h ?? null] as const,
  one: (id: string) => ["certificates", "one", id] as const,
  audit: (c: string) => ["certificates", "audit", c] as const,
};

/** يوزّع ناتج cert_get_many على البنود بترتيبها (الأصول المشتركة مجموعة شاملة يكفي كل بند منها ما يشير إليه). */
export function manyToDetails(r: {
  items: Omit<CertDetail, "design" | "assets">[];
  designs: Record<string, Design | null>;
  assets: AssetBlob[];
}): CertDetail[] {
  return (r.items ?? []).map((x) => ({
    ...x,
    design: x.design_id ? (r.designs?.[x.design_id] ?? null) : null,
    assets: r.assets ?? [],
  }));
}

export interface HonorItem {
  type_key: string;
  ref: { kind: string; juz?: number; surah?: number } | null;
  issue_date: string;
}
export interface HonorRow {
  student_id: string;
  name: string;
  count: number;
  manual: number;
  last: string | null;
  items: HonorItem[];
}
export interface HonorData {
  from: string;
  to: string;
  students: HonorRow[];
}
