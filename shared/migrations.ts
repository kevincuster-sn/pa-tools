import { PAMAP_FORMAT_VERSION } from './file-format';

// A migration takes a parsed bundle at version N and returns a bundle at N+1.
// `bundle` is intentionally typed as `unknown` — migrations are responsible
// for shaping the object before the next migration runs.
export interface Migration {
  from: number;
  to: number;
  migrate: (bundle: MigratableBundle) => MigratableBundle;
}

export interface MigratableBundle {
  manifest: { formatVersion: number; [k: string]: unknown };
  document: unknown;
  capabilityMap: unknown;
  // forward-compat for future entries
  [k: string]: unknown;
}

export class NewerFileFormatError extends Error {
  readonly fileVersion: number;
  readonly appVersion: number;
  constructor(fileVersion: number, appVersion: number) {
    super(
      `This file was created with a newer version of PA Workbench ` +
        `(file format v${fileVersion}, this build supports up to v${appVersion}).`,
    );
    this.name = 'NewerFileFormatError';
    this.fileVersion = fileVersion;
    this.appVersion = appVersion;
  }
}

export class MissingMigrationError extends Error {
  constructor(from: number, to: number) {
    super(`No migration registered to upgrade from v${from} to v${to}.`);
    this.name = 'MissingMigrationError';
  }
}

// Identity migration from v1 → v2; plumbing only.
const v1ToV2: Migration = {
  from: 1,
  to: 2,
  migrate: (bundle) => ({ ...bundle, manifest: { ...bundle.manifest, formatVersion: 2 } }),
};

export const MIGRATIONS: Migration[] = [
  // v1ToV2 is wired in but only takes effect once the supported version moves to 2.
  v1ToV2,
];

export function runMigrations(
  bundle: MigratableBundle,
  target: number = PAMAP_FORMAT_VERSION,
  migrations: Migration[] = MIGRATIONS,
): MigratableBundle {
  const sourceVersion = bundle.manifest.formatVersion;

  if (sourceVersion > target) {
    throw new NewerFileFormatError(sourceVersion, target);
  }

  let current = bundle;
  while (current.manifest.formatVersion < target) {
    const from = current.manifest.formatVersion;
    const step = migrations.find((m) => m.from === from);
    if (!step) {
      throw new MissingMigrationError(from, from + 1);
    }
    current = step.migrate(current);
    if (current.manifest.formatVersion <= from) {
      throw new Error(
        `Migration from v${from} did not advance formatVersion (got v${current.manifest.formatVersion}).`,
      );
    }
  }
  return current;
}
