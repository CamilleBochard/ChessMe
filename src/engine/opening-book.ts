// The Opening Book: the positions Camille has reached often enough in his own
// games for his reply to be known, mapped to that reply. The Python pipeline
// builds it from the training games and writes it as JSON; this module reads
// that file and answers for one position at a time.
// Free of anything DOM so that it runs unchanged under Node.

import { legalMoves, positionKey, uciName, type Game, type MoveRequest } from '../game/game';

export interface OpeningBook {
  /** How many times a position had to be reached to enter the book. */
  minOccurrences: number;
  /** The move Camille played in this position, or undefined when the book does not hold it. */
  move(game: Game): MoveRequest | undefined;
}

/** The book as pipeline/build_opening_book.py writes it. */
interface OpeningBookFile {
  min_occurrences: number;
  /** Position key, as positionKey gives it, to the move in UCI form. */
  positions: Record<string, string>;
}

/** Reads the book from the text of its JSON file. */
export function readOpeningBook(json: string): OpeningBook {
  const file = JSON.parse(json) as OpeningBookFile;
  const movesByPosition = new Map(Object.entries(file.positions));

  return {
    minOccurrences: file.min_occurrences,
    move: (game) => {
      const bookMove = movesByPosition.get(positionKey(game));
      if (bookMove === undefined) {
        return undefined;
      }
      // Looked up among the legal moves rather than parsed from its name, so
      // that whatever the file holds, the book can only answer a legal move.
      const legal = legalMoves(game);
      return legal.find((move) => uciName(move) === bookMove);
    },
  };
}
