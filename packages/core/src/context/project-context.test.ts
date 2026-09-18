import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  detectLanguage,
  getDependencyContext,
  getProjectContext,
  getSourceContext,
  getTypeScriptContext,
} from './index.js';

describe('project context collectors', () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'debuglens-context-'));
    await mkdir(join(projectRoot, 'src'));
  });

  afterEach(async () => {
    await rm(projectRoot, { force: true, recursive: true });
  });

  it('detects supported source languages', () => {
    expect(detectLanguage('component.tsx')).toBe('typescript');
    expect(detectLanguage('script.mjs')).toBe('javascript');
    expect(detectLanguage('notes.txt')).toBe('unknown');
  });

  it('returns a bounded source window around the target line', async () => {
    await writeFile(
      join(projectRoot, 'src', 'app.ts'),
      'one\ntwo\nthree\nfour\nfive\nsix\nseven\n',
    );

    const context = await getSourceContext({
      contextLines: 2,
      filePath: 'src/app.ts',
      line: 4,
      projectRoot,
    });

    expect(context).toMatchObject({
      endLine: 6,
      exists: true,
      isOutsideProject: false,
      language: 'typescript',
      startLine: 2,
      targetLine: 4,
    });
    expect(context.lines).toEqual([
      { content: 'two', number: 2 },
      { content: 'three', number: 3 },
      { content: 'four', number: 4 },
      { content: 'five', number: 5 },
      { content: 'six', number: 6 },
    ]);
  });

  it('clamps source windows at file boundaries and handles empty files', async () => {
    await writeFile(join(projectRoot, 'src', 'short.js'), 'first\nsecond\n');
    await writeFile(join(projectRoot, 'src', 'empty.ts'), '');

    await expect(
      getSourceContext({ contextLines: 5, filePath: 'src/short.js', line: 1, projectRoot }),
    ).resolves.toMatchObject({ endLine: 2, startLine: 1, targetLine: 1 });
    await expect(
      getSourceContext({ contextLines: 5, filePath: 'src/short.js', line: 2, projectRoot }),
    ).resolves.toMatchObject({ endLine: 2, startLine: 1, targetLine: 2 });
    await expect(
      getSourceContext({ filePath: 'src/empty.ts', line: 1, projectRoot }),
    ).resolves.toMatchObject({ error: { code: 'line-not-found' }, exists: true, lines: [] });
  });

  it('rejects oversized source files before reading their contents', async () => {
    await writeFile(join(projectRoot, 'src', 'large.js'), 'x'.repeat(5 * 1024 * 1024 + 1));

    await expect(
      getSourceContext({ filePath: 'src/large.js', line: 1, projectRoot }),
    ).resolves.toMatchObject({
      error: { code: 'file-too-large' },
      exists: true,
      lines: [],
    });
  });

  it('safely reports missing, invalid, and outside-project paths', async () => {
    await expect(
      getSourceContext({ filePath: 'src/missing.ts', line: 1, projectRoot }),
    ).resolves.toMatchObject({ exists: false, isOutsideProject: false });
    await expect(
      getSourceContext({ filePath: 'src/missing.ts', line: 0, projectRoot }),
    ).resolves.toMatchObject({ error: { code: 'invalid-line' } });
    await expect(
      getSourceContext({ filePath: '../../etc/passwd', line: 1, projectRoot }),
    ).resolves.toMatchObject({ error: { code: 'outside-project' }, isOutsideProject: true });
  });

  it('collects normalized package.json dependency declarations', async () => {
    await writeFile(
      join(projectRoot, 'package.json'),
      JSON.stringify({
        dependencies: { zeta: '^1.0.0', alpha: '^2.0.0' },
        devDependencies: { vitest: '^3.0.0' },
        optionalDependencies: { optional: '1.0.0' },
        peerDependencies: { typescript: '^5.0.0' },
      }),
    );

    const context = await getDependencyContext(projectRoot);

    expect(context.status).toBe('available');
    expect(context.dependencies).toEqual([
      { name: 'alpha', source: 'package.json', type: 'dependency', version: '^2.0.0' },
      { name: 'zeta', source: 'package.json', type: 'dependency', version: '^1.0.0' },
      { name: 'vitest', source: 'package.json', type: 'devDependency', version: '^3.0.0' },
      { name: 'optional', source: 'package.json', type: 'optionalDependency', version: '1.0.0' },
      { name: 'typescript', source: 'package.json', type: 'peerDependency', version: '^5.0.0' },
    ]);
  });

  it('reports missing and malformed package.json safely', async () => {
    await expect(getDependencyContext(projectRoot)).resolves.toMatchObject({
      dependencies: [],
      error: { code: 'package-json-not-found' },
      status: 'unavailable',
    });

    await writeFile(join(projectRoot, 'package.json'), '{ invalid json');
    await expect(getDependencyContext(projectRoot)).resolves.toMatchObject({
      error: { code: 'invalid-package-json' },
      status: 'parse-error',
    });
  });

  it('runs local TypeScript diagnostics only when tsconfig is present', async () => {
    await writeFile(join(projectRoot, 'src', 'broken.ts'), 'const value: string = 1;\n');
    await writeFile(
      join(projectRoot, 'tsconfig.json'),
      JSON.stringify({ compilerOptions: { noEmit: true }, include: ['src/**/*.ts'] }),
    );

    const context = await getTypeScriptContext(projectRoot);

    expect(context.status).toBe('available');
    expect(context.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ category: 'error', code: 2322, line: 1 })]),
    );

    await writeFile(join(projectRoot, 'tsconfig.json'), '{ invalid json');
    await expect(getTypeScriptContext(projectRoot)).resolves.toMatchObject({
      diagnostics: expect.any(Array),
      error: { code: 'invalid-tsconfig' },
      status: 'configuration-error',
    });
  });

  it('reports unavailable TypeScript analysis without tsconfig', async () => {
    await expect(getTypeScriptContext(projectRoot)).resolves.toMatchObject({
      error: { code: 'tsconfig-not-found' },
      status: 'unavailable',
    });
  });

  it('combines source, TypeScript, and dependency context', async () => {
    await writeFile(join(projectRoot, 'src', 'app.js'), 'throw new Error("failed");\n');
    await writeFile(
      join(projectRoot, 'package.json'),
      JSON.stringify({ dependencies: { lodash: '^4.0.0' } }),
    );

    const context = await getProjectContext({ filePath: 'src/app.js', line: 1, projectRoot });

    expect(context.source).toMatchObject({ exists: true, language: 'javascript' });
    expect(context.typescript.status).toBe('unavailable');
    expect(context.dependencies.dependencies).toEqual([
      { name: 'lodash', source: 'package.json', type: 'dependency', version: '^4.0.0' },
    ]);
  });
});
