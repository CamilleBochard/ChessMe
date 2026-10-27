import { describe, expect, it } from 'vitest';
import { regressionGate } from './regression-gate';
import type { MoveMatchingScore } from './move-matching';

/** The gain of the Bot with the new Opening Book over the served Bot, on the drawn move, over every Test Set position. */
function gain(matched: number, standardError: number): MoveMatchingScore {
  return { matched: matched, positions: 1000, games: 50, standardError: standardError };
}

describe('regressionGate', () => {
  it('lets the new Opening Book through unless Move-Matching falls by more than two standard errors of the change', () => {
    // Falls by 1.5 points, with a standard error of 1 point: within two.
    expect(regressionGate(gain(-15, 0.01)).passes).toBe(true);
    // Falls by 2.5 points: beyond two standard errors.
    expect(regressionGate(gain(-25, 0.01)).passes).toBe(false);
    expect(regressionGate(gain(12, 0.01)).passes).toBe(true);
  });

  it('refuses a change whose spread cannot be measured', () => {
    expect(regressionGate(gain(0, Number.NaN)).passes).toBe(false);
  });
});
