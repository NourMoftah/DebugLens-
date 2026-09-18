import packageJson from '../package.json' with { type: 'json' };
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { analyzeDiagnostic, readErrorFile } from './analyze.js';
import { formatJsonReport } from './reporters/json.js';
import { formatTerminalReport } from './reporters/terminal.js';
import { exitCode, type ExitCode } from './types.js';

export interface CliOutput {
  error(message: string): void;
  log(message: string): void;
}

const helpText = `DebugLens — local-first debugging engine

Usage:
  debuglens analyze --error <text> [--project <path>] [--json]
  debuglens analyze --error-file <path> [--project <path>] [--json]

Options:
  -h, --help       Show this help message
  -v, --version    Show the CLI version

Exit codes:
  0  Analysis completed without a probable cause
  1  Analysis completed with a probable cause
  2  Invalid command input
  3  Tooling failure`;

interface ParsedAnalyzeArguments {
  errorFile?: string;
  errorText?: string;
  json: boolean;
  projectRoot: string;
}

function parseAnalyzeArguments(argumentsList: readonly string[]): ParsedAnalyzeArguments | string {
  let errorText: string | undefined;
  let errorFile: string | undefined;
  let projectRoot = process.cwd();
  let json = false;

  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    const value = argumentsList[index + 1];
    if (argument === '--json') {
      json = true;
    } else if (argument === '--error' || argument === '--error-file' || argument === '--project') {
      if (value === undefined || value.startsWith('--')) {
        return `Missing value for ${argument}.`;
      }
      if (argument === '--error') errorText = value;
      if (argument === '--error-file') errorFile = value;
      if (argument === '--project') projectRoot = value;
      index += 1;
    } else {
      return `Unknown analyze option: ${argument}`;
    }
  }

  if (
    (errorText === undefined && errorFile === undefined) ||
    (errorText !== undefined && errorFile !== undefined)
  ) {
    return 'Provide exactly one of --error or --error-file.';
  }

  return {
    ...(errorFile === undefined ? {} : { errorFile }),
    ...(errorText === undefined ? {} : { errorText }),
    json,
    projectRoot,
  };
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

  if (command !== 'analyze') {
    output.error(`Unknown command: ${command}`);
    output.log(helpText);
    return exitCode.invalidInput;
  }

  const parsed = parseAnalyzeArguments(argumentsList.slice(1));
  if (typeof parsed === 'string') {
    output.error(parsed);
    return exitCode.invalidInput;
  }

  try {
    const projectRoot = resolve(parsed.projectRoot);
    const errorText =
      parsed.errorText ?? (await readErrorFile({ filePath: parsed.errorFile ?? '', projectRoot }));
    const result = await analyzeDiagnostic({ errorText, projectRoot });
    output.log(parsed.json ? formatJsonReport(result) : formatTerminalReport(result));

    return result.analysis.rootCause.kind === 'insufficient-evidence'
      ? exitCode.analysisComplete
      : exitCode.diagnosticFound;
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
