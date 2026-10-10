#!/usr/bin/env node
/**
 * حسابات تجريبية لبيئة التطوير فقط — معلّم وطالب مع مركز وحلقة وواجب أول.
 *
 * بديل آمن لزر «دخول كمعلم/كطالب» الذي أضافه Lovable: ذلك الزر كان دالة خادم بلا
 * مصادقة تعمل بمفتاح service_role، وكلمات مرور مشتقّة من رقم الهاتف. هنا:
 *   - يعمل من الطرفية فقط، بمفتاح الخدمة من متغيّرات البيئة (لا يصل إلى المتصفح).
 *   - يرفض العمل دون ZEN_DEMO_SEED=yes صراحةً.
 *   - كلمات مرور عشوائية قوية تُطبع مرة واحدة (أو من ZEN_DEMO_PASSWORD).
 *   - آمن التكرار: لا يكرّر الحسابات ولا المركز ولا الحلقة ولا الواجب.
 *
 * الاستخدام:
 *   ZEN_DEMO_SEED=yes SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-demo.mjs
 *
 * لا تشغّله على قاعدة الإنتاج.
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (process.env.ZEN_DEMO_SEED !== "yes") {
  console.error("✋ للتشغيل اضبط ZEN_DEMO_SEED=yes — هذا السكربت لبيئة التطوير فقط.");
  process.exit(1);
}
if (!url || !key) {
  console.error("✋ SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY مطلوبان.");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const DEMO = [
  { key: "teacher", email: "teacher.demo@example.com", name: "الشيخ عبدالله (تجريبي)" },
  { key: "student", email: "student.demo@example.com", name: "محمد الطالب (تجريبي)" },
];

function password() {
  return process.env.ZEN_DEMO_PASSWORD || `Zen-${randomBytes(9).toString("base64url")}`;
}

async function findUserByEmail(email) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === email);
    if (hit) return hit;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function ensureUser({ email, name }) {
  const existing = await findUserByEmail(email);
  if (existing) return { id: existing.id, password: null };
  const pw = password();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: pw,
    email_confirm: true,
    user_metadata: { name },
  });
  if (error) throw error;
  return { id: data.user.id, password: pw };
}

async function one(query) {
  const { data, error } = await query.limit(1).maybeSingle();
  if (error) throw error;
  return data;
}

const accounts = {};
for (const u of DEMO) {
  accounts[u.key] = { ...u, ...(await ensureUser(u)) };
  await admin
    .from("profiles")
    .upsert({ id: accounts[u.key].id, name: u.name }, { onConflict: "id" });
}
const teacherId = accounts.teacher.id;
const studentId = accounts.student.id;

// الدور يُمنح من user_roles (مُشغّل يزامن profiles.role).
{
  const { error } = await admin
    .from("user_roles")
    .upsert({ user_id: teacherId, role: "teacher" }, { onConflict: "user_id,role" });
  if (error) throw error;
}

let center = await one(
  admin.from("centers").select("id").eq("name", "مركز Zen التجريبي").eq("created_by", teacherId),
);
if (!center) {
  const { data, error } = await admin
    .from("centers")
    .insert({ name: "مركز Zen التجريبي", city: "صنعاء", created_by: teacherId })
    .select("id")
    .single();
  if (error) throw error;
  center = data;
}

let halaqa = await one(
  admin.from("halaqat").select("id").eq("center_id", center.id).eq("name", "حلقة الفجر (تجريبية)"),
);
if (!halaqa) {
  const { data, error } = await admin
    .from("halaqat")
    .insert({
      center_id: center.id,
      name: "حلقة الفجر (تجريبية)",
      teacher_id: teacherId,
      schedule: "يومياً بعد الفجر",
    })
    .select("id")
    .single();
  if (error) throw error;
  halaqa = data;
}

{
  const { error } = await admin
    .from("halaqa_students")
    .upsert(
      { halaqa_id: halaqa.id, student_id: studentId },
      { onConflict: "halaqa_id,student_id" },
    );
  if (error) throw error;
}

const hasAssignment = await one(
  admin.from("assignments").select("id").eq("student_id", studentId).eq("teacher_id", teacherId),
);
if (!hasAssignment) {
  const { error } = await admin.from("assignments").insert({
    student_id: studentId,
    teacher_id: teacherId,
    halaqa_id: halaqa.id,
    kind: "memorize",
    surah_name: "الفاتحة",
    from_ayah: 1,
    to_ayah: 7,
    instructions: "احفظ السورة كاملة مع مراعاة أحكام المد.",
    due_date: new Date().toISOString().slice(0, 10),
    status: "pending",
  });
  if (error) throw error;
}

console.log("\n✅ البيانات التجريبية جاهزة. ادخل من /auth/email:\n");
for (const a of Object.values(accounts)) {
  console.log(
    `  ${a.key === "teacher" ? "معلّم" : "طالب"} · ${a.email} · ${
      a.password ?? "(الحساب موجود من قبل — كلمة المرور لم تتغيّر)"
    }`,
  );
}
console.log("\nاحفظ كلمات المرور الآن؛ لا تُخزَّن في أي مكان.\n");
