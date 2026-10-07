// What the Opening Book adds, as the write-up page presents it: Move-Matching
// of the Base Model alone, the Baseline, against the Bot as the site serves
// it, which consults the book first. Computed from the record the Opening
// Book measurement writes.
// Free of anything DOM so that it is tested under Node.

import type { OpeningBookRecord } from '../evaluation/opening-book-coverage';
import { percentWithError } from './figures';

/** One slice's Move-Matching for the Baseline and for the Bot. */
export interface Comparison {
  baseline: string;
  bot: string;
}

export interface OpeningBookEffect {
  /** Every Test Set position in the opening. */
  opening: Comparison;
  /** Every Test Set position, over whole games. */
  overall: Comparison;
  /** Only the positions the book answers: its move against the Base Model's, the one place the two differ. */
  whereTheBookAnswers: Comparison;
  /** The share of opening positions the book holds a move for, such as 56%. */
  openingAnswered: string;
}

/** The Baseline against the Bot, from the record of one Opening Book measurement. */
export function describeOpeningBook(record: OpeningBookRecord): OpeningBookEffect {
  const openingCoverage = record.coverage.opening;
  const percentAnswered = Math.round((100 * openingCoverage.answered) / openingCoverage.positions);

  return {
    opening: {
      baseline: percentWithError(record.baseModelAlone.byPhase.opening),
      bot: percentWithError(record.bookThenBaseModel.byPhase.opening),
    },
    overall: {
      baseline: percentWithError(record.baseModelAlone.overall),
      bot: percentWithError(record.bookThenBaseModel.overall),
    },
    whereTheBookAnswers: {
      baseline: percentWithError(record.answeredByBook.baseModelAlone.overall),
      bot: percentWithError(record.answeredByBook.bookThenBaseModel.overall),
    },
    openingAnswered: `${percentAnswered}%`,
  };
}
