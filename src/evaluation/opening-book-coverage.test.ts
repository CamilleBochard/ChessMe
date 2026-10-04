// Tests for Opening Book coverage: how many of Camille's positions the book
// answers, per Phase. The fixture is the seven-position Test Set the
// Move-Matching tests use, so the expected counts can be checked by hand.

import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { readOpeningBook } from '../engine/opening-book';
import { readPositions } from './move-matching';
import { measureBookCoverage } from './opening-book-coverage';

const FIXTURE_TEST_SET = new URL('./fixtures/test-set.jsonl', import.meta.url);

describe('measureBookCoverage', () => {
  it('counts, per Phase, the positions the book answers', async () => {
    const testSet = readPositions(await readFile(FIXTURE_TEST_SET, 'utf-8'));
    const openingBook = readOpeningBook(
      JSON.stringify({
        min_occurrences: 3,
        positions: {
          // The fixture's ply 1, an opening position.
          'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -': 'e2e4',
          // The fixture's ply 11, a middlegame position.
          'r1bqkbnr/pppp1ppp/2n5/8/3NP3/8/PPP2PPP/RNBQKB1R w KQkq -': 'd4c6',
          // Black's reply to 1. e4, which the fixture never reaches.
          'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -': 'c7c5',
        },
      }),
    );

    const coverage = measureBookCoverage(testSet, openingBook);

    expect(coverage).toEqual({
      opening: { answered: 1, positions: 4 },
      middlegame: { answered: 1, positions: 2 },
      endgame: { answered: 0, positions: 1 },
    });
  });
});
