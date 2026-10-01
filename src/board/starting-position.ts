// The position every game opens from, and the vocabulary for talking about it.
// Deliberately free of anything Astro or DOM: the Move-Selection Engine runs
// under Node with no browser present, and this module sits on its side of the
// line.

/**
 * Forsyth-Edwards Notation for the standard opening position.
 *
 * The six fields are: piece placement, side to move, castling rights, en
 * passant target square, halfmove clock, fullmove number.
 */
export const STARTING_FEN =
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** The side a player takes. Matches chessground's own colour vocabulary. */
export type Colour = 'white' | 'black';
