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

/**
 * A stand-in Base Model written by pipeline/fixture_models.py. Whatever the
 * position, it ranks the same moves highest, best first, named from the side
 * to move's point of view: a1a8, a7a8 promoting to a rook, e1h1 (castling
 * kingside, written as the king taking its rook) and e2e4.
 */
const FIXED_PREFERENCES_MODEL = new URL('./fixtures/maia1-fixed-preferences.onnx', import.meta.url);

/**
 * A seeded random number generator (mulberry32), so a failure seen once can be
 * replayed exactly by running the test again.
 */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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

describe('selectMove with a Base Model', () => {
  it('plays the legal move the Base Model ranks highest', async () => {
    const baseModel = await loadBaseModel(await readFile(FIXED_PREFERENCES_MODEL));
    // In the starting position a1a8, a7a8 and e1h1 are all impossible, so the
    // model's first legal preference is e2e4.
    const startingPosition = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

    const move = await selectMove(startingPosition, { baseModel });

    expect(move).toEqual({ from: 'e2', to: 'e4' });
  });

  it('reads the Base Model\'s moves from Black\'s side of the board when Black is to move', async () => {
    const baseModel = await loadBaseModel(await readFile(FIXED_PREFERENCES_MODEL));
    // The network sees every position from the side to move, so for Black its
    // e2e4 is the pawn on e7 advancing two squares.
    const afterKingsPawn = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

    const move = await selectMove(afterKingsPawn, { baseModel });

    expect(move).toEqual({ from: 'e7', to: 'e5' });
  });

  it('castles when the Base Model ranks the king taking its own rook highest', async () => {
    const baseModel = await loadBaseModel(await readFile(FIXED_PREFERENCES_MODEL));
    // The network names castling kingside e1h1. White's rook on a1 is shut in
    // by its own pawn and no white pawn stands on a7, so castling is the first
    // legal preference.
    const whiteMayCastleKingside = 'r3k2r/pppqbppp/2np1n2/4p3/2B1P3/2NP1N2/PPP2PPP/R2QK2R w Kkq - 0 8';

    const move = await selectMove(whiteMayCastleKingside, { baseModel });

    expect(move).toEqual({ from: 'e1', to: 'g1' });
  });

  it('promotes to the piece the Base Model ranks highest', async () => {
    const baseModel = await loadBaseModel(await readFile(FIXED_PREFERENCES_MODEL));
    // Nothing stands on a1, so the model's first legal preference is its
    // second: the pawn on a7 promoting to a rook.
    const pawnAboutToPromote = '8/P7/8/8/8/8/k6K/8 w - - 0 1';

    const move = await selectMove(pawnAboutToPromote, { baseModel });

    expect(move).toEqual({ from: 'a7', to: 'a8', promotion: 'rook' });
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

/** True when the move is a king stepping two squares sideways, which is castling. */
function isCastling(game: Game, move: MoveRequest): boolean {
  const movingRole = game.position.board.getRole(parseSquare(move.from));
  if (movingRole !== 'king') {
    return false;
  }
  const filesCrossed = Math.abs(move.from.charCodeAt(0) - move.to.charCodeAt(0));
  return filesCrossed === 2;
}
