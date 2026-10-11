-- نسخ احتياطي مجاني وموفّر للمساحة: أسبوعي، للجداول النصية الحرجة فقط، بلا وسائط.
-- Bucket خاص db-backups، وحد أقصى 100MB لكل نسخة، والاحتفاظ بآخر 8 نسخ.

insert into storage.buckets (id, name, public)
values ('db-backups', 'db-backups', false)
on conflict (id) do nothing;

create table if not exists private.backup_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null,
  object_path text,
  size_bytes bigint,
  tables_count integer,
  error text
);

revoke all on private.backup_runs from anon, authenticated;

-- لقطة JSON لجداول public، مع استثناء السجلات التشغيلية الكبيرة وحد 100 ألف صف للجدول.
create or replace function public.create_backup_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
  rows jsonb;
  result jsonb;
begin
  result := jsonb_build_object('generated_at', now(), 'schema', 'public');

  for t in
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_type = 'BASE TABLE'
      and table_name not in (
        'client_errors', 'usage_daily', 'auth_rate_events', 'push_outbox',
        'error_alert_runs', 'certificate_public_attempts', 'certificate_verify_attempts',
        'attendance_checkin_attempts', 'center_code_failures', 'teacher_code_attempts',
        'guardian_claim_failures'
      )
  loop
    execute format(
      'select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb)
         from (select * from public.%I limit 100000) x',
      t.table_name
    ) into rows;
    result := jsonb_set(result, array[t.table_name], rows);
  end loop;

  return result;
end;
$$;

revoke all on function public.create_backup_snapshot() from public, anon, authenticated;
grant execute on function public.create_backup_snapshot() to service_role;

-- الاستدعاء الأسبوعي لدالة Edge عبر pg_net، بالسر من Vault (نفس سر الصيانة).
create or replace function public.backup_tick()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  _secret text;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    return 'no_pg_net';
  end if;

  begin
    execute $q$
      select decrypted_secret from vault.decrypted_secrets where name = 'zen_maintenance_secret'
    $q$ into _secret;
  exception when undefined_table or invalid_schema_name then
    return 'not_configured';
  end;

  if _secret is null then
    return 'not_configured';
  end if;

  execute 'select net.http_post(
    url := $1,
    headers := $2,
    body := $3,
    timeout_milliseconds := 60000
  )'
  using
    'https://iniqospdljdlcfmwxafl.supabase.co/functions/v1/zen-backup',
    jsonb_build_object('Authorization', 'Bearer ' || _secret, 'Content-Type', 'application/json'),
    jsonb_build_object('trigger', 'cron');

  return 'queued';
end;
$$;

revoke all on function public.backup_tick() from public, anon, authenticated;
grant execute on function public.backup_tick() to service_role;

-- نسخة أسبوعية: السبت 03:17 UTC.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('zen-db-backup', '17 3 * * 6', 'select public.backup_tick()');
  end if;
end;
$$;
