import type { RootCauseEvidence } from '@debuglens/core';

import type { CliAnalysisResult } from '../types.js';

function locationText(location: RootCauseEvidence['location'] | undefined): string | undefined {
  return location === undefined
    ? undefined
    : `${location.filePath}:${location.line}:${location.column}`;
}

function section(title: string, lines: readonly string[]): string[] {
  return lines.length === 0 ? [] : ['', title, ...lines.map((line) => `  ${line}`)];
}

/** Formats a readable, width-tolerant diagnostic report without ANSI escape codes. */
export function formatTerminalReport(result: CliAnalysisResult): string {
  const { analysis, diagnostic, gitContext, projectContext } = result;
  const errorLines = [
    `Type: ${diagnostic.error.name}`,
    `Message: ${diagnostic.error.message || '(empty)'}`,
  ];
  const primaryLocation = diagnostic.primaryLocation;
  if (primaryLocation !== undefined) {
    errorLines.push(
      `Location: ${primaryLocation.filePath}:${primaryLocation.line}:${primaryLocation.column}`,
    );
  }

  const evidenceLines = analysis.evidence.map((evidence) => {
    const location = locationText(evidence.location);
    return `- ${evidence.message}${location === undefined ? '' : ` (${location})`}`;
  });
  const contextLines: string[] = [];
  if (projectContext !== undefined) {
    contextLines.push(
      `Source: ${projectContext.source.exists ? projectContext.source.filePath : 'unavailable'}`,
    );
    contextLines.push(
      `TypeScript: ${projectContext.typescript.status} (${projectContext.typescript.diagnostics.length} diagnostics)`,
    );
    contextLines.push(
      `Dependencies: ${projectContext.dependencies.status} (${projectContext.dependencies.dependencies.length} declared)`,
    );
  }
  if (gitContext.status === 'available') {
    contextLines.push(
      `Git: ${gitContext.branch ?? 'detached'} (${gitContext.commits.length} relevant commits)`,
    );
  } else {
    contextLines.push('Git: unavailable');
  }

  const lines = [
    'DebugLens Diagnostic Report',
    ...section('Error', errorLines),
    ...section('Root Cause', [
      `Probable cause: ${analysis.rootCause.kind} — ${analysis.rootCause.summary}`,
      `Confidence: ${analysis.rootCause.confidence}`,
    ]),
    ...section(
      'Evidence',
      evidenceLines.length === 0 ? ['- No additional evidence collected.'] : evidenceLines,
    ),
    ...section('Context', contextLines),
    ...section(
      'Suggestions',
      analysis.suggestions.map((suggestion) => `- ${suggestion.message}`),
    ),
  ];

  return `${lines.join('\n')}\n`;
}
