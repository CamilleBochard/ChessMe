// What the Opening Book adds, as the write-up page presents it: Move-Matching
// of the Base Model alone, the Baseline, against the Bot as the site serves
// it, which consults the book first. Computed from the record the Opening
// Book measurement writes.
// Free of anything DOM so that it is tested under Node.

import type { OpeningBookRecord } from '../evaluation/opening-book-coverage';
import { PHASES, type MoveMatchingScore, type Phase } from '../evaluation/move-matching';
import { percentWithError, wholePercent } from './figures';

/** One slice's Move-Matching for the Baseline and for the Bot. */
export interface Comparison {
  baseline: string;
  bot: string;
}

export interface OpeningBookEffect {
  /** Every Test Set position of each Phase. The two differ only where the book answers, mostly the opening. */
  byPhase: Record<Phase, Comparison>;
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
  const shareAnswered = openingCoverage.answered / openingCoverage.positions;

  const byPhase = {} as Record<Phase, Comparison>;
  for (const phase of PHASES) {
    byPhase[phase] = compare(record.baseModelAlone.byPhase[phase], record.bookThenBaseModel.byPhase[phase]);
  }

  return {
    byPhase: byPhase,
    overall: compare(record.baseModelAlone.overall, record.bookThenBaseModel.overall),
    whereTheBookAnswers: compare(record.answeredByBook.baseModelAlone.overall, record.answeredByBook.bookThenBaseModel.overall),
    openingAnswered: wholePercent(shareAnswered),
  };
}

function compare(baseline: MoveMatchingScore, bot: MoveMatchingScore): Comparison {
  return { baseline: percentWithError(baseline), bot: percentWithError(bot) };
}
