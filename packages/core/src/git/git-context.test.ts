import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getGitContext } from './git-context.js';

const executeFile = promisify(execFile);

describe('getGitContext', () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'debuglens-git-'));
  });

  afterEach(async () => {
    await rm(projectRoot, { force: true, recursive: true });
  });

  async function createRepository(): Promise<void> {
    await executeFile('git', ['init', '--quiet'], { cwd: projectRoot });
    await executeFile('git', ['config', 'user.email', 'debuglens@example.test'], {
      cwd: projectRoot,
    });
    await executeFile('git', ['config', 'user.name', 'DebugLens Test'], { cwd: projectRoot });
    await mkdir(join(projectRoot, 'src'));
    await writeFile(join(projectRoot, 'src', 'app.ts'), 'export const value = 1;\n');
    await executeFile('git', ['add', 'src/app.ts'], { cwd: projectRoot });
    await executeFile('git', ['commit', '--quiet', '-m', 'Add app source'], { cwd: projectRoot });
  }

  it('collects a repository root, branch, and commits affecting a file', async () => {
    await createRepository();

    const context = await getGitContext({ filePath: 'src/app.ts', projectRoot });

    expect(context).toMatchObject({
      repositoryRoot: await realpath(projectRoot),
      status: 'available',
    });
    expect(context.branch).toBeTruthy();
    expect(context.commits).toEqual([
      expect.objectContaining({
        author: 'DebugLens Test',
        changedFiles: ['src/app.ts'],
        message: 'Add app source',
      }),
    ]);
  });

  it('returns structured unavailable context for non-Git directories', async () => {
    await expect(getGitContext({ projectRoot })).resolves.toMatchObject({
      commits: [],
      error: { code: 'not-a-git-repository' },
      status: 'unavailable',
    });
  });

  it('handles files with no history and paths outside the repository safely', async () => {
    await createRepository();

    await expect(getGitContext({ filePath: 'src/missing.ts', projectRoot })).resolves.toMatchObject(
      {
        commits: [],
        status: 'available',
      },
    );
    await expect(
      getGitContext({ filePath: '../../outside.ts', projectRoot }),
    ).resolves.toMatchObject({
      commits: [],
      error: { code: 'outside-repository' },
      status: 'available',
    });
  });

  it('returns structured failure when Git cannot use the supplied project path', async () => {
    await expect(
      getGitContext({ projectRoot: join(projectRoot, 'missing') }),
    ).resolves.toMatchObject({
      commits: [],
      status: 'unavailable',
    });
  });
});
