import { readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';

import { analyzeRootCause, getGitContext, getProjectContext, parseError } from '@debuglens/core';

import type { CliAnalysisResult } from './types.js';

export interface AnalyzeOptions {
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
  const [projectContext, gitContext] = await Promise.all([
    location === undefined
      ? Promise.resolve(undefined)
      : getProjectContext({
          ...(location.column === undefined ? {} : { column: location.column }),
          filePath: location.filePath,
          line: location.line,
          projectRoot,
        }),
    getGitContext({
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
