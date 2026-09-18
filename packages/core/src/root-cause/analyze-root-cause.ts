import { basename } from 'node:path';

import type {
  DependencyInfo,
  ProjectContext,
  SourceContext,
  TypeScriptDiagnostic,
} from '../context/types.js';
import type { Diagnostic, SourceLocation, StackFrame } from '../diagnostics/types.js';
import type { GitContext } from '../git/types.js';
import type {
  RootCause,
  RootCauseAnalysis,
  RootCauseConfidence,
  RootCauseEvidence,
  RootCauseInput,
  RootCauseKind,
  RootCauseSuggestion,
} from './types.js';

interface Candidate {
  confidence: RootCauseConfidence;
  kind: RootCauseKind;
  priority: number;
  suggestion: RootCauseSuggestion;
  summary: string;
}

function samePath(left: string, right: string): boolean {
  const normalizedLeft = left.replaceAll('\\', '/');
  const normalizedRight = right.replaceAll('\\', '/');
  return (
    normalizedLeft === normalizedRight ||
    normalizedLeft.endsWith(`/${normalizedRight}`) ||
    normalizedRight.endsWith(`/${normalizedLeft}`)
  );
}

function matchingTypeScriptDiagnostic(
  diagnostic: Diagnostic | undefined,
  projectContext: ProjectContext | undefined,
): TypeScriptDiagnostic | undefined {
  const location = diagnostic?.primaryLocation;
  if (location === undefined || projectContext?.typescript.status !== 'available') {
    return undefined;
  }

  return projectContext.typescript.diagnostics.find(
    (typescriptDiagnostic) =>
      typescriptDiagnostic.category === 'error' &&
      typescriptDiagnostic.filePath !== undefined &&
      typescriptDiagnostic.line === location.line &&
      samePath(typescriptDiagnostic.filePath, location.filePath),
  );
}

