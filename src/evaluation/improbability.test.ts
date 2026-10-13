// Tests for where a player's moves sit in the Base Model's distribution, and
// for what cutting the least likely moves would change.

import { describe, expect, it } from 'vitest';
import { chooseCut, improbabilityProfile, measureCut, phaseCutAdvantage, type PlacedMove } from './improbability';
import { seededRandom } from './seeded-random';
import type { Phase } from './move-matching';

/** A move of the given rank in a position whose policy, most likely first, is given. */
function placed(game: string, phase: Phase, policy: number[], rank: number, centipawnLoss?: number): PlacedMove {
  return {
    game: game,
    ply: 20,
    phase: phase,
    move: 'e2e4',
    policy: policy,
    rank: rank,
    probability: policy[rank - 1],
    centipawnLoss: centipawnLoss,
  };
}

describe("Camille's improbability profile", () => {
  it('gives, per Phase, the share of moves the model gave less than 1%, 2% and 5%', () => {
    const policy = [0.8, 0.12, 0.045, 0.015, 0.008, 0.007];
    const moves = [
      placed('a', 'middlegame', policy, 1),
      placed('a', 'middlegame', policy, 3),
      placed('a', 'middlegame', policy, 4),
      placed('b', 'middlegame', policy, 6),
      placed('b', 'endgame', policy, 2),
    ];

    const profile = improbabilityProfile(moves);

    // Middlegame: 0.8 is above every threshold, 0.045 under 5%, 0.015 under
    // 2% and 5%, 0.007 under all three.
    expect(profile.middlegame.moves).toBe(4);
    expect(profile.middlegame.below).toEqual([0.25, 0.5, 0.75]);
    expect(profile.endgame.below).toEqual([0, 0, 0]);
    expect(profile.opening.moves).toBe(0);
  });
});

describe('the Bot under a cut', () => {
  const policy = [0.8, 0.12, 0.045, 0.015, 0.008, 0.007];

  it("gives the Bot's expected share of improbable moves, drawing among the kept moves rescaled", () => {
    // In the second position every move is likely, so it brings no improbable move.
    const moves = [placed('a', 'middlegame', policy, 1), placed('a', 'middlegame', [0.5, 0.5], 1)];

    const uncut = measureCut(moves, { kind: 'none' });
    const fourKept = measureCut(moves, { kind: 'top-k', k: 4 });

    // Without a cut, the first position puts 0.015 on moves under 1%, 0.03
    // under 2% and 0.075 under 5%; averaged with the second, half of that.
    expect(uncut.byPhase.middlegame.botBelow[0]).toBeCloseTo(0.0075);
    expect(uncut.byPhase.middlegame.botBelow[1]).toBeCloseTo(0.015);
    expect(uncut.byPhase.middlegame.botBelow[2]).toBeCloseTo(0.0375);
    // Keeping four moves leaves 0.98 to rescale: nothing under 1%, 0.015
    // under 2%, 0.06 under 5%. The thresholds read the uncut probabilities.
    expect(fourKept.byPhase.middlegame.botBelow[0]).toBe(0);
    expect(fourKept.byPhase.middlegame.botBelow[1]).toBeCloseTo(0.015 / 0.98 / 2);
    expect(fourKept.byPhase.middlegame.botBelow[2]).toBeCloseTo(0.06 / 0.98 / 2);
  });

  it("gives the share of the player's moves the cut makes impossible", () => {
    const moves = [placed('a', 'endgame', policy, 1), placed('a', 'endgame', policy, 3)];

    const twoKept = measureCut(moves, { kind: 'top-k', k: 2 });

    expect(twoKept.byPhase.endgame.movesMadeImpossible).toBe(0.5);
  });

  it('gives the share of the mistakes, moves losing 300 centipawns or more, the cut makes impossible', () => {
    const moves = [
      placed('a', 'endgame', policy, 3, 400),
      placed('a', 'endgame', policy, 1, 300),
      placed('a', 'endgame', policy, 3, 299),
    ];

    const twoKept = measureCut(moves, { kind: 'top-k', k: 2 });

    expect(twoKept.byPhase.endgame.mistakes).toBe(2);
    expect(twoKept.byPhase.endgame.mistakesMadeImpossible).toBe(0.5);
  });

  it('gives the same figures over every move, whatever its Phase, for the trade-off', () => {
    const moves = [placed('a', 'opening', policy, 1), placed('a', 'middlegame', policy, 3), placed('a', 'endgame', policy, 1)];

    const twoKept = measureCut(moves, { kind: 'top-k', k: 2 });

    expect(twoKept.all.moves).toBe(3);
    expect(twoKept.all.movesMadeImpossible).toBeCloseTo(1 / 3);
  });
});

