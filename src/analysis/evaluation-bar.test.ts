// Tests for the evaluation bar: how much of it is White's for a score, and
// how the score is written on it.

import { describe, expect, it } from 'vitest';
import { currentFen, gameFromFen, newGame, playMove } from '../game/game';
import { barReading, fromWhitesSide, positionScores, scoreLabel, whiteShare } from './evaluation-bar';

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

/** Numbers as English writes them; the page passes the language's own way. */
const decimal = (value: number, decimals: number): string => value.toFixed(decimals);

describe('the score written on the bar', () => {
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

describe("the positions a Bot move's analysis evaluates", () => {
  it("are the one it moved from, scored by the best move, and the one it left, scored by the move played", () => {
    // The visitor opened 1. e4 and the Bot, playing Black, answered c5.
    const beforeTheBot = playMove(newGame(), { from: 'e2', to: 'e4' })!;
    const afterTheBot = playMove(beforeTheBot, { from: 'c7', to: 'c5' })!;
    // Stockfish scores for Black, the side that moved: a little worse with
    // the best move, a little worse still with c5.
    const analysis = { best: { centipawns: -30 }, played: { centipawns: -50 } };

    const scores = positionScores(beforeTheBot, { from: 'c7', to: 'c5' }, analysis);

    expect(scores).toEqual([
      { fen: currentFen(beforeTheBot), score: { centipawns: 30 } },
      { fen: currentFen(afterTheBot), score: { centipawns: 50 } },
    ]);
  });
});

describe('what the bar shows for the position on display', () => {
  it("is the position's score, when Stockfish has given one", () => {
    const afterE4 = playMove(newGame(), { from: 'e2', to: 'e4' })!;
    const scores = new Map([[currentFen(afterE4), { centipawns: 30 }]]);

    const reading = barReading(afterE4, scores, decimal);

    expect(reading).toEqual({ whiteShare: whiteShare({ centipawns: 30 }), label: '+0.3' });
  });

  it('is nothing yet when Stockfish has not scored the position', () => {
    expect(barReading(newGame(), new Map(), decimal)).toBeNull();
  });

  it("is all the winner's on a checkmate, with the result written on it", () => {
    // Fool's mate: Black mates on move two, a position no Bot move follows.
    let game = newGame();
    for (const move of [
      { from: 'f2', to: 'f3' },
      { from: 'e7', to: 'e5' },
      { from: 'g2', to: 'g4' },
      { from: 'd8', to: 'h4' },
    ] as const) {
      game = playMove(game, move)!;
    }

    expect(barReading(game, new Map(), decimal)).toEqual({ whiteShare: 0, label: '0-1' });
  });

  it('is shared on a draw the board decides, such as a stalemate', () => {
    // Black's king on h8 has no move and is not in check.
    const stalemate = gameFromFen('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');

    expect(barReading(stalemate, new Map(), decimal)).toEqual({ whiteShare: 0.5, label: '½-½' });
  });
});
