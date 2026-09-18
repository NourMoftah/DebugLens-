import { access, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import ts from 'typescript';

export interface DebugLensConfig {
  dependencies: boolean;
  git: boolean;
  ignoredDirectories: string[];
  maxSourceContext: number;
  reporter: 'json' | 'terminal';
  sourceDirectories: string[];
  typescript: boolean;
  watch: { debounceMs: number };
}

export const defaultConfig: DebugLensConfig = {
  dependencies: true,
  git: true,
  ignoredDirectories: ['node_modules', '.git', 'dist', 'coverage'],
  maxSourceContext: 5,
  reporter: 'terminal',
  sourceDirectories: ['src'],
  typescript: true,
  watch: { debounceMs: 250 },
};

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string' && item !== '');
}

function configError(message: string): never {
  throw new Error(`Invalid debuglens.config.ts: ${message}`);
}

function validateConfig(value: unknown): DebugLensConfig {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    configError('default export must be an object.');
  const candidate = value as Record<string, unknown>;
  const config: DebugLensConfig = { ...defaultConfig, watch: { ...defaultConfig.watch } };
  for (const key of ['git', 'typescript', 'dependencies'] as const) {
    if (candidate[key] !== undefined && typeof candidate[key] !== 'boolean')
      configError(`${key} must be a boolean.`);
    if (typeof candidate[key] === 'boolean') config[key] = candidate[key];
  }
  for (const key of ['sourceDirectories', 'ignoredDirectories'] as const) {
    if (candidate[key] !== undefined && !isStringArray(candidate[key]))
      configError(`${key} must be an array of non-empty strings.`);
    if (isStringArray(candidate[key])) config[key] = candidate[key];
  }
  if (
    candidate.maxSourceContext !== undefined &&
    (typeof candidate.maxSourceContext !== 'number' ||
      !Number.isSafeInteger(candidate.maxSourceContext) ||
      candidate.maxSourceContext < 0 ||
      candidate.maxSourceContext > 100)
  )
    configError('maxSourceContext must be an integer from 0 to 100.');
  if (typeof candidate.maxSourceContext === 'number')
    config.maxSourceContext = candidate.maxSourceContext;
  if (
    candidate.reporter !== undefined &&
    candidate.reporter !== 'terminal' &&
    candidate.reporter !== 'json'
  )
    configError('reporter must be "terminal" or "json".');
  if (candidate.reporter !== undefined) config.reporter = candidate.reporter;
  if (candidate.watch !== undefined) {
    if (typeof candidate.watch !== 'object' || candidate.watch === null)
      configError('watch must be an object.');
    const debounceMs = (candidate.watch as Record<string, unknown>).debounceMs;
    if (
      debounceMs !== undefined &&
      (typeof debounceMs !== 'number' ||
        !Number.isSafeInteger(debounceMs) ||
        debounceMs < 0 ||
        debounceMs > 10_000)
    )
      configError('watch.debounceMs must be an integer from 0 to 10000.');
    if (typeof debounceMs === 'number') config.watch.debounceMs = debounceMs;
  }
  return config;
}

function literalValue(node: ts.Expression): unknown {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (
    ts.isPrefixUnaryExpression(node) &&
    node.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(node.operand)
  ) {
    return -Number(node.operand.text);
  }
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.map((element) => {
      if (!ts.isExpression(element)) configError('arrays may only contain literal values.');
      return literalValue(element);
    });
  }
  if (ts.isObjectLiteralExpression(node)) {
    const result: Record<string, unknown> = {};
    for (const property of node.properties) {
      if (
        !ts.isPropertyAssignment(property) ||
        (!ts.isIdentifier(property.name) && !ts.isStringLiteral(property.name))
      ) {
        configError('objects may only contain named literal properties.');
      }
      result[property.name.text] = literalValue(property.initializer);
    }
    return result;
  }
  configError('configuration values must be static literals.');
}

function parseStaticConfig(source: string, fileName: string): unknown {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.ES2022, true);
  const declaration = sourceFile.statements.find((statement): statement is ts.ExportAssignment =>
    ts.isExportAssignment(statement),
  );
  if (declaration === undefined || declaration.isExportEquals)
    configError('must use export default { ... }.');
  return literalValue(declaration.expression);
}

/** Loads a project-local static configuration. Configuration code is never executed. */
export async function loadConfig(projectRoot: string): Promise<DebugLensConfig> {
  const configPath = join(resolve(projectRoot), 'debuglens.config.ts');
  try {
    await access(configPath);
  } catch {
    return { ...defaultConfig, watch: { ...defaultConfig.watch } };
  }
  let source: string;
  try {
    source = await readFile(configPath, 'utf8');
  } catch (error: unknown) {
    throw new Error(
      `Could not read debuglens.config.ts: ${error instanceof Error ? error.message : 'unknown error'}`,
    );
  }
  try {
    return validateConfig(parseStaticConfig(source, configPath));
  } catch (error: unknown) {
    if (error instanceof Error && error.message.startsWith('Invalid debuglens.config.ts:'))
      throw error;
    throw new Error(
      `Could not load debuglens.config.ts: ${error instanceof Error ? error.message : 'unknown error'}`,
    );
  }
}
