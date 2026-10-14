// Drawing one move from a set of move probabilities, as a player at the
// Base Model's rating would choose among them.
// Free of anything DOM so that it runs unchanged under Node.

import type { MoveRequest } from '../game/game';
import type { MoveProbability } from './base-model';
import { cutName, type MoveCut } from './move-cut';

/**
 * Picks a move at random, each move as often as its probability says: the
 * random number falls somewhere in [0, 1), and each move owns a stretch of
 * that range as wide as its probability.
 */
export function drawMove(policy: MoveProbability[], random: () => number): MoveRequest {
  const drawn = random();

  let stretchEnd = 0;
  for (const candidate of policy) {
    stretchEnd += candidate.probability;
    if (drawn < stretchEnd) {
      return candidate.move;
    }
  }
  // Probabilities that add up to a hair under one leave a sliver at the top
  // of the range; it belongs to the last move.
  return policy[policy.length - 1].move;
}

/**
 * The probabilities reshaped by a temperature, most likely first as given.
 *
 * Each probability is raised to the power 1 / temperature and the set is
 * rescaled to sum to one. This is exactly what dividing the network's raw
 * scores by the temperature before its softmax would give, so the Base
 * Model's own probabilities are all the draw needs. At 1 nothing changes;
 * below 1 the likely moves gain at the expense of the unlikely ones; above 1
 * they lose to them. At 0, the limit, the most likely move takes everything.
 */
export function withTemperature(policy: MoveProbability[], temperature: number): MoveProbability[] {
  if (temperature < 0) {
    throw new Error(`A temperature cannot be negative: ${temperature}`);
  }
  if (temperature === 0) {
    return [{ move: policy[0].move, probability: 1 }];
  }

  // Each move is weighed against the most likely one, (p / p_max) ^ (1 / T),
  // through logarithms: near 0 the powers themselves would be too small for
  // a floating-point number, every weight would round to 0, and the rescaling
  // would divide 0 by 0. Relative to the most likely move, that move weighs
  // exactly 1 and only the unlikely ones round to 0.
  const exponent = 1 / temperature;
  const largestLog = Math.log(policy[0].probability);
  const weights = policy.map((candidate) => Math.exp(exponent * (Math.log(candidate.probability) - largestLog)));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return policy.map((candidate, index) => ({ move: candidate.move, probability: weights[index] / total }));
}

/**
 * How the Bot draws, as a script's summary says it: "top move" at
 * temperature 0, otherwise "drawn at temperature 1", followed by the cut
 * when there is one, as in "drawn at temperature 1, top-10 in the opening".
 * At temperature 0 a cut is not named, since the top move survives every cut.
 */
export function drawDescription(temperature: number, openingCut: MoveCut): string {
  if (temperature === 0) {
    return 'top move';
  }
  const atTemperature = `drawn at temperature ${temperature}`;
  if (openingCut.kind === 'none') {
    return atTemperature;
  }
  return `${atTemperature}, ${cutName(openingCut)} in the opening`;
}
