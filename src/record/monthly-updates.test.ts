import { describe, expect, it } from 'vitest';
import { monthlyUpdates } from './monthly-updates';

/** A refresh summary reduced to what the section reads. */
function summary(day: string, games: number) {
  return { day, new_games: { games } };
}

describe('the monthly updates', () => {
  it('lists each update with the games it added, newest first', () => {
    const updates = monthlyUpdates([summary('2026-10-27', 114), summary('2026-11-02', 20)]);

    expect(updates.updates).toEqual([
      { day: '2026-11-02', games: 20 },
      { day: '2026-10-27', games: 114 },
    ]);
  });

  it('leaves out an update that added no game', () => {
    const updates = monthlyUpdates([summary('2026-10-27', 114), summary('2026-10-27', 0)]);

    expect(updates.updates).toEqual([{ day: '2026-10-27', games: 114 }]);
  });

  it('totals the games every update added', () => {
    const updates = monthlyUpdates([summary('2026-10-27', 114), summary('2026-11-02', 20)]);

    expect(updates.totalGames).toBe(134);
  });
});
