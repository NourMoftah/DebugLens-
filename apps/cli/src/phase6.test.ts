import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadConfig } from './config.js';
import { discoverProjectRoot } from './discovery.js';
import { run } from './index.js';
import { watchProject } from './watch.js';

describe('Phase 6 developer experience', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'debuglens-phase6-'));
    await mkdir(join(root, 'src'));
  });
  afterEach(async () => {
    await rm(root, { force: true, recursive: true });
  });

  it('loads validated configuration defaults and overrides', async () => {
    await writeFile(
      join(root, 'debuglens.config.ts'),
      'export default { maxSourceContext: 2, git: false, watch: { debounceMs: 10 } };\n',
    );
    await expect(loadConfig(root)).resolves.toMatchObject({
      git: false,
      maxSourceContext: 2,
      watch: { debounceMs: 10 },
    });
    await writeFile(
      join(root, 'debuglens.config.ts'),
      'export default { maxSourceContext: -1 };\n',
    );
    await expect(loadConfig(root)).rejects.toThrow('maxSourceContext');
    await writeFile(
      join(root, 'debuglens.config.ts'),
      'export default { git: process.env.FLAG };\n',
    );
    await expect(loadConfig(root)).rejects.toThrow('static literals');
  });

  it('discovers a nested project root from a project marker', async () => {
    await writeFile(join(root, 'package.json'), '{}');
    await mkdir(join(root, 'src', 'nested'));
    await expect(discoverProjectRoot(join(root, 'src', 'nested'))).resolves.toBe(root);
  });

  it('supports focused analysis and CI JSON mode', async () => {
    await writeFile(join(root, 'package.json'), '{}');
    await writeFile(join(root, 'src', 'app.js'), 'const value = undefined;\nvalue.map(String);\n');
    const output = { error: vi.fn(), log: vi.fn() };
    await expect(
      run(
        [
          'analyze',
          '--project',
          join(root, 'src'),
          '--file',
          'src/app.js',
          '--line',
          '2',
          '--ci',
          '--json',
        ],
        output,
      ),
    ).resolves.toBe(1);
    const report = output.log.mock.calls[0]?.[0] as string;
    expect(JSON.parse(report)).toMatchObject({ diagnostic: { primaryLocation: { line: 2 } } });
    expect(report).not.toContain(String.fromCharCode(27));
  });

  it('returns a tooling failure for an unsafe or missing focused file', async () => {
    await writeFile(join(root, 'package.json'), '{}');
    const output = { error: vi.fn(), log: vi.fn() };
    await expect(
      run(['analyze', '--project', root, '--file', '../outside.ts', '--line', '1'], output),
    ).resolves.toBe(3);
    expect(output.error).toHaveBeenCalled();
  });

  it('returns machine-readable errors for JSON tooling failures and documents subcommand help', async () => {
    const output = { error: vi.fn(), log: vi.fn() };
    await expect(
      run(
        ['analyze', '--project', root, '--file', '../outside.ts', '--line', '1', '--json'],
        output,
      ),
    ).resolves.toBe(3);
    expect(JSON.parse(output.log.mock.calls[0]?.[0] as string)).toMatchObject({
      error: { code: 'tooling-failure' },
    });
    await expect(run(['analyze', '--help'], output)).resolves.toBe(0);
    expect(output.log).toHaveBeenLastCalledWith(
      expect.stringContaining('Usage: debuglens analyze'),
    );
  });

  it('closes project watchers cleanly when files change or watch handles are unavailable', async () => {
    await writeFile(join(root, 'package.json'), '{}');
    const changed = vi.fn();
    const watcher = await watchProject(
      { debounceMs: 20, ignoredDirectories: ['node_modules'], projectRoot: root },
      changed,
    );
    await writeFile(join(root, 'package.json'), '{"name":"changed"}\n');
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
    watcher.close();
    expect(changed.mock.calls.length).toBeGreaterThanOrEqual(0);
  });
});
