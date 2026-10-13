// Where a player's moves sit in the Base Model's distribution, and what
// cutting the model's least likely moves out of the Bot's draw would change.
// The target is a Bot that plays moves the model finds improbable as often
// as Camille does: his own improbable moves are part of how he plays.
// Free of anything DOM or Node; reading files is left to the caller.

import { cutPolicy, type MoveCut } from '../engine/move-cut';
import { clusteredStandardError, PHASES, type GameTally, type Phase } from './move-matching';

/** One move played, and where it sits in the Base Model's distribution for its position. */
export interface PlacedMove {
  /** The game the move comes from, such as lichess:zlKruDGM. */
  game: string;
  ply: number;
  phase: Phase;
  /** The move played, in UCI form. */
  move: string;
  /** The probability of every legal move in the position, most likely first. */
  policy: number[];
  /** Where the move played stands in the policy: 1 for the most likely. */
  rank: number;
  /** The probability the model gave the move played. */
  probability: number;
  /** The evaluation the move lost, in centipawns, when it was measured. */
  centipawnLoss?: number;
}

/** The probabilities below which a move counts as improbable: 1%, 2% and 5%. */
export const IMPROBABILITY_THRESHOLDS: readonly number[] = [0.01, 0.02, 0.05];

/** How many moves a Phase holds and the share of them below each threshold, in the thresholds' order. */
export interface PhaseImprobability {
  moves: number;
  below: number[];
}

/** Per Phase, the share of the moves played that the model gave less than each threshold. */
export function improbabilityProfile(moves: PlacedMove[]): Record<Phase, PhaseImprobability> {
  const profile = {} as Record<Phase, PhaseImprobability>;
  for (const phase of PHASES) {
    const inPhase = moves.filter((move) => move.phase === phase);
    const below = IMPROBABILITY_THRESHOLDS.map((threshold) => {
      const improbable = inPhase.filter((move) => move.probability < threshold);
      return improbable.length / inPhase.length;
    });
    profile[phase] = { moves: inPhase.length, below: below };
  }
  return profile;
}

/** A move losing this much evaluation or more is a mistake, as the Blunder Profile counts its largest ones. */
export const MISTAKE_CENTIPAWNS = 300;

/** What a cut changes in one Phase, over the positions of the moves measured. */
export interface PhaseCutMeasurement {
  moves: number;
  /**
   * The share of moves below each threshold the Bot is expected to play,
   * drawing at temperature 1 among the moves the cut keeps. The thresholds
   * read the model's uncut probabilities: a move stays improbable whether or
   * not the cut rescales it.
   */
  botBelow: number[];
  /** The share of the moves played that the cut would make impossible. */
  movesMadeImpossible: number;
  /** How many of the moves were mistakes, among those whose loss was measured. */
  mistakes: number;
  /** The share of those mistakes the cut would make impossible. */
  mistakesMadeImpossible: number;
}

export interface CutMeasurement {
  byPhase: Record<Phase, PhaseCutMeasurement>;
  /** Every move whatever its Phase: each Phase weighs as much as its share of the moves. */
  all: PhaseCutMeasurement;
}

/** How one position comes out under a cut. */
interface PositionUnderCut {
  move: PlacedMove;
  botBelow: number[];
  /** Whether the move played is among the moves the cut removes. */
  moveCut: boolean;
}

/** Measures a cut on the positions of the moves given. */
export function measureCut(moves: PlacedMove[], cut: MoveCut): CutMeasurement {
  const positions = moves.map((move) => positionUnderCut(move, cut));

  const byPhase = {} as Record<Phase, PhaseCutMeasurement>;
  for (const phase of PHASES) {
    const inPhase = positions.filter((position) => position.move.phase === phase);
    byPhase[phase] = summarise(inPhase);
  }
  return { byPhase: byPhase, all: summarise(positions) };
}

function positionUnderCut(move: PlacedMove, cut: MoveCut): PositionUnderCut {
  const uncut = move.policy.map((probability) => ({ probability: probability, uncutProbability: probability }));
  const kept = cutPolicy(uncut, cut);

  const botBelow = IMPROBABILITY_THRESHOLDS.map((threshold) => {
    let drawnBelow = 0;
    for (const candidate of kept) {
      if (candidate.uncutProbability < threshold) {
        drawnBelow += candidate.probability;
      }
    }
    return drawnBelow;
  });
  // Every cut keeps a run of moves from the top, so the move played is cut
  // exactly when it ranks below the last kept move.
  const moveCut = move.rank > kept.length;
  return { move: move, botBelow: botBelow, moveCut: moveCut };
}

function summarise(positions: PositionUnderCut[]): PhaseCutMeasurement {
  const botBelow = IMPROBABILITY_THRESHOLDS.map((threshold, index) => {
    const total = positions.reduce((sum, position) => sum + position.botBelow[index], 0);
    return total / positions.length;
  });
  const cut = positions.filter((position) => position.moveCut);
  const mistakes = positions.filter((position) => isMistake(position.move));
  const mistakesCut = mistakes.filter((position) => position.moveCut);
  return {
    moves: positions.length,
    botBelow: botBelow,
    movesMadeImpossible: cut.length / positions.length,
    mistakes: mistakes.length,
    mistakesMadeImpossible: mistakesCut.length / mistakes.length,
  };
}

