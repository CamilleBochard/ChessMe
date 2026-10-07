// Opening Book coverage: how many of Camille's positions the book answers.
// Move-Matching with and without the book says whether the book helps;
// coverage says how much of the game it reaches, which is the ceiling on that
// help. Reported per Phase, since the book is meant for the opening.
// Free of anything DOM or Node; reading files is left to the caller.

import { gameFromFen } from '../game/game';
import type { OpeningBook } from '../engine/opening-book';
import { PHASES, type MoveMatchingReport, type Phase, type PlayedPosition } from './move-matching';

export interface BookCoverage {
  /** Positions the book holds a move for. */
  answered: number;
  positions: number;
}

/**
 * What one measurement of the Opening Book found on the Test Set, as it is
 * kept for the write-up: the raw counts, from which every figure shown is
 * computed again.
 */
export interface OpeningBookRecord {
  /** The day the measurement ran, as YYYY-MM-DD. */
  measuredOn: string;
  /** The Base Model behind the book, such as maia3-5m, and the rating it played at. */
  baseModel: string;
  rating: number | null;
  /** How many positions the book holds, and how often each had to be reached to enter it. */
  bookPositions: number;
  minOccurrences: number;
  coverage: Record<Phase, BookCoverage>;
  /** Every Test Set position: the Baseline, and the Bot as the site serves it. */
  baseModelAlone: MoveMatchingReport;
  bookThenBaseModel: MoveMatchingReport;
  /** Only the positions the book answers, the one place the two can differ. */
  answeredByBook: {
    baseModelAlone: MoveMatchingReport;
    bookThenBaseModel: MoveMatchingReport;
  };
}

/** Counts, per Phase, the positions the book answers. */
export function measureBookCoverage(positions: PlayedPosition[], openingBook: OpeningBook): Record<Phase, BookCoverage> {
  const coverage = {} as Record<Phase, BookCoverage>;
  for (const phase of PHASES) {
    coverage[phase] = { answered: 0, positions: 0 };
  }

  for (const position of positions) {
    const tally = coverage[position.phase];
    tally.positions = tally.positions + 1;

    const bookMove = openingBook.move(gameFromFen(position.fen));
    if (bookMove !== undefined) {
      tally.answered = tally.answered + 1;
    }
  }
  return coverage;
}
