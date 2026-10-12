// Drawing one move from a set of move probabilities, as a player at the
// Base Model's rating would choose among them.
// Free of anything DOM so that it runs unchanged under Node.

import type { MoveRequest } from '../game/game';
import type { MoveProbability } from './base-model';

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
  if (temperature === 0) {
    return [{ move: policy[0].move, probability: 1 }];
  }

  const exponent = 1 / temperature;
  const reshaped = policy.map((candidate) => candidate.probability ** exponent);
  const total = reshaped.reduce((sum, value) => sum + value, 0);
  return policy.map((candidate, index) => ({ move: candidate.move, probability: reshaped[index] / total }));
}