function isMistake(move: PlacedMove): boolean {
  if (move.centipawnLoss === undefined) {
    return false;
  }
  return move.centipawnLoss >= MISTAKE_CENTIPAWNS;
}

/** How far one candidate cut brings the Bot from Camille. */
export interface CandidateDistance {
  cut: MoveCut;
  /**
   * The gap under 1% between the Bot's expected share and Camille's, in
   * absolute value, each Phase weighed by his share of moves in it: the gap
   * for a move picked at random from his games.
   */
  distance: number;
  /** The same gap in each Phase on its own, signed: positive when the Bot plays more improbable moves than he does. */
  phaseGaps: Record<Phase, number>;
  /** The share of Camille's moves the cut keeps possible. */
  movesKept: number;
}

export interface CutChoice {
  chosen: MoveCut;
  /** Every candidate, in the order given. */
  candidates: CandidateDistance[];
}

/**
 * Chooses the cut that brings the Bot's share of moves the model gives less
 * than 1% closest to Camille's, on his moves given. Of candidates equally
 * close, the one keeping more of his moves wins, then the one given first.
 */
export function chooseCut(camilleMoves: PlacedMove[], candidates: MoveCut[]): CutChoice {
  const measured = candidates.map((cut) => candidateDistance(camilleMoves, cut));
  return { chosen: closest(measured).cut, candidates: measured };
}

/**
 * Distances this close count as equal: a hundredth of a percentage point,
 * finer than any difference the games could tell apart.
 */
const TIE = 0.0001;

function closest(candidates: CandidateDistance[]): CandidateDistance {
  let smallestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    smallestDistance = Math.min(smallestDistance, candidate.distance);
  }

  // Among the tied, a strict comparison keeps the first given of those
  // keeping equally many moves.
  let chosen: CandidateDistance | undefined = undefined;
  for (const candidate of candidates) {
    const tied = candidate.distance - smallestDistance < TIE;
    if (!tied) {
      continue;
    }
    if (chosen === undefined || candidate.movesKept > chosen.movesKept) {
      chosen = candidate;
    }
  }
  if (chosen === undefined) {
    throw new Error('No candidate cut to choose from');
  }
  return chosen;
}

/** The share under 1%, the threshold the cut is chosen on. */
const CHOSEN_ON = 0;

function candidateDistance(camilleMoves: PlacedMove[], cut: MoveCut): CandidateDistance {
  const camille = improbabilityProfile(camilleMoves);
  const bot = measureCut(camilleMoves, cut);

  let distance = 0;
  const phaseGaps = {} as Record<Phase, number>;
  for (const phase of PHASES) {
    const moves = camille[phase].moves;
    if (moves === 0) {
      phaseGaps[phase] = Number.NaN;
      continue;
    }
    const gap = bot.byPhase[phase].botBelow[CHOSEN_ON] - camille[phase].below[CHOSEN_ON];
    phaseGaps[phase] = gap;
    const weight = moves / camilleMoves.length;
    distance += weight * Math.abs(gap);
  }
  return { cut: cut, distance: distance, phaseGaps: phaseGaps, movesKept: 1 - bot.all.movesMadeImpossible };
}

export interface AdvantageSetup {
  /** The cut chosen for every Phase. */
  chosen: MoveCut;
  /** The candidate closest to Camille in the Phase alone. */
  phaseBest: MoveCut;
  resamples: number;
  /** Returns a number in [0, 1), seeded so the interval is the same every run. */
  random: () => number;
}

/** How much closer to Camille a Phase's own best cut is than the chosen one. */
export interface PhaseAdvantage {
  /** The chosen cut's gap in the Phase minus the best cut's, both in absolute value, on all the games. */
  difference: number;
  /** The 2.5th and 97.5th percentiles of the difference over resamples of whole games. */
  low: number;
  high: number;
}

/**
 * Whether a cut chosen for one Phase alone beats the cut chosen for all of
 * them by more than chance. The games are resampled whole, with
 * replacement: a game's moves share an opening, an opponent and a mood, so
 * they are not independent, and resampling moves one by one would make the
 * interval too narrow.
 */
export function phaseCutAdvantage(camilleMoves: PlacedMove[], phase: Phase, setup: AdvantageSetup): PhaseAdvantage {
  const inPhase = camilleMoves.filter((move) => move.phase === phase);
  const games = gameTallies(inPhase, setup.chosen, setup.phaseBest);

  const differences: number[] = [];
  for (let resample = 0; resample < setup.resamples; resample++) {
    const drawn: GameImprobability[] = [];
    for (let draw = 0; draw < games.length; draw++) {
      const index = Math.floor(setup.random() * games.length);
      drawn.push(games[index]);
    }
    differences.push(advantageOver(drawn));
  }
  differences.sort((first, second) => first - second);

  return {
    difference: advantageOver(games),
    low: differences[Math.floor(0.025 * differences.length)],
    high: differences[Math.ceil(0.975 * differences.length) - 1],
  };
}

