import packageJson from '../package.json' with { type: 'json' };
import { pathToFileURL } from 'node:url';

export interface CliOutput {
  error(message: string): void;
  log(message: string): void;
}

const helpText = `DebugLens — local-first debugging engine

Usage:
  debuglens [option]

Options:
  -h, --help       Show this help message
  -v, --version    Show the CLI version`;

export function run(argumentsList: readonly string[], output: CliOutput = console): number {
  const [command] = argumentsList;

  if (command === undefined || command === '--help' || command === '-h') {
    output.log(helpText);
    return 0;
  }

  if (command === '--version' || command === '-v') {
    output.log(packageJson.version);
    return 0;
  }

  output.error(`Unknown option: ${command}`);
  output.log(helpText);
  return 1;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const exitCode = run(process.argv.slice(2));
  if (exitCode !== 0) {
    process.exitCode = exitCode;
  }
}
