// The report shown once a game is over: what the Bot's moves in that game add
// up to, each figure meant to be set beside Camille's own. It counts what it
// names and claims no more: where the Bot followed him, and where it left his
// habits.
// Free of anything DOM.

import type { MoveLoss } from '../analysis/engine-analysis';
import type { MoveCut } from '../engine/move-cut';
import type { MoveSource } from '../engine/move-selection';
import { SERVED_MODEL_NAME, SERVED_MODEL_TEMPERATURE, SERVED_OPENING_CUT } from '../engine/served-model';
import { PHASES, type Phase } from '../evaluation/move-matching';
import { currentFen, playMove, uciName } from '../game/game';
import { moveKeyOf, type ExplainedMove } from './explained-moves';
import type { MoveEvaluation } from './panel';
import { IMPROBABLE_BELOW, LOSS_PROFILE_EDGES, type ShippedLossYardstick, type Spread } from './yardsticks';

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
  /** The position the move was played from, as a full FEN. */
  fen: string;
  /** The move in UCI form. */
  uci: string;
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
      fen: currentFen(explained.before),
      uci: uciName(botMove.move),
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
  /** How many moves the visitor played. */
  visitorMoves: number;
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
  /**
   * The average loss in centipawns of each side's moves measured in open
   * positions; null for a side none of whose moves was.
   */
  averageLoss: { bot: number | null; visitor: number | null };
  /** How many moves of either side Stockfish has still to measure. */
  pending: number;
  /** Its model moves under 1%, in the order played. */
  improbable: ImprobableMove[];
}

/** What the Bot's moves in one game add up to. */
export function gameReport(
  moves: ReportedMove[],
  camillePositions: ReadonlySet<string> | null,
  visitorEvaluations: MoveEvaluation[],
): GameReport {
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
    const averageLoss = averageOf(inPhase.map((measured) => measured.loss));
    phases[phase] = { measured: inPhase.length, averageLoss: averageLoss };
  }

  // The visitor's moves are measured as the Bot's are, so the two averages
  // can stand side by side.
  const visitorOpen: MoveLoss[] = [];
  for (const evaluation of visitorEvaluations) {
    if (evaluation === 'pending') {
      pending += 1;
    } else if (evaluation !== 'failed' && evaluation.openPosition) {
      visitorOpen.push(evaluation);
    }
  }
  const averageLoss = {
    bot: averageOf(measuredOpen.map((measured) => measured.loss)),
    visitor: averageOf(visitorOpen),
  };

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
    visitorMoves: visitorEvaluations.length,
    fromOpeningBook: fromOpeningBook,
    reachedByCamille: reachedByCamille,
    phases: phases,
    overThreePawns: { count: costly.length, of: measuredOpen.length },
    averageLoss: averageLoss,
    pending: pending,
    improbable: improbable,
  };
}

/** The average loss in centipawns of the moves given; null when there are none. */
function averageOf(losses: MoveLoss[]): number | null {
  if (losses.length === 0) {
    return null;
  }
  const total = losses.reduce((sum, loss) => sum + loss.centipawnLoss, 0);
  return total / losses.length;
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

/** How the Bot was set up for one run on the Test Set, and how often its drawn move was Camille's. */
export interface BotRun extends ServedBot {
  drawn: { overall: MatchedCount };
}

/** The parts of docs/experiments/results/opening-cut-test-set-fine-tuned.json the report reads. */
export interface BotRunResults {
  first: BotRun;
  second: BotRun;
}

/** How the site serves the Bot: its Base Model, the temperature it draws at, and its opening cut. */
export interface ServedBot {
  baseModel: string;
  temperature: number;
  openingCut: MoveCut;
}

interface MatchedCount {
  matched: number;
  positions: number;
  games: number;
}

/** The Bot as the site serves it. */
export const SERVED_BOT: ServedBot = {
  baseModel: SERVED_MODEL_NAME,
  temperature: SERVED_MODEL_TEMPERATURE,
  openingCut: SERVED_OPENING_CUT,
};

/** How often the Bot plays Camille's move on his Test Set. */
export interface MoveMatching {
  /** How many of his games the Test Set holds: none of them was trained on. */
  games: number;
  /** The share of his moves there the Bot plays, drawing as it does on the site. */
  guessed: number;
}

/**
 * Move-Matching of the Bot as the site serves it: the Opening Book first,
 * then the Base Model's move drawn at its temperature, within its opening
 * cut. A drawn move is Camille's as often as the draw gives his move, so this
 * is lower than the model's first choice, which is his more often but never
 * makes his mistakes.
 */
export function moveMatching(results: BotRunResults, served: ServedBot): MoveMatching {
  const runs = [results.first, results.second];
  const servedRun = runs.find((botRun) => isSetUpAs(botRun, served));
  if (servedRun === undefined) {
    throw new Error('No run on the Test Set was set up as the Bot is served');
  }
  const overall = servedRun.drawn.overall;
  return {
    games: overall.games,
    guessed: overall.matched / overall.positions,
  };
}

function isSetUpAs(botRun: BotRun, served: ServedBot): boolean {
  const sameModel = botRun.baseModel === served.baseModel;
  const sameTemperature = botRun.temperature === served.temperature;
  const sameCut = isSameCut(botRun.openingCut, served.openingCut);
  return sameModel && sameTemperature && sameCut;
}

function isSameCut(first: MoveCut, second: MoveCut): boolean {
  if (first.kind === 'none' && second.kind === 'none') {
    return true;
  }
  if (first.kind === 'top-k' && second.kind === 'top-k') {
    return first.k === second.k;
  }
  if (first.kind === 'top-p' && second.kind === 'top-p') {
    return first.p === second.p;
  }
  if (first.kind === 'min-p' && second.kind === 'min-p') {
    return first.fraction === second.fraction;
  }
  return false;
}
