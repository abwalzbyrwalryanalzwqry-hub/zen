export function migrationDrift(
  files: string[],
  deployed: string[],
): { local: number; remote: number; notDeployed: string[]; unknownRemote: string[] };
