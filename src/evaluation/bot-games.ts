// Plays the Bot's games under Node, with no browser and no visitor, so that the
// Style Fingerprint can be measured on games the Bot played. The Bot is the
// Move-Selection Engine as the page runs it; its opponent is the caller's
// choice.
// Free of anything DOM or Node, so the same code could run wherever the engine
// does; writing the games out is left to the caller.

import type { MoveProbability } from '../engine/base-model';
import type { MoveRequest } from '../game/game';

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
