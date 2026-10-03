// What a Maia-3 network reads and writes. Maia-3 is a transformer: its input
// is one token per square describing the pieces there over the last eight
// positions, plus the two players' ratings, and its output scores every pair
// of squares plus every promotion. This follows CSSLab's maia3 package, the
// reference implementation (maia3/dataset.py and maia3/utils.py).
// Free of anything DOM so that it runs unchanged under Node.

import type { Color, Role, Square } from 'chessops/types';
import type { Game, MoveRequest } from '../game/game';

/** The tensor names given to the converted Maia-3 network. */
export const MAIA3_TOKENS_NAME = 'tokens';
export const MAIA3_SELF_RATING_NAME = 'self_elo';
export const MAIA3_OPPONENT_RATING_NAME = 'oppo_elo';
export const MAIA3_POLICY_NAME = 'policy';

const SQUARE_COUNT = 64;
const HISTORY_LENGTH = 8;
const FEATURES_PER_POSITION = 12;
/** Within a position's features, the mover's six piece types come first, then the opponent's. */
const THEIR_FIRST_PIECE_FEATURE = 6;
/** Twelve piece features for each of eight positions, then the clock feature. */
const FEATURES_PER_SQUARE = HISTORY_LENGTH * FEATURES_PER_POSITION + 1;

/** The shape of one position's tokens: squares, features. */
export const MAIA3_TOKENS_SHAPE = [SQUARE_COUNT, FEATURES_PER_SQUARE];

const ROLES_IN_FEATURE_ORDER: readonly Role[] = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'];

/**
 * One token per square, a1 to h8, flattened square by square.
 *
 * As with Maia-1 the board is seen from the side to move: for Black it is
 * mirrored top to bottom, and the first six features always describe the
 * mover's pieces. Unlike Maia-1, nothing describes castling rights, en
 * passant or the fifty-move counter.
 *
 * The network reads eight positions, but the engine is handed one. CSSLab's
 * engine, given a position without its moves, repeats the current position in
 * every slot, and so does this function.
 *
 * The last feature is the time the player spent on the previous move. No
 * clock is known here, so it stays zero, as CSSLab's engine leaves it.
 */
export function encodeMaia3(game: Game): Float32Array {
  const tokens = new Float32Array(SQUARE_COUNT * FEATURES_PER_SQUARE);
  const position = game.position;
  const us = position.turn;
  const them = opposite(us);

  for (let slot = 0; slot < HISTORY_LENGTH; slot++) {
    const firstFeature = slot * FEATURES_PER_POSITION;
    for (const [roleIndex, role] of ROLES_IN_FEATURE_ORDER.entries()) {
      for (const square of position.board.pieces(us, role)) {
        const token = fromMoversSide(square, us);
        tokens[token * FEATURES_PER_SQUARE + firstFeature + roleIndex] = 1;
      }
      for (const square of position.board.pieces(them, role)) {
        const token = fromMoversSide(square, us);
        tokens[token * FEATURES_PER_SQUARE + firstFeature + THEIR_FIRST_PIECE_FEATURE + roleIndex] = 1;
      }
    }
  }
  return tokens;
}

/** Where the network scores this move in its output. */
export function maia3PolicyIndex(game: Game, move: MoveRequest): number {
  const name = networkMoveName(game, move);
  const index = POLICY_INDEX_BY_MOVE.get(name);
  if (index === undefined) {
    throw new Error(`Maia-3 has no policy entry for ${name}`);
  }
  return index;
}

/**
 * The move as the network names it: UCI, with a Black move's ranks mirrored so
 * that e7e5 is read as e2e4. Castling is the king's two-square step, and every
 * promotion, a knight's included, has its own entry.
 */
function networkMoveName(game: Game, move: MoveRequest): string {
  let from: string = move.from;
  let to: string = move.to;
  if (game.position.turn === 'black') {
    from = mirrorRank(from);
    to = mirrorRank(to);
  }

  let promotionSuffix = '';
  if (move.promotion !== undefined) {
    promotionSuffix = PROMOTION_SUFFIXES[move.promotion];
  }
  return from + to + promotionSuffix;
}

const PROMOTION_SUFFIXES = { queen: 'q', rook: 'r', bishop: 'b', knight: 'n' };

function opposite(colour: Color): Color {
  if (colour === 'white') {
    return 'black';
  }
  return 'white';
}

/** The square index as the side to move sees it: unchanged for White, mirrored top to bottom for Black. */
function fromMoversSide(square: Square, mover: Color): Square {
  if (mover === 'black') {
    return square ^ 56;
  }
  return square;
}

/** The same file on the rank seen from the other side: e7 becomes e2. */
function mirrorRank(square: string): string {
  const file = square[0];
  const rank = Number(square[1]);
  return `${file}${9 - rank}`;
}

const FILES = 'abcdefgh';

/**
 * Maia-3's 4352 policy moves in its order (get_all_possible_moves): every pair
 * of squares, possible or not, by origin square then destination square (a1,
 * b1, ... h1, a2, ...), then every promotion from the seventh rank to the
 * eighth, by origin file, destination file and piece.
 */
function policyMoves(): string[] {
  const squareNames: string[] = [];
  for (let rank = 1; rank <= 8; rank++) {
    for (const file of FILES) {
      squareNames.push(`${file}${rank}`);
    }
  }

  const moves: string[] = [];
  for (const origin of squareNames) {
    for (const destination of squareNames) {
      moves.push(origin + destination);
    }
  }
  for (const originFile of FILES) {
    for (const destinationFile of FILES) {
      for (const piece of ['q', 'r', 'b', 'n']) {
        moves.push(`${originFile}7${destinationFile}8${piece}`);
      }
    }
  }
  return moves;
}

const POLICY_INDEX_BY_MOVE = new Map(policyMoves().map((move, index) => [move, index]));
