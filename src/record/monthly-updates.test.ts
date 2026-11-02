import { describe, expect, it } from 'vitest';
import { lastTwelveMonths, monthlyUpdates } from './monthly-updates';

/** A refresh summary reduced to what the section reads. */
function summary(day: string, games: number) {
  return { day, new_games: { games } };
}

describe('the monthly updates', () => {
  it('lists each update with the games it added, oldest first', () => {
    const updates = monthlyUpdates([summary('2026-11-02', 20), summary('2026-10-27', 114)]);

    expect(updates.updates.map((update) => [update.day, update.games])).toEqual([
      ['2026-10-27', 114],
      ['2026-11-02', 20],
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

    expect(updates.updates.map((update) => update.shareOfLargest)).toEqual([1, 0.25]);
  });
});

describe('the last twelve months of updates', () => {
  it('counts the games each month added, up to the month of the newest update', () => {
    const updates = monthlyUpdates([summary('2026-10-27', 114), summary('2026-11-02', 20)]);

    const months = lastTwelveMonths(updates).months;

    expect(months.map((month) => month.month)).toEqual([
      '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05',
      '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11',
    ]);
    expect(months.map((month) => month.games)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 114, 20]);
  });

  it('lists the updates of those months, newest first, leaving out older ones', () => {
    const updates = monthlyUpdates([
      summary('2025-11-03', 50),
      summary('2025-12-01', 30),
      summary('2026-11-02', 20),
    ]);

    const inMonths = lastTwelveMonths(updates).updates;

    expect(inMonths.map((update) => update.day)).toEqual(['2026-11-02', '2025-12-01']);
  });

  it('is empty before the first update', () => {
    expect(lastTwelveMonths(monthlyUpdates([]))).toEqual({ months: [], updates: [] });
  });
});
