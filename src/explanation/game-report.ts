// The report shown once a game is over: what the Bot's moves in that game add
// up to, each figure meant to be set beside Camille's own. It counts what it
// names and claims no more: how many of the Bot's moves Camille could have
// played, where it followed him, and where it left his habits.
// Free of anything DOM.

import type { MoveLoss } from '../analysis/engine-analysis';
import type { MoveSource } from '../engine/move-selection';
import { PHASES, type Phase } from '../evaluation/move-matching';
import { currentFen, playMove } from '../game/game';
import { moveKeyOf, type ExplainedMove } from './explained-moves';
import type { MoveEvaluation } from './panel';
import { IMPROBABLE_BELOW, LOSS_PROFILE_EDGES, type Spread, type ShippedLossYardstick } from './yardsticks';

/** One of the Bot's moves, as the report reads it. */
export interface ReportedMove {
  ply: number;
  phase: Phase;
  san: string;
  source: MoveSource;
  /** The probability the Base Model gave the move; undefined for a move it did not choose. */
  modelProbability: number | undefined;
  /** The position the move left on the board, as positionKey writes it. */
  positionAfter: string;
  /** What Stockfish knows of the move. */
  evaluation: MoveEvaluation;
}

/**
 * A position as Camille's positions are written: the board, the side to move
 * and castling, the first three fields of its FEN. The move counters and the
 * en passant square are left out, as pipeline/player_positions.py explains.
 */
export function positionKey(fen: string): string {
  const fields = fen.split(' ');
  return fields.slice(0, 3).join(' ');
}

/**
 * The Bot's moves on the board as the report reads them. A move Stockfish
 * has not been asked about yet counts as still being measured.
 */
export function reportedMovesOf(botMoves: ExplainedMove[], evaluations: Map<string, MoveEvaluation>): ReportedMove[] {
  const reported: ReportedMove[] = [];
  for (const explained of botMoves) {
    const botMove = explained.botMove;
    let modelProbability: number | undefined = undefined;
    if (botMove.source === 'base-model') {
      modelProbability = botMove.candidates[botMove.rank - 1].modelProbability;
    }
    const after = playMove(explained.before, botMove.move);
    if (after === null) {
      // The reply was played on this very position, so it is always legal.
      throw new Error(`The Bot's move ${explained.san} is not legal where it was played`);
    }
    reported.push({
      ply: explained.ply,
      phase: explained.phase,
      san: explained.san,
      source: botMove.source,
      modelProbability: modelProbability,
      positionAfter: positionKey(currentFen(after)),
      evaluation: evaluations.get(moveKeyOf(explained)) ?? 'pending',
    });
  }
  return reported;
}

/**
 * How far into a game Camille's positions reach: fifteen moves of each side,
 * as pipeline/build_player_positions.py builds them.
 */
export const POSITIONS_UP_TO_PLY = 30;

/** A loss beyond this, in centipawns, is a move that gave away more than three pawns. */
export const COSTLY_LOSS = 300;

/** The Bot's losses in one Phase of the game. */
export interface PhaseLosses {
  /** How many of its moves Stockfish measured in open positions. */
  measured: number;
  /** Their average loss in centipawns; null when none was measured. */
  averageLoss: number | null;
}

/** A move of the model's the model itself gave under 1%: one Camille rarely plays. */
export interface ImprobableMove {
  ply: number;
  san: string;
  probability: number;
  /** What it lost in centipawns, null until measured or where it cannot be. */
  loss: number | null;
}

export interface GameReport {
  /** How many moves the Bot played. */
  moves: number;
  /** How many of them Camille could have played: from his Opening Book, or given at least 1% by the model trained on his games. */
  plausible: number;
  /** How many came from his Opening Book. */
  fromOpeningBook: number;
  /**
   * Of the Base Model's moves within the first fifteen, how many left the
   * board in a position Camille himself reached; null until his positions
   * have been read.
   */
  reachedByCamille: { count: number; of: number } | null;
  /** Per Phase, its losses in open positions. */
  phases: Record<Phase, PhaseLosses>;
  /** Of its moves measured in open positions, how many lost more than three pawns. */
  overThreePawns: { count: number; of: number };
  /** How many of its moves Stockfish has still to measure. */
  pending: number;
  /** Its model moves under 1%, in the order played. */
  improbable: ImprobableMove[];
}

