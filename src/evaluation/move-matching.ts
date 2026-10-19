// The evaluation harness: replays positions from Camille's games through an
// engine and counts how often it plays the move he played. That share is
// Move-Matching, the project's primary measure of Style.
// Free of anything DOM or Node, so the same code could score the engine
// wherever it runs; reading files is left to the caller.

import type { MoveProbability } from '../engine/base-model';
import { LAST_OPENING_PLY } from '../engine/move-selection';
import { uciName, type MoveRequest } from '../game/game';

/** A position where Camille moved, as the Python pipeline writes it to the dataset. */
export interface PlayedPosition {
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

/** The Phases in the order a game passes through them. */
export const PHASES: readonly Phase[] = ['opening', 'middlegame', 'endgame'];

/** The Phase a ply belongs to, by the same boundaries as pipeline/dataset.py. */
export function phaseOfPly(ply: number): Phase {
  if (ply <= 10) {
    return 'opening';
  }
  if (ply <= 30) {
    return 'middlegame';
  }
  return 'endgame';
}

/** How a Phase is named in a table, with the plies that belong to it. */
export const PHASE_LABELS: Record<Phase, string> = {
  opening: 'Opening (1-10)',
  middlegame: 'Middlegame (11-30)',
  endgame: 'Endgame (31+)',
};

/** How many positions were scored and in how many the engine played Camille's move. */
export interface MoveMatchingScore {
  /**
   * The positions where the engine played Camille's move. For a drawn move,
   * the number it is expected to match: the sum over positions of the
   * probability the draw lands on his move, which need not be whole.
   */
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

/** Whatever chooses a move for a position, usually the Move-Selection Engine. */
export type ChooseMove = (fen: string) => Promise<MoveRequest>;

/** How likely the engine is to play each move in a position, most likely first. */
export type WeighMoves = (fen: string) => Promise<MoveProbability[]>;

/** The same positions scored two ways from one distribution per position. */
export interface DrawnMoveMatchingReport {
  /** Whether the most likely move is Camille's: what an engine always playing it scores. */
  topMove: MoveMatchingReport;
  /**
   * The probability the draw lands on Camille's move: what an engine drawing
   * from the distribution scores on average. One random run would add the
   * luck of the draw to the luck of the sample; the expectation leaves it out.
   */
  drawn: MoveMatchingReport;
}

/**
 * Two Bots scored on the same positions, and what the second gains over the
 * first. In the gain, matched holds the matches gained, negative when the
 * second Bot loses some, and its standard error is that of the gain itself:
 * both Bots answer the same positions, so whatever makes one game easier
 * than another cancels out of the difference.
 */
export interface BotComparison {
  first: DrawnMoveMatchingReport;
  second: DrawnMoveMatchingReport;
  gain: DrawnMoveMatchingReport;
}

/** Reads positions in JSON Lines, one per line, as in the Test Set and the training file. */
export function readPositions(jsonLines: string): PlayedPosition[] {
  const positions: PlayedPosition[] = [];
  for (const line of jsonLines.split('\n')) {
    if (line.trim() === '') {
      continue;
    }
    const record = JSON.parse(line);
    positions.push({ game: record.game_id, fen: record.fen, ply: record.ply, phase: record.phase, move: record.move });
  }
  return positions;
}

/** The fraction of positions in which the engine played Camille's move. */
export function share(score: MoveMatchingScore): number {
  return score.matched / score.positions;
}

/**
 * How far the engine matched Camille in one position: 1 or 0 for a move it
 * played, or the probability of his move for a move it would draw.
 */
interface Outcome {
  position: PlayedPosition;
  matched: number;
}

/** Asks the engine for its move in every position and counts the ones that match Camille's. */
export async function measureMoveMatching(positions: PlayedPosition[], chooseMove: ChooseMove): Promise<MoveMatchingReport> {
  const outcomes: Outcome[] = [];
  for (const position of positions) {
    const engineMove = await chooseMove(position.fen);
    outcomes.push({ position: position, matched: matchOf(engineMove, position) });
  }
  return report(outcomes);
}

/**
 * Asks the engine how likely it is to play each move in every position, and
 * scores both the most likely move and the draw against Camille's move.
 */
export async function measureDrawnMoveMatching(
  positions: PlayedPosition[],
  weighMoves: WeighMoves,
): Promise<DrawnMoveMatchingReport> {
  const topMoveOutcomes: Outcome[] = [];
  const drawnOutcomes: Outcome[] = [];
  for (const position of positions) {
    const distribution = await weighMoves(position.fen);
    topMoveOutcomes.push({ position: position, matched: topMoveMatch(distribution, position) });
    drawnOutcomes.push({ position: position, matched: drawnMatch(distribution, position) });
  }
  return { topMove: report(topMoveOutcomes), drawn: report(drawnOutcomes) };
}

/**
 * Scores two Bots on the same positions, top move and draw, and measures the
 * second's gain over the first position by position.
 */
export async function compareBots(
  positions: PlayedPosition[],
  weighFirst: WeighMoves,
  weighSecond: WeighMoves,
): Promise<BotComparison> {
  const first = { topMove: [] as Outcome[], drawn: [] as Outcome[] };
  const second = { topMove: [] as Outcome[], drawn: [] as Outcome[] };
  const gain = { topMove: [] as Outcome[], drawn: [] as Outcome[] };
  for (const position of positions) {
    const firstDistribution = await weighFirst(position.fen);
    const secondDistribution = await weighSecond(position.fen);

    const firstTopMove = topMoveMatch(firstDistribution, position);
    const secondTopMove = topMoveMatch(secondDistribution, position);
    first.topMove.push({ position: position, matched: firstTopMove });
    second.topMove.push({ position: position, matched: secondTopMove });
    gain.topMove.push({ position: position, matched: secondTopMove - firstTopMove });

    const firstDrawn = drawnMatch(firstDistribution, position);
    const secondDrawn = drawnMatch(secondDistribution, position);
    first.drawn.push({ position: position, matched: firstDrawn });
    second.drawn.push({ position: position, matched: secondDrawn });
    gain.drawn.push({ position: position, matched: secondDrawn - firstDrawn });
  }
  return {
    first: { topMove: report(first.topMove), drawn: report(first.drawn) },
    second: { topMove: report(second.topMove), drawn: report(second.drawn) },
    gain: { topMove: report(gain.topMove), drawn: report(gain.drawn) },
  };
}

/** 1 when the most likely move of the distribution is Camille's, 0 otherwise. */
function topMoveMatch(distribution: MoveProbability[], position: PlayedPosition): number {
  return matchOf(distribution[0].move, position);
}

/** The probability a draw from the distribution lands on Camille's move. */
function drawnMatch(distribution: MoveProbability[], position: PlayedPosition): number {
  let probabilityOfHisMove = 0;
  for (const candidate of distribution) {
    const probabilityIfHis = candidate.probability * matchOf(candidate.move, position);
    probabilityOfHisMove = probabilityOfHisMove + probabilityIfHis;
  }
  return probabilityOfHisMove;
}

/** 1 when the move is the one Camille played in the position, 0 otherwise. */
function matchOf(move: MoveRequest, position: PlayedPosition): number {
  if (uciName(move) === position.move) {
    return 1;
  }
  return 0;
}

/** Scores every position, the positions after ply 10, and each Phase's positions. */
function report(outcomes: Outcome[]): MoveMatchingReport {
  const afterOpening = outcomes.filter((outcome) => outcome.position.ply > LAST_OPENING_PLY);
  const byPhase = {} as Record<Phase, MoveMatchingScore>;
  for (const phase of PHASES) {
    const inPhase = outcomes.filter((outcome) => outcome.position.phase === phase);
    byPhase[phase] = score(inPhase);
  }
  return { overall: score(outcomes), afterPly10: score(afterOpening), byPhase: byPhase };
}

/** Positions and matches within one game. */
export interface GameTally {
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
    tally.matched = tally.matched + outcome.matched;
  }

  let matched = 0;
  let positions = 0;
  for (const tally of tallies.values()) {
    matched = matched + tally.matched;
    positions = positions + tally.positions;
  }

  const gameTallies = [...tallies.values()];
  const matchedShare = matched / positions;
  return {
    matched: matched,
    positions: positions,
    games: gameTallies.length,
    standardError: clusteredStandardError(gameTallies, matchedShare),
  };
}

/**
 * The cluster-robust standard error of a share, with games as clusters. Each
 * game contributes how far its matches stray from what the overall share
 * predicts for its number of positions; the spread of those residuals across
 * games, scaled by G / (G - 1) to correct for estimating the share from the
 * same games, gives the variance.
 */
export function clusteredStandardError(games: GameTally[], share: number): number {
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
