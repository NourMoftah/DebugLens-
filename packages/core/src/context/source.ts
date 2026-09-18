import { createReadStream } from 'node:fs';
import { access, lstat, realpath } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { isAbsolute, relative, resolve } from 'node:path';

import type { SourceContext, SourceContextOptions, SourceLanguage, SourceLine } from './types.js';

const languageByExtension: Readonly<Record<string, SourceLanguage>> = {
  '.cjs': 'javascript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
};

function detectLanguage(filePath: string): SourceLanguage {
  const extensionStart = filePath.lastIndexOf('.');
  const extension = extensionStart === -1 ? '' : filePath.slice(extensionStart).toLowerCase();

  return languageByExtension[extension] ?? 'unknown';
}

function isWithinProject(projectRoot: string, candidatePath: string): boolean {
  const pathFromRoot = relative(projectRoot, candidatePath);
  return pathFromRoot === '' || (!pathFromRoot.startsWith('..') && !isAbsolute(pathFromRoot));
}

function createContext(
  filePath: string,
  language: SourceLanguage,
  properties: Omit<SourceContext, 'filePath' | 'language'>,
): SourceContext {
  return { filePath, language, ...properties };
}

async function readWindow(
  filePath: string,
  targetLine: number,
  contextLines: number,
): Promise<{ lines: SourceLine[]; startLine?: number; endLine?: number }> {
  const startLine = Math.max(1, targetLine - contextLines);
  const requestedEndLine = targetLine + contextLines;
  const stream = createReadStream(filePath, { encoding: 'utf8' });
  const reader = createInterface({ crlfDelay: Number.POSITIVE_INFINITY, input: stream });
  const lines: SourceLine[] = [];
  let currentLine = 0;

  try {
    for await (const content of reader) {
      currentLine += 1;
      if (currentLine >= startLine && currentLine <= requestedEndLine) {
        lines.push({ content, number: currentLine });
      }

      if (currentLine >= requestedEndLine) {
        reader.close();
        stream.destroy();
      }
    }
  } finally {
    reader.close();
    stream.destroy();
  }

  const firstLine = lines.at(0);
  const lastLine = lines.at(-1);
  if (firstLine === undefined || lastLine === undefined) {
    return { lines };
  }

  return { endLine: lastLine.number, lines, startLine: firstLine.number };
}

/** Safely reads a small source window within the supplied project root. */
export async function getSourceContext(options: SourceContextOptions): Promise<SourceContext> {
  const projectRoot = resolve(options.projectRoot);
  const filePath = resolve(
    projectRoot,
    isAbsolute(options.filePath) ? options.filePath : options.filePath,
  );
  const language = detectLanguage(filePath);
  const contextLines = options.contextLines ?? 5;

  if (!isWithinProject(projectRoot, filePath)) {
    return createContext(filePath, language, {
      error: {
        code: 'outside-project',
        message: 'The requested file is outside the project root.',
      },
      exists: false,
      isOutsideProject: true,
      lines: [],
    });
  }

  if (!Number.isSafeInteger(options.line) || options.line < 1) {
    return createContext(filePath, language, {
      error: { code: 'invalid-line', message: 'The target line must be a positive integer.' },
      exists: false,
      isOutsideProject: false,
      lines: [],
    });
  }

  if (!Number.isSafeInteger(contextLines) || contextLines < 0) {
    return createContext(filePath, language, {
      error: {
        code: 'invalid-context-lines',
        message: 'contextLines must be a non-negative integer.',
      },
      exists: false,
      isOutsideProject: false,
      lines: [],
    });
  }

  try {
    await access(filePath);
    const fileStats = await lstat(filePath);
    if (!fileStats.isFile() && !fileStats.isSymbolicLink()) {
      return createContext(filePath, language, {
        error: { code: 'not-a-file', message: 'The requested path is not a file.' },
        exists: false,
        isOutsideProject: false,
        lines: [],
      });
    }

    const [resolvedProjectRoot, resolvedFilePath] = await Promise.all([
      realpath(projectRoot),
      realpath(filePath),
    ]);
    if (!isWithinProject(resolvedProjectRoot, resolvedFilePath)) {
      return createContext(filePath, language, {
        error: {
          code: 'outside-project',
          message: 'The requested file resolves outside the project root.',
        },
        exists: false,
        isOutsideProject: true,
        lines: [],
      });
    }

    const window = await readWindow(resolvedFilePath, options.line, contextLines);
    if (window.lines.length === 0) {
      return createContext(filePath, language, {
        error: { code: 'line-not-found', message: 'The target line is outside the file.' },
        exists: true,
        isOutsideProject: false,
        lines: [],
        targetLine: options.line,
      });
    }

    return createContext(filePath, language, {
      exists: true,
      isOutsideProject: false,
      lines: window.lines,
      targetLine: options.line,
      ...(window.startLine === undefined ? {} : { startLine: window.startLine }),
      ...(window.endLine === undefined ? {} : { endLine: window.endLine }),
    });
  } catch (error: unknown) {
    const code =
      error instanceof Error && 'code' in error && typeof error.code === 'string'
        ? error.code
        : 'read-failed';
    const message =
      error instanceof Error ? error.message : 'The requested file could not be read.';

    return createContext(filePath, language, {
      error: { code, message },
      exists: false,
      isOutsideProject: false,
      lines: [],
    });
  }
}

export { detectLanguage };
