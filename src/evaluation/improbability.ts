// Where a player's moves sit in the Base Model's distribution, and what
// cutting the model's least likely moves out of the Bot's draw would change.
// The target is a Bot that plays moves the model finds improbable as often
// as Camille does: his own improbable moves are part of how he plays.
// Free of anything DOM or Node; reading files is left to the caller.

import { cutPolicy, type MoveCut } from '../engine/move-cut';
import { PHASES, type Phase } from './move-matching';

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
