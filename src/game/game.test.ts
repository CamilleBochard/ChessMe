// Tests for the game module. Every test goes through the public functions: a
// position or a move in, a game or a refusal out. Expected values come from the
// rules of chess, written out by hand, never from asking chessops.

import { describe, expect, it } from 'vitest';
import { currentFen, gameFromFen, newGame, playMove, sideToMove } from './game';

describe('newGame', () => {
  it('starts from the standard position with white to move', () => {
    const game = newGame();

    expect(currentFen(game)).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    expect(sideToMove(game)).toBe('white');
  });
});

describe('gameFromFen', () => {
  it('starts from the position the FEN describes', () => {
    const afterKingsPawn = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

    const game = gameFromFen(afterKingsPawn);

    expect(currentFen(game)).toBe(afterKingsPawn);
    expect(sideToMove(game)).toBe('black');
  });

  it('names the FEN when it cannot be parsed', () => {
    expect(() => gameFromFen('not a fen')).toThrow('Invalid FEN: not a fen');
  });

  it('refuses a well-formed FEN describing an impossible position', () => {
    const noKings = '8/8/8/8/8/8/8/8 w - - 0 1';

    expect(() => gameFromFen(noKings)).toThrow(`Impossible position: ${noKings}`);
  });
});

describe('playMove', () => {
  it('plays a legal move and hands the turn to the other side', () => {
    const game = newGame();

    const next = playMove(game, { from: 'e2', to: 'e4' });

    expect(next).not.toBeNull();
    expect(currentFen(next!)).toBe('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');
    expect(sideToMove(next!)).toBe('black');
  });

  it('refuses a move the piece cannot make', () => {
    const game = newGame();

    const pawnThreeSquares = playMove(game, { from: 'e2', to: 'e5' });

    expect(pawnThreeSquares).toBeNull();
  });

  it("refuses moving the opponent's piece", () => {
    const game = newGame();

    const blackMovesFirst = playMove(game, { from: 'e7', to: 'e5' });

    expect(blackMovesFirst).toBeNull();
  });

  it('refuses a move that leaves your own king in check', () => {
    // The white knight on e4 stands between its king on e1 and the black rook on e8.
    const pinnedKnight = gameFromFen('4r1k1/8/8/8/4N3/8/8/4K3 w - - 0 1');

    const knightLeavesThePin = playMove(pinnedKnight, { from: 'e4', to: 'f6' });

    expect(knightLeavesThePin).toBeNull();
  });

  it('leaves the original game untouched', () => {
    const game = newGame();

    playMove(game, { from: 'e2', to: 'e4' });

    expect(currentFen(game)).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  });
});
