// The evaluation harness: replays Camille's Test Set positions through an
// engine and counts how often it plays the move he played. That share is
// Move-Matching, the project's primary measure of Style.
// Free of anything DOM or Node, so the same code could score the engine
// wherever it runs; reading files is left to the caller.

import type { MoveRequest } from '../game/game';

/** One of Camille's positions, as the Python pipeline writes it to the Test Set. */
export interface TestPosition {
  /** The game the position comes from, such as lichess:zlKruDGM. */
  game: string;
  /** The position Camille faced, before his move. */
  fen: string;
  /** The ply of his move: White's first move is ply 1. */
  ply: number;
  /** The Phase of his move, as the pipeline assigned it from the ply. */
  phase: Phase;
  /** The move he played, in UCI form such as e2e4, e1g1 or e7e8q. */
  move: string;
}

/** Opening is plies 1-10, middlegame 11-30, endgame 31 on. */
export type Phase = 'opening' | 'middlegame' | 'endgame';

/** How many positions were scored and in how many the engine played Camille's move. */
export interface MoveMatchingScore {
  matched: number;
  positions: number;
  /** How many games the positions come from. */
  games: number;
  /**
   * The standard error of the share matched, as a fraction like the share
   * itself. Positions from one game are not independent (one opening, one
   * plan, one opponent), so each game counts as a single sample: the estimate
   * is the cluster-robust one, with games as the clusters. Counting positions
   * as independent would understate the uncertainty. NaN when the positions
   * come from a single game, whose spread cannot be measured.
   */
  standardError: number;
}

export interface MoveMatchingReport {
  overall: MoveMatchingScore;
  /**
   * Positions from ply 11 on. Published Maia figures leave out each game's
   * first ten plies, where the opening makes moves easy to predict, so this is
   * the score to compare with them.
   */
  afterPly10: MoveMatchingScore;
  /**
   * One score per Phase. A single figure hides how much easier the opening is
   * to predict than what follows.
   */
  byPhase: Record<Phase, MoveMatchingScore>;
}

/** The last ply left out of the score compared with published Maia figures. */
const LAST_OPENING_PLY = 10;

/** Whatever chooses a move for a position, usually the Move-Selection Engine. */
export type ChooseMove = (fen: string) => Promise<MoveRequest>;

/** Reads a Test Set in JSON Lines, one position per line. */
export function readTestSet(jsonLines: string): TestPosition[] {
  const positions: TestPosition[] = [];
  for (const line of jsonLines.split('\n')) {
    if (line.trim() === '') {
      continue;
    }
    const record = JSON.parse(line);
    positions.push({ game: record.game_id, fen: record.fen, ply: record.ply, phase: record.phase, move: record.move });
  }
  return positions;
}

/** Whether the engine played Camille's move in one position. */
interface Outcome {
  position: TestPosition;
  isMatch: boolean;
}

/** Asks the engine for its move in every position and counts the ones that match Camille's. */
export async function measureMoveMatching(testSet: TestPosition[], chooseMove: ChooseMove): Promise<MoveMatchingReport> {
  const outcomes: Outcome[] = [];
  for (const position of testSet) {
    const engineMove = await chooseMove(position.fen);
    const isMatch = uciName(engineMove) === position.move;
    outcomes.push({ position: position, isMatch: isMatch });
  }

  const afterOpening = outcomes.filter((outcome) => outcome.position.ply > LAST_OPENING_PLY);
  return {
    overall: score(outcomes),
    afterPly10: score(afterOpening),
    byPhase: {
      opening: score(outcomes.filter((outcome) => outcome.position.phase === 'opening')),
      middlegame: score(outcomes.filter((outcome) => outcome.position.phase === 'middlegame')),
      endgame: score(outcomes.filter((outcome) => outcome.position.phase === 'endgame')),
    },
  };
}

/** Positions and matches within one game. */
interface GameTally {
  matched: number;
  positions: number;
}

function score(outcomes: Outcome[]): MoveMatchingScore {
  const tallies = new Map<string, GameTally>();
  for (const outcome of outcomes) {
    let tally = tallies.get(outcome.position.game);
    if (tally === undefined) {
      tally = { matched: 0, positions: 0 };
      tallies.set(outcome.position.game, tally);
    }
    tally.positions = tally.positions + 1;
    if (outcome.isMatch) {
      tally.matched = tally.matched + 1;
    }
  }

  let matched = 0;
  let positions = 0;
  for (const tally of tallies.values()) {
    matched = matched + tally.matched;
    positions = positions + tally.positions;
  }

  return {
    matched: matched,
    positions: positions,
    games: tallies.size,
    standardError: clusteredStandardError([...tallies.values()], matched / positions),
  };
}

/**
 * The cluster-robust standard error of a share, with games as clusters. Each
 * game contributes how far its matches stray from what the overall share
 * predicts for its number of positions; the spread of those residuals across
 * games, scaled by G / (G - 1) to correct for estimating the share from the
 * same games, gives the variance.
 */
function clusteredStandardError(games: GameTally[], share: number): number {
  const gameCount = games.length;
  if (gameCount < 2) {
    return Number.NaN;
  }

  let positions = 0;
  let sumOfSquaredResiduals = 0;
  for (const game of games) {
    const residual = game.matched - share * game.positions;
    sumOfSquaredResiduals = sumOfSquaredResiduals + residual * residual;
    positions = positions + game.positions;
  }

  const smallSampleCorrection = gameCount / (gameCount - 1);
  const variance = (smallSampleCorrection * sumOfSquaredResiduals) / (positions * positions);
  return Math.sqrt(variance);
}

/** The move in UCI form, the form the Test Set records Camille's moves in. */
function uciName(move: MoveRequest): string {
  let suffix = '';
  if (move.promotion !== undefined) {
    suffix = UCI_PROMOTION_LETTERS[move.promotion];
  }
  return move.from + move.to + suffix;
}

const UCI_PROMOTION_LETTERS = { queen: 'q', rook: 'r', bishop: 'b', knight: 'n' };
