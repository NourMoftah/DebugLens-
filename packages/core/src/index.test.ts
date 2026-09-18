import { describe, expect, it } from 'vitest';

import { getCoreStatus, parseError } from './index.js';

describe('DebugLens core', () => {
  it('exposes an executable public entry point', () => {
    expect(getCoreStatus()).toBe('DebugLens core foundation');
  });

  it('exposes the diagnostic parser', () => {
    expect(parseError('Error: available')).toMatchObject({
      error: { message: 'available', name: 'Error' },
    });
  });
});
