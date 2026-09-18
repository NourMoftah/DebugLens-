import { access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import ts from 'typescript';

import type {
  TypeScriptContext,
  TypeScriptDiagnostic,
  TypeScriptDiagnosticCategory,
} from './types.js';

function categoryFor(value: ts.DiagnosticCategory): TypeScriptDiagnosticCategory {
  switch (value) {
    case ts.DiagnosticCategory.Error:
      return 'error';
    case ts.DiagnosticCategory.Warning:
      return 'warning';
    case ts.DiagnosticCategory.Suggestion:
      return 'suggestion';
    default:
      return 'message';
  }
}

function normalizeDiagnostic(diagnostic: ts.Diagnostic): TypeScriptDiagnostic {
  const location =
    diagnostic.file === undefined || diagnostic.start === undefined
      ? undefined
      : diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);

  return {
    category: categoryFor(diagnostic.category),
    code: diagnostic.code,
    ...(location === undefined ? {} : { column: location.character + 1 }),
    ...(diagnostic.file === undefined ? {} : { filePath: diagnostic.file.fileName }),
    ...(location === undefined ? {} : { line: location.line + 1 }),
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
  };
}

/** Detects tsconfig.json and collects local compiler diagnostics without modifying the project. */
export async function getTypeScriptContext(projectRoot: string): Promise<TypeScriptContext> {
  const tsconfigPath = join(resolve(projectRoot), 'tsconfig.json');

  try {
    await access(tsconfigPath);
  } catch {
    return {
      diagnostics: [],
      error: {
        code: 'tsconfig-not-found',
        message: 'No tsconfig.json was found in the project root.',
      },
      status: 'unavailable',
    };
  }

  try {
    const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
    if (configFile.error !== undefined) {
      return {
        diagnostics: [normalizeDiagnostic(configFile.error)],
        error: { code: 'invalid-tsconfig', message: 'tsconfig.json could not be parsed.' },
        status: 'configuration-error',
        tsconfigPath,
      };
    }

    const parsedConfig = ts.parseJsonConfigFileContent(
      configFile.config,
      ts.sys,
      resolve(projectRoot),
    );
    const program = ts.createProgram({ options: parsedConfig.options, rootNames: parsedConfig.fileNames });
    // Pre-emit diagnostics also requests declaration diagnostics. DebugLens only
    // reports project type-checking facts, so avoid that extra full-program pass.
    const diagnostics = [
      ...parsedConfig.errors,
      ...program.getOptionsDiagnostics(),
      ...program.getGlobalDiagnostics(),
      ...program.getSyntacticDiagnostics(),
      ...program.getSemanticDiagnostics(),
    ].map(normalizeDiagnostic);

    return { diagnostics, status: 'available', tsconfigPath };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'TypeScript diagnostics could not be collected.';

    return {
      diagnostics: [],
      error: { code: 'typescript-unavailable', message },
      status: 'unavailable',
      tsconfigPath,
    };
  }
}
