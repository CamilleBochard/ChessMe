import { describe, expect, it } from 'vitest';
import { positionsNotYetRecorded } from './move-records';
import type { PlayedPosition } from './move-matching';

function position(game: string, ply: number): PlayedPosition {
  return { game: game, fen: 'a-fen', ply: ply, phase: 'opening', move: 'e2e4' };
}

describe('positionsNotYetRecorded', () => {
  it('keeps the positions no record names yet, by game and ply', () => {
    const recorded = [
      JSON.stringify({ game_id: 'lichess:a', ply: 1, move: 'e2e4', rank: 1 }),
      JSON.stringify({ game_id: 'lichess:a', ply: 3, move: 'g1f3', rank: 2 }),
    ].join('\n');
    const positions = [position('lichess:a', 1), position('lichess:a', 3), position('lichess:a', 5), position('chesscom:b', 1)];

    expect(positionsNotYetRecorded(positions, recorded)).toEqual([position('lichess:a', 5), position('chesscom:b', 1)]);
  });
});
