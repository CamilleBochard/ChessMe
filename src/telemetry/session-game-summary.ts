// The Session Game summary: how many games visitors have played against the
// Bot and how it fared, read from the Session Game service when it is shown,
// so the figures are current rather than those of the last build.
// Free of anything DOM so that it is tested under Node; the page fills in the
// text.

import { wholePercent } from '../write-up/figures';

/** The counts as the service answers them (pipeline/session_games.py). */
interface SessionGameCounts {
  games: number;
  bot_wins: number;
  bot_losses: number;
  draws: number;
  bot_moves_from_opening_book: number;
  bot_moves_from_base_model: number;
  felt_like_a_real_player: number;
  did_not_feel_like_a_real_player: number;
  impression_not_given: number;
}

const COUNT_NAMES: (keyof SessionGameCounts)[] = [
  'games',
  'bot_wins',
  'bot_losses',
  'draws',
  'bot_moves_from_opening_book',
  'bot_moves_from_base_model',
  'felt_like_a_real_player',
  'did_not_feel_like_a_real_player',
  'impression_not_given',
];

/** The summary as the page shows it, each figure already written out. */
export interface SessionGameSummary {
  games: string;
  /** Such as "7 wins, 2 draws, 3 losses", counted from the Bot's side. */
  botRecord: string;
  /**
   * The share of the points the Bot took, a win counting one and a draw a
   * half, as chess scores a match. Undefined until a game has been played.
   */
  botScore?: string;
  /** The share of the Bot's moves the Opening Book gave. Undefined until the Bot has moved. */
  fromOpeningBook?: string;
  /**
   * How many visitors, of those who answered the end-of-game question, felt
   * the Bot played like a real player at its level. Undefined until one has
   * answered.
   */
  feltLikeARealPlayer?: string;
}

const COUNTS_URL = '/api/session-games/counts';

/**
 * The event announced on the document when the stored games may have changed:
 * a game was reported, or a visitor's impression recorded. Whatever shows the
 * summary reads it again.
 */
export const SESSION_GAMES_CHANGED = 'chessme:session-games-changed';

/**
 * Asks the service for the counts and writes out the summary they make.
 * Undefined when no counts come back, so that the page says they are
 * unavailable rather than showing zeros.
 */
export async function readSessionGameSummary(fetchFromService: typeof fetch): Promise<SessionGameSummary | undefined> {
  let response: Response;
  try {
    response = await fetchFromService(COUNTS_URL);
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
  if (!isSessionGameCounts(body)) {
    return undefined;
  }
  const counts = body;

  const summary: SessionGameSummary = {
    games: `${counts.games}`,
    botRecord: [
      counted(counts.bot_wins, 'win', 'wins'),
      counted(counts.draws, 'draw', 'draws'),
      counted(counts.bot_losses, 'loss', 'losses'),
    ].join(', '),
  };
  if (counts.games > 0) {
    const points = counts.bot_wins + counts.draws / 2;
    summary.botScore = wholePercent(points / counts.games);
  }

  const botMoves = counts.bot_moves_from_opening_book + counts.bot_moves_from_base_model;
  if (botMoves > 0) {
    summary.fromOpeningBook = wholePercent(counts.bot_moves_from_opening_book / botMoves);
  }

  const answered = counts.felt_like_a_real_player + counts.did_not_feel_like_a_real_player;
  if (answered > 0) {
    summary.feltLikeARealPlayer = `${counts.felt_like_a_real_player} of ${answered} who answered`;
  }
  return summary;
}

/** A number followed by its noun, such as "1 win" or "3 wins". */
function counted(count: number, singular: string, plural: string): string {
  if (count === 1) {
    return `${count} ${singular}`;
  }
  return `${count} ${plural}`;
}


/** Whether the reply holds every count, each a number. */
function isSessionGameCounts(body: unknown): body is SessionGameCounts {
  if (typeof body !== 'object' || body === null) {
    return false;
  }
  const fields = body as Record<string, unknown>;
  for (const name of COUNT_NAMES) {
    if (typeof fields[name] !== 'number') {
      return false;
    }
  }
  return true;
}
