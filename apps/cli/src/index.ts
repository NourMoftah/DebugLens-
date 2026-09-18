import packageJson from '../package.json' with { type: 'json' };
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { analyzeDiagnostic, focusedErrorText, readErrorFile } from './analyze.js';
import { loadConfig } from './config.js';
import { discoverProjectRoot } from './discovery.js';
import { formatJsonReport } from './reporters/json.js';
import { formatTerminalReport } from './reporters/terminal.js';
import { exitCode, type ExitCode } from './types.js';
import { watchProject } from './watch.js';

export interface CliOutput {
  error(message: string): void;
  log(message: string): void;
}

const helpText = `DebugLens — local-first debugging engine

Usage:
  debuglens analyze --error <text> [--project <path>] [--json] [--ci]
  debuglens analyze --error-file <path> [--project <path>] [--json] [--ci]
  debuglens analyze --file <path> --line <number> [--project <path>] [--json] [--ci]
  debuglens watch --error <text> [--project <path>] [--json] [--ci]

Exit codes: 0 no probable cause; 1 probable cause found; 2 invalid input; 3 tooling failure.`;

interface ParsedArguments {
  ci: boolean;
  errorFile?: string;
  errorText?: string;
  file?: string;
  json: boolean;
  line?: number;
  projectPath: string;
}

function parseArguments(
  argumentsList: readonly string[],
  watchMode: boolean,
): ParsedArguments | string {
  let errorText: string | undefined;
  let errorFile: string | undefined;
  let file: string | undefined;
  let line: number | undefined;
  let projectPath = process.cwd();
  let json = false;
  let ci = false;
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === '--json') {
      json = true;
      continue;
    }
    if (argument === '--ci') {
      ci = true;
      continue;
    }
    if (!['--error', '--error-file', '--file', '--line', '--project'].includes(argument ?? ''))
      return `Unknown option: ${argument}`;
    const value = argumentsList[index + 1];
    if (value === undefined || value.startsWith('--')) return `Missing value for ${argument}.`;
    if (argument === '--error') errorText = value;
    if (argument === '--error-file') errorFile = value;
    if (argument === '--file') file = value;
    if (argument === '--line') {
      line = Number(value);
      if (!Number.isSafeInteger(line) || line < 1) return '--line must be a positive integer.';
    }
    if (argument === '--project') projectPath = value;
    index += 1;
  }
  const inputCount =
    Number(errorText !== undefined) +
    Number(errorFile !== undefined) +
    Number(file !== undefined || line !== undefined);
  if (inputCount !== 1 || (file === undefined) !== (line === undefined))
    return 'Provide exactly one error input, or both --file and --line.';
  if (watchMode && file !== undefined) return 'Watch mode requires --error or --error-file.';
  return {
    ...(errorFile === undefined ? {} : { errorFile }),
    ...(errorText === undefined ? {} : { errorText }),
    ...(file === undefined ? {} : { file }),
    ...(line === undefined ? {} : { line }),
    ci,
    json,
    projectPath,
  };
}

async function executeAnalysis(parsed: ParsedArguments, output: CliOutput): Promise<ExitCode> {
  const projectRoot = await discoverProjectRoot(resolve(parsed.projectPath));
  const config = await loadConfig(projectRoot);
  const errorText =
    parsed.errorText ??
    (parsed.errorFile === undefined
      ? focusedErrorText(parsed.file ?? '', parsed.line ?? 0)
      : await readErrorFile({ filePath: parsed.errorFile, projectRoot }));
  const result = await analyzeDiagnostic({ config, errorText, projectRoot });
  if (parsed.file !== undefined && result.projectContext?.source.exists !== true)
    throw new Error(
      result.projectContext?.source.error?.message ?? 'The focused source file is unavailable.',
    );
  const useJson = parsed.json || config.reporter === 'json';
  output.log(
    useJson
      ? formatJsonReport(result)
      : formatTerminalReport(result, !parsed.ci && process.stdout.isTTY === true),
  );
  return result.analysis.rootCause.kind === 'insufficient-evidence'
    ? exitCode.analysisComplete
    : exitCode.diagnosticFound;
}

export async function run(
  argumentsList: readonly string[],
  output: CliOutput = console,
): Promise<ExitCode> {
  const [command] = argumentsList;
  if (command === undefined || command === '--help' || command === '-h') {
    output.log(helpText);
    return exitCode.analysisComplete;
  }
  if (command === '--version' || command === '-v') {
    output.log(packageJson.version);
    return exitCode.analysisComplete;
  }
  if (command !== 'analyze' && command !== 'watch') {
    output.error(`Unknown command: ${command}`);
    output.log(helpText);
    return exitCode.invalidInput;
  }
  const parsed = parseArguments(argumentsList.slice(1), command === 'watch');
  if (typeof parsed === 'string') {
    output.error(parsed);
    return exitCode.invalidInput;
  }
  try {
    if (command === 'analyze') return await executeAnalysis(parsed, output);
    const root = await discoverProjectRoot(resolve(parsed.projectPath));
    const config = await loadConfig(root);
    await executeAnalysis({ ...parsed, projectPath: root }, output);
    const watcher = await watchProject(
      {
        debounceMs: config.watch.debounceMs,
        ignoredDirectories: config.ignoredDirectories,
        projectRoot: root,
      },
      () => {
        void executeAnalysis({ ...parsed, projectPath: root }, output);
      },
    );
    await new Promise<void>((resolveWatch) => process.once('SIGINT', resolveWatch));
    watcher.close();
    return exitCode.analysisComplete;
  } catch (error: unknown) {
    output.error(error instanceof Error ? error.message : 'DebugLens could not complete analysis.');
    return exitCode.toolingFailure;
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void run(process.argv.slice(2)).then((result) => {
    process.exitCode = result;
  });
}
