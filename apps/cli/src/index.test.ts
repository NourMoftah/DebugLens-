import { describe, expect, it, vi } from 'vitest';

import { run } from './index.js';

describe('DebugLens CLI', () => {
  it('prints its version', () => {
    const output = { error: vi.fn(), log: vi.fn() };

    expect(run(['--version'], output)).toBe(0);
    expect(output.log).toHaveBeenCalledWith('0.1.0');
    expect(output.error).not.toHaveBeenCalled();
  });

  it('shows help', () => {
    const output = { error: vi.fn(), log: vi.fn() };

    expect(run(['--help'], output)).toBe(0);
    expect(output.log).toHaveBeenCalledWith(expect.stringContaining('Usage:'));
  });
});
