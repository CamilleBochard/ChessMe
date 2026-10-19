// A player's record as the page shows it: Camille's, built into
// player-record.json by pipeline/build_player_record.py, and the Bot's, read
// from the Session Game service when its tab is opened. Both are worked out
// by pipeline/player_record.py, so they have one shape.
// Free of anything DOM so that it is tested under Node.

export interface Results {
  wins: number;
  draws: number;
  losses: number;
}

export interface OpeningRecord {
  name: string;
  games: number;
  results: Results;
}

/** The player's games with one colour. */
export interface ColourRecord {
  games: number;
  results: Results;
  /** The openings played most with that colour, most played first. */
  openings: OpeningRecord[];
}

export interface PlayerRecord {
  games: number;
  results: Results;
  white: ColourRecord;
  black: ColourRecord;
}

const BOT_RECORD_URL = '/api/session-games/record';

/** A player's score: a point for a win and half a point for a draw, as a share of the games. */
export function score(results: Results): number {
  const games = results.wins + results.draws + results.losses;
  const points = results.wins + results.draws / 2;
  return points / games;
}

/**
 * Asks the service for the Bot's record over the games visitors finished on
 * the site.
 */
export async function readBotRecord(fetchFromService: typeof fetch): Promise<PlayerRecord | undefined> {
  let response: Response;
  try {
    response = await fetchFromService(BOT_RECORD_URL);
  } catch {
    // The service is down, or the visitor is offline.
    return undefined;
  }
  if (!response.ok) {
    // Turned away, by the web server's rate limit for instance.
    return undefined;
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return undefined;
  }
  if (!isPlayerRecord(body)) {
    return undefined;
  }
  return body;
}

/** Whether the reply is a record, every figure in it a number. Nothing from the network is assumed until checked. */
function isPlayerRecord(body: unknown): body is PlayerRecord {
  if (!isObject(body)) {
    return false;
  }
  if (typeof body.games !== 'number' || !isResults(body.results)) {
    return false;
  }
  return isColourRecord(body.white) && isColourRecord(body.black);
}

function isColourRecord(value: unknown): value is ColourRecord {
  if (!isObject(value)) {
    return false;
  }
  if (typeof value.games !== 'number' || !isResults(value.results) || !Array.isArray(value.openings)) {
    return false;
  }
  for (const opening of value.openings) {
    if (!isOpeningRecord(opening)) {
      return false;
    }
  }
  return true;
}

function isOpeningRecord(value: unknown): value is OpeningRecord {
  if (!isObject(value)) {
    return false;
  }
  return typeof value.name === 'string' && typeof value.games === 'number' && isResults(value.results);
}

function isResults(value: unknown): value is Results {
  if (!isObject(value)) {
    return false;
  }
  return typeof value.wins === 'number' && typeof value.draws === 'number' && typeof value.losses === 'number';
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
