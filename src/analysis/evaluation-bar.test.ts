// Tests for the evaluation bar: how much of it is White's for a score, and
// how the score is written on it.

import { describe, expect, it } from 'vitest';
import { fromWhitesSide, scoreLabel, whiteShare } from './evaluation-bar';

describe("White's share of the evaluation bar", () => {
  it('is half the bar in a level position', () => {
    expect(whiteShare({ centipawns: 0 })).toBe(0.5);
  });

  it('grows with White\'s advantage, and shrinks as much with the same advantage for Black', () => {
    const pawnUp = whiteShare({ centipawns: 100 });
    const twoPawnsUp = whiteShare({ centipawns: 200 });
    const pawnDown = whiteShare({ centipawns: -100 });

    expect(pawnUp).toBeGreaterThan(0.5);
    expect(twoPawnsUp).toBeGreaterThan(pawnUp);
    expect(pawnDown).toBeCloseTo(1 - pawnUp, 10);
  });

  it('stops growing past ten pawns, leaving a sliver of the bar to the losing side', () => {
    const tenPawnsUp = whiteShare({ centipawns: 1000 });
    const twentyPawnsUp = whiteShare({ centipawns: 2000 });

    expect(twentyPawnsUp).toBe(tenPawnsUp);
    expect(tenPawnsUp).toBeLessThan(1);
  });

  it('is the whole bar when White mates, and none of it when Black does', () => {
    expect(whiteShare({ mateIn: 3 })).toBe(1);
    expect(whiteShare({ mateIn: -2 })).toBe(0);
  });
});

describe("a score read from White's side", () => {
  it("changes sign when it was Black's", () => {
    expect(fromWhitesSide({ centipawns: 40 }, 'black')).toEqual({ centipawns: -40 });
    expect(fromWhitesSide({ mateIn: 2 }, 'black')).toEqual({ mateIn: -2 });
  });

  it("stays as it is when it was White's", () => {
    expect(fromWhitesSide({ centipawns: 40 }, 'white')).toEqual({ centipawns: 40 });
  });
});

describe('the score written on the bar', () => {
  /** Numbers as English writes them; the page passes the language's own way. */
  const decimal = (value: number, decimals: number): string => value.toFixed(decimals);

  it("is in pawns, to one decimal, signed for the side ahead", () => {
    expect(scoreLabel({ centipawns: 40 }, decimal)).toBe('+0.4');
    expect(scoreLabel({ centipawns: -120 }, decimal)).toBe('-1.2');
  });

  it('has no sign in a level position, nor in one that rounds to level', () => {
    expect(scoreLabel({ centipawns: 0 }, decimal)).toBe('0.0');
    expect(scoreLabel({ centipawns: -3 }, decimal)).toBe('0.0');
  });

  it('is M and the moves to mate, with a minus when Black mates', () => {
    expect(scoreLabel({ mateIn: 3 }, decimal)).toBe('M3');
    expect(scoreLabel({ mateIn: -2 }, decimal)).toBe('-M2');
  });
});
