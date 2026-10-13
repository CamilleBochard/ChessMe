// Cutting the Base Model's least likely moves out of the draw, so that the
// Bot only draws among moves a player at its rating would plausibly play.
// Free of anything DOM so that it runs unchanged under Node.

import type { MoveProbability } from './base-model';

/** Which of the Base Model's moves the draw keeps. */
export type MoveCut =
  /** Every legal move, as the Bot draws without a cut. */
  | { kind: 'none' }
  /** The k most likely moves. */
  | { kind: 'top-k'; k: number }
  /** The most likely moves, taken in order until together they cover a share p of the probability. */
  | { kind: 'top-p'; p: number }
  /**
   * The moves with at least a fraction of the most likely move's probability:
   * few where the model is confident, more where it hesitates.
   */
  | { kind: 'min-p'; fraction: number };

/**
 * The moves the cut keeps, most likely first as given, with their
 * probabilities rescaled to sum to one: what the Bot would draw from.
 * The policy must be sorted most likely first, as the Base Model gives it.
 */
export function cutPolicy(policy: MoveProbability[], cut: MoveCut): MoveProbability[] {
  if (cut.kind === 'none') {
    return policy;
  }

  let kept: MoveProbability[];
  if (cut.kind === 'top-k') {
    kept = policy.slice(0, cut.k);
  } else if (cut.kind === 'top-p') {
    kept = mostLikelyCovering(policy, cut.p);
  } else {
    const smallestKept = cut.fraction * policy[0].probability;
    kept = policy.filter((candidate) => candidate.probability >= smallestKept);
  }
  return rescaled(kept);
}

/** The shortest run of most likely moves whose probabilities add up to the share or more. */
function mostLikelyCovering(policy: MoveProbability[], share: number): MoveProbability[] {
  const kept: MoveProbability[] = [];
  let covered = 0;
  for (const candidate of policy) {
    kept.push(candidate);
    covered += candidate.probability;
    if (covered >= share) {
      break;
    }
  }
  return kept;
}

function rescaled(kept: MoveProbability[]): MoveProbability[] {
  const total = kept.reduce((sum, candidate) => sum + candidate.probability, 0);
  return kept.map((candidate) => ({ move: candidate.move, probability: candidate.probability / total }));
}
