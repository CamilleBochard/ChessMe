// The Move-Selection Engine: the single place where the Bot decides on a move.
// Its boundary is a position in, one move out. Everything that later goes into
// choosing (the Opening Book, the Base Model) sits behind this function, so the
// page and the evaluation harness never change when the choice does.
// Free of anything DOM so that it runs unchanged under Node.

import { gameFromFen, legalMoves, type MoveRequest } from '../game/game';
import type { BaseModel } from './base-model';
import type { OpeningBook } from './opening-book';

/** What the engine depends on, supplied by the caller so tests can fix it. */
export interface EngineOptions {
  /** Camille's own replies, consulted before the Base Model. */
  openingBook?: OpeningBook;
  /**
   * The network consulted for the move. It may still be loading: the Opening
   * Book is asked first, so a move the book holds never waits for the model.
   */
  baseModel?: BaseModel | Promise<BaseModel>;
  /** Returns a number in [0, 1), like Math.random. */
  random?: () => number;
}

/** Where a move of the Bot came from. */
export type MoveSource = 'opening-book' | 'base-model' | 'random';

/** One move of the Bot, with where it came from, which the Session Game records. */
export interface BotMove {
  move: MoveRequest;
  source: MoveSource;
}

/**
 * Chooses the Bot's move in the position the FEN describes: Camille's own
 * reply when the Opening Book holds the position, otherwise the move the Base
 * Model ranks highest, otherwise a legal move picked uniformly at random.
 * Asynchronous because the Base Model runs a network. Throws when the side to
 * move has no legal move, since the Bot is never asked to move in a finished
 * game.
 */
export async function selectMove(fen: string, options: EngineOptions = {}): Promise<MoveRequest> {
  const botMove = await selectMoveWithSource(fen, options);
  return botMove.move;
}

/** The same choice as selectMove, also saying which of the three gave the move. */
export async function selectMoveWithSource(fen: string, options: EngineOptions = {}): Promise<BotMove> {
  const random = options.random ?? Math.random;

  const game = gameFromFen(fen);
  const candidates = legalMoves(game);
  if (candidates.length === 0) {
    // A finished game reaching the engine is a bug in the caller.
    throw new Error(`No legal move to choose in ${fen}`);
  }

  if (options.openingBook !== undefined) {
    const bookMove = options.openingBook.move(game);
    if (bookMove !== undefined) {
      return { move: bookMove, source: 'opening-book' };
    }
  }

  if (options.baseModel !== undefined) {
    const baseModel = await options.baseModel;
    const policy = await baseModel.movePolicy(game);
    return { move: policy[0].move, source: 'base-model' };
  }

  const index = Math.floor(random() * candidates.length);
  return { move: candidates[index], source: 'random' };
}
