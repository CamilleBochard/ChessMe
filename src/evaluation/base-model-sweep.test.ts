// Tests for choosing the Base Model from the results of the sweep. The scores
// are made up so that which candidates are tied can be read off directly: all
// are out of 1,000 positions after ply 10, so 5 positions is half a point.

import { describe, expect, it } from 'vitest';
import { chooseBaseModel, type CandidateResult } from './base-model-sweep';
import type { MoveMatchingScore } from './move-matching';

const MEGABYTE = 1_000_000;

function scoreOf(matched: number): MoveMatchingScore {
  return { matched: matched, positions: 1000, games: 100, standardError: 0.01 };
}

function candidate(name: string, family: string, matchedAfterPly10: number, downloadMegabytes: number): CandidateResult {
  const unused = scoreOf(0);
  return {
    name: name,
    family: family,
    rating: Number(name.slice(-4)),
    licence: 'GPL-3.0',
    downloadBytes: downloadMegabytes * MEGABYTE,
    report: {
      overall: unused,
      afterPly10: scoreOf(matchedAfterPly10),
      byPhase: { opening: unused, middlegame: unused, endgame: unused },
    },
  };
}

describe('chooseBaseModel', () => {
  it('chooses the candidate that matches most moves after ply 10 when no other is within half a point', () => {
    const results = [
      candidate('maia1-1200', 'maia1', 470, 2.3),
      candidate('maia1-1300', 'maia1', 490, 2.3),
      candidate('maia3-5m at 1300', 'maia3', 480, 19.2),
    ];

    const decision = chooseBaseModel(results);

    expect(decision.chosen.name).toBe('maia1-1300');
    expect(decision.tied).toEqual([]);
  });

  it('prefers the smaller download among candidates within half a point of the best', () => {
    const results = [
      candidate('maia1-1300', 'maia1', 486, 2.3),
      candidate('maia3-5m at 1300', 'maia3', 490, 19.2),
    ];

    const decision = chooseBaseModel(results);

    expect(decision.best.name).toBe('maia3-5m at 1300');
    expect(decision.tied.map((result) => result.name)).toEqual(['maia1-1300']);
    expect(decision.chosen.name).toBe('maia1-1300');
  });

  it('keeps the better score between tied members of one family, whose sizes differ only by chance', () => {
    const results = [
      candidate('maia1-1200', 'maia1', 487, 2.28),
      candidate('maia1-1300', 'maia1', 490, 2.3),
    ];

    const decision = chooseBaseModel(results);

    expect(decision.tied.map((result) => result.name)).toEqual(['maia1-1200']);
    expect(decision.chosen.name).toBe('maia1-1300');
  });

  it('takes the best scorer of the smaller family when several of its members are tied', () => {
    const results = [
      candidate('maia1-1200', 'maia1', 486, 2.28),
      candidate('maia1-1300', 'maia1', 488, 2.3),
      candidate('maia3-5m at 1300', 'maia3', 490, 19.2),
    ];

    const decision = chooseBaseModel(results);

    expect(decision.chosen.name).toBe('maia1-1300');
  });
});
