// Checks that the engine encodes positions for Maia-1 exactly as lc0 does.
//
// lc0 is the reference implementation for a Maia-1 network's input. Its
// answers on fixed positions are recorded by pipeline/maia1_reference.py,
// running the same ONNX file this test loads. With the network held fixed, the
// only thing that can make the probabilities differ is the encoding.
//
// The model is not committed, so on a checkout without it this test is skipped;
// convert the candidates first (docs/experiments/onnx-conversion.md).

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { beforeAll, describe, expect, it } from 'vitest';
import { gameFromFen, type MoveRequest } from '../game/game';
import { loadBaseModel, type BaseModel, type MoveProbability } from './base-model';
import reference from './fixtures/maia1-1500-lc0-reference.json';

/**
 * lc0 prints probabilities rounded to hundredths of a percent, so agreement can
 * be no closer than 0.005 percentage points. The rest of the allowance covers
 * two runtimes adding the same numbers in a different order. A wrong input
 * plane moves probabilities by tenths of a point or more.
 */
const TOLERANCE_PERCENTAGE_POINTS = 0.01;

describe.skipIf(!existsSync(reference.model))(`Maia-1 encoding, checked against lc0 with ${reference.model}`, () => {
  let baseModel: BaseModel;
  beforeAll(async () => {
    baseModel = await loadBaseModel(await readFile(reference.model));
  });

  for (const position of reference.positions) {
    it(`gives lc0's probabilities in ${position.fen}`, async () => {
      const policy = await baseModel.movePolicy(gameFromFen(position.fen));

      const ourPercent = asLc0WouldPrint(policy);
      const lc0Percent = new Map(Object.entries(position.policy_percent));
      expect([...ourPercent.keys()].sort()).toEqual([...lc0Percent.keys()].sort());
      for (const [move, percent] of lc0Percent) {
        const difference = Math.abs(ourPercent.get(move)! - percent);
        expect(difference, move).toBeLessThanOrEqual(TOLERANCE_PERCENTAGE_POINTS);
      }
      expect(uciName(policy[0].move)).toBe(position.best_move);
    });
  }
});

/**
 * The engine's probabilities redone the way lc0 computes the ones it prints,
 * keyed by UCI name, in percent.
 *
 * lc0's softmax uses FastExp, an approximation of the exponential that is off
 * by up to about 0.3%, and then stores each probability in 16 bits. Both shift
 * the printed numbers by several hundredths of a point, as much as a small
 * encoding error would, so they are reproduced here to compare like with like.
 * A softmax only depends on differences between scores, so the logarithm of
 * each probability serves as the network's raw score.
 */
function asLc0WouldPrint(policy: MoveProbability[]): Map<string, number> {
  const scores = policy.map((entry) => Math.log(entry.probability));
  const largestScore = Math.max(...scores);
  const exponentials = scores.map((score) => fastExp(score - largestScore));
  const total = exponentials.reduce((sum, value) => sum + value, 0);

  const percentByMove = new Map<string, number>();
  for (const [index, entry] of policy.entries()) {
    const stored = storedIn16Bits(exponentials[index] / total);
    percentByMove.set(uciName(entry.move), stored * 100);
  }
  return percentByMove;
}

/** lc0's FastExp (src/utils/fastmath.h): 2 to the power x, with a quadratic for the fraction. */
function fastExp(x: number): number {
  const power = 1.44269504 * x;
  if (power < -126) {
    return 0;
  }
  let whole = Math.trunc(power);
  if (power < 0) {
    whole = Math.trunc(power - 1);
  }
  const fraction = power - whole;
  const fractionPart = 1 + fraction * (0.6602339 + 0.33976606 * fraction);
  return fractionPart * 2 ** whole;
}

/** lc0's Edge::SetP then GetP: a probability kept to 11 bits of precision. */
function storedIn16Bits(probability: number): number {
  const view = new DataView(new ArrayBuffer(4));
  view.setFloat32(0, probability);
  const rounded = view.getInt32(0) + ((1 << 11) - (3 << 28));
  if (rounded < 0) {
    return 0;
  }
  const kept = rounded >> 12;
  view.setUint32(0, ((kept << 12) | (3 << 28)) >>> 0);
  return view.getFloat32(0);
}

/** The move in UCI form, such as e2e4 or a7a8q. */
function uciName(move: MoveRequest): string {
  let suffix = '';
  if (move.promotion !== undefined) {
    suffix = { queen: 'q', rook: 'r', bishop: 'b', knight: 'n' }[move.promotion];
  }
  return move.from + move.to + suffix;
}
