// The evaluation bar analysis mode shows beside the board: how much of it is
// White's, from Stockfish's score of the position on display.
// Free of anything DOM.

import { EVALUATION_CAP, type Score } from './engine-analysis';

/**
 * How steeply the bar fills as the advantage grows: the constant of the
 * winning-chances curve Lichess draws its own bar with, fitted on its games.
 */
const STEEPNESS = 0.00368208;

/**
 * The share of the bar that is White's, from 0 (Black is winning) to 1
 * (White is), for a score from White's point of view. The bar follows the
 * chances of winning rather than the centipawns themselves, so a pawn
 * matters more in a level position than in one already won. Past ten pawns,
 * the cap the Blunder Profile reads scores with, the position is decided
 * and the bar stops filling, short of the whole of it, which a mate alone
 * takes.
 */
export function whiteShare(score: Score): number {
  // A mate is no longer a matter of chances: the bar is all the mating side's.
  if ('mateIn' in score) {
    if (score.mateIn > 0) {
      return 1;
    }
    return 0;
  }
  let centipawns = score.centipawns;
  if (centipawns > EVALUATION_CAP) {
    centipawns = EVALUATION_CAP;
  } else if (centipawns < -EVALUATION_CAP) {
    centipawns = -EVALUATION_CAP;
  }
  const winningChances = 2 / (1 + Math.exp(-STEEPNESS * centipawns)) - 1;
  return 0.5 + winningChances / 2;
}
