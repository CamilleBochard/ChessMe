// What a Maia-1 network reads and writes. Maia-1 is an lc0 network, so its
// input is lc0's 112 planes of 8 by 8 and its output scores lc0's list of 1858
// moves. This module turns a position into the first and reads the second back
// into moves the game understands.
// Free of anything DOM so that it runs unchanged under Node.

import type { Game, MoveRequest } from '../game/game';

/** The tensor names lc0 gives a converted Maia-1 network. */
export const MAIA1_INPUT_NAME = '/input/planes';
export const MAIA1_POLICY_NAME = '/output/policy';

const PLANE_COUNT = 112;
const SQUARES_PER_PLANE = 64;

/** The shape of one position's input: planes, ranks, files. */
export const MAIA1_INPUT_SHAPE = [PLANE_COUNT, 8, 8];

/**
 * The 112 input planes for the position, flattened plane by plane. Each plane
 * holds one value per square.
 */
export function encodeMaia1(game: Game): Float32Array {
  return new Float32Array(PLANE_COUNT * SQUARES_PER_PLANE);
}

/**
 * Where the network scores this move in its output. Returns undefined for a
 * move the network has no entry for, which no legal move should be.
 */
export function maia1PolicyIndex(game: Game, move: MoveRequest): number | undefined {
  const name = networkMoveName(game, move);
  return POLICY_INDEX_BY_MOVE.get(name);
}

/**
 * The move as the network names it. lc0 shows the network every position from
 * the side to move, as if that side were White, so a Black move is named with
 * its ranks mirrored: e7e5 is read as e2e4.
 */
function networkMoveName(game: Game, move: MoveRequest): string {
  let from: string = move.from;
  let to: string = move.to;
  if (game.position.turn === 'black') {
    from = mirrorRank(from);
    to = mirrorRank(to);
  }
  return from + to;
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
