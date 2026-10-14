// Camille's yardsticks, against which the panel beside the board sets each of
// the Bot's moves and the game so far: how often he plays a move the Base
// Model finds this unlikely, and the range his own games cover.
// Built under Node by scripts/yardsticks.ts and shipped with the site as JSON.
// Free of anything DOM or Node.

import type { MoveLoss } from '../analysis/engine-analysis';
import { PHASES, type Phase } from '../evaluation/move-matching';

/** One of the Bot's Base Model moves and the probability the model gave it. */
export interface BotWeighedMove {
  phase: Phase;
  probability: number;
}

/** One of Camille's moves and the probability the Base Model gave it. */
export interface WeighedMove extends BotWeighedMove {
  /** The game the move comes from, such as lichess:zlKruDGM. */
  game: string;
}

/**
 * The probabilities at which the share of Camille's moves is read, the rungs
 * of a ladder: ten a decade from 0.00001 to 1, evenly spaced on a
 * logarithmic scale, where improbable moves are told apart.
 */
export const RARITY_LADDER: readonly number[] = Array.from({ length: 51 }, (_, index) => Math.pow(10, (index - 50) / 10));

/** Per Phase, how improbable Camille's moves are to the Base Model. */
export interface ImprobabilityYardstick {
  phases: Record<Phase, PhaseImprobabilityYardstick>;
}

/** The improbability yardstick as scripts/yardsticks.ts writes it, with what it was read from. */
export interface ShippedImprobabilityYardstick extends ImprobabilityYardstick {
  measuredOn: string;
  /** The model whose probabilities were read, as src/engine/served-model.ts names it. */
  baseModel: string;
  rating: number;
  /** The records the probabilities were read from. */
  records: string;
  games: number;
  moves: number;
  movesOutsideOpeningBook: number;
  movesForAVerdict: number;
}

export interface PhaseImprobabilityYardstick {
  /** How many of his moves the Phase holds. */
  moves: number;
  /** For each probability of RARITY_LADDER, the share of his moves the model gave no more. */
  atOrBelow: number[];
  /** How far his games' shares of moves under 1% spread; null when no game of his has enough moves in the Phase. */
  perGame: Spread | null;
}

/** The range the middle 80% of Camille's games cover: from the 10th percentile of a figure to the 90th. */
export interface Spread {
  /** How many of his games the range is read from. */
  games: number;
  low: number;
  high: number;
}

/**
 * The fewest moves in a Phase from which one game's figure is read. Below
 * it a single move swings the share by more than an eighth, and the panel
 * says there are too few moves to tell. The opening holds at most five of a
 * player's moves, so one game's opening is never enough.
 */
export const MOVES_FOR_A_VERDICT = 8;

/** Below this probability a move counts as improbable. */
export const IMPROBABLE_BELOW = 0.01;

/** Camille's yardstick of improbability, from his moves and the probabilities the model gave them. */
export function improbabilityYardstick(moves: WeighedMove[]): ImprobabilityYardstick {
  const phases = perPhase((phase) => {
    const inPhase = moves.filter((move) => move.phase === phase);
    const atOrBelow = RARITY_LADDER.map((rung) => {
      const asUnlikely = inPhase.filter((move) => move.probability <= rung).length;
      return asUnlikely / inPhase.length;
    });
    const perGame = perGameSpread(inPhase, shareImprobable);
    return { moves: inPhase.length, atOrBelow: atOrBelow, perGame: perGame };
  });
  return { phases: phases };
}

/** One value for each Phase, worked out by the function given. */
function perPhase<Value>(valueOf: (phase: Phase) => Value): Record<Phase, Value> {
  const values = {} as Record<Phase, Value>;
  for (const phase of PHASES) {
    values[phase] = valueOf(phase);
  }
  return values;
}

/** The share of the moves the model gave less than 1%. */
function shareImprobable(moves: { probability: number }[]): number {
  const improbable = moves.filter((move) => move.probability < IMPROBABLE_BELOW).length;
  return improbable / moves.length;
}

/** The spread of a figure across games, each game's figure read from its own moves. */
function perGameSpread<Move extends { game: string }>(moves: Move[], figureOf: (gameMoves: Move[]) => number): Spread | null {
  const movesByGame = new Map<string, Move[]>();
  for (const move of moves) {
    const gameMoves = movesByGame.get(move.game) ?? [];
    gameMoves.push(move);
    movesByGame.set(move.game, gameMoves);
  }

  const figures: number[] = [];
  for (const gameMoves of movesByGame.values()) {
    if (gameMoves.length < MOVES_FOR_A_VERDICT) {
      continue;
    }
    figures.push(figureOf(gameMoves));
  }
  if (figures.length === 0) {
    return null;
  }
  figures.sort((first, second) => first - second);
  return { games: figures.length, low: nearestRank(figures, 10), high: nearestRank(figures, 90) };
}

/** The p-th percentile: the smallest value with at least p% of the values at or below it, as the Blunder Profile reads them. */
function nearestRank(sorted: number[], percentile: number): number {
  const rank = Math.ceil((percentile / 100) * sorted.length);
  return sorted[rank - 1];
}

