import { parseStack } from './parse-stack.js';
import type { Diagnostic, ErrorInfo, SourceLocation, StackFrame } from './types.js';

const errorNamePattern = /^(?<name>(?:[A-Za-z_$][\w$]*Error|Error))\s*(?::\s*(?<message>.*))?$/;

function parseErrorInfo(rawError: string): ErrorInfo {
  const firstContentLine = rawError
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line !== '' && !line.startsWith('at '));

  if (firstContentLine === undefined) {
    return { message: '', name: 'Error' };
  }

  const match = errorNamePattern.exec(firstContentLine);
  if (match?.groups?.name !== undefined) {
    return { message: match.groups.message ?? '', name: match.groups.name };
  }

  return { message: firstContentLine, name: 'Error' };
}

function toSourceLocation(frame: StackFrame): SourceLocation | undefined {
  if (frame.filePath === undefined || frame.line === undefined || frame.column === undefined) {
    return undefined;
  }

  return { column: frame.column, filePath: frame.filePath, line: frame.line };
}

function findPrimaryLocation(stack: readonly StackFrame[]): SourceLocation | undefined {
  const nonInternal = stack.find(
    (frame) => !frame.isInternal && toSourceLocation(frame) !== undefined,
  );
  const firstAvailable =
    nonInternal ?? stack.find((frame) => toSourceLocation(frame) !== undefined);

  return firstAvailable === undefined ? undefined : toSourceLocation(firstAvailable);
}

/**
 * Normalizes a JavaScript or TypeScript error pasted from a Node.js/V8-style
 * stack trace. Malformed headings and frames are safely retained only when
 * their individual fields can be parsed.
 */
export function parseError(rawError: string): Diagnostic {
  const stack = parseStack(rawError);
  const primaryLocation = findPrimaryLocation(stack);

  return {
    error: parseErrorInfo(rawError),
    ...(primaryLocation === undefined ? {} : { primaryLocation }),
    stack,
  };
}
