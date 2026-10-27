// The Base Model's records of where Camille's moves sit in its distribution,
// written by scripts/move-probabilities.ts, grow with his games: a refresh
// runs the model on the positions of new games only and keeps every record
// already written. A game's positions never change once it is in data/raw,
// so a position is named by its game and ply.

import type { PlayedPosition } from './move-matching';

/** The positions none of the records' JSON lines names yet, in their order. */
export function positionsNotYetRecorded(positions: PlayedPosition[], recordLines: string): PlayedPosition[] {
  const recorded = new Set<string>();
  for (const line of recordLines.split('\n')) {
    if (line.trim() === '') {
      continue;
    }
    const record = JSON.parse(line);
    recorded.add(positionKey(record.game_id, record.ply));
  }
  return positions.filter((position) => !recorded.has(positionKey(position.game, position.ply)));
}

function positionKey(game: string, ply: number): string {
  return `${game} ${ply}`;
}
