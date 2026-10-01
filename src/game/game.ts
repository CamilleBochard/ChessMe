// A game of chess in progress: the current position, the positions that led to
// it, and the only door through which a move gets in. chessops owns the rules of
// a single position; this module owns the game around them.
// Free of anything Astro or DOM so that the Move-Selection Engine can use it
// under Node.

import { Chess } from 'chessops/chess';
import { chessgroundDests } from 'chessops/compat';
import { makeFen, parseFen } from 'chessops/fen';
import type { NormalMove, SquareName } from 'chessops/types';
import { parseSquare, squareRank } from 'chessops/util';
import type { Colour } from '../board/starting-position';

/** The pieces a pawn may become when it reaches the last rank. */
export type PromotionPiece = 'queen' | 'rook' | 'bishop' | 'knight';

/** A move as the board reports it: two squares, plus a piece when promoting. */
export interface MoveRequest {
  from: SquareName;
  to: SquareName;
  promotion?: PromotionPiece;
}

/**
 * One game at one moment. Treated as a value: playing a move returns a new
 * Game and leaves this one untouched, so earlier moments of a game stay valid.
 */
export interface Game {
  /** The current position, as chessops understands it. */
  readonly position: Chess;
  /** The last move played, for the board to highlight. Absent at the start. */
  readonly lastMove?: MoveRequest;
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

/**
 * Plays a move if it is legal and returns the new game. Returns null for an
 * illegal move, which is the board's signal to put the piece back.
 */
export function playMove(game: Game, move: MoveRequest): Game | null {
  const chessopsMove: NormalMove = {
    from: parseSquare(move.from),
    to: parseSquare(move.to),
    promotion: move.promotion,
  };
  if (!game.position.isLegal(chessopsMove)) {
    return null;
  }

  const position = game.position.clone();
  position.play(chessopsMove);

  const next: Game = {
    position: position,
    lastMove: move,
  };
  return next;
}

/**
 * Where each piece of the side to move may go, in the shape chessground wants
 * for its `movable.dests` option. A king that may castle lists both the square
 * it lands on and its rook's square, since chessground accepts either gesture.
 */
export function legalDestinations(game: Game): Map<SquareName, SquareName[]> {
  return chessgroundDests(game.position);
}

/** True when this move takes a pawn onto the last rank, so the board must ask which piece. */
export function isPromotion(game: Game, from: SquareName, to: SquareName): boolean {
  const movingRole = game.position.board.getRole(parseSquare(from));
  if (movingRole !== 'pawn') {
    return false;
  }

  // Ranks count from 0, so the first rank is 0 and the eighth is 7. A pawn only
  // ever moves forward, so whichever of the two it reaches is its last rank.
  const targetRank = squareRank(parseSquare(to));
  const reachesLastRank = targetRank === 0 || targetRank === 7;
  return reachesLastRank;
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

/** True when the side to move is in check, so the board can highlight the king. */
export function isInCheck(game: Game): boolean {
  return game.position.isCheck();
}
