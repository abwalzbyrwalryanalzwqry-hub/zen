#!/usr/bin/env bash
# تجربة الاستعادة الشهرية (تدقيق 2026-10، المرحلة 0.2). تُشغَّل على جهاز المالك لأن المفتاح الخاص لا
# يدخل GitHub أبداً. تنزّل آخر نسخة، تتحقق من بصمتها، تفكّ تشفيرها، وتستعيدها إلى قاعدة **فارغة**
# (Staging أو Postgres محلي)، ثم تطبع أعداداً للتحقق وتكتب محضراً في $DRILL_DIR (افتراضياً ../zen-ops/restore-drills).
# النسخ في مستودع التشغيل الخاص (OPS_REPO)، والمحاضر هناك أيضاً: لا تدخل المستودع العام.
#
#   ZEN_BACKUP_KEY=~/zen-backup.key TARGET_DB_URL=postgres://... scripts/restore-drill.sh [run-id]
#
# المتطلبات: gh (مسجَّل الدخول)، age، pg_restore و psql (17)، sha256sum.
set -euo pipefail

: "${ZEN_BACKUP_KEY:?ضع مسار المفتاح الخاص في ZEN_BACKUP_KEY}"
: "${TARGET_DB_URL:?ضع رابط قاعدة فارغة في TARGET_DB_URL (لا الإنتاج)}"
case "$TARGET_DB_URL" in
  *iniqospdljdlcfmwxafl*) echo "⛔ هذا رابط الإنتاج. الاستعادة إلى قاعدة فارغة فقط." >&2; exit 1 ;;
esac
for bin in gh age pg_restore psql sha256sum; do
  command -v "$bin" >/dev/null || { echo "⛔ يلزم $bin" >&2; exit 1; }
done

OPS_REPO="${OPS_REPO:-abwalzbyrwalryanalzwqry-hub/zen-ops}"
DRILL_DIR="${DRILL_DIR:-../zen-ops/restore-drills}"
RUN_ID="${1:-$(gh run list --repo "$OPS_REPO" --workflow db-backup.yml --status success --limit 20 --json databaseId,conclusion \
  --jq '.[0].databaseId')}"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
echo "⬇️  تنزيل نسخة التشغيل $RUN_ID"
# بديل عند فشل gh run download (بوابات/وكلاء لا تتبع تحويل رابط التخزين): تنزيل zip المرفق عبر API.
if ! gh run download --repo "$OPS_REPO" "$RUN_ID" -D "$WORK" 2>/dev/null; then
  command -v unzip >/dev/null || { echo "⛔ يلزم unzip للتنزيل البديل" >&2; exit 1; }
  REPO="$OPS_REPO"
  for ART in $(gh api "repos/$REPO/actions/runs/$RUN_ID/artifacts" --jq '.artifacts[].id'); do
    gh api "repos/$REPO/actions/artifacts/$ART/zip" > "$WORK/$ART.zip"
    unzip -q "$WORK/$ART.zip" -d "$WORK/$ART"
  done
fi
DIR=$(find "$WORK" -name SHA256SUMS -printf '%h\n' | head -1)
[ -n "$DIR" ] || { echo "⛔ لا مرفق نسخة في التشغيل $RUN_ID (هل الإعداد مضبوط؟)" >&2; exit 1; }
(cd "$DIR" && sha256sum -c SHA256SUMS)
ENC=$(ls "$DIR"/*.dump.age)
age -d -i "$ZEN_BACKUP_KEY" "$ENC" > "$WORK/zen.dump"
pg_restore --list "$WORK/zen.dump" > "$WORK/toc.txt"
TABLES=$(grep -c " TABLE DATA public " "$WORK/toc.txt" || true)
echo "📦 جداول public في النسخة: $TABLES"

# الهدف Supabase (Staging) يملك auth والأدوار أصلاً؛ Postgres محلي فارغ لا يملكها، فنهيّئ الأدوار ونستعيد
# auth من النسخة نفسها (دونه تسقط المفاتيح الأجنبية إلى auth.users ودوال auth.uid()).
SCHEMAS=(--schema=private --schema=public)
if [ "$(psql "$TARGET_DB_URL" -At -c "select count(*) from pg_namespace where nspname = 'auth'")" = "0" ]; then
  echo "ℹ️  هدف Postgres عادي: تهيئة أدوار Supabase واستعادة auth أيضاً"
  psql "$TARGET_DB_URL" -q -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN
  CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA auth;
CREATE SCHEMA IF NOT EXISTS extensions;
SQL
  SCHEMAS=(--schema=auth "${SCHEMAS[@]}")
fi
# pg_restore --schema لا يُنشئ المخطط نفسه.
psql "$TARGET_DB_URL" -q -c "CREATE SCHEMA IF NOT EXISTS private"

RESTORE_LOG="$WORK/restore.log"
pg_restore --dbname "$TARGET_DB_URL" --no-owner --no-privileges "${SCHEMAS[@]}" --clean --if-exists \
  "$WORK/zen.dump" 2> "$RESTORE_LOG" || echo "⚠️ تحذيرات pg_restore — راجع الأخطاء والأعداد أدناه"
# «does not exist» الناتجة عن --clean في قاعدة فارغة مُتجاهَلة مع --if-exists؛ ما يبقى أخطاء حقيقية.
ERRORS=$(grep -c "ERROR:" "$RESTORE_LOG" || true)
TOP_ERRORS=$(grep "ERROR:" "$RESTORE_LOG" | sed 's/.*ERROR: *//' | cut -c1-100 | sort | uniq -c | sort -rn | head -5 || true)

count() { psql "$TARGET_DB_URL" -At -c "select count(*) from public.$1" 2>/dev/null || echo "?"; }
STAMP=$(date -u +%Y%m%d-%H%M)
mkdir -p "$DRILL_DIR"
OUT="$DRILL_DIR/restore-drill-$STAMP.md"
{
  echo "# محضر تجربة استعادة — $STAMP"
  echo
  echo "- التشغيل: $RUN_ID · الملف: $(basename "$ENC")"
  echo "- جداول public في النسخة: $TABLES"
  echo "- المخططات المستعادة: ${SCHEMAS[*]}"
  echo "- جداول public بعد الاستعادة: $(psql "$TARGET_DB_URL" -At -c "select count(*) from pg_tables where schemaname = 'public'")"
  echo "- سياسات RLS بعد الاستعادة: $(psql "$TARGET_DB_URL" -At -c "select count(*) from pg_policies where schemaname = 'public'")"
  echo "- أخطاء pg_restore: $ERRORS"
  [ -n "$TOP_ERRORS" ] && { echo; echo '```'; echo "$TOP_ERRORS"; echo '```'; }
  echo
  echo "| الجدول | الصفوف |"
  echo "| --- | --- |"
  for t in profiles user_roles centers halaqat halaqa_students progress recitation_sessions attendance; do
    echo "| $t | $(count "$t") |"
  done
} | tee "$OUT"
echo "✅ انتهت التجربة. أرفق $OUT بسجل الصيانة (docs/BACKUP.md ← سجل التجارب)."
