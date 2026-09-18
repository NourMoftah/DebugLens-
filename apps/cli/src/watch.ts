import { watch, type FSWatcher } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

export interface WatchProjectOptions {
  debounceMs: number;
  ignoredDirectories: readonly string[];
  projectRoot: string;
}

async function directories(root: string, ignored: ReadonlySet<string>): Promise<string[]> {
  const result = [root];
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (entry.isDirectory() && !ignored.has(entry.name))
      result.push(...(await directories(join(root, entry.name), ignored)));
  }
  return result;
}

/** Watches project directories with debounce and an explicit close operation. */
export async function watchProject(
  options: WatchProjectOptions,
  onChange: (filePath: string) => void,
): Promise<{ close(): void }> {
  const ignored = new Set(options.ignoredDirectories);
  const watchers: FSWatcher[] = [];
  // Keeps watch mode alive even when the operating system temporarily refuses a watch handle.
  const keepAlive = setInterval(() => undefined, 60_000);
  let timer: NodeJS.Timeout | undefined;
  const emit = (directory: string, filename: string | Buffer | null) => {
    const name = filename?.toString() ?? '';
    if (name.split(/[\\/]/u).some((part) => ignored.has(part))) return;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => onChange(join(directory, name)), options.debounceMs);
  };
  for (const directory of await directories(options.projectRoot, ignored)) {
    if ((await stat(directory).catch(() => undefined))?.isDirectory()) {
      try {
        const watcher = watch(directory, (_event, filename) => emit(directory, filename));
        watcher.on('error', () => watcher.close());
        watchers.push(watcher);
      } catch {
        // A temporarily unavailable directory should not make watch mode crash.
      }
    }
  }
  return {
    close: () => {
      if (timer !== undefined) clearTimeout(timer);
      clearInterval(keepAlive);
      watchers.forEach((watcher) => watcher.close());
    },
  };
}
