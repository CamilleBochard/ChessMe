// Opening Book coverage: how many of Camille's positions the book answers.
// Move-Matching with and without the book says whether the book helps;
// coverage says how much of the game it reaches, which is the ceiling on that
// help. Reported per Phase, since the book is meant for the opening.
// Free of anything DOM or Node; reading files is left to the caller.

import { gameFromFen } from '../game/game';
import type { OpeningBook } from '../engine/opening-book';
import { PHASES, type Phase, type PlayedPosition } from './move-matching';

export interface BookCoverage {
  /** Positions the book holds a move for. */
  answered: number;
  positions: number;
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
