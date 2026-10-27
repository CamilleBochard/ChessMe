// The check a refreshed Opening Book passes before it is published: the file
// reads as a book, and every move in it is legal in its position. The Bot
// would never play an illegal book move, since it looks the move up among the
// legal ones, but it would silently fall back to the Base Model there, and a
// book that breaks that way is a book built wrong.

import { gameFromFen, legalMoves, uciName } from '../game/game';
import type { OpeningBookFile } from './opening-book';

/** Every way the book's file is wrong, one sentence each; none for a sound book. */
export function openingBookProblems(json: string): string[] {
  let file: OpeningBookFile;
  try {
    file = JSON.parse(json) as OpeningBookFile;
  } catch (error) {
    return [`The book is not JSON: ${(error as Error).message}`];
  }
  if (!Number.isInteger(file.min_occurrences) || file.min_occurrences < 1) {
    return [`min_occurrences is ${file.min_occurrences}, not a whole number of at least 1`];
  }
  if (typeof file.positions !== 'object' || file.positions === null) {
    return ['The book holds no positions'];
  }

  const problems: string[] = [];
  for (const [position, move] of Object.entries(file.positions)) {
    // A book position is a FEN without its two move counters.
    let legal: string[];
    try {
      legal = legalMoves(gameFromFen(`${position} 0 1`)).map(uciName);
    } catch {
      problems.push(`The position "${position}" cannot be read`);
      continue;
    }
    if (!legal.includes(move)) {
      problems.push(`${move} is not legal in ${position}`);
    }
  }
  return problems;
}
