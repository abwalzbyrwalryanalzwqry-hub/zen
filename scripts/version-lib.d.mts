export function changelogVersion(md: string): string | null;
export function gradleVersion(gradle: string): { name: string | null; code: number | null };
export function setGradleVersion(gradle: string, name: string, code: number | null): string;
export function resolveVersionCode(
  current: number | null,
  override: string | undefined,
): number | null;
export function versionMismatches(v: {
  changelog: string | null;
  pkg: string | null | undefined;
  gradle: string | null;
}): string[];
