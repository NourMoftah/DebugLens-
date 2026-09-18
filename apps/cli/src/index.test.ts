import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { run } from './index.js';

describe('DebugLens CLI', () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'debuglens-cli-'));
  });

  afterEach(async () => {
    await rm(projectRoot, { force: true, recursive: true });
  });

  it('prints its version', async () => {
    const output = { error: vi.fn(), log: vi.fn() };

    await expect(run(['--version'], output)).resolves.toBe(0);
    expect(output.log).toHaveBeenCalledWith('0.1.0');
    expect(output.error).not.toHaveBeenCalled();
  });

  it('shows help', async () => {
    const output = { error: vi.fn(), log: vi.fn() };

    await expect(run(['--help'], output)).resolves.toBe(0);
    expect(output.log).toHaveBeenCalledWith(expect.stringContaining('Usage:'));
  });

  it('reports a valid analysis in terminal format with diagnostic-found status', async () => {
    await writeFile(join(projectRoot, 'app.js'), 'const items = undefined;\nitems.map(String);\n');
    const output = { error: vi.fn(), log: vi.fn() };

    await expect(
      run(
        [
          'analyze',
          '--project',
          projectRoot,
          '--error',
          `TypeError: Cannot read properties of undefined (reading 'map')\n    at main (${join(projectRoot, 'app.js')}:2:7)`,
        ],
        output,
      ),
    ).resolves.toBe(1);

    expect(output.log).toHaveBeenCalledWith(expect.stringContaining('DebugLens Diagnostic Report'));
    expect(output.log).toHaveBeenCalledWith(expect.stringContaining('unsafe-property-access'));
  });

  it('prints stable JSON without ANSI formatting', async () => {
    const output = { error: vi.fn(), log: vi.fn() };

    await expect(
      run(['analyze', '--project', projectRoot, '--error', 'Error: unknown', '--json'], output),
    ).resolves.toBe(0);

    const report = output.log.mock.calls[0]?.[0] as string;
    expect(JSON.parse(report)).toMatchObject({
      analysis: { rootCause: { kind: 'insufficient-evidence' } },
      diagnostic: { error: { message: 'unknown', name: 'Error' } },
    });
    expect(report).not.toContain(String.fromCharCode(27));
  });

  it('rejects invalid and missing analysis input predictably', async () => {
    const output = { error: vi.fn(), log: vi.fn() };

    await expect(run(['analyze'], output)).resolves.toBe(2);
    await expect(run(['analyze', '--error', 'Error: failed', '--unknown'], output)).resolves.toBe(
      2,
    );
    expect(output.error).toHaveBeenCalledWith(expect.stringContaining('Provide exactly one'));
  });

  it('handles missing source files and non-Git JavaScript projects without crashing', async () => {
    const output = { error: vi.fn(), log: vi.fn() };

    await expect(
      run(
        [
          'analyze',
          '--project',
          projectRoot,
          '--error',
          'Error: failed\n    at run (missing.js:2:1)',
        ],
        output,
      ),
    ).resolves.toBe(1);
    expect(output.log).toHaveBeenCalledWith(expect.stringContaining('Git: unavailable'));
  });

  it('collects TypeScript project context through the CLI', async () => {
    await writeFile(join(projectRoot, 'app.ts'), 'const value: string = 1;\n');
    await writeFile(join(projectRoot, 'tsconfig.json'), JSON.stringify({ include: ['app.ts'] }));
    const output = { error: vi.fn(), log: vi.fn() };

    await expect(
      run(
        [
          'analyze',
          '--project',
          projectRoot,
          '--error',
          `Error: failed\n    at run (app.ts:1:1)`,
          '--json',
        ],
        output,
      ),
    ).resolves.toBe(1);
    const report = JSON.parse(output.log.mock.calls[0]?.[0] as string) as {
      projectContext: { typescript: { status: string } };
    };
    expect(report.projectContext.typescript.status).toBe('available');
  });

  it('reads diagnostic input from a project-local error file and rejects traversal', async () => {
    await writeFile(join(projectRoot, 'error.log'), 'Error: unknown');
    const output = { error: vi.fn(), log: vi.fn() };

    await expect(
      run(['analyze', '--project', projectRoot, '--error-file', 'error.log'], output),
    ).resolves.toBe(0);
    await expect(
      run(['analyze', '--project', projectRoot, '--error-file', '../error.log'], output),
    ).resolves.toBe(3);
    expect(output.error).toHaveBeenCalledWith(expect.stringContaining('inside the project root'));
  });
});
