// What a Maia-1 network reads and writes. Maia-1 is an lc0 network, so its
// input is lc0's 112 planes of 8 by 8 and its output scores lc0's list of 1858
// moves. This module turns a position into the first and reads the second back
// into moves the game understands.
// Free of anything DOM so that it runs unchanged under Node.

import { Chess } from 'chessops/chess';
import type { Color, Role, Square, SquareName } from 'chessops/types';
import { parseSquare, squareFile } from 'chessops/util';
import type { Game, MoveRequest } from '../game/game';

/** The tensor names lc0 gives a converted Maia-1 network. */
export const MAIA1_INPUT_NAME = '/input/planes';
export const MAIA1_POLICY_NAME = '/output/policy';

const PLANE_COUNT = 112;
const SQUARES_PER_PLANE = 64;

/** The shape of one position's input: planes, ranks, files. */
export const MAIA1_INPUT_SHAPE = [PLANE_COUNT, 8, 8];

/** Eight positions of history, the current one first, each 13 planes deep. */
const HISTORY_LENGTH = 8;
const PLANES_PER_POSITION = 13;
/** Within a position's planes, the mover's six piece types come first, then the opponent's. */
const THEIR_FIRST_PIECE_PLANE = 6;
const ROLES_IN_PLANE_ORDER: readonly Role[] = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'];

/** The planes after the history, each filled with a single value. */
const OUR_QUEENSIDE_CASTLING_PLANE = 104;
const OUR_KINGSIDE_CASTLING_PLANE = 105;
const THEIR_QUEENSIDE_CASTLING_PLANE = 106;
const THEIR_KINGSIDE_CASTLING_PLANE = 107;
const BLACK_TO_MOVE_PLANE = 108;
const FIFTY_MOVE_COUNTER_PLANE = 109;
const ALL_ONES_PLANE = 111;

/**
 * The 112 input planes for the position, flattened plane by plane, each plane
 * holding one value per square from a1 to h8. This follows lc0's encoder for
 * the classical 112-plane format, which is the one Maia-1 was trained on.
 *
 * Everything is seen from the side to move: "our" pieces are the mover's, and
 * for Black the board is mirrored top to bottom so that Black's pieces start
 * on the first ranks.
 *
 * The network reads the last eight positions, but the engine is handed a single
 * position. lc0, given a position with no moves before it, fills every earlier
 * slot with a copy of the current position, and so does this function. The
 * exception is the starting position, where lc0 knows nothing came before and
 * leaves the earlier slots empty.
 */
