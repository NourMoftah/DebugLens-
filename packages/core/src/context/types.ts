/** A normalized language inferred from a source file extension. */
export type SourceLanguage = 'javascript' | 'typescript' | 'unknown';

/** A safe, structured failure reported by a context collector. */
export interface ContextError {
  code: string;
  message: string;
}

/** A numbered line from a source-code window. */
export interface SourceLine {
  content: string;
  number: number;
}

/** Source text safely collected around a requested location. */
export interface SourceContext {
  error?: ContextError;
  exists: boolean;
  filePath: string;
  isOutsideProject: boolean;
  language: SourceLanguage;
  lines: SourceLine[];
  startLine?: number;
  targetLine?: number;
  endLine?: number;
}

/** The category emitted by the TypeScript compiler. */
export type TypeScriptDiagnosticCategory = 'error' | 'message' | 'suggestion' | 'warning';

/** A normalized compiler diagnostic. */
export interface TypeScriptDiagnostic {
  category: TypeScriptDiagnosticCategory;
  code: number;
  column?: number;
  filePath?: string;
  line?: number;
  message: string;
}

/** Availability and output of local TypeScript project analysis. */
export interface TypeScriptContext {
  diagnostics: TypeScriptDiagnostic[];
  error?: ContextError;
  status: 'available' | 'configuration-error' | 'unavailable';
  tsconfigPath?: string;
}

/** The package.json section that declared a dependency. */
export type DependencyType =
  'dependency' | 'devDependency' | 'optionalDependency' | 'peerDependency';

/** A dependency declared in the local project's package.json. */
export interface DependencyInfo {
  name: string;
  source: 'package.json';
  type: DependencyType;
  version: string;
}

/** Availability and normalized dependency declarations for a project. */
export interface DependencyContext {
  dependencies: DependencyInfo[];
  error?: ContextError;
  packageJsonPath: string;
  status: 'available' | 'parse-error' | 'unavailable';
}

/** All deterministic context collected for a diagnostic location. */
export interface ProjectContext {
  dependencies: DependencyContext;
  source: SourceContext;
  typescript: TypeScriptContext;
}

/** Input used to collect a project context around a source location. */
export interface ProjectContextOptions {
  column?: number;
  contextLines?: number;
  filePath: string;
  line: number;
  projectRoot: string;
}

/** Input used to collect a safe source-code window. */
export type SourceContextOptions = ProjectContextOptions;
