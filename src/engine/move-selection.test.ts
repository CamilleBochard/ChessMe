// Tests for the Move-Selection Engine. They hand it a position and assert the
// move it returns. Positions are chosen so the expected move is the only legal
// one, which keeps every assertion independent of how the engine chooses.

import { describe, expect, it } from 'vitest';
import { selectMove } from './move-selection';

describe('selectMove', () => {
  it('returns the only legal move in a position', async () => {
    // The white king on a1 can neither step to a2 nor b1, both covered by the
    // rook, but it can take the undefended rook on b2.
    const kingMustTakeTheRook = '7k/8/8/8/8/8/1r6/K7 w - - 0 1';

    const move = await selectMove(kingMustTakeTheRook);

    expect(move).toEqual({ from: 'a1', to: 'b2' });
  });

  it('refuses a position where the side to move has no legal move', async () => {
    // Black's king on h8 is stalemated by the queen on f7 and the king on g6.
    const stalemate = '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1';

    await expect(selectMove(stalemate)).rejects.toThrow(`No legal move to choose in ${stalemate}`);
  });
});
