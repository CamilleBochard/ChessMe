// The evaluation bar analysis mode shows beside the board: how much of it is
// White's, from Stockfish's score of the position on display.
// Free of anything DOM.

import type { Colour } from '../board/starting-position';
import { currentFen, playMove, sideToMove, type Game, type MoveRequest } from '../game/game';
import { EVALUATION_CAP, type Analysis, type Score } from './engine-analysis';

/** A position, by its FEN, and Stockfish's score of it from White's side. */
export interface PositionScore {
  fen: string;
  score: Score;
}

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

/**
 * A score Stockfish gave from the side it searched for, read from White's
 * side as the bar reads every score.
 */
export function fromWhitesSide(score: Score, side: Colour): Score {
  if (side === 'white') {
    return score;
  }
  if ('mateIn' in score) {
    return { mateIn: -score.mateIn };
  }
  return { centipawns: -score.centipawns };
}

/**
 * The score as the bar writes it, from White's side: in pawns to one
 * decimal, with a plus for White ahead, or M and the moves to mate. The
 * language's own way of writing a decimal is passed in.
 */
export function scoreLabel(score: Score, decimal: (value: number, decimals: number) => string): string {
  if ('mateIn' in score) {
    if (score.mateIn > 0) {
      return `M${score.mateIn}`;
    }
    return `-M${-score.mateIn}`;
  }
  // Rounded first, so a position a few centipawns off level reads 0.0
  // rather than -0.0.
  const tenthsOfAPawn = Math.round(score.centipawns / 10);
  const pawns = Math.abs(tenthsOfAPawn) / 10;
  if (tenthsOfAPawn > 0) {
    return `+${decimal(pawns, 1)}`;
  }
  if (tenthsOfAPawn < 0) {
    return `-${decimal(pawns, 1)}`;
  }
  return decimal(0, 1);
}

/**
 * What the analysis of one move says of the positions on either side of it.
 * The search of the whole position scores the position the move was played
 * from, through the best move; the search of the move alone scores the
 * position it leaves. The bar reads both, so every position next to one of
 * the Bot's moves has a score without another search.
 */
export function positionScores(before: Game, move: MoveRequest, analysis: Analysis): PositionScore[] {
  const mover = sideToMove(before);
  const after = playMove(before, move)!;
  return [
    { fen: currentFen(before), score: fromWhitesSide(analysis.best, mover) },
    { fen: currentFen(after), score: fromWhitesSide(analysis.played, mover) },
  ];
}
