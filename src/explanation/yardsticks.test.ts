// Tests for Camille's yardsticks: how rare a move of the Bot is among his own
// moves, and whether a game's figures sit inside the range his own games
// cover.

import { describe, expect, it } from 'vitest';
import type { Phase } from '../evaluation/move-matching';
import { improbabilityYardstick, moveRarity, type WeighedMove } from './yardsticks';

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

  it('is read between the two probabilities of the ladder around the move, on a logarithmic scale', () => {
    const yardstick = improbabilityYardstick([weighed('a', 'middlegame', 0.001), weighed('a', 'middlegame', 0.01)]);
    // Halfway, on a logarithmic scale, between the rungs 10^-2.1, where half
    // of his moves lie at or below, and 10^-2, where all of them do.
    const halfwayBetweenRungs = Math.pow(10, -2.05);

    expect(moveRarity(yardstick, 'middlegame', halfwayBetweenRungs)).toBeCloseTo(0.75, 10);
  });
});

/** A game of Camille's with ten middlegame moves, the given number of them under 1%. */
function middlegameWithRareMoves(game: string, rare: number): WeighedMove[] {
  const moves: WeighedMove[] = [];
  for (let index = 0; index < 10; index++) {
    let probability = 0.3;
    if (index < rare) {
      probability = 0.005;
    }
    moves.push(weighed(game, 'middlegame', probability));
  }
  return moves;
}

describe("the spread of Camille's games", () => {
  it('runs from the 10th to the 90th percentile of his games\' shares of moves under 1%', () => {
    // Ten games, the k-th with k moves under 1% out of ten: shares 0 to 0.9.
    const moves: WeighedMove[] = [];
    for (let rare = 0; rare < 10; rare++) {
      moves.push(...middlegameWithRareMoves(`game-${rare}`, rare));
    }

    const yardstick = improbabilityYardstick(moves);

    expect(yardstick.phases.middlegame.perGame).toEqual({ games: 10, low: 0, high: 0.8 });
  });

  it('leaves out a game with fewer moves in the Phase than a verdict needs', () => {
    const moves: WeighedMove[] = [];
    for (let rare = 0; rare < 10; rare++) {
      moves.push(...middlegameWithRareMoves(`game-${rare}`, rare));
    }
    // Seven moves, every one under 1%: one short of a verdict.
    for (let index = 0; index < 7; index++) {
      moves.push(weighed('short', 'middlegame', 0.005));
    }

    const yardstick = improbabilityYardstick(moves);

    expect(yardstick.phases.middlegame.perGame).toEqual({ games: 10, low: 0, high: 0.8 });
  });

  it('has no spread for a Phase where none of his games holds enough moves', () => {
    const moves = [weighed('a', 'opening', 0.3), weighed('a', 'opening', 0.005), weighed('b', 'opening', 0.3)];

    const yardstick = improbabilityYardstick(moves);

    expect(yardstick.phases.opening.perGame).toBeNull();
  });
});
