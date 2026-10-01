// Tests for the game module. Every test goes through the public functions: a
// position or a move in, a game or a refusal out. Expected values come from the
// rules of chess, written out by hand, never from asking chessops.

import { describe, expect, it } from 'vitest';
import { currentFen, gameFromFen, newGame, sideToMove } from './game';

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
