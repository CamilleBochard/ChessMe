// The Base Model: a pretrained network that, given a position, says how likely
// a human player is to choose each move. The engine receives it as the bytes of
// an ONNX file, so trying another candidate is a matter of loading another
// file. Inference runs on onnxruntime-web, the runtime visitors' browsers use,
// so that what is measured under Node is what ships.
// Free of anything DOM so that it runs unchanged under Node.

import * as ort from 'onnxruntime-web';
import { legalMoves, type Game, type MoveRequest } from '../game/game';
import { encodeMaia1, maia1PolicyIndex, MAIA1_INPUT_NAME, MAIA1_INPUT_SHAPE, MAIA1_POLICY_NAME } from './maia1';

/** One legal move and the probability the Base Model gives it. */
export interface MoveProbability {
  move: MoveRequest;
  probability: number;
}

export interface BaseModel {
  /**
   * Every legal move in the position with the probability the model gives it,
   * most likely first. The probabilities are spread over legal moves only and
   * sum to one.
   */
  movePolicy(game: Game): Promise<MoveProbability[]>;
}

/** Loads a Base Model from the bytes of its ONNX file. */
export async function loadBaseModel(onnxFile: Uint8Array): Promise<BaseModel> {
  const session = await ort.InferenceSession.create(onnxFile);

  return {
    movePolicy: async (game) => {
      const planes = new ort.Tensor('float32', encodeMaia1(game), [1, ...MAIA1_INPUT_SHAPE]);
      const outputs = await session.run({ [MAIA1_INPUT_NAME]: planes });
      const scores = outputs[MAIA1_POLICY_NAME].data as Float32Array;

      const candidates = legalMoves(game);
      const legalScores = candidates.map((move) => scores[maia1PolicyIndex(game, move)!]);
      const probabilities = softmax(legalScores);

      const policy = candidates.map((move, index) => ({ move: move, probability: probabilities[index] }));
      policy.sort((first, second) => second.probability - first.probability);
      return policy;
    },
  };
}

/**
 * Turns raw scores into probabilities that sum to one. The largest score is
 * subtracted first so that exponentials of large scores cannot overflow.
 */
function softmax(scores: number[]): number[] {
  const largest = Math.max(...scores);
  const exponentials = scores.map((score) => Math.exp(score - largest));
  const total = exponentials.reduce((sum, value) => sum + value, 0);
  return exponentials.map((value) => value / total);
}
