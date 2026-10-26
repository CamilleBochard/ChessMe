// What the page shows of the games visitors played against the Bot, measured
// once with Stockfish: their results for the Bot, then for the Bot, its
// visitors and Camille, how often a game slipped away early and the average
// loss per Phase. Written into played-games.json by the report step of
// pipeline/analyse_session_games.py, from a copy of the Session Game store.
// Free of anything DOM.

import type { Phase } from '../evaluation/move-matching';
import type { Results } from './player-record';

/** A figure read from a sample, with the range two standard errors give it. */
export interface Measured {
  /** How many moves it is read from. */
  moves: number;
  /** The average loss in centipawns; null when no move was made in an open position. */
  averageLoss: number | null;
  /** Two standard errors of that average; null with fewer than two moves. */
  margin: number | null;
}

/** How many of a side's games slipped away before move 15: three pawns down or worse. */
export interface SlippedAway {
  games: number;
  of: number;
  /** Two standard errors of the share games / of. */
  margin: number;
}

export interface SideFigures {
  slippedAway: SlippedAway;
  phases: Record<Phase, Measured>;
}

export type Side = 'visitors' | 'bot' | 'camille';

export interface PlayedGamesRecord {
  measuredOn: string;
  engine: string;
  depth: number;
  /** How many of Camille's games his figures are read from. */
  camilleGames: number;
  /** The games visitors finished without analysis mode. */
  games: number;
  /** Their results, from the Bot's side. */
  results: Results;
  sides: Record<Side, SideFigures>;
}
