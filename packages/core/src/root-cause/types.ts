import type { ProjectContext } from '../context/types.js';
import type { Diagnostic, SourceLocation } from '../diagnostics/types.js';
import type { GitContext } from '../git/types.js';

/** The deterministic explanation selected from collected evidence. */
export type RootCauseKind =
  | 'insufficient-evidence'
  | 'missing-dependency'
  | 'recent-code-change'
  | 'runtime-source-location'
  | 'typescript-diagnostic'
  | 'unsafe-property-access';

/** Confidence is deliberately limited to deterministic evidence strength. */
export type RootCauseConfidence = 'high' | 'low' | 'medium' | 'none';

/** A fact observed by a root-cause rule. */
export interface RootCauseEvidence {
  kind:
    | 'matching-typescript-diagnostic'
    | 'missing-dependency'
    | 'recent-git-change'
    | 'repeated-stack-frame'
    | 'runtime-source-location'
    | 'unsafe-property-access';
  location?: SourceLocation;
  message: string;
}

/** A conservative next action associated with a deterministic finding. */
export interface RootCauseSuggestion {
  message: string;
}

/** The selected explanation for the runtime failure. */
export interface RootCause {
  confidence: RootCauseConfidence;
  kind: RootCauseKind;
  summary: string;
}

/** Inputs already produced by the parser and context collection layers. */
export interface RootCauseInput {
  diagnostic?: Diagnostic;
  gitContext?: GitContext;
  projectContext?: ProjectContext;
}

/** Deterministic root-cause output with all supporting evidence. */
export interface RootCauseAnalysis {
  evidence: RootCauseEvidence[];
  rootCause: RootCause;
  suggestions: RootCauseSuggestion[];
}
