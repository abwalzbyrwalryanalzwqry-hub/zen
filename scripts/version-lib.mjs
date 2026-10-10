/**
 * سياسة الإصدار (المرحلة 6.8): رقم الإصدار مصدره الوحيد أول عنوان في CHANGELOG.md
 * («… — الإصدار X.Y.Z»)، ويُكتب منه في package.json وandroid/app/build.gradle.
 * versionCode يُمرَّر من CI (`VERSION_CODE`) أو يبقى كما هو في build.gradle.
 */

const SEMVER = /الإصدار\s+(\d+\.\d+\.\d+)/;

/** أول رقم إصدار يظهر في عناوين CHANGELOG (الأحدث في الأعلى). */
export function changelogVersion(md) {
  for (const line of md.split("\n")) {
    if (!line.startsWith("## ")) continue;
    const m = line.match(SEMVER);
    if (m) return m[1];
  }
  return null;
}

export function gradleVersion(gradle) {
  const name = gradle.match(/versionName\s+"([^"]+)"/)?.[1] ?? null;
  const code = Number(gradle.match(/versionCode\s+(\d+)/)?.[1] ?? NaN);
  return { name, code: Number.isFinite(code) ? code : null };
}

export function setGradleVersion(gradle, name, code) {
  let out = gradle.replace(/versionName\s+"[^"]+"/, `versionName "${name}"`);
  if (code != null) out = out.replace(/versionCode\s+\d+/, `versionCode ${code}`);
  return out;
}

/** يرفض versionCode غير صحيح أو أصغر من الحالي (Google Play لا يقبل التراجع). */
export function resolveVersionCode(current, override) {
  if (override == null || override === "") return current;
  const n = Number(override);
  if (!Number.isInteger(n) || n < 1 || n > 2_100_000_000) {
    throw new Error(`VERSION_CODE غير صالح: ${override}`);
  }
  if (current != null && n < current) {
    throw new Error(`VERSION_CODE (${n}) أصغر من الحالي (${current})`);
  }
  return n;
}

/** قائمة عدم التطابق بين المصادر الثلاثة. فارغة ⇒ متطابقة. */
export function versionMismatches({ changelog, pkg, gradle }) {
  const issues = [];
  if (!changelog) issues.push("لا رقم إصدار في أول عناوين CHANGELOG.md");
  if (pkg !== changelog) issues.push(`package.json: ${pkg ?? "—"} ≠ CHANGELOG: ${changelog}`);
  if (gradle !== changelog) issues.push(`build.gradle: ${gradle ?? "—"} ≠ CHANGELOG: ${changelog}`);
  return issues;
}
