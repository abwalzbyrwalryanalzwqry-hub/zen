#!/usr/bin/env node
/**
 * اختبار دخان على مشروع Staging حقيقي (تدقيق أكتوبر 2026، المرحلة 3.3). يكمّل `test:db` (PostgreSQL مضمَّن
 * بلا GoTrue ولا PostgREST) واختبارات E2E (Supabase وهمي): هنا Auth وPostgREST وRLS ودوال Edge الحقيقية.
 *
 *   STAGING_SUPABASE_URL=… STAGING_PUBLISHABLE_KEY=… node scripts/staging-smoke.mjs
 *
 * يرفض رابط الإنتاج. ينشئ حساباً مؤقتاً ويحذفه في النهاية حتى عند الفشل.
 */
import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "node:crypto";

const PROD_REF = "iniqospdljdlcfmwxafl";
const url = process.env.STAGING_SUPABASE_URL ?? "";
const key = process.env.STAGING_PUBLISHABLE_KEY ?? "";

if (!url || !key) {
  console.error("❌ STAGING_SUPABASE_URL و STAGING_PUBLISHABLE_KEY مطلوبان.");
  process.exit(1);
}
if (url.includes(PROD_REF)) {
  console.error("❌ هذا رابط الإنتاج. اختبار الدخان لـ Staging فقط.");
  process.exit(1);
}

// مطابق لـ public.username_email (20261005100000_username_auth.sql).
const usernameEmail = (u) =>
  createHash("sha256").update(`zen-username:${u}`, "utf8").digest("hex").slice(0, 32) +
  "@users.zen.invalid";

const results = [];
const step = async (name, fn) => {
  try {
    await fn();
    results.push(`✅ ${name}`);
  } catch (e) {
    results.push(`❌ ${name}: ${e instanceof Error ? e.message : e}`);
    throw e;
  }
};
const must = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

const anon = createClient(url, key, { auth: { persistSession: false } });
const username = `smoke_${randomBytes(4).toString("hex")}`;
const password = `Smk-${randomBytes(9).toString("base64url")}7a`;
let signedIn = false;

try {
  await step("كلمة مرور شائعة مرفوضة من الخادم", async () => {
    const { error } = await anon.rpc("register_username_account", {
      _username: `${username}x`,
      _password: "Password123",
      _name: "دخان",
    });
    must(error && /weak_password/.test(error.message), `قُبلت: ${error?.message ?? "بلا خطأ"}`);
  });

  await step("التسجيل باسم مستخدم", async () => {
    const { data, error } = await anon.rpc("register_username_account", {
      _username: username,
      _password: password,
      _name: "اختبار الدخان",
    });
    must(!error, error?.message);
    must(data?.username === username && data?.recovery_code, "استجابة تسجيل ناقصة");
  });

  await step("الدخول (GoTrue يقبل الحساب المنشأ من SQL)", async () => {
    const { error } = await anon.auth.signInWithPassword({
      email: usernameEmail(username),
      password,
    });
    must(!error, error?.message);
    signedIn = true;
  });

  const { data: me } = await anon.auth.getUser();
  const uid = me.user?.id;

  await step("الدور طالب، والملف الشخصي منشأ", async () => {
    const { data, error } = await anon.from("profiles").select("id, role").eq("id", uid).single();
    must(!error, error?.message);
    must(data.role === "student", `الدور ${data.role}`);
  });

  await step("تسجيل حفظ وإجماليات الخادم", async () => {
    const { error } = await anon.from("progress").insert({
      user_id: uid,
      surah_name: "الملك",
      from_ayah: 1,
      to_ayah: 5,
      memorization_type: "new",
    });
    must(!error, error?.message);
    const { data, error: e2 } = await anon.rpc("progress_stats", { _user: uid });
    must(!e2, e2?.message);
    must(Number(data.total) === 1 && Number(data.ayat) === 5, JSON.stringify(data));
  });

  await step("RLS: بلا جلسة لا تُقرأ سجلات الحفظ", async () => {
    const outsider = createClient(url, key, { auth: { persistSession: false } });
    const { data } = await outsider.from("progress").select("id").eq("user_id", uid);
    must((data ?? []).length === 0, "سجلات مرئية بلا جلسة");
  });

  await step("دوال Edge ترفض الطلب غير المصادَق", async () => {
    for (const fn of [
      "zen-ai",
      "zen-recitation",
      "zen-tools",
      "zen-push-dispatch",
      "zen-maintenance",
    ]) {
      const res = await fetch(`${url}/functions/v1/${fn}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: key },
        body: "{}",
      });
      must([401, 403, 404].includes(res.status), `${fn}: ${res.status}`);
    }
  });
} catch {
  /* النتيجة في الملخّص */
} finally {
  if (signedIn) {
    const { error } = await anon.rpc("delete_my_account", { _confirm: "احذف حسابي" });
    results.push(error ? `⚠️ حذف الحساب المؤقت: ${error.message}` : "✅ حذف الحساب المؤقت");
  }
}

console.log(results.join("\n"));
process.exit(results.some((r) => r.startsWith("❌")) ? 1 : 0);
