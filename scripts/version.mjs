#!/usr/bin/env node
/**
 * node scripts/version.mjs           يكتب رقم إصدار CHANGELOG في package.json وbuild.gradle
 * node scripts/version.mjs --check   يفشل إن اختلفت المصادر الثلاثة (يُشغَّل في CI)
 * VERSION_CODE=123 node scripts/version.mjs   يضبط versionCode أيضاً (CI عند الإصدار)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  changelogVersion,
  gradleVersion,
  resolveVersionCode,
  setGradleVersion,
  versionMismatches,
} from "./version-lib.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const paths = {
  changelog: join(ROOT, "CHANGELOG.md"),
  pkg: join(ROOT, "package.json"),
  gradle: join(ROOT, "android/app/build.gradle"),
  lock: join(ROOT, "package-lock.json"),
};

const changelog = changelogVersion(readFileSync(paths.changelog, "utf8"));
const pkgText = readFileSync(paths.pkg, "utf8");
const pkg = JSON.parse(pkgText);
const gradleText = readFileSync(paths.gradle, "utf8");
const gradle = gradleVersion(gradleText);

if (process.argv.includes("--check")) {
  const issues = versionMismatches({ changelog, pkg: pkg.version, gradle: gradle.name });
  if (issues.length) {
    console.error(
      "أرقام الإصدار غير متطابقة. شغّل: node scripts/version.mjs\n- " + issues.join("\n- "),
    );
    process.exit(1);
  }
  console.log(`الإصدار ${changelog} (versionCode ${gradle.code}) متطابق.`);
  process.exit(0);
}

if (!changelog) throw new Error("لا رقم إصدار في CHANGELOG.md");
const code = resolveVersionCode(gradle.code, process.env.VERSION_CODE);

if (pkg.version !== changelog) {
  // يُحافظ على ترتيب الحقول: version بعد name مباشرة.
  const { name, version: _old, ...rest } = pkg;
  writeFileSync(paths.pkg, JSON.stringify({ name, version: changelog, ...rest }, null, 2) + "\n");
}
// package-lock.json: الحقلان في الجذر وفي packages[""].
const lockText = readFileSync(paths.lock, "utf8");
const lock = JSON.parse(lockText);
if (lock.version !== changelog || lock.packages?.[""]?.version !== changelog) {
  lock.version = changelog;
  if (lock.packages?.[""]) lock.packages[""].version = changelog;
  writeFileSync(paths.lock, JSON.stringify(lock, null, 2) + "\n");
}
writeFileSync(paths.gradle, setGradleVersion(gradleText, changelog, code));
console.log(`الإصدار ${changelog} · versionCode ${code}`);
