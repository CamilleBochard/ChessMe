// The report of a finished Session Game, and the sending of it to the service
// that stores finished games (pipeline/serve_session_games.py). The page
// sends the moves rather than a PGN: the service replays them and writes the
// PGN itself.
// Free of anything DOM, and handed fetch by the caller, so the tests can
// replace the network.

import type { Colour } from '../board/starting-position';
import { uciName } from '../game/game';
import type { MoveSource } from '../engine/move-selection';
import type { FinishedGame } from '../session/session-game';

/** Where the service listens, behind the same web server as the page. */
const SESSION_GAMES_URL = '/api/session-games';

/** One move as the service expects it: the Bot's moves also say where they came from. */
export interface ReportedMove {
  uci: string;
  source?: MoveSource;
}

/** The Base Model the Bot plays with, as a Session Game records it. */
export interface PlayedModel {
  /** Named after its file, whose name carries a hash of its contents. */
  readonly baseModel: string;
  /** The rating it plays at. */
  readonly rating: number;
}

/** A finished game, in the shape the service stores. */
export interface SessionGameReport extends PlayedModel {
  readonly botColour: Colour;
  readonly moves: readonly ReportedMove[];
  /** True when the game ended with the visitor resigning rather than on the board. */
  readonly visitorResigned: boolean;
}

/** The report of a finished game, the Bot playing the side the visitor did not take. */
export function sessionGameReport(model: PlayedModel, finished: FinishedGame): SessionGameReport {
  let botColour: Colour = 'white';
  if (finished.visitor === 'white') {
    botColour = 'black';
  }

  const moves: ReportedMove[] = [];
  for (const played of finished.moves) {
    const reported: ReportedMove = { uci: uciName(played.move) };
    if (played.source !== undefined) {
      reported.source = played.source;
    }
    moves.push(reported);
  }

  return {
    botColour: botColour,
    baseModel: model.baseModel,
    rating: model.rating,
    moves: moves,
    visitorResigned: finished.visitorResigned,
  };
}

/** The page's way of reporting to the service. */
export interface Telemetry {
  /**
   * Sends a finished game, resolving with the id the service stored it under,
   * or with no id when the service refused it or could not be reached.
   */
  reportGame(report: SessionGameReport): Promise<string | undefined>;
  /**
   * Sends the visitor's answer to whether the Bot felt like a real player at
   * that level, resolving with whether the service recorded it.
   */
  reportImpression(gameId: string, feltLikeARealPlayer: boolean): Promise<boolean>;
}

/** Reports through the fetch given, which the page passes as the browser's own. */
export function connectTelemetry(fetchFunction: typeof fetch): Telemetry {
  return {
    reportGame: async (report) => {
      // The game has already been played and shown to the visitor. A report
      // that fails costs one game in the counts and nothing more, so no
      // failure reaches the page.
      try {
        const response = await fetchFunction(SESSION_GAMES_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(report),
        });
        if (!response.ok) {
          return undefined;
        }
        const reply = (await response.json()) as { id: string };
        return reply.id;
      } catch {
        return undefined;
      }
    },

    reportImpression: async (gameId, feltLikeARealPlayer) => {
      try {
        const response = await fetchFunction(`${SESSION_GAMES_URL}/${gameId}/impression`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ feltLikeARealPlayer: feltLikeARealPlayer }),
        });
        return response.ok;
      } catch {
        return false;
      }
    },
  };
}
