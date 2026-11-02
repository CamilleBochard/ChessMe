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
