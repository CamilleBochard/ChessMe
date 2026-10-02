// Tests for the game module. Every test goes through the public functions: a
// position or a move in, a game or a refusal out. Expected values come from the
// rules of chess, written out by hand, never from asking chessops.

import { describe, expect, it } from 'vitest';
import {
  currentFen,
  gameFromFen,
  isInCheck,
  isPromotion,
  legalDestinations,
  legalMoves,
  moveList,
  newGame,
  playMove,
  sideToMove,
  takeBack,
  type Game,
  type MoveRequest,
} from './game';

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

  it('remembers the move just played so the board can highlight it', () => {
    const game = newGame();

    const next = playMove(game, { from: 'g1', to: 'f3' });

    expect(game.lastMove).toBeUndefined();
    expect(next!.lastMove).toEqual({ from: 'g1', to: 'f3' });
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

  it('castles when the king is dropped on its own rook, as chessground also allows', () => {
    const game = gameFromFen(readyToCastle);

    const castled = playMove(game, { from: 'e1', to: 'h1' });

    expect(currentFen(castled!)).toBe('r3k2r/8/8/8/8/8/8/R4RK1 b kq - 1 1');
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

describe('legalDestinations', () => {
  it('lists the twenty opening moves: two for each pawn and two for each knight', () => {
    const game = newGame();

    const destinations = legalDestinations(game);

    expect(destinations.get('e2')).toEqual(['e3', 'e4']);
    expect(destinations.get('g1')).toEqual(['f3', 'h3']);
    let moveCount = 0;
    for (const squares of destinations.values()) {
      moveCount = moveCount + squares.length;
    }
    expect(moveCount).toBe(20);
  });
});

describe('isInCheck', () => {
  it('is true when the side to move has its king attacked', () => {
    const rookChecksAlongTheFile = gameFromFen('4r1k1/8/8/8/8/8/8/4K3 w - - 0 1');

    expect(isInCheck(rookChecksAlongTheFile)).toBe(true);
  });

  it('is false at the start', () => {
    expect(isInCheck(newGame())).toBe(false);
  });
});

describe('legalMoves', () => {
  it('lists the twenty opening moves', () => {
    const moves = legalMoves(newGame());

    expect(moves).toHaveLength(20);
    expect(moves).toContainEqual({ from: 'e2', to: 'e4' });
    expect(moves).toContainEqual({ from: 'g1', to: 'f3' });
  });

  it('lists castling once, as the king stepping two squares', () => {
    // The king is hemmed in by its own pieces: its only moves are f1 and castling.
    const game = gameFromFen('k7/8/8/8/8/8/3PPP2/3QK2R w K - 0 1');

    const kingMoves = legalMoves(game).filter((move) => move.from === 'e1');

    expect(kingMoves).toContainEqual({ from: 'e1', to: 'g1' });
    expect(kingMoves).not.toContainEqual({ from: 'e1', to: 'h1' });
    expect(kingMoves).toHaveLength(2);
  });

  it('lists a promotion once for each piece the pawn may become', () => {
    // The white king on a1 is boxed in by the two rooks, so the pawn on g7 is
    // the only piece that can move, and it can only step onto g8.
    const game = gameFromFen('8/6P1/8/4k3/8/1r6/7r/K7 w - - 0 1');

    const moves = legalMoves(game);

    expect(moves).toHaveLength(4);
    expect(moves).toContainEqual({ from: 'g7', to: 'g8', promotion: 'queen' });
    expect(moves).toContainEqual({ from: 'g7', to: 'g8', promotion: 'rook' });
    expect(moves).toContainEqual({ from: 'g7', to: 'g8', promotion: 'bishop' });
    expect(moves).toContainEqual({ from: 'g7', to: 'g8', promotion: 'knight' });
  });
});

describe('moveList', () => {
  it('pairs the moves played so far into numbered rows, in algebraic notation', () => {
    const italianOpening = playMoves([
      { from: 'e2', to: 'e4' },
      { from: 'e7', to: 'e5' },
      { from: 'g1', to: 'f3' },
      { from: 'b8', to: 'c6' },
      { from: 'f1', to: 'c4' },
    ]);

    expect(moveList(italianOpening)).toEqual([
      { moveNumber: 1, white: 'e4', black: 'e5' },
      { moveNumber: 2, white: 'Nf3', black: 'Nc6' },
      { moveNumber: 3, white: 'Bc4', black: null },
    ]);
  });

  it('leaves the White half of the first row empty when the game starts with Black to move', () => {
    const afterKingsPawn = gameFromFen('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');

    const game = playMoves([{ from: 'c7', to: 'c5' }, { from: 'g1', to: 'f3' }], afterKingsPawn);

    expect(moveList(game)).toEqual([
      { moveNumber: 1, white: null, black: 'c5' },
      { moveNumber: 2, white: 'Nf3', black: null },
    ]);
  });

  it('is empty before any move', () => {
    expect(moveList(newGame())).toEqual([]);
  });
});

describe('takeBack', () => {
  it("reverts the side's last move and the reply that followed it", () => {
    const beforeWhitesMove = playMoves([
      { from: 'e2', to: 'e4' },
      { from: 'e7', to: 'e5' },
    ]);
    const afterBlacksReply = playMoves(
      [
        { from: 'g1', to: 'f3' },
        { from: 'b8', to: 'c6' },
      ],
      beforeWhitesMove,
    );

    const restored = takeBack(afterBlacksReply, 'white');

    expect(currentFen(restored!)).toBe(currentFen(beforeWhitesMove));
    expect(moveList(restored!)).toEqual(moveList(beforeWhitesMove));
  });

  it('reverts only the side\'s move when no reply has been played yet', () => {
    const start = newGame();
    const afterWhitesMove = playMoves([{ from: 'e2', to: 'e4' }], start);

    const restored = takeBack(afterWhitesMove, 'white');

    expect(currentFen(restored!)).toBe(currentFen(start));
  });

  it('has nothing to take back when the side has not moved yet', () => {
    const afterWhitesFirstMove = playMoves([{ from: 'e2', to: 'e4' }]);

    expect(takeBack(newGame(), 'white')).toBeNull();
    expect(takeBack(afterWhitesFirstMove, 'black')).toBeNull();
  });

  it('can be repeated to go back several moves', () => {
    const start = newGame();
    const afterTwoMovesEach = playMoves(
      [
        { from: 'd2', to: 'd4' },
        { from: 'd7', to: 'd5' },
        { from: 'c2', to: 'c4' },
        { from: 'e7', to: 'e6' },
      ],
      start,
    );

    const once = takeBack(afterTwoMovesEach, 'black')!;
    const twice = takeBack(once, 'black')!;

    expect(moveList(once)).toEqual([
      { moveNumber: 1, white: 'd4', black: 'd5' },
      { moveNumber: 2, white: 'c4', black: null },
    ]);
    expect(moveList(twice)).toEqual([{ moveNumber: 1, white: 'd4', black: null }]);
  });
});
