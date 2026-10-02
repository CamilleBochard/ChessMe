// A game of chess in progress: the current position, the positions that led to
// it, and the only door through which a move gets in. chessops owns the rules of
// a single position; this module owns the game around them.
// Free of anything Astro or DOM so that the Move-Selection Engine can use it
// under Node.

import { Chess } from 'chessops/chess';
import { chessgroundDests } from 'chessops/compat';
import { makeFen, parseFen } from 'chessops/fen';
import { makeSan } from 'chessops/san';
import type { NormalMove, SquareName } from 'chessops/types';
import { parseSquare, squareRank } from 'chessops/util';
import type { Colour } from '../board/starting-position';

/** The pieces a pawn may become when it reaches the last rank. */
export type PromotionPiece = 'queen' | 'rook' | 'bishop' | 'knight';

const PROMOTION_PIECES: readonly PromotionPiece[] = ['queen', 'rook', 'bishop', 'knight'];

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
  /**
   * Every position reached so far, oldest first and including the current one,
   * reduced to what counts for threefold repetition: the pieces, the side to
   * move, castling rights and a capturable en passant square.
   */
  readonly repetitionKeys: readonly string[];
  /** The last move played, for the board to highlight. Absent at the start. */
  readonly lastMove?: MoveRequest;
  /** The last move in standard algebraic notation, for the move list. Absent at the start. */
  readonly lastMoveSan?: string;
  /** The game one move earlier. Absent at the start. */
  readonly previous?: Game;
  /** The side that resigned, which ends the game whatever the position. */
  readonly resignedBy?: Colour;
}

/** One line of the move list: a move number, White's move and Black's reply. */
export interface MoveListRow {
  moveNumber: number;
  /** Null when the game started from a position with Black to move. */
  white: string | null;
  /** Null while White's move is still waiting for a reply. */
  black: string | null;
}

/** A game at the standard starting position. */
export function newGame(): Game {
  const position = Chess.default();

  const game: Game = {
    position: position,
    repetitionKeys: [repetitionKey(position)],
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
    repetitionKeys: [repetitionKey(position.value)],
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

  const san = makeSan(game.position, chessopsMove);
  const position = game.position.clone();
  position.play(chessopsMove);

  const next: Game = {
    position: position,
    repetitionKeys: [...game.repetitionKeys, repetitionKey(position)],
    lastMove: move,
    lastMoveSan: san,
    previous: game,
  };
  return next;
}

/**
 * The moves played so far, in algebraic notation and grouped the way a
 * scoresheet groups them: one numbered row per White move and Black reply.
 */
export function moveList(game: Game): MoveListRow[] {
  const rows: MoveListRow[] = [];

  for (const moment of momentsAfterEachMove(game)) {
    // The position before the move says who played it and under which number.
    const before = moment.previous!.position;
    const san = moment.lastMoveSan!;

    if (before.turn === 'white') {
      rows.push({ moveNumber: before.fullmoves, white: san, black: null });
      continue;
    }

    const lastRow = rows[rows.length - 1];
    if (lastRow !== undefined && lastRow.moveNumber === before.fullmoves) {
      lastRow.black = san;
    } else {
      rows.push({ moveNumber: before.fullmoves, white: null, black: san });
    }
  }
  return rows;
}

/** The same game, ended by the given side resigning. */
export function resign(game: Game, side: Colour): Game {
  const resigned: Game = { ...game, resignedBy: side };
  return resigned;
}

/**
 * The game as it stood just before the given side's most recent move, which
 * also removes any reply played after it. Returns null when that side has not
 * moved yet, or when the game was resigned: resigning is final, unlike a
 * checkmate or draw that a misclick may have walked into.
 */
export function takeBack(game: Game, side: Colour): Game | null {
  if (game.resignedBy !== undefined) {
    return null;
  }

  let moment = game;
  while (moment.previous !== undefined) {
    const earlier = moment.previous;
    const mover = earlier.position.turn;
    if (mover === side) {
      return earlier;
    }
    moment = earlier;
  }
  return null;
}

/**
 * Where each piece of the side to move may go, in the shape chessground wants
 * for its `movable.dests` option. A king that may castle lists both the square
 * it lands on and its rook's square, since chessground accepts either gesture.
 */
export function legalDestinations(game: Game): Map<SquareName, SquareName[]> {
  return chessgroundDests(game.position);
}

/**
 * Every legal move in the current position, each listed once and in the form
 * playMove accepts: castling as the king's two-square step, and a pawn reaching
 * the last rank once for each piece it may become.
 */
export function legalMoves(game: Game): MoveRequest[] {
  const board = game.position.board;
  const moves: MoveRequest[] = [];

  for (const [from, destinations] of legalDestinations(game)) {
    const movingPiece = board.get(parseSquare(from));

    for (const to of destinations) {
      // chessground also lets a king castle by landing on its own rook. The
      // same castling is already listed as the king's two-square step.
      const pieceOnTarget = board.get(parseSquare(to));
      const isKingOntoOwnRook =
        movingPiece?.role === 'king' &&
        pieceOnTarget?.role === 'rook' &&
        pieceOnTarget.color === movingPiece.color;
      if (isKingOntoOwnRook) {
        continue;
      }

      if (isPromotion(game, from, to)) {
        for (const piece of PROMOTION_PIECES) {
          moves.push({ from: from, to: to, promotion: piece });
        }
      } else {
        moves.push({ from: from, to: to });
      }
    }
  }
  return moves;
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

/** Every moment of the game that follows a move, oldest first. */
function momentsAfterEachMove(game: Game): Game[] {
  const moments: Game[] = [];
  let moment: Game | undefined = game;
  while (moment !== undefined && moment.previous !== undefined) {
    moments.push(moment);
    moment = moment.previous;
  }
  moments.reverse();
  return moments;
}

/**
 * The part of a position that decides whether it repeats an earlier one: the
 * first four fields of its FEN. The move counters are left out, and chessops
 * only writes an en passant square when a capture there is legal, which is the
 * rule threefold repetition uses.
 */
function repetitionKey(position: Chess): string {
  const fen = makeFen(position.toSetup());
  const fields = fen.split(' ');
  const placementTurnCastlingEnPassant = fields.slice(0, 4);
  return placementTurnCastlingEnPassant.join(' ');
}