function sourceSupportsUnsafeAccess(
  diagnostic: Diagnostic | undefined,
  source: SourceContext | undefined,
): boolean {
  const message = diagnostic?.error.message.toLowerCase() ?? '';
  if (!message.includes('undefined') && !message.includes('null')) {
    return false;
  }

  const targetLine = source?.targetLine;
  const sourceLine = source?.lines.find((line) => line.number === targetLine)?.content;
  return sourceLine !== undefined && /(?:\.|\[)/.test(sourceLine);
}

function requestedPackageName(message: string): string | undefined {
  const match = /Cannot find (?:module|package) ['"]([^'"]+)['"]/.exec(message);
  const packageName = match?.[1];
  if (
    packageName === undefined ||
    packageName.startsWith('.') ||
    packageName.startsWith('/') ||
    packageName.startsWith('node:')
  ) {
    return undefined;
  }

  return packageName.startsWith('@')
    ? packageName.split('/').slice(0, 2).join('/')
    : packageName.split('/')[0];
}

function hasDependency(dependencies: readonly DependencyInfo[], packageName: string): boolean {
  return dependencies.some((dependency) => dependency.name === packageName);
}

function repeatedFrame(stack: readonly StackFrame[]): StackFrame | undefined {
  const counts = new Map<string, { count: number; frame: StackFrame }>();
  for (const frame of stack) {
    if (
      frame.filePath === undefined ||
      frame.line === undefined ||
      frame.column === undefined ||
      frame.isInternal
    ) {
      continue;
    }

    const key = `${frame.filePath}:${frame.line}:${frame.column}`;
    const previous = counts.get(key);
    counts.set(key, { count: (previous?.count ?? 0) + 1, frame });
  }

  return [...counts.values()].find((entry) => entry.count > 1)?.frame;
}

function frameLocation(frame: StackFrame): SourceLocation | undefined {
  if (frame.filePath === undefined || frame.line === undefined || frame.column === undefined) {
    return undefined;
  }

  return { column: frame.column, filePath: frame.filePath, line: frame.line };
}

function sourceChangedRecently(
  gitContext: GitContext | undefined,
  source: SourceContext | undefined,
): boolean {
  const sourcePath = source?.filePath;
  if (sourcePath === undefined || gitContext?.status !== 'available') {
    return false;
  }

  const sourceName = basename(sourcePath);
  return gitContext.commits.some((commit) =>
    commit.changedFiles.some((file) => basename(file) === sourceName),
  );
}

function selectRootCause(candidates: readonly Candidate[]): RootCause {
  const selected = [...candidates].sort((left, right) => right.priority - left.priority)[0];
  if (selected === undefined) {
    return {
      confidence: 'none',
      kind: 'insufficient-evidence',
      summary: 'Insufficient deterministic evidence to identify a root cause.',
    };
  }

  return { confidence: selected.confidence, kind: selected.kind, summary: selected.summary };
}

/** Combines parser, project, and Git facts into a deterministic root-cause hypothesis. */
export function analyzeRootCause(input: RootCauseInput): RootCauseAnalysis {
  const diagnostic = input.diagnostic;
  const projectContext = input.projectContext;
  const gitContext = input.gitContext;
  const evidence: RootCauseEvidence[] = [];
  const candidates: Candidate[] = [];

  const primaryLocation = diagnostic?.primaryLocation;
  if (primaryLocation !== undefined) {
    evidence.push({
      kind: 'runtime-source-location',
      location: primaryLocation,
      message: `Runtime error surfaced at ${primaryLocation.filePath}:${primaryLocation.line}:${primaryLocation.column}.`,
    });
    candidates.push({
      confidence: 'low',
      kind: 'runtime-source-location',
      priority: 10,
      suggestion: { message: 'Inspect the surfaced source location and its immediate inputs.' },
      summary: 'The runtime error is localized to a source location.',
    });
  }

  const typescriptDiagnostic = matchingTypeScriptDiagnostic(diagnostic, projectContext);
  if (typescriptDiagnostic !== undefined) {
    evidence.push({
      kind: 'matching-typescript-diagnostic',
      ...(primaryLocation === undefined ? {} : { location: primaryLocation }),
      message: `TypeScript diagnostic TS${typescriptDiagnostic.code} matches the runtime location: ${typescriptDiagnostic.message}`,
    });
    candidates.push({
      confidence: 'high',
      kind: 'typescript-diagnostic',
      priority: 50,
      suggestion: {
        message: `Resolve TypeScript diagnostic TS${typescriptDiagnostic.code} at the runtime location.`,
      },
      summary: 'A TypeScript diagnostic matches the runtime failure location.',
    });
  }

  if (sourceSupportsUnsafeAccess(diagnostic, projectContext?.source)) {
    evidence.push({
      kind: 'unsafe-property-access',
      ...(primaryLocation === undefined ? {} : { location: primaryLocation }),
      message:
        'The runtime message reports null or undefined access and the target source line performs property access.',
    });
    candidates.push({
      confidence: 'medium',
      kind: 'unsafe-property-access',
      priority: 40,
      suggestion: { message: 'Verify the accessed value is present before reading its property.' },
      summary: 'A null or undefined value appears to be accessed at the surfaced source line.',
    });
  }

  const packageName = requestedPackageName(diagnostic?.error.message ?? '');
  if (
    packageName !== undefined &&
    projectContext?.dependencies.status === 'available' &&
    !hasDependency(projectContext.dependencies.dependencies, packageName)
  ) {
    evidence.push({
      kind: 'missing-dependency',
      message: `The runtime error references "${packageName}", which is not declared in package.json.`,
    });
    candidates.push({
      confidence: 'high',
      kind: 'missing-dependency',
      priority: 45,
      suggestion: {
        message: `Declare or correct the "${packageName}" dependency before retrying.`,
      },
      summary: 'A runtime module request is not declared in package.json.',
    });
  }

  const repeated = repeatedFrame(diagnostic?.stack ?? []);
  if (repeated !== undefined) {
    const location = frameLocation(repeated);
    evidence.push({
      kind: 'repeated-stack-frame',
      ...(location === undefined ? {} : { location }),
      message: 'The stack trace repeats the same application frame.',
    });
  }

  if (sourceChangedRecently(gitContext, projectContext?.source)) {
    evidence.push({
      kind: 'recent-git-change',
      message: 'Recent Git history includes a commit affecting the surfaced source file.',
    });
    candidates.push({
      confidence: 'low',
      kind: 'recent-code-change',
      priority: 20,
      suggestion: { message: 'Review the most recent commit affecting the surfaced source file.' },
      summary: 'The surfaced source file was modified in recent Git history.',
    });
  }

  const rootCause = selectRootCause(candidates);
  const suggestions =
    rootCause.kind === 'insufficient-evidence'
      ? [{ message: 'Collect a stack trace and project context before drawing a conclusion.' }]
      : candidates
          .filter((candidate) => candidate.kind === rootCause.kind)
          .map((candidate) => candidate.suggestion);

  return { evidence, rootCause, suggestions };
}