export function encodeMaia1(game: Game): Float32Array {
  const planes = new Float32Array(PLANE_COUNT * SQUARES_PER_PLANE);
  const position = game.position;
  const us = position.turn;
  const them = opposite(us);

  let positionsToWrite = HISTORY_LENGTH;
  if (isStartingPosition(game)) {
    positionsToWrite = 1;
  }
  for (let slot = 0; slot < positionsToWrite; slot++) {
    const firstPlane = slot * PLANES_PER_POSITION;
    for (const [roleIndex, role] of ROLES_IN_PLANE_ORDER.entries()) {
      for (const square of position.board.pieces(us, role)) {
        setSquare(planes, firstPlane + roleIndex, fromMoversSide(square, us));
      }
      for (const square of position.board.pieces(them, role)) {
        setSquare(planes, firstPlane + THEIR_FIRST_PIECE_PLANE + roleIndex, fromMoversSide(square, us));
      }
    }
    // Plane 12 of each slot marks a repeated position. A copy made to fill
    // the history is not a repetition, so it stays empty.

    // A capturable en passant square says the opponent's last move was a
    // two-square pawn push, so lc0 puts that pawn back on its starting square
    // in the copies standing in for earlier positions.
    const isEarlierPosition = slot > 0;
    if (isEarlierPosition && position.epSquare !== undefined) {
      const pushedPawnFile = squareFile(position.epSquare);
      const theirPawnPlane = firstPlane + THEIR_FIRST_PIECE_PLANE;
      // From the mover's side, their pawn has just arrived on the fifth rank
      // from the seventh.
      clearSquare(planes, theirPawnPlane, 4 * 8 + pushedPawnFile);
      setSquare(planes, theirPawnPlane, 6 * 8 + pushedPawnFile);
    }
  }

  const castlingRooks = position.castles.castlingRights;
  if (castlingRooks.has(cornerSquare(us, 'queenside'))) {
    fillPlane(planes, OUR_QUEENSIDE_CASTLING_PLANE, 1);
  }
  if (castlingRooks.has(cornerSquare(us, 'kingside'))) {
    fillPlane(planes, OUR_KINGSIDE_CASTLING_PLANE, 1);
  }
  if (castlingRooks.has(cornerSquare(them, 'queenside'))) {
    fillPlane(planes, THEIR_QUEENSIDE_CASTLING_PLANE, 1);
  }
  if (castlingRooks.has(cornerSquare(them, 'kingside'))) {
    fillPlane(planes, THEIR_KINGSIDE_CASTLING_PLANE, 1);
  }
  if (us === 'black') {
    fillPlane(planes, BLACK_TO_MOVE_PLANE, 1);
  }
  // The raw count of half-moves since the last capture or pawn move, not
  // scaled: Maia-1 was trained on it as is.
  fillPlane(planes, FIFTY_MOVE_COUNTER_PLANE, position.halfmoves);
  // An all-ones plane lets the network's convolutions find the board's edges.
  fillPlane(planes, ALL_ONES_PLANE, 1);

  return planes;
}

/**
 * True for the standard starting position with White to move and every
 * castling right, which lc0 treats as the start of a game with no history.
 */
function isStartingPosition(game: Game): boolean {
  const start = Chess.default();
  const position = game.position;
  return (
    position.turn === 'white' &&
    position.board.occupied.equals(start.board.occupied) &&
    position.board.white.equals(start.board.white) &&
    ROLES_IN_PLANE_ORDER.every((role) => position.board[role].equals(start.board[role])) &&
    position.castles.castlingRights.equals(start.castles.castlingRights) &&
    position.epSquare === undefined
  );
}

function opposite(colour: Color): Color {
  if (colour === 'white') {
    return 'black';
  }
  return 'white';
}

/** The square as the side to move sees it: unchanged for White, mirrored top to bottom for Black. */
function fromMoversSide(square: Square, mover: Color): Square {
  if (mover === 'black') {
    return square ^ 56;
  }
  return square;
}

/** The corner a castling rook starts from. */
function cornerSquare(colour: Color, side: 'queenside' | 'kingside'): Square {
  let file = 'h';
  if (side === 'queenside') {
    file = 'a';
  }
  let rank = '1';
  if (colour === 'black') {
    rank = '8';
  }
  return parseSquare(`${file}${rank}` as SquareName);
}

function setSquare(planes: Float32Array, plane: number, square: Square): void {
  planes[plane * SQUARES_PER_PLANE + square] = 1;
}

function clearSquare(planes: Float32Array, plane: number, square: Square): void {
  planes[plane * SQUARES_PER_PLANE + square] = 0;
}

function fillPlane(planes: Float32Array, plane: number, value: number): void {
  const start = plane * SQUARES_PER_PLANE;
  planes.fill(value, start, start + SQUARES_PER_PLANE);
}

/**
 * Where the network scores this move in its output. Every legal move has an
 * entry, so a missing one means the move was named wrongly and is thrown
 * rather than scored as nothing.
 */
export function maia1PolicyIndex(game: Game, move: MoveRequest): number {
  const name = networkMoveName(game, move);
  const index = POLICY_INDEX_BY_MOVE.get(name);
  if (index === undefined) {
    throw new Error(`Maia-1 has no policy entry for ${name}`);
  }
  return index;
}

