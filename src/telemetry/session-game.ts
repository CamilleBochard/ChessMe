// The Session Game as the page records it, and the reporting of it to the
// service that stores finished games (pipeline/serve_session_games.py). The
// page sends the moves rather than a PGN: the service replays them and writes
// the PGN itself.
// Free of anything DOM, and handed fetch by the caller, so the tests can
// replace the network.

import type { Colour } from '../board/starting-position';
import { uciName, type MoveRequest } from '../game/game';
import type { BotMove, MoveSource } from '../engine/move-selection';

/** Where the service listens, behind the same web server as the page. */
const SESSION_GAMES_URL = '/api/session-games';

/** One move as the service expects it: the Bot's moves also say where they came from. */
export interface ReportedMove {
  uci: string;
  source?: MoveSource;
}

/** A game in progress or finished, in the shape the service stores. */
export interface SessionGame {
  readonly botColour: Colour;
  /** The Base Model the Bot plays with, named after its file. */
  readonly baseModel: string;
  readonly moves: readonly ReportedMove[];
}

/** A Session Game with no move played yet. */
export function startSessionGame(botColour: Colour, baseModel: string): SessionGame {
  return { botColour: botColour, baseModel: baseModel, moves: [] };
}

/** The game with the visitor's move added. */
export function recordVisitorMove(sessionGame: SessionGame, move: MoveRequest): SessionGame {
  const reported: ReportedMove = { uci: uciName(move) };
  return { ...sessionGame, moves: [...sessionGame.moves, reported] };
}

/** The game with the Bot's move added, marked with where it came from. */
export function recordBotMove(sessionGame: SessionGame, botMove: BotMove): SessionGame {
  const reported: ReportedMove = { uci: uciName(botMove.move), source: botMove.source };
  return { ...sessionGame, moves: [...sessionGame.moves, reported] };
}

/** The page's way of reporting to the service. */
export interface Telemetry {
  /**
   * Sends a finished game, resolving with the id the service stored it under,
   * or with no id when the service refused it or could not be reached.
   */
  reportGame(sessionGame: SessionGame): Promise<string | undefined>;
}

/** Reports through the fetch given, which the page passes as the browser's own. */
export function connectTelemetry(fetchFunction: typeof fetch): Telemetry {
  return {
    reportGame: async (sessionGame) => {
      // The game has already been played and shown to the visitor. A report
      // that fails costs one game in the counts and nothing more, so no
      // failure reaches the page.
      try {
        const response = await fetchFunction(SESSION_GAMES_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sessionGame),
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
  };
}
