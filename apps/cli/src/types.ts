import type { Diagnostic, GitContext, ProjectContext, RootCauseAnalysis } from '@debuglens/core';

/** Complete CLI output assembled from existing DebugLens core models. */
export interface CliAnalysisResult {
  analysis: RootCauseAnalysis;
  diagnostic: Diagnostic;
  gitContext: GitContext;
  projectContext?: ProjectContext;
}

/** Supported process exit statuses for DebugLens commands. */
export const exitCode = {
  analysisComplete: 0,
  diagnosticFound: 1,
  invalidInput: 2,
  toolingFailure: 3,
} as const;

export type ExitCode = (typeof exitCode)[keyof typeof exitCode];
