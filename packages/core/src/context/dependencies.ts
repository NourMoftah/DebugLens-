import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import type { DependencyContext, DependencyInfo, DependencyType } from './types.js';

const dependencySections: readonly { key: DependencyType; packageKey: string }[] = [
  { key: 'dependency', packageKey: 'dependencies' },
  { key: 'devDependency', packageKey: 'devDependencies' },
  { key: 'optionalDependency', packageKey: 'optionalDependencies' },
  { key: 'peerDependency', packageKey: 'peerDependencies' },
];

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.values(value).every((item) => typeof item === 'string')
  );
}

/** Reads dependency declarations from the project's package.json without network access. */
export async function getDependencyContext(projectRoot: string): Promise<DependencyContext> {
  const packageJsonPath = join(resolve(projectRoot), 'package.json');

  try {
    const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8')) as unknown;
    if (typeof packageJson !== 'object' || packageJson === null) {
      return {
        dependencies: [],
        error: {
          code: 'invalid-package-json',
          message: 'package.json must contain a JSON object.',
        },
        packageJsonPath,
        status: 'parse-error',
      };
    }

    const dependencies = dependencySections.flatMap(({ key, packageKey }) => {
      const values = (packageJson as Record<string, unknown>)[packageKey];
      if (!isStringRecord(values)) {
        return [];
      }

      return Object.entries(values)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([name, version]): DependencyInfo => ({
          name,
          source: 'package.json',
          type: key,
          version,
        }));
    });

    return { dependencies, packageJsonPath, status: 'available' };
  } catch (error: unknown) {
    const isMissing = error instanceof Error && 'code' in error && error.code === 'ENOENT';
    const isSyntaxError = error instanceof SyntaxError;
    const message = error instanceof Error ? error.message : 'package.json could not be read.';

    return {
      dependencies: [],
      ...(isMissing
        ? { error: { code: 'package-json-not-found', message } }
        : {
            error: {
              code: isSyntaxError ? 'invalid-package-json' : 'package-json-unavailable',
              message,
            },
          }),
      packageJsonPath,
      status: isSyntaxError ? 'parse-error' : 'unavailable',
    };
  }
}
