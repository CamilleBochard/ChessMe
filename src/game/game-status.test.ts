// Tests for the game status module. Each way a game can end is checked with a
// known position from chess literature, next to the closest position where the
// game must still be going.

import { describe, expect, it } from 'vitest';
import { gameFromFen, newGame, playMove, type Game, type MoveRequest } from './game';
import { gameStatus } from './game-status';

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
});
