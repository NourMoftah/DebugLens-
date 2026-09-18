import { describe, expect, it } from 'vitest';

import { parseError } from '../diagnostics/parse-error.js';
import { analyzeRootCause } from './analyze-root-cause.js';

const sourcePath = '/project/src/app.ts';

function sourceContext(lineContent = 'items.map((item) => item.id)') {
  return {
    exists: true,
    filePath: sourcePath,
    isOutsideProject: false,
    language: 'typescript' as const,
    lines: [{ content: lineContent, number: 5 }],
    targetLine: 5,
  };
}

function diagnosticFor(message: string) {
  return parseError(`${message}\n    at render (${sourcePath}:5:3)`);
}

describe('analyzeRootCause', () => {
  it('selects a matching TypeScript diagnostic as the strongest evidence', () => {
    const analysis = analyzeRootCause({
      diagnostic: diagnosticFor('TypeError: failed'),
      projectContext: {
        dependencies: {
          dependencies: [],
          packageJsonPath: '/project/package.json',
          status: 'available',
        },
        source: sourceContext(),
        typescript: {
          diagnostics: [
            {
              category: 'error',
              code: 2322,
              filePath: sourcePath,
              line: 5,
              message: 'Type mismatch',
            },
          ],
          status: 'available',
          tsconfigPath: '/project/tsconfig.json',
        },
      },
    });

    expect(analysis.rootCause).toMatchObject({ confidence: 'high', kind: 'typescript-diagnostic' });
    expect(analysis.evidence).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'matching-typescript-diagnostic' })]),
    );
  });

  it('uses the surfaced source location as evidence when no stronger rule matches', () => {
    const analysis = analyzeRootCause({ diagnostic: diagnosticFor('Error: failed') });

    expect(analysis.rootCause).toMatchObject({
      confidence: 'low',
      kind: 'runtime-source-location',
    });
    expect(analysis.evidence[0]).toMatchObject({ kind: 'runtime-source-location' });
  });

  it('identifies an undeclared package referenced by a runtime module error', () => {
    const analysis = analyzeRootCause({
      diagnostic: diagnosticFor("Error: Cannot find module 'missing-package'"),
      projectContext: {
        dependencies: {
          dependencies: [],
          packageJsonPath: '/project/package.json',
          status: 'available',
        },
        source: sourceContext(),
        typescript: { diagnostics: [], status: 'unavailable' },
      },
    });

    expect(analysis.rootCause).toMatchObject({ confidence: 'high', kind: 'missing-dependency' });
    expect(analysis.evidence).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'missing-dependency' })]),
    );
  });

  it('reports repeated application stack frames as evidence', () => {
    const analysis = analyzeRootCause({
      diagnostic: parseError(`Error: failed
    at render (${sourcePath}:5:3)
    at render (${sourcePath}:5:3)`),
    });

    expect(analysis.evidence).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'repeated-stack-frame' })]),
    );
  });

  it('uses recent Git modification evidence when source and Git metadata agree', () => {
    const analysis = analyzeRootCause({
      diagnostic: diagnosticFor('Error: failed'),
      gitContext: {
        commits: [
          {
            author: 'Developer',
            changedFiles: ['src/app.ts'],
            date: '2026-01-01T00:00:00+00:00',
            hash: 'abcdef',
            message: 'Change app',
          },
        ],
        repositoryRoot: '/project',
        status: 'available',
      },
      projectContext: {
        dependencies: {
          dependencies: [],
          packageJsonPath: '/project/package.json',
          status: 'available',
        },
        source: sourceContext(),
        typescript: { diagnostics: [], status: 'unavailable' },
      },
    });

    expect(analysis.evidence).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'recent-git-change' })]),
    );
  });

  it('recognizes null or undefined property access only when source supports it', () => {
    const analysis = analyzeRootCause({
      diagnostic: diagnosticFor("TypeError: Cannot read properties of undefined (reading 'map')"),
      projectContext: {
        dependencies: {
          dependencies: [],
          packageJsonPath: '/project/package.json',
          status: 'available',
        },
        source: sourceContext(),
        typescript: { diagnostics: [], status: 'unavailable' },
      },
    });

    expect(analysis.rootCause).toMatchObject({
      confidence: 'medium',
      kind: 'unsafe-property-access',
    });
  });

  it('keeps all evidence but resolves conflicts deterministically', () => {
    const analysis = analyzeRootCause({
      diagnostic: diagnosticFor("Error: Cannot find module 'missing-package'"),
      projectContext: {
        dependencies: {
          dependencies: [],
          packageJsonPath: '/project/package.json',
          status: 'available',
        },
        source: sourceContext(),
        typescript: {
          diagnostics: [
            {
              category: 'error',
              code: 2307,
              filePath: sourcePath,
              line: 5,
              message: 'Module cannot be found',
            },
          ],
          status: 'available',
        },
      },
    });

    expect(analysis.rootCause.kind).toBe('typescript-diagnostic');
    expect(analysis.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'matching-typescript-diagnostic' }),
        expect.objectContaining({ kind: 'missing-dependency' }),
      ]),
    );
  });

  it('returns insufficient evidence for incomplete input', () => {
    expect(analyzeRootCause({})).toEqual({
      evidence: [],
      rootCause: {
        confidence: 'none',
        kind: 'insufficient-evidence',
        summary: 'Insufficient deterministic evidence to identify a root cause.',
      },
      suggestions: [
        { message: 'Collect a stack trace and project context before drawing a conclusion.' },
      ],
    });
  });
});
