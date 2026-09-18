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

/** Loads a trusted project-local TypeScript configuration with validated defaults. */
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
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    fileName: configPath,
  });
  try {
    const module = (await import(
      `data:text/javascript;base64,${Buffer.from(compiled.outputText).toString('base64')}`
    )) as { default?: unknown };
    return validateConfig(module.default);
  } catch (error: unknown) {
    if (error instanceof Error && error.message.startsWith('Invalid debuglens.config.ts:'))
      throw error;
    throw new Error(
      `Could not load debuglens.config.ts: ${error instanceof Error ? error.message : 'unknown error'}`,
    );
  }
}
