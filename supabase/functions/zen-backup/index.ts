// نسخ احتياطي مجاني وموفّر للمساحة: JSON مضغوط للجداول النصية الحرجة فقط.
// الحماية: Bearer MAINTENANCE_SECRET. الحد: 100MB. الاحتفاظ: آخر 8 نسخ أسبوعية.
import { createClient } from "npm:@supabase/supabase-js@2.117.3";

declare const Deno: {
  env: { toObject(): Record<string, string> };
  serve(h: (req: Request) => Response | Promise<Response>): void;
};

const MAX_BYTES = 100 * 1024 * 1024;
const KEEP = 8;
const BUCKET = "db-backups";
const FOLDER = "weekly";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST فقط" }, 405);

  const env = Deno.env.toObject();
  const secret = env.MAINTENANCE_SECRET;
  const auth = req.headers.get("Authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) return json({ error: "غير مصرح" }, 401);

  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const startedAt = new Date().toISOString();

  const { data: snapshot, error: snapError } = await admin.rpc("create_backup_snapshot");
  if (snapError || !snapshot) {
    await admin.from("backup_runs").insert({
      status: "failed",
      error: snapError?.message ?? "snapshot failed",
    });
    return json({ error: "تعذّر إنشاء اللقطة." }, 502);
  }

  const text = JSON.stringify(snapshot);
  const compressed = await new Response(
    new Blob([text]).stream().pipeThrough(new CompressionStream("gzip")),
  ).arrayBuffer();

  if (compressed.byteLength > MAX_BYTES) {
    await admin.from("backup_runs").insert({
      status: "skipped_too_large",
      size_bytes: compressed.byteLength,
      error: "backup exceeds 100MB",
    });
    return json({ error: "النسخة أكبر من الحد المسموح.", size: compressed.byteLength }, 413);
  }

  const day = startedAt.slice(0, 10);
  const path = `${FOLDER}/${day}.json.gz`;

  const { error: uploadError } = await admin.storage.from(BUCKET).upload(path, compressed, {
    contentType: "application/gzip",
    upsert: true,
  });

  if (uploadError) {
    await admin.from("backup_runs").insert({
      status: "failed",
      object_path: path,
      size_bytes: compressed.byteLength,
      error: uploadError.message,
    });
    return json({ error: "تعذّر حفظ النسخة." }, 502);
  }

  // الاحتفاظ بآخر 8 نسخ فقط.
  const { data: files } = await admin.storage.from(BUCKET).list(FOLDER, {
    limit: 100,
    sortBy: { column: "created_at", order: "desc" },
  });

  const old = (files ?? []).slice(KEEP);
  for (const f of old) {
    await admin.storage.from(BUCKET).remove([`${FOLDER}/${f.name}`]);
  }

  await admin.from("backup_runs").insert({
    status: "success",
    object_path: path,
    size_bytes: compressed.byteLength,
    tables_count: Object.keys(snapshot as Record<string, unknown>).length - 2,
    finished_at: new Date().toISOString(),
  });

  return json({ ok: true, path, size: compressed.byteLength, removed: old.length });
});
