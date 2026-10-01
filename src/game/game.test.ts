// Tests for the game module. Every test goes through the public functions: a
// position or a move in, a game or a refusal out. Expected values come from the
// rules of chess, written out by hand, never from asking chessops.

import { describe, expect, it } from 'vitest';
import { currentFen, gameFromFen, isPromotion, newGame, playMove, sideToMove } from './game';

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

describe('castling', () => {
  const readyToCastle = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';

  it('castles kingside when the king steps two squares, moving the rook too', () => {
    const game = gameFromFen(readyToCastle);

    const castled = playMove(game, { from: 'e1', to: 'g1' });

    expect(currentFen(castled!)).toBe('r3k2r/8/8/8/8/8/8/R4RK1 b kq - 1 1');
  });

  it('castles queenside when the king steps two squares, moving the rook too', () => {
    const game = gameFromFen(readyToCastle);

    const castled = playMove(game, { from: 'e1', to: 'c1' });

    expect(currentFen(castled!)).toBe('r3k2r/8/8/8/8/8/8/2KR3R b kq - 1 1');
  });
});

describe('en passant', () => {
  it('captures the pawn that just made a double step, removing it from its square', () => {
    const blackJustPlayedD5 = gameFromFen('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2');

    const captured = playMove(blackJustPlayedD5, { from: 'e5', to: 'd6' });

    expect(currentFen(captured!)).toBe('4k3/8/3P4/8/8/8/8/4K3 b - - 0 2');
  });
});

describe('promotion', () => {
  const pawnAboutToPromote = '4k3/P7/8/8/8/8/8/4K3 w - - 0 1';

  it('promotes to the piece asked for', () => {
    const game = gameFromFen(pawnAboutToPromote);

    const toQueen = playMove(game, { from: 'a7', to: 'a8', promotion: 'queen' });
    const toKnight = playMove(game, { from: 'a7', to: 'a8', promotion: 'knight' });

    expect(currentFen(toQueen!)).toBe('Q3k3/8/8/8/8/8/8/4K3 b - - 0 1');
    expect(currentFen(toKnight!)).toBe('N3k3/8/8/8/8/8/8/4K3 b - - 0 1');
  });

  it('refuses a pawn reaching the last rank without a promotion piece', () => {
    const game = gameFromFen(pawnAboutToPromote);

    const noPieceChosen = playMove(game, { from: 'a7', to: 'a8' });

    expect(noPieceChosen).toBeNull();
  });
});

describe('isPromotion', () => {
  it('is true for a white pawn stepping onto the eighth rank', () => {
    const game = gameFromFen('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');

    expect(isPromotion(game, 'a7', 'a8')).toBe(true);
  });

  it('is true for a black pawn stepping onto the first rank', () => {
    const game = gameFromFen('4k3/8/8/8/8/8/p7/4K3 b - - 0 1');

    expect(isPromotion(game, 'a2', 'a1')).toBe(true);
  });

  it('is false for a pawn move that stays short of the last rank', () => {
    const game = newGame();

    expect(isPromotion(game, 'e2', 'e4')).toBe(false);
  });

  it('is false for a piece other than a pawn reaching the last rank', () => {
    const game = gameFromFen('4k3/8/8/8/8/8/8/R3K3 w - - 0 1');

    expect(isPromotion(game, 'a1', 'a8')).toBe(false);
  });
});
