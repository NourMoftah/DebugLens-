import { access, stat } from 'node:fs/promises';
import { dirname, join, parse, resolve } from 'node:path';

const projectMarkers = ['debuglens.config.ts', 'package.json', 'tsconfig.json'];

async function hasMarker(directory: string): Promise<boolean> {
  return Promise.all(
    projectMarkers.map(async (marker) =>
      access(join(directory, marker))
        .then(() => true)
        .catch(() => false),
    ),
  ).then((values) => values.some(Boolean));
}

/** Finds the nearest project marker without walking beyond the filesystem root. */
export async function discoverProjectRoot(startPath: string): Promise<string> {
  const resolved = resolve(startPath);
  let current = (await stat(resolved).catch(() => undefined))?.isDirectory()
    ? resolved
    : dirname(resolved);
  while (true) {
    if (await hasMarker(current)) return current;
    const parent = dirname(current);
    if (parent === current || current === parse(current).root) return resolved;
    current = parent;
  }
}
