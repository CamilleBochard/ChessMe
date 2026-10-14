// Tests for Camille's yardsticks: how rare a move of the Bot is among his own
// moves, and whether a game's figures sit inside the range his own games
// cover.

import { describe, expect, it } from 'vitest';
import type { Phase } from '../evaluation/move-matching';
import { improbabilityYardstick, moveRarity } from './yardsticks';

/** One of Camille's moves, given the probability the Base Model gave it. */
function weighed(game: string, phase: Phase, probability: number) {
  return { game: game, phase: phase, probability: probability };
}

describe('the rarity of a move', () => {
  it("is the share of Camille's moves in the Phase the model gave no more than it", () => {
    const yardstick = improbabilityYardstick([
      weighed('a', 'middlegame', 0.001),
      weighed('a', 'middlegame', 0.01),
      weighed('b', 'middlegame', 0.1),
      weighed('b', 'middlegame', 0.5),
      weighed('b', 'endgame', 0.001),
    ]);

    expect(moveRarity(yardstick, 'middlegame', 0.01)).toBeCloseTo(0.5, 10);
    expect(moveRarity(yardstick, 'endgame', 0.01)).toBeCloseTo(1, 10);
  });
});
