import type { StackFrame } from './types.js';

interface ParsedLocation {
  column?: number;
  filePath: string;
  line: number;
}

function parseLocation(value: string): ParsedLocation | undefined {
  const columnMatch = /^(.*):(\d+):(\d+)$/.exec(value);
  const lineMatch = /^(.*):(\d+)$/.exec(value);
  const match = columnMatch ?? lineMatch;

  if (match === null || match[1] === undefined || match[1] === '' || match[2] === undefined) {
    return undefined;
  }

  const filePath = match[1];
  const line = Number(match[2]);
  const column = columnMatch?.[3] === undefined ? undefined : Number(columnMatch[3]);

  if (!Number.isSafeInteger(line) || (column !== undefined && !Number.isSafeInteger(column))) {
    return undefined;
  }

  return {
    ...(column === undefined ? {} : { column }),
    filePath,
    line,
  };
}

function parseFrame(line: string): StackFrame | undefined {
  const content = line.trim().replace(/^at\s+/, '');
  if (content === line.trim()) {
    return undefined;
  }

  const parenthesizedMatch = /^(?:async\s+)?(.+?)\s+\((.+)\)$/.exec(content);
  const locationText = parenthesizedMatch?.[2] ?? content.replace(/^async\s+/, '');
  const functionName = parenthesizedMatch?.[1];

  if (locationText === 'native') {
    return {
      ...(functionName === undefined ? {} : { functionName }),
      isInternal: false,
      isNative: true,
    };
  }

  const location = parseLocation(locationText);
  if (location === undefined) {
    return undefined;
  }

  return {
    ...(location.column === undefined ? {} : { column: location.column }),
    filePath: location.filePath,
    ...(functionName === undefined ? {} : { functionName }),
    isInternal: location.filePath.startsWith('node:internal/'),
    isNative: false,
    line: location.line,
  };
}

/** Parses the valid V8-style frames found in arbitrary text. */
export function parseStack(rawStack: string): StackFrame[] {
  return rawStack
    .split(/\r?\n/)
    .map(parseFrame)
    .filter((frame): frame is StackFrame => frame !== undefined);
}
