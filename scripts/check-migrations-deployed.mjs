/**
 * يقارن ترحيلات المستودع (`supabase/migrations/*.sql`) بالمنشور على قاعدة البيانات
 * (`supabase_migrations.schema_migrations.version`) ويطبع جدول Markdown بالفروق.
 *
 * الاستعمال:
 *   psql "$DB_URL" -At -c "select version || '|' || coalesce(name, '') from supabase_migrations.schema_migrations" > deployed.txt
 *   node scripts/check-migrations-deployed.mjs deployed.txt [--strict] [--list]
 *
 * بلا `--strict` يكتفي بتحذير (::warning) حتى لا يُخلط بفشل النسخة الاحتياطية؛ مع `--strict` يخرج بـ 1.
 * المنطق النقي في `migrationDrift` ويختبره `src/lib/migration-drift.test.ts`.
 *
 * كل سطر «version» أو «version|name». النشر من لوحة Supabase أو أداة MCP يسجّل `version` بوقت التطبيق لا برقم
 * الملف، فيُستخرج الرقم من `name` إن احتواه (`m20261022100000_x` أو `20261107100000_x`)، وإلا يُطابَق `name`
 * بلاحقة ملف محلي (`username_auth` ← `20261005100000_username_auth.sql`). `OPS_ONLY` ترحيلات تشغيلية طُبّقت
 * من اللوحة يوم إنشاء المشروع (pg_cron/pg_net وجدولة التقرير الأسبوعي) وليست ملفات في المستودع.
 */
export const OPS_ONLY = new Set(["enable_pg_cron_pg_net", "schedule_guardian_weekly"]);
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/** @param {string[]} files @param {string[]} deployed */
export function migrationDrift(files, deployed) {
  const local = files
    .filter((f) => f.endsWith(".sql"))
    .map((f) => f.split("_")[0])
    .filter((v) => /^\d{14}$/.test(v))
    .sort();
  const bySuffix = new Map(
    files.filter((f) => /^\d{14}_.+\.sql$/.test(f)).map((f) => [f.slice(15, -4), f.slice(0, 14)]),
  );
  const remote = [
    ...new Set(
      deployed
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [version, name = ""] = line.split("|").map((x) => x.trim());
          if (OPS_ONLY.has(name)) return "";
          return name.match(/\d{14}/)?.[0] ?? bySuffix.get(name) ?? version;
        })
        .filter(Boolean),
    ),
  ].sort();
  const r = new Set(remote);
  const l = new Set(local);
  return {
    local: local.length,
    remote: remote.length,
    notDeployed: local.filter((v) => !r.has(v)),
    unknownRemote: remote.filter((v) => !l.has(v)),
  };
}

function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("الاستعمال: node scripts/check-migrations-deployed.mjs deployed.txt [--strict]");
    process.exit(2);
  }
  const strict = process.argv.includes("--strict");
  const files = fs.readdirSync(path.join(ROOT, "supabase", "migrations"));
  const d = migrationDrift(files, fs.readFileSync(file, "utf8").split(/\r?\n/));
  // --list: أسماء ملفات الترحيلات غير المنشورة بالترتيب، سطراً سطراً (لسير db-migrate).
  if (process.argv.includes("--list")) {
    const pending = new Set(d.notDeployed);
    for (const f of files.filter((f) => /^\d{14}_.+\.sql$/.test(f)).sort())
      if (pending.has(f.slice(0, 14))) console.log(f);
    return;
  }
  const ok = d.notDeployed.length === 0 && d.unknownRemote.length === 0;
  console.log(`## الترحيلات: ${ok ? "✅ مطابقة" : "⚠️ غير مطابقة"}`);
  console.log(`في المستودع ${d.local} · على الإنتاج ${d.remote}`);
  if (d.notDeployed.length) {
    console.log("\n**لم تُنشر بعد** (`supabase db push`):\n");
    for (const v of d.notDeployed) console.log(`- \`${v}\``);
  }
  if (d.unknownRemote.length) {
    console.log("\n**على الإنتاج وليست في المستودع** (تعديل من خارج طلبات الدمج؟):\n");
    for (const v of d.unknownRemote) console.log(`- \`${v}\``);
  }
  if (!ok) {
    console.error("::warning::ترحيلات المستودع لا تطابق الإنتاج (انظر ملخّص التشغيل).");
    if (strict) process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
