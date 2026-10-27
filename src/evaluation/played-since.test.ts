import { describe, expect, it } from 'vitest';
import { playedSince, readGameStarts } from './played-since';

/** Two of Camille's moves as the dataset writes them, from two games. */
const DATASET_LINES = [
  { game_id: 'lichess:a', ply: 1, phase: 'opening', fen: 'f', move: 'e2e4', played_at: '2025-07-01T10:00:00' },
  { game_id: 'lichess:a', ply: 3, phase: 'opening', fen: 'f', move: 'g1f3', played_at: '2025-07-01T10:00:00' },
  { game_id: 'chesscom:b', ply: 2, phase: 'opening', fen: 'f', move: 'e7e5', played_at: '2026-03-01T18:30:00' },
]
  .map((record) => JSON.stringify(record))
  .join('\n');

describe('readGameStarts', () => {
  it('reads when each game began from the dataset\'s lines', () => {
    const starts = readGameStarts(DATASET_LINES);

    expect(starts).toEqual(
      new Map([
        ['lichess:a', '2025-07-01T10:00:00'],
        ['chesscom:b', '2026-03-01T18:30:00'],
      ]),
    );
  });
});

describe('playedSince', () => {
  const starts = readGameStarts(DATASET_LINES);
  const records = [
    { game: 'lichess:a', ply: 1 },
    { game: 'chesscom:b', ply: 2 },
  ];

  it('keeps the records of the games begun at the moment or later, and every record with no moment given', () => {
    expect(playedSince(records, starts, '2026-03-01T18:30:00')).toEqual([{ game: 'chesscom:b', ply: 2 }]);
    expect(playedSince(records, starts, null)).toEqual(records);
  });

  it('refuses a record of a game the dataset does not date, rather than keep or drop it unseen', () => {
    const undated = [{ game: 'lichess:unknown', ply: 5 }];

    expect(() => playedSince(undated, starts, '2025-01-01T00:00:00')).toThrow('lichess:unknown');
  });
});
