// Tests for the Move-Selection Engine. They hand it a position and assert the
// move it returns. Positions are chosen so the expected move is the only legal
// one, which keeps every assertion independent of how the engine chooses.

import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { parseSquare } from 'chessops/util';
import { currentFen, legalMoves, newGame, playMove, type Game, type MoveRequest } from '../game/game';
import { gameStatus } from '../game/game-status';
import { loadBaseModel } from './base-model';
import { selectMove } from './move-selection';
import { readOpeningBook, type OpeningBook } from './opening-book';
import { seededRandom } from '../evaluation/seeded-random';

/**
 * Stand-in Base Models written by pipeline/fixture_models.py, one shaped like
 * each family the engine reads. Whatever the position, both rank the same moves
 * highest, best first, seen from the side to move: a1a8, a7a8 promoting to a
 * rook, castling kingside, and e2e4.
 */
const FIXED_PREFERENCE_MODELS = [
  { family: 'Maia-1', file: new URL('./fixtures/maia1-fixed-preferences.onnx', import.meta.url), options: {} },
  {
    family: 'Maia-3',
    file: new URL('./fixtures/maia3-fixed-preferences.onnx', import.meta.url),
    options: { rating: 1500 },
  },
];

/**
 * Positions reached by playing random games from the start, each game stopping
 * when it ends or after a fixed number of moves. Every collected position has
 * at least one legal move.
 */
function randomPositions(count: number, random: () => number): Game[] {
  const maxPliesPerGame = 200;
  const positions: Game[] = [];

  while (positions.length < count) {
    let game = newGame();
    for (let ply = 0; ply < maxPliesPerGame && positions.length < count; ply++) {
      if (gameStatus(game).kind !== 'ongoing') {
        break;
      }
      positions.push(game);

      const moves = legalMoves(game);
      const move = moves[Math.floor(random() * moves.length)];
      game = playMove(game, move)!;
    }
  }
  return positions;
}

describe('selectMove', () => {
  it('returns the only legal move in a position', async () => {
    // The white king on a1 can neither step to a2 nor b1, both covered by the
    // rook, but it can take the undefended rook on b2.
    const kingMustTakeTheRook = '7k/8/8/8/8/8/1r6/K7 w - - 0 1';

    const move = await selectMove(kingMustTakeTheRook);

    expect(move).toEqual({ from: 'a1', to: 'b2' });
  });

  it('refuses a position where the side to move has no legal move', async () => {
    // Black's king on h8 is stalemated by the queen on f7 and the king on g6.
    const stalemate = '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1';

    await expect(selectMove(stalemate)).rejects.toThrow(`No legal move to choose in ${stalemate}`);
  });

  it('names the piece when the move it returns is a promotion', async () => {
    // The white king on a1 is boxed in by the two rooks, so the pawn on g7 is
    // the only piece that can move, and it can only step onto g8.
    const onlyPromotionsLeft = '8/6P1/8/4k3/8/1r6/7r/K7 w - - 0 1';

    const move = await selectMove(onlyPromotionsLeft);

    expect(move.from).toBe('g7');
    expect(move.to).toBe('g8');
    expect(['queen', 'rook', 'bishop', 'knight']).toContain(move.promotion);
  });
});

describe.each(FIXED_PREFERENCE_MODELS)('selectMove with a $family Base Model', ({ file, options }) => {
  it('plays the legal move the Base Model ranks highest', async () => {
    const baseModel = await loadBaseModel(await readFile(file), options);
    // In the starting position a1a8, a7a8 and castling are all impossible, so
    // the model's first legal preference is e2e4.
    const startingPosition = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

    const move = await selectMove(startingPosition, { baseModel });

    expect(move).toEqual({ from: 'e2', to: 'e4' });
  });

  it('reads the Base Model\'s moves from Black\'s side of the board when Black is to move', async () => {
    const baseModel = await loadBaseModel(await readFile(file), options);
    // The network sees every position from the side to move, so for Black its
    // e2e4 is the pawn on e7 advancing two squares.
    const afterKingsPawn = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

    const move = await selectMove(afterKingsPawn, { baseModel });

    expect(move).toEqual({ from: 'e7', to: 'e5' });
  });

  it('castles when the Base Model ranks castling highest', async () => {
    const baseModel = await loadBaseModel(await readFile(file), options);
    // White's rook on a1 is shut in by its own pawn and no white pawn stands on
    // a7, so castling is the first legal preference.
    const whiteMayCastleKingside = 'r3k2r/pppqbppp/2np1n2/4p3/2B1P3/2NP1N2/PPP2PPP/R2QK2R w Kkq - 0 8';

    const move = await selectMove(whiteMayCastleKingside, { baseModel });

    expect(move).toEqual({ from: 'e1', to: 'g1' });
  });

  it('promotes to the piece the Base Model ranks highest', async () => {
    const baseModel = await loadBaseModel(await readFile(file), options);
    // Nothing stands on a1, so the model's first legal preference is its
    // second: the pawn on a7 promoting to a rook.
    const pawnAboutToPromote = '8/P7/8/8/8/8/k6K/8 w - - 0 1';

    const move = await selectMove(pawnAboutToPromote, { baseModel });

    expect(move).toEqual({ from: 'a7', to: 'a8', promotion: 'rook' });
  });
});

