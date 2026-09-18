import { describe, expect, it } from 'vitest';

import { formatJsonReport } from './json.js';
import { formatTerminalReport } from './terminal.js';

const completeResult = {
  analysis: {
    evidence: [
      {
        kind: 'runtime-source-location' as const,
        message: 'Runtime location.',
        location: { column: 2, filePath: '/project/app.ts', line: 1 },
      },
      { kind: 'recent-git-change' as const, message: 'Recent change.' },
    ],
    rootCause: {
      confidence: 'high' as const,
      kind: 'typescript-diagnostic' as const,
      summary: 'TypeScript matches.',
    },
    suggestions: [{ message: 'Fix the diagnostic.' }],
  },
  diagnostic: {
    error: { message: 'failed', name: 'Error' },
    primaryLocation: { column: 2, filePath: '/project/app.ts', line: 1 },
    stack: [],
  },
  gitContext: {
    branch: 'main',
    commits: [],
    repositoryRoot: '/project',
    status: 'available' as const,
  },
  projectContext: {
    dependencies: {
      dependencies: [],
      packageJsonPath: '/project/package.json',
      status: 'available' as const,
    },
    source: {
      exists: true,
      filePath: '/project/app.ts',
      isOutsideProject: false,
      language: 'typescript' as const,
      lines: [],
    },
    typescript: { diagnostics: [], status: 'available' as const },
  },
};

describe('CLI reporters', () => {
  it('renders a complete readable terminal report with multiple evidence items', () => {
    const report = formatTerminalReport(completeResult);

    expect(report).toContain('DebugLens Diagnostic Report');
    expect(report).toContain('Root Cause');
    expect(report).toContain('Runtime location.');
    expect(report).toContain('Recent change.');
    expect(report).toContain('Git: main');
  });

  it('renders incomplete reports gracefully', () => {
    const report = formatTerminalReport({
      analysis: {
        evidence: [],
        rootCause: { confidence: 'none', kind: 'insufficient-evidence', summary: 'Unknown.' },
        suggestions: [{ message: 'Add context.' }],
      },
      diagnostic: { error: { message: '', name: 'Error' }, stack: [] },
      gitContext: { commits: [], status: 'unavailable' },
    });

    expect(report).toContain('Git: unavailable');
    expect(report).toContain('No additional evidence collected.');
    expect(report).not.toContain('TypeScript:');
  });

  it('serializes the same analysis structure as valid ANSI-free JSON', () => {
    const report = formatJsonReport(completeResult);

    expect(JSON.parse(report)).toEqual(completeResult);
    expect(report).not.toContain(String.fromCharCode(27));
  });
});