/**
 * The move as the network names it. lc0 shows the network every position from
 * the side to move, as if that side were White, so a Black move is named with
 * its ranks mirrored: e7e5 is read as e2e4. Castling is named as the king
 * taking its own rook, e1h1 rather than e1g1.
 */
function networkMoveName(game: Game, move: MoveRequest): string {
  let from: string = move.from;
  let to: string = move.to;
  if (isCastling(game, move)) {
    to = castlingRookSquare(move);
  }
  if (game.position.turn === 'black') {
    from = mirrorRank(from);
    to = mirrorRank(to);
  }

  // A promotion to a knight has no entry of its own in lc0's list: it is
  // scored under the plain move's name.
  let promotionSuffix = '';
  if (move.promotion !== undefined && move.promotion !== 'knight') {
    promotionSuffix = PROMOTION_SUFFIXES[move.promotion];
  }
  return from + to + promotionSuffix;
}

const PROMOTION_SUFFIXES = { queen: 'q', rook: 'r', bishop: 'b' };

/** True when the move is a king stepping two squares sideways, which is castling. */
function isCastling(game: Game, move: MoveRequest): boolean {
  const movingRole = game.position.board.getRole(parseSquare(move.from));
  if (movingRole !== 'king') {
    return false;
  }
  const filesCrossed = Math.abs(move.from.charCodeAt(0) - move.to.charCodeAt(0));
  return filesCrossed === 2;
}

/** The corner the castling rook starts from: h1 for a king landing on g1, a1 for c1. */
function castlingRookSquare(move: MoveRequest): string {
  const rank = move.to[1];
  if (move.to[0] === 'g') {
    return `h${rank}`;
  }
  return `a${rank}`;
}

/** The same file on the rank seen from the other side: e7 becomes e2. */
function mirrorRank(square: string): string {
  const file = square[0];
  const rank = Number(square[1]);
  return `${file}${9 - rank}`;
}

const FILES = 'abcdefgh';

function squareName(square: number): string {
  const file = FILES[square % 8];
  const rank = Math.floor(square / 8) + 1;
  return `${file}${rank}`;
}

function isQueenMove(origin: number, destination: number): boolean {
  const fileStep = Math.abs((origin % 8) - (destination % 8));
  const rankStep = Math.abs(Math.floor(origin / 8) - Math.floor(destination / 8));
  return fileStep === 0 || rankStep === 0 || fileStep === rankStep;
}

function isKnightMove(origin: number, destination: number): boolean {
  const fileStep = Math.abs((origin % 8) - (destination % 8));
  const rankStep = Math.abs(Math.floor(origin / 8) - Math.floor(destination / 8));
  return (fileStep === 1 && rankStep === 2) || (fileStep === 2 && rankStep === 1);
}

/**
 * lc0's 1858 policy moves in lc0's order: every queen and knight move from
 * every square, by origin square then destination square (a1, b1, ... h1, a2,
 * ...), then the promotions to queen, rook and bishop from the seventh rank. A
 * promotion to a knight has no entry of its own and shares the plain move's.
 */
function policyMoves(): string[] {
  const moves: string[] = [];
  for (let origin = 0; origin < 64; origin++) {
    for (let destination = 0; destination < 64; destination++) {
      if (origin === destination) {
        continue;
      }
      if (isQueenMove(origin, destination) || isKnightMove(origin, destination)) {
        moves.push(squareName(origin) + squareName(destination));
      }
    }
  }
  for (let originFile = 0; originFile < 8; originFile++) {
    for (let destinationFile = originFile - 1; destinationFile <= originFile + 1; destinationFile++) {
      if (destinationFile < 0 || destinationFile > 7) {
        continue;
      }
      for (const piece of ['q', 'r', 'b']) {
        moves.push(`${FILES[originFile]}7${FILES[destinationFile]}8${piece}`);
      }
    }
  }
  return moves;
}

const POLICY_INDEX_BY_MOVE = new Map(policyMoves().map((move, index) => [move, index]));
