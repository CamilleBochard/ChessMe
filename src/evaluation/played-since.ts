// The records of Camille's games begun since a given moment, such as the
// Level Break (docs/experiments/level-break.md): Level is measured on those,
// Style on every game. The dataset records when each game began; records
// written from it, such as the Base Model's probabilities, name only the
// game, so the moment is looked up from the dataset.

/** When each game of the dataset began, in UTC, by game id, read from its JSON lines. */
export function readGameStarts(jsonLines: string): Map<string, string> {
  const starts = new Map<string, string>();
  for (const line of jsonLines.split('\n')) {
    if (line.trim() === '') {
      continue;
    }
    const record = JSON.parse(line);
    starts.set(record.game_id, record.played_at);
  }
  return starts;
}

/**
 * The records of the games that began at the moment since or later, every
 * record when since is null. since is written as the dataset writes when a
 * game began, such as 2025-06-15T10:00:00, so the two compare as text.
 */
export function playedSince<T extends { game: string }>(records: T[], gameStarts: Map<string, string>, since: string | null): T[] {
  if (since === null) {
    return records;
  }
  const kept: T[] = [];
  for (const record of records) {
    const began = gameStarts.get(record.game);
    // A game missing from the dataset, or written before games were dated,
    // would otherwise be kept or dropped without anyone seeing it.
    if (began === undefined || began === null) {
      throw new Error(`The dataset does not say when ${record.game} was played`);
    }
    if (began >= since) {
      kept.push(record);
    }
  }
  return kept;
}
