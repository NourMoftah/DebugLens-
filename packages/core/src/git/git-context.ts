import { spawn } from 'node:child_process';
import { isAbsolute, relative, resolve } from 'node:path';

import type { GitCommit, GitContext, GitContextOptions } from './types.js';

interface GitCommandResult {
  exitCode: number | null;
  stderr: string;
  stdout: string;
}

function runGit(cwd: string, argumentsList: readonly string[]): Promise<GitCommandResult> {
  return new Promise((resolveCommand) => {
    const child = spawn('git', ['-C', cwd, ...argumentsList], { shell: false });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.once('error', (error: Error) => {
      resolveCommand({ exitCode: null, stderr: error.message, stdout });
    });
    child.once('close', (exitCode) => {
      resolveCommand({ exitCode, stderr, stdout });
    });
  });
}

function isWithinRepository(repositoryRoot: string, filePath: string): boolean {
  const pathFromRoot = relative(repositoryRoot, filePath);
  return pathFromRoot === '' || (!pathFromRoot.startsWith('..') && !isAbsolute(pathFromRoot));
}

function parseCommits(output: string): GitCommit[] {
  return output
    .split('\u001e')
    .map((record) => record.trim())
    .filter((record) => record !== '')
    .flatMap((record): GitCommit[] => {
      const [metadata, ...changedFiles] = record.split(/\r?\n/);
      if (metadata === undefined) {
        return [];
      }

      const [hash, message, author, date] = metadata.split('\u001f');
      if (
        hash === undefined ||
        message === undefined ||
        author === undefined ||
        date === undefined
      ) {
        return [];
      }

      return [
        { author, changedFiles: changedFiles.filter((file) => file !== ''), date, hash, message },
      ];
    });
}

function normalizedMaxCommits(value: number | undefined): number {
  if (value === undefined) {
    return 10;
  }

  return Number.isSafeInteger(value) && value > 0 ? Math.min(value, 100) : 10;
}

/** Collects repository metadata and recent commits using fixed Git arguments only. */
export async function getGitContext(options: GitContextOptions): Promise<GitContext> {
  const projectRoot = resolve(options.projectRoot);
  const rootResult = await runGit(projectRoot, ['rev-parse', '--show-toplevel']);
  if (rootResult.exitCode !== 0) {
    return {
      commits: [],
      error: {
        code: 'not-a-git-repository',
        message: rootResult.stderr.trim() || 'Git repository not found.',
      },
      status: 'unavailable',
    };
  }

  const repositoryRoot = rootResult.stdout.trim();
  if (repositoryRoot === '') {
    return {
      commits: [],
      error: { code: 'git-root-unavailable', message: 'Git did not return a repository root.' },
      status: 'unavailable',
    };
  }

  const branchResult = await runGit(repositoryRoot, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  const branch = branchResult.exitCode === 0 ? branchResult.stdout.trim() : undefined;
  let relativeFilePath: string | undefined;

  if (options.filePath !== undefined) {
    const resolvedFilePath = resolve(repositoryRoot, options.filePath);
    if (!isWithinRepository(repositoryRoot, resolvedFilePath)) {
      return {
        ...(branch === undefined || branch === '' ? {} : { branch }),
        commits: [],
        error: {
          code: 'outside-repository',
          message: 'The requested file is outside the Git repository.',
        },
        repositoryRoot,
        status: 'available',
      };
    }
    relativeFilePath = relative(repositoryRoot, resolvedFilePath);
  }

  const logArguments = [
    'log',
    `--max-count=${normalizedMaxCommits(options.maxCommits)}`,
    '--format=%x1e%H%x1f%s%x1f%an%x1f%aI',
    '--name-only',
    ...(relativeFilePath === undefined ? [] : ['--', relativeFilePath]),
  ];
  const logResult = await runGit(repositoryRoot, logArguments);
  if (logResult.exitCode !== 0) {
    return {
      ...(branch === undefined || branch === '' ? {} : { branch }),
      commits: [],
      error: {
        code: 'git-log-failed',
        message: logResult.stderr.trim() || 'Git history could not be read.',
      },
      repositoryRoot,
      status: 'available',
    };
  }

  return {
    ...(branch === undefined || branch === '' ? {} : { branch }),
    commits: parseCommits(logResult.stdout),
    repositoryRoot,
    status: 'available',
  };
}
