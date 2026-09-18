export {
  parseError,
  parseStack,
  type Diagnostic,
  type ErrorInfo,
  type SourceLocation,
  type StackFrame,
} from './diagnostics/index.js';
export {
  detectLanguage,
  getDependencyContext,
  getProjectContext,
  getSourceContext,
  getTypeScriptContext,
  type ContextError,
  type DependencyContext,
  type DependencyInfo,
  type DependencyType,
  type ProjectContext,
  type ProjectContextOptions,
  type SourceContext,
  type SourceContextOptions,
  type SourceLanguage,
  type SourceLine,
  type TypeScriptContext,
  type TypeScriptDiagnostic,
  type TypeScriptDiagnosticCategory,
} from './context/index.js';
export {
  getGitContext,
  type GitCommit,
  type GitContext,
  type GitContextOptions,
} from './git/index.js';
export {
  analyzeRootCause,
  type RootCause,
  type RootCauseAnalysis,
  type RootCauseConfidence,
  type RootCauseEvidence,
  type RootCauseInput,
  type RootCauseKind,
  type RootCauseSuggestion,
} from './root-cause/index.js';

/**
 * Identifies the current public foundation of the DebugLens core package.
 */
export function getCoreStatus(): string {
  return 'DebugLens core foundation';
}
