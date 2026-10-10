/**
 * دفتر الرسوم وتأكيد الدفع بالإيصال (1.21.0، المرحلة 5.1–5.2؛ supabase/migrations/20261211100000_fees_remote_recitation.sql).
 * لا دفع داخل التطبيق: المدير يسجّل المستحقات والمدفوعات، ووليّ الأمر يرسل مرجع التحويل أو صورة الإيصال فيؤكدها
 * المدير. القراءة والكتابة عبر دوال الخادم (manages_center للمدير، والطالب ووليّه لكشفه). المنطق الصافي مختبَر
 * في fees.test.ts.
 */
import { supabase } from "@/integrations/supabase/client";
import { rpc } from "@/integrations/supabase/rpc";
import { intlLocale, t } from "@/lib/i18n";

export type FeeStudentRow = {
  student_id: string;
  name: string;
  halaqat: string | null;
  charged: number;
  paid: number;
  balance: number;
  overdue: number;
  last_paid: string | null;
  currency: string;
};
export type FeeOverview = {
  center_id: string;
  enabled: boolean;
  totals: {
    charged: number;
    paid: number;
    balance: number;
    overdue: number;
    students_due: number;
    pending_receipts: number;
  };
  students: FeeStudentRow[];
};
export type FeeCharge = {
  id: string;
  title: string;
  amount: number;
  currency: string;
  due_date: string;
  cancelled: boolean;
};
export type PaymentMethod = "cash" | "transfer" | "other";
export type FeePayment = {
  id: string;
  amount: number;
  currency: string;
  method: PaymentMethod;
  reference: string | null;
  paid_on: string;
  source: "manual" | "receipt";
  voided: boolean;
};
export type ReceiptStatus = "pending" | "confirmed" | "rejected";
export type FeeReceiptLite = {
  id: string;
  amount: number;
  reference: string | null;
  status: ReceiptStatus;
  decision_note: string | null;
  created_at: string;
  has_image: boolean;
};
export type FeeStatement = {
  center_id: string;
  center_name: string;
  charged: number;
  paid: number;
  currency: string;
  charges: FeeCharge[];
  payments: FeePayment[];
  receipts: FeeReceiptLite[];
};
export type CenterReceipt = {
  id: string;
  student_id: string;
  student_name: string;
  submitted_by_name: string;
  by_guardian: boolean;
  amount: number;
  currency: string;
  reference: string | null;
  image_path: string | null;
  note: string | null;
  status: ReceiptStatus;
  decision_note: string | null;
  created_at: string;
};
export type FeeCenter = {
  center_id: string;
  center_name: string;
  student_id: string;
  student_name: string;
  self: boolean;
};

export const FEE_RECEIPT_BUCKET = "fee-receipts";

const ERR_KEYS = [
  "FEES_DISABLED",
  "INVALID_AMOUNT",
  "INVALID_TITLE",
  "INVALID_DATE",
  "STUDENT_NOT_IN_CENTER",
  "PROOF_REQUIRED",
  "INVALID_IMAGE",
  "TOO_MANY_PENDING",
  "ALREADY_DECIDED",
  "REASON_REQUIRED",
  "NOT_ALLOWED",
] as const;

/** رسالة مفهومة من رمز خطأ الخادم، وإلا الرسالة العامة. */
export function feeError(e: unknown, fallback: "load" | "save" = "save"): string {
  const msg =
    typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : "";
  const code = ERR_KEYS.find((k) => msg.includes(k));
  return code ? t(`fees.err.${code}`) : t(`fees.err.${fallback}`);
}

async function call<T>(p: PromiseLike<{ data: unknown; error: unknown }>, kind: "load" | "save") {
  const { data, error } = await p;
  if (error) throw new Error(feeError(error, kind));
  return data as T;
}

export const getFeeOverview = (centerId: string) =>
  call<FeeOverview>(rpc("center_fee_overview", { _center: centerId }), "load");
export const getCenterReceipts = (centerId: string, status: ReceiptStatus | null = "pending") =>
  call<CenterReceipt[]>(
    rpc("center_fee_receipts", { _center: centerId, _status: status as string }),
    "load",
  ).then((r) => r ?? []);
export const getStudentStatement = (studentId: string) =>
  call<FeeStatement[]>(rpc("student_fee_statement", { _student: studentId }), "load").then(
    (r) => r ?? [],
  );
export const getMyFeeCenters = () =>
  call<FeeCenter[]>(rpc("my_fee_centers"), "load").then((r) => r ?? []);

export const setFeesEnabled = (centerId: string, on: boolean) =>
  call<null>(rpc("set_center_fees_enabled", { _center: centerId, _on: on }), "save");
export const addCharges = (
  centerId: string,
  students: string[],
  title: string,
  amount: number,
  due: string,
  currency = "YER",
) =>
  call<number>(
    rpc("fee_add_charges", {
      _center: centerId,
      _students: students,
      _title: title,
      _amount: amount,
      _due: due,
      _currency: currency,
    }),
    "save",
  );
