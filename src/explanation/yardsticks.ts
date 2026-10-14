// Camille's yardsticks, against which the panel beside the board sets each of
// the Bot's moves and the game so far: how often he plays a move the Base
// Model finds this unlikely, and the range his own games cover.
// Built under Node by scripts/yardsticks.ts and shipped with the site as JSON.
// Free of anything DOM or Node.

import { PHASES, type Phase } from '../evaluation/move-matching';

/** One of Camille's moves and the probability the Base Model gave it. */
export interface WeighedMove {
  /** The game the move comes from, such as lichess:zlKruDGM. */
  game: string;
  phase: Phase;
  probability: number;
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
  const phases = {} as Record<Phase, PhaseImprobabilityYardstick>;
  for (const phase of PHASES) {
    const probabilities = moves.filter((move) => move.phase === phase).map((move) => move.probability);
    const atOrBelow = RARITY_LADDER.map((rung) => {
      const asUnlikely = probabilities.filter((probability) => probability <= rung).length;
      return asUnlikely / probabilities.length;
    });
    const inPhase = moves.filter((move) => move.phase === phase);
    const perGame = perGameSpread(inPhase, shareImprobable);
    phases[phase] = { moves: probabilities.length, atOrBelow: atOrBelow, perGame: perGame };
  }
  return { phases: phases };
}

/** The share of the moves the model gave less than 1%. */
function shareImprobable(moves: WeighedMove[]): number {
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
