// Tests for how the write-up page presents what the Opening Book adds to the
// Base Model, read from the record of the Opening Book measurement.

import { describe, expect, it } from 'vitest';
import type { OpeningBookRecord } from '../evaluation/opening-book-coverage';
import type { MoveMatchingReport, MoveMatchingScore } from '../evaluation/move-matching';
import { describeOpeningBook } from './opening-book-effect';

function score(matched: number, positions: number, errorInPercent: number): MoveMatchingScore {
  return { matched: matched, positions: positions, games: 100, standardError: errorInPercent / 100 };
}

/** A report whose opening and overall scores are given; the other Phases do not matter here. */
function report(opening: MoveMatchingScore, overall: MoveMatchingScore): MoveMatchingReport {
  const unused = score(0, 1, 0);
  return { overall: overall, afterPly10: unused, byPhase: { opening: opening, middlegame: unused, endgame: unused } };
}

const MEASUREMENT: OpeningBookRecord = {
  measuredOn: '2026-10-07',
  baseModel: 'maia3-5m',
  rating: 1100,
  bookPositions: 182,
  minOccurrences: 3,
  coverage: {
    opening: { answered: 50, positions: 200 },
    middlegame: { answered: 1, positions: 400 },
    endgame: { answered: 0, positions: 400 },
  },
  baseModelAlone: report(score(100, 200, 1.5), score(500, 1000, 0.6)),
  bookThenBaseModel: report(score(120, 200, 1.6), score(520, 1000, 0.6)),
  answeredByBook: {
    baseModelAlone: report(score(25, 50, 2), score(25, 51, 2)),
    bookThenBaseModel: report(score(40, 50, 2), score(40, 51, 2)),
  },
};

describe('the Opening Book shown on the write-up', () => {
  it("compares the opening Move-Matching of the Base Model alone with the Bot's, which consults the book first", () => {
    const effect = describeOpeningBook(MEASUREMENT);

    expect(effect.byPhase.opening).toEqual({ baseline: '50.00 ± 1.50', bot: '60.00 ± 1.60' });
  });

  it('compares the two over every Test Set position, where the book weighs far less', () => {
    const effect = describeOpeningBook(MEASUREMENT);

    expect(effect.overall).toEqual({ baseline: '50.00 ± 0.60', bot: '52.00 ± 0.60' });
  });

  it('states how much of the opening the book answers', () => {
    const effect = describeOpeningBook(MEASUREMENT);

    // 50 of 200 opening positions
    expect(effect.openingAnswered).toBe('25%');
  });

  it("compares the book's move with the Base Model's on the positions the book answers", () => {
    const effect = describeOpeningBook(MEASUREMENT);

    // 40 of 51 against 25 of 51
    expect(effect.whereTheBookAnswers).toEqual({ baseline: '49.02 ± 2.00', bot: '78.43 ± 2.00' });
  });

  it('compares the two in every Phase, so a reader sees where the book stops making a difference', () => {
    const later = score(476, 1000, 1.06);
    const withLaterPhases = (report: MoveMatchingReport): MoveMatchingReport => ({
      ...report,
      byPhase: { opening: report.byPhase.opening, middlegame: later, endgame: later },
    });
    const measurement: OpeningBookRecord = {
      ...MEASUREMENT,
      baseModelAlone: withLaterPhases(MEASUREMENT.baseModelAlone),
      bookThenBaseModel: withLaterPhases(MEASUREMENT.bookThenBaseModel),
    };

    const effect = describeOpeningBook(measurement);

    expect(effect.byPhase.middlegame).toEqual({ baseline: '47.60 ± 1.06', bot: '47.60 ± 1.06' });
    expect(effect.byPhase.endgame).toEqual({ baseline: '47.60 ± 1.06', bot: '47.60 ± 1.06' });
  });
});