export const cancelCharge = (id: string) =>
  call<null>(rpc("fee_cancel_charge", { _id: id }), "save");
export const recordPayment = (
  centerId: string,
  studentId: string,
  amount: number,
  method: PaymentMethod,
  reference: string | null,
  note: string | null,
  paidOn: string | null,
) =>
  call<string>(
    rpc("fee_record_payment", {
      _center: centerId,
      _student: studentId,
      _amount: amount,
      _method: method,
      _reference: reference as string,
      _note: note as string,
      _paid_on: paidOn as string,
    }),
    "save",
  );
export const voidPayment = (id: string) => call<null>(rpc("fee_void_payment", { _id: id }), "save");
export const decideReceipt = (id: string, confirm: boolean, note: string | null) =>
  call<{ status: ReceiptStatus }>(
    rpc("fee_decide_receipt", { _id: id, _confirm: confirm, _note: note as string }),
    "save",
  );

/** يرفع صورة الإيصال (إن وُجدت) إلى {center}/{me}/… ثم يرسله. */
export async function submitReceipt(input: {
  centerId: string;
  studentId: string;
  userId: string;
  amount: number;
  reference: string | null;
  note: string | null;
  image: File | Blob | null;
}): Promise<string> {
  let path: string | null = null;
  if (input.image) {
    const ext = receiptExt(input.image.type);
    if (!ext) throw new Error(t("fees.err.INVALID_IMAGE"));
    if (input.image.size > 3 * 1024 * 1024) throw new Error(t("fees.err.imageTooBig"));
    path = receiptPath(input.centerId, input.userId, ext);
    const { error } = await supabase.storage
      .from(FEE_RECEIPT_BUCKET)
      .upload(path, input.image, { contentType: input.image.type, upsert: false });
    if (error) throw new Error(t("fees.err.upload"));
  }
  return call<string>(
    rpc("fee_submit_receipt", {
      _center: input.centerId,
      _student: input.studentId,
      _amount: input.amount,
      _reference: input.reference as string,
      _image_path: path as string,
      _note: input.note as string,
    }),
    "save",
  );
}

export async function receiptImageUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from(FEE_RECEIPT_BUCKET).createSignedUrl(path, 600);
  return data?.signedUrl ?? null;
}

// ─────────── منطق صافٍ ───────────

export function receiptExt(type: string): "jpg" | "png" | "webp" | null {
  if (type === "image/jpeg") return "jpg";
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  return null;
}

export function receiptPath(
  centerId: string,
  userId: string,
  ext: string,
  now = Date.now(),
): string {
  return `${centerId}/${userId}/${now}.${ext}`;
}

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

/**
 * مبلغ من نصّ يكتبه المستخدم: أرقام عربية أو فارسية، وفواصل الآلاف (، , ٬)، والفاصلة العشرية (. ٫).
 * null إن لم يكن مبلغاً موجباً بمنزلتين عشريتين على الأكثر.
 */
export function parseAmount(raw: string): number | null {
  let s = raw.trim();
  if (!s) return null;
  s = s.replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)));
  s = s.replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)));
  s = s.replace(/[\s,،٬]/g, "").replace(/٫/g, ".");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const n = Number(s);
  return n > 0 && n <= 100_000_000 ? n : null;
}

export function formatMoney(amount: number, currency = "YER"): string {
  try {
    return new Intl.NumberFormat(intlLocale(), {
      style: "currency",
      currency,
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

/** الرصيد المتبقي (لا يقلّ عن صفر للعرض)، والزائد رصيد دائن. */
export function balanceOf(s: Pick<FeeStatement, "charged" | "paid">): {
  due: number;
  credit: number;
} {
  const diff = Math.round((s.charged - s.paid) * 100) / 100;
  return diff >= 0 ? { due: diff, credit: 0 } : { due: 0, credit: -diff };
}

export type LedgerLine = {
  id: string;
  date: string;
  kind: "charge" | "payment";
  label: string;
  amount: number;
  void: boolean;
};

/** كشف حساب زمني واحد: المستحقات (مدين) والمدفوعات (دائن)، الأحدث أولاً. */
export function ledgerLines(s: FeeStatement): LedgerLine[] {
  const lines: LedgerLine[] = [
    ...s.charges.map((c) => ({
      id: c.id,
      date: c.due_date,
      kind: "charge" as const,
      label: c.title,
      amount: c.amount,
      void: c.cancelled,
    })),
    ...s.payments.map((p) => ({
      id: p.id,
      date: p.paid_on,
      kind: "payment" as const,
      label: p.reference ?? "",
      amount: p.amount,
      void: p.voided,
    })),
  ];
  return lines.sort(
    (a, b) =>
      b.date.localeCompare(a.date) || (a.kind === b.kind ? 0 : a.kind === "payment" ? -1 : 1),
  );
}
