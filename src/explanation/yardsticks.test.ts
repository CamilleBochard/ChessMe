// Tests for Camille's yardsticks: how rare a move of the Bot is among his own
// moves, and whether a game's figures sit inside the range his own games
// cover.

import { describe, expect, it } from 'vitest';
import type { Phase } from '../evaluation/move-matching';
import {
  gameImprobability,
  gameLosses,
  improbabilityYardstick,
  chanceBand,
  LOSS_PROFILE_EDGES,
  lossProfile,
  lossYardstick,
  moveRarity,
  type LossMove,
  type WeighedMove,
} from './yardsticks';

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

describe("the Bot's game so far against Camille's games", () => {
  // Ten games of his, the k-th with k middlegame moves under 1% out of ten:
  // the middle 80% of his games run from 0 to 0.8.
  const camilleMoves: WeighedMove[] = [];
  for (let rare = 0; rare < 10; rare++) {
    camilleMoves.push(...middlegameWithRareMoves(`game-${rare}`, rare));
  }
  const yardstick = improbabilityYardstick(camilleMoves);

  it('says there are too few moves to tell below eight moves in the Phase', () => {
    const botMoves = middlegameWithRareMoves('bot', 7).slice(0, 7);

    const verdicts = gameImprobability(botMoves, yardstick);

    expect(verdicts.middlegame).toEqual({ kind: 'too-few-moves', moves: 7 });
  });

  it("says the game's share is inside his usual range when it lies within the middle 80% of his games", () => {
    // Two moves under 1% out of ten: 0.2, between 0 and 0.8.
    const botMoves = middlegameWithRareMoves('bot', 2);

    const verdicts = gameImprobability(botMoves, yardstick);

    expect(verdicts.middlegame).toEqual({ kind: 'inside', moves: 10, figure: 0.2, spread: { games: 10, low: 0, high: 0.8 } });
  });

  it("says the game's share is above his usual range when it passes the 90th percentile of his games", () => {
    // Nine moves under 1% out of ten: 0.9, above 0.8.
    const botMoves = middlegameWithRareMoves('bot', 9);

    const verdicts = gameImprobability(botMoves, yardstick);

    expect(verdicts.middlegame.kind).toBe('above');
  });

  it("says the game's share is below his usual range when it falls under the 10th percentile of his games", () => {
    // His games here have three to nine moves under 1% out of ten, so the
    // middle 80% run from 0.3 to 0.9; a game without one falls below.
    const rarerGames: WeighedMove[] = [];
    for (let rare = 3; rare < 10; rare++) {
      rarerGames.push(...middlegameWithRareMoves(`game-${rare}`, rare));
    }
    const rarerYardstick = improbabilityYardstick(rarerGames);
    const botMoves = middlegameWithRareMoves('bot', 0);

    const verdicts = gameImprobability(botMoves, rarerYardstick);

    expect(verdicts.middlegame.kind).toBe('below');
  });
});

/** A game of the given player with eight middlegame moves in open positions, each losing the same. */
function middlegameLosing(game: string, centipawns: number): LossMove[] {
  const moves: LossMove[] = [];
  for (let index = 0; index < 8; index++) {
    moves.push({ game: game, phase: 'middlegame', centipawnLoss: centipawns, openPosition: true });
  }
  return moves;
}

describe("Camille's losses per game", () => {
  it("spread from the 10th to the 90th percentile of his games' average loss in open positions", () => {
    // Ten games averaging 10 to 100 centipawns. The first also has moves made
    // once the game was decided, which say nothing of his Level.
    const moves: LossMove[] = [];
    for (let tenth = 1; tenth <= 10; tenth++) {
      moves.push(...middlegameLosing(`game-${tenth}`, 10 * tenth));
    }
    for (let index = 0; index < 4; index++) {
      moves.push({ game: 'game-1', phase: 'middlegame', centipawnLoss: 500, openPosition: false });
    }

    const yardstick = lossYardstick(moves);

    expect(yardstick.phases.middlegame.perGame).toEqual({ games: 10, low: 10, high: 90 });
  });

  it('carries the profile of all his losses, whatever the Phase', () => {
    const moves: LossMove[] = [
      { game: 'game-1', phase: 'opening', centipawnLoss: 0, openPosition: true },
      { game: 'game-1', phase: 'endgame', centipawnLoss: 300, openPosition: true },
    ];

    const yardstick = lossYardstick(moves);

    expect(yardstick.profile).toEqual(lossProfile(moves));
  });
});

describe("the Bot's losses so far against Camille's games", () => {
  const camilleMoves: LossMove[] = [];
  for (let tenth = 1; tenth <= 10; tenth++) {
    camilleMoves.push(...middlegameLosing(`game-${tenth}`, 10 * tenth));
  }
  const yardstick = lossYardstick(camilleMoves);

  it('reads the average loss over the moves made in open positions only', () => {
    // Eight open moves losing 50 each, then three after the game was decided.
    const botMoves = middlegameLosing('bot', 50);
    for (let index = 0; index < 3; index++) {
      botMoves.push({ game: 'bot', phase: 'middlegame', centipawnLoss: 1000, openPosition: false });
    }

    const verdicts = gameLosses(botMoves, yardstick);

    expect(verdicts.middlegame).toEqual({ kind: 'inside', moves: 8, figure: 50, spread: { games: 10, low: 10, high: 90 } });
  });
});

describe('a profile of losses', () => {
  it('gives, for each edge, the share of moves in open positions that lost no more', () => {
    // Four open moves, and one made once the game was decided, which the
    // profile leaves out whatever it lost.
    const moves = [
      { centipawnLoss: 0, openPosition: true },
      { centipawnLoss: 20, openPosition: true },
      { centipawnLoss: 150, openPosition: true },
      { centipawnLoss: 600, openPosition: true },
      { centipawnLoss: 0, openPosition: false },
    ];

    const profile = lossProfile(moves);

    expect(LOSS_PROFILE_EDGES).toEqual([0, 10, 25, 50, 100, 200, 300, 500, 1000]);
    expect(profile).toEqual({ moves: 4, atMost: [0.25, 0.25, 0.5, 0.5, 0.5, 0.75, 0.75, 0.75, 1] });
  });

  it('holds no shares while no move in an open position has been measured', () => {
    const profile = lossProfile([{ centipawnLoss: 0, openPosition: false }]);

    expect(profile).toEqual({ moves: 0, atMost: [] });
  });
});

describe('the band chance alone leaves around his profile', () => {
  it('spreads each share by the 80% range of a sample as small as the Bot\'s', () => {
    // A share of a half read on 100 moves strays by 1.2816 standard errors,
    // 0.05 each, eight times in ten.
    const camille = { moves: 28000, atMost: [0.5] };

    const band = chanceBand(camille, 100);

    expect(band.low[0]).toBeCloseTo(0.5 - 0.06408, 4);
    expect(band.high[0]).toBeCloseTo(0.5 + 0.06408, 4);
  });

  it('stays between no move and every move', () => {
    const camille = { moves: 28000, atMost: [0.02, 0.99] };

    const band = chanceBand(camille, 4);

    expect(band.low[0]).toBe(0);
    expect(band.high[1]).toBe(1);
  });
});
