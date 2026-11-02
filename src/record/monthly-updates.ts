// How many of Camille's games each monthly update took in, for the section
// under his record. Read from the summaries the monthly refresh writes into
// docs/refreshes/, so each deployment of a refresh brings its own row.
// Free of anything DOM.

/** The part of a refresh summary the section reads. */
export interface RefreshSummary {
  day: string;
  new_games: { games: number };
}

export interface MonthlyUpdate {
  /** The day the update ran, as YYYY-MM-DD. */
  day: string;
  /** How many games it added to those the Bot is built from. */
  games: number;
  /** Its games over those of the update that added the most: the length of its bar, from 0 to 1. */
  shareOfLargest: number;
}

export interface MonthlyUpdates {
  /** Oldest first. */
  updates: MonthlyUpdate[];
  /** The games every update added, together. */
  totalGames: number;
}

export function monthlyUpdates(summaries: RefreshSummary[]): MonthlyUpdates {
  const updates: MonthlyUpdate[] = [];
  for (const summary of summaries) {
    // A month without new games writes no summary; one with none comes from
    // a run forced to go on for testing, and added nothing to show.
    const games = summary.new_games.games;
    if (games === 0) {
      continue;
    }
    updates.push({ day: summary.day, games, shareOfLargest: 0 });
  }
  // Oldest first: the chart reads left to right along time.
  updates.sort((first, second) => first.day.localeCompare(second.day));

  let totalGames = 0;
  let largest = 0;
  for (const update of updates) {
    totalGames += update.games;
    largest = Math.max(largest, update.games);
  }
  for (const update of updates) {
    update.shareOfLargest = update.games / largest;
  }
  return { updates, totalGames };
}

/** How many months the detailed view of the updates covers. */
const MONTHS_SHOWN = 12;

export interface MonthOfUpdates {
  /** The month, as YYYY-MM. */
  month: string;
  /** The games its updates added; 0 when none ran or none found a new game. */
  games: number;
}

export interface TwelveMonths {
  /** Oldest first, ending with the month of the newest update. */
  months: MonthOfUpdates[];
  /** The updates that ran in those months, newest first. */
  updates: MonthlyUpdate[];
}

/**
 * The twelve months up to the newest update, each with the games its updates
 * added. They end at the newest update rather than today, so the site built
 * from the same summaries always shows the same months.
 */
export function lastTwelveMonths(record: MonthlyUpdates): TwelveMonths {
  if (record.updates.length === 0) {
    return { months: [], updates: [] };
  }
  const newest = record.updates[record.updates.length - 1];
  const [newestYear, newestMonth] = newest.day.split('-').map(Number);

  const months: MonthOfUpdates[] = [];
  for (let back = MONTHS_SHOWN - 1; back >= 0; back--) {
    // Counted in months since year 0, so stepping back crosses years.
    const monthsSinceYearZero = newestYear * 12 + (newestMonth - 1) - back;
    const year = Math.floor(monthsSinceYearZero / 12);
    const month = (monthsSinceYearZero % 12) + 1;
    months.push({ month: `${year}-${String(month).padStart(2, '0')}`, games: 0 });
  }

  const updates: MonthlyUpdate[] = [];
  for (const update of record.updates) {
    const month = update.day.slice(0, 7);
    const shown = months.find((candidate) => candidate.month === month);
    if (shown === undefined) {
      continue;
    }
    shown.games += update.games;
    updates.unshift(update);
  }
  return { months, updates };
}
