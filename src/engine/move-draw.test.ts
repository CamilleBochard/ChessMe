// Tests for drawing one move from a set of move probabilities.

import { describe, expect, it } from 'vitest';
import type { MoveProbability } from './base-model';
import { drawDescription, drawMove } from './move-draw';

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

describe('describing how the Bot draws', () => {
  it('names the top move at temperature 0', () => {
    expect(drawDescription(0, { kind: 'none' })).toBe('top move');
  });

  it('names the temperature, and the cut in the opening when there is one', () => {
    expect(drawDescription(1, { kind: 'none' })).toBe('drawn at temperature 1');
    expect(drawDescription(1.25, { kind: 'top-k', k: 10 })).toBe('drawn at temperature 1.25, top-10 in the opening');
  });
});
