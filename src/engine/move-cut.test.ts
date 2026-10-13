// Tests for cutting the Base Model's least likely moves out of the draw.

import { describe, expect, it } from 'vitest';
import type { MoveProbability } from './base-model';
import { cutPolicy } from './move-cut';

describe('cutting the least likely moves', () => {
  const policy: MoveProbability[] = [
    { move: { from: 'e2', to: 'e4' }, probability: 0.5 },
    { move: { from: 'd2', to: 'd4' }, probability: 0.3 },
    { move: { from: 'g1', to: 'f3' }, probability: 0.15 },
    { move: { from: 'a2', to: 'a3' }, probability: 0.05 },
  ];

  it('keeps the k most likely moves, rescaled to sum to one', () => {
    const kept = cutPolicy(policy, { kind: 'top-k', k: 2 });

    expect(kept.map((candidate) => candidate.move)).toEqual([
      { from: 'e2', to: 'e4' },
      { from: 'd2', to: 'd4' },
    ]);
    expect(kept[0].probability).toBeCloseTo(0.625);
    expect(kept[1].probability).toBeCloseTo(0.375);
  });

  it('keeps the most likely moves until together they cover the share p', () => {
    // 0.5 falls short of 0.85, 0.5 + 0.3 too; adding g1f3 reaches 0.95.
    const kept = cutPolicy(policy, { kind: 'top-p', p: 0.85 });

    expect(kept.map((candidate) => candidate.move.to)).toEqual(['e4', 'd4', 'f3']);
    expect(kept[2].probability).toBeCloseTo(0.15 / 0.95);
  });

  it('keeps the moves with at least a fraction of the most likely move probability', () => {
    // A fifth of e2e4's 0.5 is 0.1: g1f3 at 0.15 stays, a2a3 at 0.05 goes.
    const kept = cutPolicy(policy, { kind: 'min-p', fraction: 0.2 });

    expect(kept.map((candidate) => candidate.move.to)).toEqual(['e4', 'd4', 'f3']);
  });

  it('keeps every move when there is no cut', () => {
    expect(cutPolicy(policy, { kind: 'none' })).toEqual(policy);
  });
});
