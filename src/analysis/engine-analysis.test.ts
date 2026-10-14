// Tests for analysis mode's measure of a move: the evaluation it lost against
// the best move, read as the Blunder Profile reads it, and the conversation
// with the engine that produces it.

import { describe, expect, it } from 'vitest';
import { moveLoss } from './engine-analysis';

describe('the evaluation a move lost', () => {
  it('is how far the played move scores below the best one, from the side that moved', () => {
    const loss = moveLoss({ best: { centipawns: 50 }, played: { centipawns: -30 } });

    expect(loss).toEqual({ centipawnLoss: 80, openPosition: true });
  });

  it('is nothing when the played move, searched on its own, scores a little above the best', () => {
    const loss = moveLoss({ best: { centipawns: 20 }, played: { centipawns: 24 } });

    expect(loss.centipawnLoss).toBe(0);
  });

  it('reads a score beyond ten pawns, and any mate, as ten pawns', () => {
    // Mate in three against +2: a mate counts as +10, so the move lost 8 pawns.
    const missedMate = moveLoss({ best: { mateIn: 3 }, played: { centipawns: 200 } });
    // +25 against +15, both beyond the cap: read as +10 against +10.
    const stillWinning = moveLoss({ best: { centipawns: 2500 }, played: { centipawns: 1500 } });

    expect(missedMate.centipawnLoss).toBe(800);
    expect(stillWinning.centipawnLoss).toBe(0);
  });
});
