// Checks that the engine encodes positions for Maia-3 exactly as CSSLab's
// maia3 package does.
//
// The reference answers are recorded by pipeline/maia3_reference.py, which
// encodes each position with the maia3 package and runs the same ONNX file
// this test loads. With the network held fixed, the only thing that can make
// the probabilities differ is the encoding.
//
// The model is not committed, so on a checkout without it this test is skipped;
// convert the candidates first (docs/experiments/onnx-conversion.md).

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { beforeAll, describe, expect, it } from 'vitest';
import { gameFromFen, type MoveRequest } from '../game/game';
import { loadBaseModel, type BaseModel } from './base-model';
import reference from './fixtures/maia3-5m-reference.json';

/**
 * The reference is not rounded, so the only allowance is for two builds of
 * ONNX Runtime adding the same numbers in a different order, which moved no
 * probability by more than 0.0004 points when the conversion was checked. A
 * wrong feature moves probabilities by tenths of a point or more.
 */
const TOLERANCE_PERCENTAGE_POINTS = 0.001;

describe.skipIf(!existsSync(reference.model))(`Maia-3 encoding, checked against the maia3 package with ${reference.model}`, () => {
  let baseModel: BaseModel;
  beforeAll(async () => {
    baseModel = await loadBaseModel(await readFile(reference.model), { rating: reference.rating });
  });

  for (const position of reference.positions) {
    it(`gives the reference probabilities in ${position.fen}`, async () => {
      const policy = await baseModel.movePolicy(gameFromFen(position.fen));

      const ourPercent = new Map(policy.map((entry) => [uciName(entry.move), entry.probability * 100]));
      const referencePercent = new Map(Object.entries(position.policy_percent));
      expect([...ourPercent.keys()].sort()).toEqual([...referencePercent.keys()].sort());
      for (const [move, percent] of referencePercent) {
        const difference = Math.abs(ourPercent.get(move)! - percent);
        expect(difference, move).toBeLessThanOrEqual(TOLERANCE_PERCENTAGE_POINTS);
      }
      expect(uciName(policy[0].move)).toBe(position.best_move);
    });
  }
});

/** The move in UCI form, such as e2e4 or a7a8q. */
function uciName(move: MoveRequest): string {
  let suffix = '';
  if (move.promotion !== undefined) {
    suffix = { queen: 'q', rook: 'r', bishop: 'b', knight: 'n' }[move.promotion];
  }
  return move.from + move.to + suffix;
}
