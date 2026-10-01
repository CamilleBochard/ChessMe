// The Move-Selection Engine: the single place where the Bot decides on a move.
// Its boundary is a position in, one move out. Everything that later goes into
// choosing (the Opening Book, the Base Model) sits behind this function, so the
// page and the evaluation harness never change when the choice does.
// Free of anything DOM so that it runs unchanged under Node.

import { gameFromFen, legalMoves, type MoveRequest } from '../game/game';

/** What the engine depends on, supplied by the caller so tests can fix it. */
export interface EngineOptions {
  /** Returns a number in [0, 1), like Math.random. */
  random?: () => number;
}

/**
 * Chooses the Bot's move in the position the FEN describes. Asynchronous
 * because choosing will involve running a model. For now the choice is a
 * legal move picked uniformly at random.
 */
export async function selectMove(fen: string, options: EngineOptions = {}): Promise<MoveRequest> {
  const random = options.random ?? Math.random;

  const game = gameFromFen(fen);
  const candidates = legalMoves(game);

  const index = Math.floor(random() * candidates.length);
  return candidates[index];
}