describe('choosing the cut', () => {
  // Without a cut the Bot puts 0.01 of its draw on the two moves under 1%;
  // keeping two moves, nothing.
  const twoImprobable = [0.6, 0.39, 0.005, 0.005];

  it("weighs each Phase's gap under 1% by Camille's share of moves in it", () => {
    // Opening: his one move is improbable, so no cut is 0.01 closer there.
    // Endgame: his three moves are likely, so the cut is 0.01 closer there.
    // With three times the moves, the endgame decides: no cut is at
    // 0.25 x 0.99 + 0.75 x 0.01 = 0.255, the cut at 0.25 x 1 = 0.25.
    // Pooling every move instead would favour no cut.
    const camille = [
      placed('a', 'opening', twoImprobable, 3),
      placed('a', 'endgame', twoImprobable, 1),
      placed('a', 'endgame', twoImprobable, 1),
      placed('a', 'endgame', twoImprobable, 2),
    ];

    const choice = chooseCut(camille, [{ kind: 'none' }, { kind: 'top-k', k: 2 }]);

    expect(choice.chosen).toEqual({ kind: 'top-k', k: 2 });
    expect(choice.candidates[0].distance).toBeCloseTo(0.255);
    expect(choice.candidates[1].distance).toBeCloseTo(0.25);
  });

  it('breaks a tie with the cut that keeps more of his moves', () => {
    // No move is under 1%, so every cut leaves the Bot at Camille's share,
    // zero; keeping two moves forbids his third-ranked one.
    const nothingImprobable = [0.5, 0.3, 0.2];
    const camille = [placed('a', 'middlegame', nothingImprobable, 1), placed('a', 'middlegame', nothingImprobable, 3)];

    const choice = chooseCut(camille, [{ kind: 'top-k', k: 2 }, { kind: 'top-k', k: 3 }]);

    expect(choice.chosen).toEqual({ kind: 'top-k', k: 3 });
  });

  it('counts distances equal to the hundredth of a percentage point as a tie', () => {
    // Camille plays one move under 1% in 40,000, the fourth-ranked one: a
    // share of 0.0025%. No cut leaves the Bot at 0.01%, 0.0075 points away;
    // keeping three moves leaves it at 0.005%, 0.0025 points away. Closer,
    // but by less than a hundredth of a point, and it forbids his move.
    const twoVeryImprobable = [0.5, 0.4999, 0.00005, 0.00005];
    const camille = [placed('a', 'middlegame', twoVeryImprobable, 4)];
    for (let move = 1; move < 40_000; move++) {
      camille.push(placed('a', 'middlegame', twoVeryImprobable, 1));
    }

    const choice = chooseCut(camille, [{ kind: 'top-k', k: 3 }, { kind: 'none' }]);

    expect(choice.chosen).toEqual({ kind: 'none' });
  });
});

describe("how far a Phase's own best cut beats the chosen one", () => {
  const twoImprobable = [0.6, 0.39, 0.005, 0.005];

  it('resamples whole games, so identical games leave no room for chance', () => {
    // In every game Camille plays a likely move: no cut is 0.01 from him,
    // keeping two moves is exactly at his share.
    const camille = [
      placed('a', 'middlegame', twoImprobable, 1),
      placed('b', 'middlegame', twoImprobable, 2),
      placed('c', 'middlegame', twoImprobable, 1),
    ];

    const advantage = phaseCutAdvantage(camille, 'middlegame', {
      chosen: { kind: 'none' },
      phaseBest: { kind: 'top-k', k: 2 },
      resamples: 200,
      random: seededRandom(13),
    });

    expect(advantage.difference).toBeCloseTo(0.01);
    expect(advantage.low).toBeCloseTo(0.01);
    expect(advantage.high).toBeCloseTo(0.01);
  });

  it('spreads with the games drawn: the middle 95% of the resampled differences', () => {
    // Over all three games Camille plays a third of his moves under 1%, so
    // no cut, at 0.01, is closer than the cut, at 0. A resample without
    // game a has him at 0 and reverses that; one in four or so draws it.
    const camille = [
      placed('a', 'middlegame', twoImprobable, 3),
      placed('b', 'middlegame', twoImprobable, 1),
      placed('c', 'middlegame', twoImprobable, 1),
    ];

    const advantage = phaseCutAdvantage(camille, 'middlegame', {
      chosen: { kind: 'none' },
      phaseBest: { kind: 'top-k', k: 2 },
      resamples: 200,
      random: seededRandom(13),
    });

    expect(advantage.difference).toBeCloseTo(-0.01);
    expect(advantage.low).toBeCloseTo(-0.01);
    expect(advantage.high).toBeCloseTo(0.01);
  });
});
