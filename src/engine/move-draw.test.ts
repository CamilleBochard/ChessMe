// Tests for drawing one move from a set of move probabilities.

import { describe, expect, it } from 'vitest';
import type { MoveProbability } from './base-model';
import { drawMove } from './move-draw';

describe('drawing a move from the Base Model probabilities', () => {
  const policy: MoveProbability[] = [
    { move: { from: 'e2', to: 'e4' }, probability: 0.7 },
    { move: { from: 'd2', to: 'd4' }, probability: 0.2 },
    { move: { from: 'g1', to: 'f3' }, probability: 0.1 },
  ];

  it('gives each move a share of the random range as wide as its probability', () => {
    // e2e4 owns [0, 0.7), d2d4 [0.7, 0.9), g1f3 [0.9, 1).
    expect(drawMove(policy, () => 0)).toEqual({ from: 'e2', to: 'e4' });
    expect(drawMove(policy, () => 0.75)).toEqual({ from: 'd2', to: 'd4' });
    expect(drawMove(policy, () => 0.95)).toEqual({ from: 'g1', to: 'f3' });
  });
});
