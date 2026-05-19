import { describe, it, expect } from 'vitest';
import {
  runMigrations,
  NewerFileFormatError,
  MissingMigrationError,
  type Migration,
  type MigratableBundle,
} from '../migrations';

function makeBundle(version: number, doc: Record<string, unknown> = {}): MigratableBundle {
  return {
    manifest: {
      formatVersion: version,
      appVersion: 'test',
      createdAt: 'x',
      updatedAt: 'x',
      fileId: 'x',
    },
    document: doc,
    capabilityMap: {},
  };
}

describe('runMigrations', () => {
  it('runs a v0 → v1 migration that reshapes the document', () => {
    const fakeMigration: Migration = {
      from: 0,
      to: 1,
      migrate: (bundle) => ({
        ...bundle,
        manifest: { ...bundle.manifest, formatVersion: 1 },
        document: { ...(bundle.document as object), migrated: true },
      }),
    };
    const out = runMigrations(makeBundle(0, { original: true }), 1, [fakeMigration]);
    expect(out.manifest.formatVersion).toBe(1);
    expect(out.document).toEqual({ original: true, migrated: true });
  });

  it('chains multiple migrations sequentially', () => {
    const m01: Migration = {
      from: 0,
      to: 1,
      migrate: (b) => ({
        ...b,
        manifest: { ...b.manifest, formatVersion: 1 },
        document: { ...(b.document as object), step1: true },
      }),
    };
    const m12: Migration = {
      from: 1,
      to: 2,
      migrate: (b) => ({
        ...b,
        manifest: { ...b.manifest, formatVersion: 2 },
        document: { ...(b.document as object), step2: true },
      }),
    };
    const out = runMigrations(makeBundle(0), 2, [m01, m12]);
    expect(out.manifest.formatVersion).toBe(2);
    expect(out.document).toEqual({ step1: true, step2: true });
  });

  it('throws NewerFileFormatError when the file is too new', () => {
    expect(() => runMigrations(makeBundle(5), 1, [])).toThrow(NewerFileFormatError);
  });

  it('throws MissingMigrationError when a step is not registered', () => {
    expect(() => runMigrations(makeBundle(0), 2, [])).toThrow(MissingMigrationError);
  });

  it('is a no-op when versions already match', () => {
    const bundle = makeBundle(1, { keep: true });
    const out = runMigrations(bundle, 1, []);
    expect(out).toBe(bundle);
  });
});
