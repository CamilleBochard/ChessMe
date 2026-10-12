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