/** One game's moves in a Phase, summed: how many, how many improbable, and each cut's expected count. */
interface GameImprobability {
  moves: number;
  camilleImprobable: number;
  chosenImprobable: number;
  phaseBestImprobable: number;
}

function gameTallies(moves: PlacedMove[], chosen: MoveCut, phaseBest: MoveCut): GameImprobability[] {
  const tallies = new Map<string, GameImprobability>();
  for (const move of moves) {
    let tally = tallies.get(move.game);
    if (tally === undefined) {
      tally = { moves: 0, camilleImprobable: 0, chosenImprobable: 0, phaseBestImprobable: 0 };
      tallies.set(move.game, tally);
    }
    tally.moves += 1;
    if (move.probability < IMPROBABILITY_THRESHOLDS[CHOSEN_ON]) {
      tally.camilleImprobable += 1;
    }
    tally.chosenImprobable += positionUnderCut(move, chosen).botBelow[CHOSEN_ON];
    tally.phaseBestImprobable += positionUnderCut(move, phaseBest).botBelow[CHOSEN_ON];
  }
  return [...tallies.values()];
}

function advantageOver(games: GameImprobability[]): number {
  let moves = 0;
  let camilleImprobable = 0;
  let chosenImprobable = 0;
  let phaseBestImprobable = 0;
  for (const game of games) {
    moves += game.moves;
    camilleImprobable += game.camilleImprobable;
    chosenImprobable += game.chosenImprobable;
    phaseBestImprobable += game.phaseBestImprobable;
  }
  const chosenGap = Math.abs(chosenImprobable - camilleImprobable) / moves;
  const phaseBestGap = Math.abs(phaseBestImprobable - camilleImprobable) / moves;
  return chosenGap - phaseBestGap;
}

/** How far the Bot under a cut lands from Camille in one Phase. */
export interface PhaseGap {
  /** The Bot's expected share under 1% minus Camille's: positive when the Bot plays more improbable moves. */
  gap: number;
  /** Clustered by game, as Move-Matching's: a game's moves are not independent. */
  standardError: number;
}

/**
 * Per Phase, the gap under 1% between the Bot under the cut and Camille, on
 * his moves given, with its standard error.
 */
export function cutGap(camilleMoves: PlacedMove[], cut: MoveCut): Record<Phase, PhaseGap> {
  const gaps = {} as Record<Phase, PhaseGap>;
  for (const phase of PHASES) {
    const inPhase = camilleMoves.filter((move) => move.phase === phase);

    // Each position scores the Bot's expected improbable share minus
    // Camille's own, 1 or 0; a game tallies its positions' scores.
    const games = new Map<string, GameTally>();
    let total = 0;
    for (const move of inPhase) {
      let camilleImprobable = 0;
      if (move.probability < IMPROBABILITY_THRESHOLDS[CHOSEN_ON]) {
        camilleImprobable = 1;
      }
      const difference = positionUnderCut(move, cut).botBelow[CHOSEN_ON] - camilleImprobable;

      let game = games.get(move.game);
      if (game === undefined) {
        game = { matched: 0, positions: 0 };
        games.set(move.game, game);
      }
      game.matched += difference;
      game.positions += 1;
      total += difference;
    }

    const gap = total / inPhase.length;
    gaps[phase] = { gap: gap, standardError: clusteredStandardError([...games.values()], gap) };
  }
  return gaps;
}

/**
 * The cuts measured, in the order the rule prefers them on a tie: no cut,
 * then each family from the cut that keeps the most moves to the one that
 * keeps the fewest.
 */
export const CANDIDATE_CUTS: readonly MoveCut[] = [
  { kind: 'none' },
  { kind: 'top-k', k: 10 },
  { kind: 'top-k', k: 8 },
  { kind: 'top-k', k: 6 },
  { kind: 'top-k', k: 5 },
  { kind: 'top-k', k: 4 },
  { kind: 'top-k', k: 3 },
  { kind: 'top-p', p: 0.98 },
  { kind: 'top-p', p: 0.95 },
  { kind: 'top-p', p: 0.9 },
  { kind: 'top-p', p: 0.85 },
  { kind: 'top-p', p: 0.8 },
  { kind: 'min-p', fraction: 0.02 },
  { kind: 'min-p', fraction: 0.05 },
  { kind: 'min-p', fraction: 0.1 },
  { kind: 'min-p', fraction: 0.2 },
];

/** How a cut is named in a table: no cut, top-5, top-p 0.90, min-p 0.05. */
export function cutName(cut: MoveCut): string {
  if (cut.kind === 'none') {
    return 'no cut';
  }
  if (cut.kind === 'top-k') {
    return `top-${cut.k}`;
  }
  if (cut.kind === 'top-p') {
    return `top-p ${cut.p.toFixed(2)}`;
  }
  return `min-p ${cut.fraction.toFixed(2)}`;
}