/** An Opening Book holding the given positions, each mapped to a move in UCI form. */
function bookWith(positions: Record<string, string>): OpeningBook {
  const file = { min_occurrences: 3, positions: positions };
  return readOpeningBook(JSON.stringify(file));
}

describe('selectMove with an Opening Book', () => {
  const startingPosition = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  it('plays the book move when the position is in the book', async () => {
    // The Base Model on its own would play e2e4 here.
    const baseModel = await loadBaseModel(await readFile(FIXED_PREFERENCE_MODELS[0].file));
    const openingBook = bookWith({ 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -': 'd2d4' });

    const move = await selectMove(startingPosition, { openingBook, baseModel });

    expect(move).toEqual({ from: 'd2', to: 'd4' });
  });

  it('plays the Base Model\'s move when the position is not in the book', async () => {
    const baseModel = await loadBaseModel(await readFile(FIXED_PREFERENCE_MODELS[0].file));
    // The book only knows Black's reply to 1. e4.
    const openingBook = bookWith({ 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -': 'c7c5' });

    const move = await selectMove(startingPosition, { openingBook, baseModel });

    expect(move).toEqual({ from: 'e2', to: 'e4' });
  });

  it('finds a position in the book whatever its move counters', async () => {
    const openingBook = bookWith({ 'r1bqkb1r/pppppppp/2n2n2/8/8/2N2N2/PPPPPPPP/R1BQKB1R w KQkq -': 'e2e4' });
    // The position the book was built from, reached after the knights went
    // out and back once more.
    const sameKnightsLater = 'r1bqkb1r/pppppppp/2n2n2/8/8/2N2N2/PPPPPPPP/R1BQKB1R w KQkq - 8 5';

    const move = await selectMove(sameKnightsLater, { openingBook, random: () => 0 });

    expect(move).toEqual({ from: 'e2', to: 'e4' });
  });

  it('castles when the book move is castling', async () => {
    const whiteMayCastleKingside = 'r3k2r/pppqbppp/2np1n2/4p3/2B1P3/2NP1N2/PPP2PPP/R2QK2R w Kkq - 0 8';
    const openingBook = bookWith({ 'r3k2r/pppqbppp/2np1n2/4p3/2B1P3/2NP1N2/PPP2PPP/R2QK2R w Kkq -': 'e1g1' });

    const move = await selectMove(whiteMayCastleKingside, { openingBook, random: () => 0 });

    expect(move).toEqual({ from: 'e1', to: 'g1' });
  });
});

describe('selectMove over many positions', () => {
  it('never returns an illegal move', async () => {
    const positions = randomPositions(10000, seededRandom(2026));
    const engineRandom = seededRandom(4);

    let promotionsChosen = 0;
    let castlingsChosen = 0;
    for (const game of positions) {
      const fen = currentFen(game);
      const move = await selectMove(fen, { random: engineRandom });

      const accepted = playMove(game, move);
      expect(accepted, `${move.from}-${move.to} in ${fen}`).not.toBeNull();

      if (move.promotion !== undefined) {
        promotionsChosen = promotionsChosen + 1;
      }
      if (isCastling(game, move)) {
        castlingsChosen = castlingsChosen + 1;
      }
    }

    // The sample only proves something if it reaches the unusual moves too.
    expect(promotionsChosen).toBeGreaterThan(0);
    expect(castlingsChosen).toBeGreaterThan(0);
  });
});

describe.each(FIXED_PREFERENCE_MODELS)('selectMove with a $family Base Model over many positions', ({ file, options }) => {
  it('never returns an illegal move', async () => {
    const baseModel = await loadBaseModel(await readFile(file), options);
    const positions = randomPositions(2000, seededRandom(2027));

    for (const game of positions) {
      const fen = currentFen(game);
      const move = await selectMove(fen, { baseModel });

      const accepted = playMove(game, move);
      expect(accepted, `${move.from}-${move.to} in ${fen}`).not.toBeNull();
    }
  });
});

/** True when the move is a king stepping two squares sideways, which is castling. */
function isCastling(game: Game, move: MoveRequest): boolean {
  const movingRole = game.position.board.getRole(parseSquare(move.from));
  if (movingRole !== 'king') {
    return false;
  }
  const filesCrossed = Math.abs(move.from.charCodeAt(0) - move.to.charCodeAt(0));
  return filesCrossed === 2;
}
