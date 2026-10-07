// Tests for how the write-up page presents the Base Model sweep: the table of
// every candidate and the choice made from it, both read from a record of the
// sweep.

import { describe, expect, it } from 'vitest';
import type { CandidateResult, SweepRecord } from '../evaluation/base-model-sweep';
import type { MoveMatchingScore } from '../evaluation/move-matching';
import { describeSweep } from './base-model-choice';

/** A score of matched in 10,000 positions from 400 games, with the standard error given in percent. */
function score(matched: number, errorInPercent: number): MoveMatchingScore {
  return { matched: matched, positions: 10_000, games: 400, standardError: errorInPercent / 100 };
}

/** A candidate scoring the same in every slice, so only its score after ply 10 matters. */
function candidate(name: string, family: string, rating: number, downloadBytes: number, matched: number): CandidateResult {
  const sameEverywhere = score(matched, 0.34);
  return {
    name: name,
    family: family,
    rating: rating,
    licence: `${family} licence`,
    downloadBytes: downloadBytes,
    report: {
      overall: sameEverywhere,
      afterPly10: sameEverywhere,
      byPhase: { opening: sameEverywhere, middlegame: sameEverywhere, endgame: sameEverywhere },
    },
  };
}

const SWEEP: SweepRecord = {
  measuredOn: '2026-10-07',
  runtime: 'Node 22.12.0',
  lichessRating: 1331,
  candidates: [
    candidate('maia1-1100', 'maia1', 1100, 2_400_000, 4719),
    candidate('maia3-5m at 1100', 'maia3', 1100, 19_000_000, 4935),
    candidate('maia3-5m at 1300', 'maia3', 1300, 19_000_000, 4927),
  ],
};

describe('the Base Model sweep shown on the write-up', () => {
  it("shows each candidate's Move-Matching per slice, with its standard error", () => {
    const sweep = describeSweep(SWEEP);

    expect(sweep.rows[1].candidate).toBe('maia3-5m at 1100');
    expect(sweep.rows[1].cells).toEqual([
      '49.35 ± 0.34',
      '49.35 ± 0.34',
      '49.35 ± 0.34',
      '49.35 ± 0.34',
      '49.35 ± 0.34',
    ]);
  });

  it('marks the candidate chosen as the Base Model and those tied with it', () => {
    const sweep = describeSweep(SWEEP);

    const standings = sweep.rows.map((row) => row.standing);
    expect(standings).toEqual(['measured', 'chosen', 'tied']);
  });

  it("states the Base Model chosen and Camille's Maia-Equivalent Rating against his Lichess rating", () => {
    const sweep = describeSweep(SWEEP);

    expect(sweep.chosen).toEqual({ candidate: 'maia3-5m at 1100', afterPly10: '49.35 ± 0.34' });
    expect(sweep.maiaEquivalentRating).toBe(1100);
    expect(sweep.againstLichessRating).toBe('231 points below his Lichess rating of 1331');
  });

  it('states how far the best candidate leads the best of every other family', () => {
    const sweep = describeSweep(SWEEP);

    // 49.35 for maia3-5m at 1100 against 47.19 for maia1-1100, a lead of 2.16
    // written to one decimal
    expect(sweep.leadOverOtherFamilies).toEqual({ points: '2.2', runnerUp: 'maia1-1100' });
  });

  it('states how many positions and games each slice holds', () => {
    const sweep = describeSweep(SWEEP);

    expect(sweep.slices[0]).toEqual({ positions: '10,000', games: '400' });
    expect(sweep.slices).toHaveLength(5);
  });

  it("compares the chosen candidate's errors with those of counting every position as independent", () => {
    // Half of 10,000 positions matched: counted as independent, the standard
    // error would be 0.50 points in every slice.
    const halfMatched = (errorInPercent: number) => score(5000, errorInPercent);
    const onlyCandidate: CandidateResult = {
      ...candidate('maia3-5m at 1100', 'maia3', 1100, 19_000_000, 5000),
      report: {
        overall: halfMatched(0.51),
        afterPly10: halfMatched(0.52),
        byPhase: { opening: halfMatched(0.475), middlegame: halfMatched(0.5), endgame: halfMatched(0.55) },
      },
    };

    const sweep = describeSweep({ ...SWEEP, candidates: [onlyCandidate] });

    expect(sweep.errorAgainstIndependentPositions).toEqual({ lowest: '0.95', highest: '1.10' });
  });
});
