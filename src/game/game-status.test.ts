// Tests for the game status module. Each way a game can end is checked with a
// known position from chess literature, next to the closest position where the
// game must still be going.

import { describe, expect, it } from 'vitest';
import { gameFromFen, newGame, playMove, resign, type Game, type MoveRequest } from './game';
import { describeResult, gameStatus } from './game-status';

/** Plays a sequence of moves, failing loudly if one is illegal. */
function playMoves(moves: MoveRequest[], from: Game = newGame()): Game {
  let game = from;
  for (const move of moves) {
    const next = playMove(game, move);
    if (next === null) {
      throw new Error(`Illegal move in test setup: ${move.from}-${move.to}`);
    }
    game = next;
  }
  return game;
}

describe('gameStatus', () => {
  it('is ongoing at the start', () => {
    expect(gameStatus(newGame())).toEqual({ kind: 'ongoing' });
  });

  it("ends Fool's Mate with black winning", () => {
    const foolsMate = playMoves([
      { from: 'f2', to: 'f3' },
      { from: 'e7', to: 'e5' },
      { from: 'g2', to: 'g4' },
      { from: 'd8', to: 'h4' },
    ]);

    expect(gameStatus(foolsMate)).toEqual({ kind: 'checkmate', winner: 'black' });
  });

  it('ends a back-rank mate with white winning', () => {
    const blackKingBehindItsPawns = gameFromFen('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1');

    const backRankMate = playMoves([{ from: 'a1', to: 'a8' }], blackKingBehindItsPawns);

    expect(gameStatus(backRankMate)).toEqual({ kind: 'checkmate', winner: 'white' });
  });

  it('keeps going when the king is in check but can escape', () => {
    const escapeSquareOnH7 = gameFromFen('6k1/5pp1/8/8/8/8/8/R5K1 w - - 0 1');

    const checkOnly = playMoves([{ from: 'a1', to: 'a8' }], escapeSquareOnH7);

    expect(gameStatus(checkOnly)).toEqual({ kind: 'ongoing' });
  });

  it('ends in stalemate when the side to move has no legal move and is not in check', () => {
    // Black's king on h8 is boxed in by the queen on f7 and the king on g6.
    const queenTooClose = gameFromFen('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');

    expect(gameStatus(queenTooClose)).toEqual({ kind: 'stalemate' });
  });

  it('ends king against king as a draw by insufficient material', () => {
    const bareKings = gameFromFen('4k3/8/8/8/8/8/8/4K3 w - - 0 1');

    expect(gameStatus(bareKings)).toEqual({ kind: 'insufficient-material' });
  });

  it('ends king and bishop against king as a draw by insufficient material', () => {
    const loneBishop = gameFromFen('4k3/8/8/8/8/8/8/2B1K3 w - - 0 1');

    expect(gameStatus(loneBishop)).toEqual({ kind: 'insufficient-material' });
  });

  it('ends king and knight against king as a draw by insufficient material', () => {
    const loneKnight = gameFromFen('4k3/8/8/8/8/8/8/1N2K3 w - - 0 1');

    expect(gameStatus(loneKnight)).toEqual({ kind: 'insufficient-material' });
  });

  it('keeps going with king and rook against king, which can still mate', () => {
    const loneRook = gameFromFen('4k3/8/8/8/8/8/8/R3K3 w - - 0 1');

    expect(gameStatus(loneRook)).toEqual({ kind: 'ongoing' });
  });

  describe('fifty-move rule', () => {
    // 99 half-moves have passed without a capture or a pawn move.
    const oneHalfMoveShort = '4k3/8/8/8/8/8/4P3/R3K3 w - - 99 80';

    it('ends the game on the hundredth half-move without a capture or pawn move', () => {
      const game = gameFromFen(oneHalfMoveShort);

      const quietRookMove = playMoves([{ from: 'a1', to: 'a2' }], game);

      expect(gameStatus(quietRookMove)).toEqual({ kind: 'fifty-move-rule' });
    });

    it('keeps going when that move is a pawn move, which resets the count', () => {
      const game = gameFromFen(oneHalfMoveShort);

      const pawnMove = playMoves([{ from: 'e2', to: 'e3' }], game);

      expect(gameStatus(pawnMove)).toEqual({ kind: 'ongoing' });
    });

    it('lets a checkmate on the hundredth half-move stand as checkmate', () => {
      const backRankMateAvailable = gameFromFen('6k1/5ppp/8/8/8/8/8/R5K1 w - - 99 80');

      const mateOnTheLastMove = playMoves([{ from: 'a1', to: 'a8' }], backRankMateAvailable);

      expect(gameStatus(mateOnTheLastMove)).toEqual({ kind: 'checkmate', winner: 'white' });
    });
  });

  describe('threefold repetition', () => {
    // Both knights go out and come back, returning to the starting position.
    const knightsOutAndBack: MoveRequest[] = [
      { from: 'g1', to: 'f3' },
      { from: 'g8', to: 'f6' },
      { from: 'f3', to: 'g1' },
      { from: 'f6', to: 'g8' },
    ];

    it('ends the game when the starting position occurs for the third time', () => {
      const thirdOccurrence = playMoves([...knightsOutAndBack, ...knightsOutAndBack]);

      expect(gameStatus(thirdOccurrence)).toEqual({ kind: 'threefold-repetition' });
    });

    it('keeps going on the second occurrence', () => {
      const secondOccurrence = playMoves(knightsOutAndBack);

      expect(gameStatus(secondOccurrence)).toEqual({ kind: 'ongoing' });
    });

    it('does not count a position as repeated once castling rights have been lost', () => {
      // After 1.e4 e5 both kings walk out and back twice. The pieces stand where
      // they stood after 1...e5 three times, but the first time both sides could
      // still castle, so by the rules it has only occurred twice.
      const kingsWalkOutAndBack: MoveRequest[] = [
        { from: 'e1', to: 'e2' },
        { from: 'e8', to: 'e7' },
        { from: 'e2', to: 'e1' },
        { from: 'e7', to: 'e8' },
      ];

      const game = playMoves([
        { from: 'e2', to: 'e4' },
        { from: 'e7', to: 'e5' },
        ...kingsWalkOutAndBack,
        ...kingsWalkOutAndBack,
      ]);

      expect(gameStatus(game)).toEqual({ kind: 'ongoing' });
    });
  });

  it('ends with the other side winning when a side resigns', () => {
    const afterOneMove = playMoves([{ from: 'e2', to: 'e4' }]);

    expect(gameStatus(resign(afterOneMove, 'white'))).toEqual({ kind: 'resignation', winner: 'black' });
    expect(gameStatus(resign(afterOneMove, 'black'))).toEqual({ kind: 'resignation', winner: 'white' });
  });
});

describe('describeResult', () => {
  it('names the winner on checkmate', () => {
    expect(describeResult({ kind: 'checkmate', winner: 'white' })).toBe('Checkmate. White wins.');
    expect(describeResult({ kind: 'checkmate', winner: 'black' })).toBe('Checkmate. Black wins.');
  });

  it('names who resigned and who won', () => {
    expect(describeResult({ kind: 'resignation', winner: 'white' })).toBe('Black resigns. White wins.');
    expect(describeResult({ kind: 'resignation', winner: 'black' })).toBe('White resigns. Black wins.');
  });

  it.each([
    [{ kind: 'stalemate' } as const, 'Draw by stalemate.'],
    [{ kind: 'insufficient-material' } as const, 'Draw by insufficient material.'],
    [{ kind: 'fifty-move-rule' } as const, 'Draw by the fifty-move rule.'],
    [{ kind: 'threefold-repetition' } as const, 'Draw by threefold repetition.'],
  ])('names the rule that drew the game: %o', (status, sentence) => {
    expect(describeResult(status)).toBe(sentence);
  });

  it('is null while the game is ongoing', () => {
    expect(describeResult({ kind: 'ongoing' })).toBeNull();
  });
});
