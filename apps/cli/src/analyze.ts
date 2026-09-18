import { readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';

import {
  analyzeRootCause,
  getDependencyContext,
  getGitContext,
  getSourceContext,
  getTypeScriptContext,
  parseError,
  type ProjectContext,
} from '@debuglens/core';

import type { DebugLensConfig } from './config.js';
import type { CliAnalysisResult } from './types.js';

export interface AnalyzeOptions {
  config?: DebugLensConfig;
  errorText: string;
  projectRoot: string;
}

export interface ErrorFileOptions {
  filePath: string;
  projectRoot: string;
}

function isWithinProject(projectRoot: string, candidatePath: string): boolean {
  const pathFromRoot = relative(projectRoot, candidatePath);
  return pathFromRoot === '' || (!pathFromRoot.startsWith('..') && !isAbsolute(pathFromRoot));
}

/** Reads diagnostic text from a project-local file. */
export async function readErrorFile(options: ErrorFileOptions): Promise<string> {
  const projectRoot = resolve(options.projectRoot);
  const filePath = resolve(projectRoot, options.filePath);
  if (!isWithinProject(projectRoot, filePath)) {
    throw new Error('The error file must be inside the project root.');
  }

  return readFile(filePath, 'utf8');
}

/** Runs the existing parser, project context, Git context, and root-cause engine. */
export async function analyzeDiagnostic(options: AnalyzeOptions): Promise<CliAnalysisResult> {
  const diagnostic = parseError(options.errorText);
  const projectRoot = resolve(options.projectRoot);
  const location = diagnostic.primaryLocation;
  const config = options.config;
  const [projectContext, gitContext] = await Promise.all([
    location === undefined
      ? Promise.resolve(undefined)
      : collectProjectContext(
          projectRoot,
          location.filePath,
          location.line,
          location.column,
          config,
        ),
    config?.git === false
      ? Promise.resolve({ commits: [], status: 'unavailable' as const })
      : getGitContext({
          ...(location === undefined ? {} : { filePath: location.filePath }),
          projectRoot,
        }),
  ]);
  const analysis = analyzeRootCause({
    diagnostic,
    gitContext,
    ...(projectContext === undefined ? {} : { projectContext }),
  });

  return {
    analysis,
    diagnostic,
    gitContext,
    ...(projectContext === undefined ? {} : { projectContext }),
  };
}

async function collectProjectContext(
  projectRoot: string,
  filePath: string,
  line: number,
  column: number,
  config: DebugLensConfig | undefined,
): Promise<ProjectContext> {
  const source = await getSourceContext({
    ...(config?.maxSourceContext === undefined ? {} : { contextLines: config.maxSourceContext }),
    ...(column === undefined ? {} : { column }),
    filePath,
    line,
    projectRoot,
  });
  const [typescript, dependencies] = await Promise.all([
    config?.typescript === false
      ? Promise.resolve({ diagnostics: [], status: 'unavailable' as const })
      : getTypeScriptContext(projectRoot),
    config?.dependencies === false
      ? Promise.resolve({
          dependencies: [],
          packageJsonPath: resolve(projectRoot, 'package.json'),
          status: 'unavailable' as const,
        })
      : getDependencyContext(projectRoot),
  ]);
  return { dependencies, source, typescript };
}

/** Creates a standard parser input for focused file/line analysis. */
export function focusedErrorText(filePath: string, line: number): string {
  return `Error: Focused source analysis\n    at focus (${filePath}:${line}:1)`;
}
