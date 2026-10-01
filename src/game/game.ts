// A game of chess in progress: the current position, the positions that led to
// it, and the only door through which a move gets in. chessops owns the rules of
// a single position; this module owns the game around them.
// Free of anything Astro or DOM so that the Move-Selection Engine can use it
// under Node.

import { Chess } from 'chessops/chess';
import { makeFen, parseFen } from 'chessops/fen';
import type { Colour } from '../board/starting-position';

/**
 * One game at one moment. Treated as a value: playing a move returns a new
 * Game and leaves this one untouched, so earlier moments of a game stay valid.
 */
export interface Game {
  /** The current position, as chessops understands it. */
  readonly position: Chess;
}

/** A game at the standard starting position. */
export function newGame(): Game {
  const game: Game = {
    position: Chess.default(),
  };
  return game;
}

/**
 * A game starting from an arbitrary position, such as an endgame to test or a
 * position to hand the Move-Selection Engine. Throws if the FEN is malformed or
 * describes a position that cannot occur.
 */
export function gameFromFen(fen: string): Game {
  const parsed = parseFen(fen);
  if (parsed.isErr) {
    throw new Error(`Invalid FEN: ${fen}`);
  }

  const position = Chess.fromSetup(parsed.value);
  if (position.isErr) {
    throw new Error(`Impossible position: ${fen}`);
  }

  const game: Game = {
    position: position.value,
  };
  return game;
}

/** The position as FEN, for handing to chessground. */
export function currentFen(game: Game): string {
  const setup = game.position.toSetup();
  return makeFen(setup);
}

/** Whose turn it is. */
export function sideToMove(game: Game): Colour {
  return game.position.turn;
}