/** What the Bot's moves in one game add up to. */
export function gameReport(moves: ReportedMove[], camillePositions: ReadonlySet<string> | null): GameReport {
  const plausible = moves.filter(isPlausible).length;
  const fromOpeningBook = moves.filter((move) => move.source === 'opening-book').length;

  // The Opening Book's moves are his by construction; the question is
  // whether the model's moves followed him too.
  let reachedByCamille: { count: number; of: number } | null = null;
  if (camillePositions !== null) {
    const early = moves.filter((move) => move.source === 'base-model' && move.ply <= POSITIONS_UP_TO_PLY);
    const reached = early.filter((move) => camillePositions.has(move.positionAfter));
    reachedByCamille = { count: reached.length, of: early.length };
  }

  // Once a game is decided every move reads as losing nothing, so only the
  // moves made in open positions say anything of the Bot's Level.
  const measuredOpen: { phase: Phase; loss: MoveLoss }[] = [];
  let pending = 0;
  for (const move of moves) {
    if (move.evaluation === 'pending') {
      pending += 1;
    } else if (move.evaluation !== 'failed' && move.evaluation.openPosition) {
      measuredOpen.push({ phase: move.phase, loss: move.evaluation });
    }
  }

  const phases = {} as Record<Phase, PhaseLosses>;
  for (const phase of PHASES) {
    const inPhase = measuredOpen.filter((measured) => measured.phase === phase);
    let averageLoss: number | null = null;
    if (inPhase.length > 0) {
      const total = inPhase.reduce((sum, measured) => sum + measured.loss.centipawnLoss, 0);
      averageLoss = total / inPhase.length;
    }
    phases[phase] = { measured: inPhase.length, averageLoss: averageLoss };
  }

  const costly = measuredOpen.filter((measured) => measured.loss.centipawnLoss > COSTLY_LOSS);

  const improbable: ImprobableMove[] = [];
  for (const move of moves) {
    if (move.modelProbability === undefined || move.modelProbability >= IMPROBABLE_BELOW) {
      continue;
    }
    let loss: number | null = null;
    if (move.evaluation !== 'pending' && move.evaluation !== 'failed') {
      loss = move.evaluation.centipawnLoss;
    }
    improbable.push({ ply: move.ply, san: move.san, probability: move.modelProbability, loss: loss });
  }

  return {
    moves: moves.length,
    plausible: plausible,
    fromOpeningBook: fromOpeningBook,
    reachedByCamille: reachedByCamille,
    phases: phases,
    overThreePawns: { count: costly.length, of: measuredOpen.length },
    pending: pending,
    improbable: improbable,
  };
}

/** Whether Camille could have played the move: one from his Opening Book, or one the model gave at least 1%. */
function isPlausible(move: ReportedMove): boolean {
  if (move.source === 'opening-book') {
    return true;
  }
  if (move.modelProbability === undefined) {
    return false;
  }
  return move.modelProbability >= IMPROBABLE_BELOW;
}

/** Camille's own figures, read from his loss yardstick, that the report sets the Bot's beside. */
export interface CamilleFigures {
  /** The share of his moves in open positions that lost more than three pawns. */
  overThreePawnsShare: number;
  /** Per Phase, the range of average loss 8 in 10 of his games cover; null where a game holds too few moves. */
  lossRanges: Record<Phase, Spread | null>;
}

/** Camille's figures from his loss yardstick, measured on all his games. */
export function camilleFigures(losses: ShippedLossYardstick): CamilleFigures {
  const costlyEdge = LOSS_PROFILE_EDGES.indexOf(COSTLY_LOSS);
  const overThreePawnsShare = 1 - losses.profile.atMost[costlyEdge];

  const lossRanges = {} as Record<Phase, Spread | null>;
  for (const phase of PHASES) {
    lossRanges[phase] = losses.phases[phase].perGame;
  }

  return { overThreePawnsShare: overThreePawnsShare, lossRanges: lossRanges };
}

/** The parts of docs/experiments/results/fine-tuning.json the report reads. */
export interface FineTuningResults {
  rating: number;
  baseline: { overall: MatchedCount };
  variants: { full: { testSet: { overall: MatchedCount } } };
}

interface MatchedCount {
  matched: number;
  positions: number;
  games: number;
}

/** How often a model's first choice is Camille's move on his Test Set, in times in 100. */
export interface MoveMatching {
  /** How many of his games the Test Set holds: none of them was trained on. */
  games: number;
  /** The model the Bot plays, fine-tuned on his other games. */
  fineTuned: number;
  /** The same model before it saw any of his games: any player at his rating. */
  untrained: number;
  rating: number;
}

/**
 * Move-Matching on the Test Set, as the fine-tuning experiment measured it:
 * the model alone, on its first choice. The untrained model's figure is
 * what a player at his rating gets without knowing him, so the gap between
 * the two is what his games taught it.
 */
export function moveMatching(results: FineTuningResults): MoveMatching {
  const fineTuned = results.variants.full.testSet.overall;
  const untrained = results.baseline.overall;
  return {
    games: fineTuned.games,
    fineTuned: Math.round((100 * fineTuned.matched) / fineTuned.positions),
    untrained: Math.round((100 * untrained.matched) / untrained.positions),
    rating: results.rating,
  };
}
