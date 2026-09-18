export { getDependencyContext } from './dependencies.js';
export { getProjectContext } from './project-context.js';
export { detectLanguage, getSourceContext } from './source.js';
export { getTypeScriptContext } from './typescript.js';
export type {
  ContextError,
  DependencyContext,
  DependencyInfo,
  DependencyType,
  ProjectContext,
  ProjectContextOptions,
  SourceContext,
  SourceContextOptions,
  SourceLanguage,
  SourceLine,
  TypeScriptContext,
  TypeScriptDiagnostic,
  TypeScriptDiagnosticCategory,
} from './types.js';
