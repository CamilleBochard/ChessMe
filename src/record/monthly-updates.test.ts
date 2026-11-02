import { describe, expect, it } from 'vitest';
import { monthlyUpdates } from './monthly-updates';

/** A refresh summary reduced to what the section reads. */
function summary(day: string, games: number) {
  return { day, new_games: { games } };
}

describe('the monthly updates', () => {
  it('lists each update with the games it added, newest first', () => {
    const updates = monthlyUpdates([summary('2026-10-27', 114), summary('2026-11-02', 20)]);

    expect(updates.updates.map((update) => [update.day, update.games])).toEqual([
      ['2026-11-02', 20],
      ['2026-10-27', 114],
    ]);
  });

  it('leaves out an update that added no game', () => {
    const updates = monthlyUpdates([summary('2026-10-27', 114), summary('2026-10-27', 0)]);

    expect(updates.updates.map((update) => update.day)).toEqual(['2026-10-27']);
  });

  it('totals the games every update added', () => {
    const updates = monthlyUpdates([summary('2026-10-27', 114), summary('2026-11-02', 20)]);

    expect(updates.totalGames).toBe(134);
  });

  it('sizes each update against the one that added the most games', () => {
    const updates = monthlyUpdates([summary('2026-10-27', 100), summary('2026-11-02', 25)]);

    expect(updates.updates.map((update) => update.shareOfLargest)).toEqual([0.25, 1]);
  });
});
