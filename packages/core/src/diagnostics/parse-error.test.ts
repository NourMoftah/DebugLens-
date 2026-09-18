import { describe, expect, it } from 'vitest';

import { parseError } from './parse-error.js';

describe('parseError', () => {
  it('parses a standard TypeError and its primary location', () => {
    const diagnostic = parseError(`TypeError: Cannot read properties of undefined (reading 'map')
    at UserList (/project/src/components/UserList.tsx:42:18)
    at renderComponent (/project/src/app.tsx:18:5)`);

    expect(diagnostic).toEqual({
      error: {
        message: "Cannot read properties of undefined (reading 'map')",
        name: 'TypeError',
      },
      primaryLocation: {
        column: 18,
        filePath: '/project/src/components/UserList.tsx',
        line: 42,
      },
      stack: [
        {
          column: 18,
          filePath: '/project/src/components/UserList.tsx',
          functionName: 'UserList',
          isInternal: false,
          isNative: false,
          line: 42,
        },
        {
          column: 5,
          filePath: '/project/src/app.tsx',
          functionName: 'renderComponent',
          isInternal: false,
          isNative: false,
          line: 18,
        },
      ],
    });
  });

  it('detects ReferenceError and SyntaxError headings', () => {
    expect(parseError('ReferenceError: accountId is not defined').error).toEqual({
      message: 'accountId is not defined',
      name: 'ReferenceError',
    });
    expect(parseError('SyntaxError: Unexpected token }').error).toEqual({
      message: 'Unexpected token }',
      name: 'SyntaxError',
    });
  });

  it('returns a heading without a stack', () => {
    const diagnostic = parseError('Error: Something went wrong');

    expect(diagnostic).toEqual({
      error: { message: 'Something went wrong', name: 'Error' },
      stack: [],
    });
    expect(diagnostic.primaryLocation).toBeUndefined();
  });

  it('parses frames without a function name', () => {
    expect(parseError('Error: failed\n    at /project/src/app.ts:18:5').stack).toEqual([
      {
        column: 5,
        filePath: '/project/src/app.ts',
        isInternal: false,
        isNative: false,
        line: 18,
      },
    ]);
  });

  it('parses async frames', () => {
    expect(
      parseError('Error: failed\n    at async loadUser (/project/src/user.ts:9:2)').stack[0],
    ).toMatchObject({
      column: 2,
      filePath: '/project/src/user.ts',
      functionName: 'loadUser',
      line: 9,
    });
  });

  it('marks Node.js internal frames and prefers a later source location', () => {
    const diagnostic = parseError(`Error: failed
    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)
    at run (/project/src/run.ts:11:4)`);

    expect(diagnostic.stack[0]).toMatchObject({ isInternal: true, isNative: false });
    expect(diagnostic.primaryLocation).toEqual({
      column: 4,
      filePath: '/project/src/run.ts',
      line: 11,
    });
  });

  it('uses an internal frame when it is the only location', () => {
    expect(
      parseError('Error: failed\n    at processTicks (node:internal/process/task_queues:95:5)')
        .primaryLocation,
    ).toEqual({
      column: 5,
      filePath: 'node:internal/process/task_queues',
      line: 95,
    });
  });

  it('parses Windows-style paths', () => {
    expect(
      parseError('Error: failed\n    at main (C:\\work\\debuglens\\src\\main.ts:27:9)').stack[0],
    ).toMatchObject({
      column: 9,
      filePath: 'C:\\work\\debuglens\\src\\main.ts',
      functionName: 'main',
      line: 27,
    });
  });

  it('represents native frames without a file path', () => {
    expect(parseError('RangeError: failed\n    at Array.map (native)').stack[0]).toEqual({
      functionName: 'Array.map',
      isInternal: false,
      isNative: true,
    });
  });

  it('handles malformed and empty input safely', () => {
    const malformedDiagnostic = parseError('not a standard error\n at malformed frame');
    const emptyDiagnostic = parseError('');

    expect(malformedDiagnostic).toEqual({
      error: { message: 'not a standard error', name: 'Error' },
      stack: [],
    });
    expect(malformedDiagnostic.primaryLocation).toBeUndefined();
    expect(emptyDiagnostic).toEqual({
      error: { message: '', name: 'Error' },
      stack: [],
    });
    expect(emptyDiagnostic.primaryLocation).toBeUndefined();
  });

  it('keeps valid frames when mixed with malformed frames', () => {
    const diagnostic = parseError(`AggregateError: multiple failures
    at malformed frame
    at valid (/project/src/valid.ts:3:7)
    at another malformed frame`);

    expect(diagnostic.stack).toHaveLength(1);
    expect(diagnostic.stack[0]).toMatchObject({
      filePath: '/project/src/valid.ts',
      functionName: 'valid',
      line: 3,
    });
  });
});
