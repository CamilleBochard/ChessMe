// Tests for where a player's moves sit in the Base Model's distribution, and
// for what cutting the least likely moves would change.

import { describe, expect, it } from 'vitest';
import { improbabilityProfile, measureCut, type PlacedMove } from './improbability';
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
