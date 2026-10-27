import { describe, expect, it } from 'vitest';
import { openingBookProblems } from './opening-book-check';

const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -';

function book(positions: Record<string, string>): string {
  return JSON.stringify({ min_occurrences: 3, positions: positions });
}

describe('openingBookProblems', () => {
  it('finds nothing wrong with a book whose every move is legal in its position', () => {
    expect(openingBookProblems(book({ [AFTER_E4]: 'c7c5' }))).toEqual([]);
  });

  it('names a move that is not legal in its position, and a position that cannot be read', () => {
    const problems = openingBookProblems(book({ [AFTER_E4]: 'e2e4', 'not a position': 'e7e5' }));

    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain('e2e4');
    expect(problems[1]).toContain('not a position');
  });
});