/**
 * The share of Camille's moves in the Phase the model gave no more than the
 * probability given: "he plays a move this unlikely on this share of his
 * moves".
 */
export function moveRarity(yardstick: ImprobabilityYardstick, phase: Phase, probability: number): number {
  const curve = yardstick.phases[phase].atOrBelow;
  const above = RARITY_LADDER.findIndex((rung) => rung >= probability);
  // Below the lowest rung, the lowest rung's share is the closest known.
  if (above <= 0) {
    return curve[0];
  }

  // Between two rungs the share is read on a straight line between theirs,
  // as far along as the move's probability lies on a logarithmic scale.
  const below = above - 1;
  const lowRung = Math.log(RARITY_LADDER[below]);
  const highRung = Math.log(RARITY_LADDER[above]);
  const along = (Math.log(probability) - lowRung) / (highRung - lowRung);
  return curve[below] + along * (curve[above] - curve[below]);
}

/** One of the Bot's moves and the evaluation it lost, as the Blunder Profile measures it. */
export interface BotLoss extends MoveLoss {
  phase: Phase;
}

/** One of Camille's moves and the evaluation it lost. */
export interface LossMove extends BotLoss {
  /** The game the move comes from. */
  game: string;
}

/** Per Phase, how far Camille's games spread in the evaluation his moves lost. */
export interface LossYardstick {
  phases: Record<Phase, { perGame: Spread | null }>;
}

/** The loss yardstick as scripts/yardsticks.ts writes it, with the engine that measured it. */
export interface ShippedLossYardstick extends LossYardstick {
  measuredOn: string;
  /** The engine as it names itself, such as Stockfish 19 Lite WASM. */
  engine: string;
  depth: number;
  /** The file of losses it was read from. */
  losses: string;
  games: number;
  moves: number;
  movesForAVerdict: number;
}

/**
 * Camille's yardstick of Level: per Phase, the spread of his games' average
 * loss over the moves made in open positions. Moves made once the game was
 * decided are left out, as Level is compared only where a move could still
 * be a mistake.
 */
export function lossYardstick(moves: LossMove[]): LossYardstick {
  const open = moves.filter((move) => move.openPosition);
  const phases = perPhase((phase) => {
    const inPhase = open.filter((move) => move.phase === phase);
    return { perGame: perGameSpread(inPhase, averageLoss) };
  });
  return { phases: phases };
}

/** The average evaluation the moves lost, in centipawns. */
function averageLoss(moves: { centipawnLoss: number }[]): number {
  const total = moves.reduce((sum, move) => sum + move.centipawnLoss, 0);
  return total / moves.length;
}

/** How a figure of the game so far compares with Camille's games, in one Phase. */
export type Verdict =
  /** Fewer moves than MOVES_FOR_A_VERDICT: one game this short cannot be told apart from his. */
  | { kind: 'too-few-moves'; moves: number }
  /** Inside the range the middle 80% of his games cover, or below or above it. */
  | { kind: 'inside' | 'below' | 'above'; moves: number; figure: number; spread: Spread };

/**
 * Per Phase, the share of the Bot's Base Model moves so far the model gave
 * less than 1%, set against the spread of the same share across Camille's
 * games.
 */
export function gameImprobability(botMoves: BotWeighedMove[], yardstick: ImprobabilityYardstick): Record<Phase, Verdict> {
  return perPhase((phase) => {
    const inPhase = botMoves.filter((move) => move.phase === phase);
    return againstSpread(inPhase, shareImprobable, yardstick.phases[phase].perGame);
  });
}

/** The game's figure in one Phase, read from its moves there, against the spread of Camille's games. */
function againstSpread<Move>(moves: Move[], figureOf: (moves: Move[]) => number, spread: Spread | null): Verdict {
  // Without a spread, none of his games had enough moves in the Phase
  // either, so the game has too few for a verdict as well.
  if (moves.length < MOVES_FOR_A_VERDICT || spread === null) {
    return { kind: 'too-few-moves', moves: moves.length };
  }
  const figure = figureOf(moves);
  if (figure < spread.low) {
    return { kind: 'below', moves: moves.length, figure: figure, spread: spread };
  }
  if (figure > spread.high) {
    return { kind: 'above', moves: moves.length, figure: figure, spread: spread };
  }
  return { kind: 'inside', moves: moves.length, figure: figure, spread: spread };
}

/**
 * Per Phase, the Bot's average loss so far over its moves in open positions,
 * set against the spread of the same average across Camille's games. Every
 * move counts, the Opening Book's too, as every one of his moves counts in
 * his.
 */
export function gameLosses(botMoves: BotLoss[], yardstick: LossYardstick): Record<Phase, Verdict> {
  const open = botMoves.filter((move) => move.openPosition);
  return perPhase((phase) => {
    const inPhase = open.filter((move) => move.phase === phase);
    return againstSpread(inPhase, averageLoss, yardstick.phases[phase].perGame);
  });
}
