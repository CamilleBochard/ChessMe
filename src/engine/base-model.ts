// The Base Model: a pretrained network that, given a position, says how likely
// a human player is to choose each move. The engine receives it as the bytes of
// an ONNX file and recognises the family from the file's input names, so trying
// another candidate is a matter of loading another file. Inference runs on
// onnxruntime-web, the runtime visitors' browsers use, so that what is measured
// under Node is what ships.
// Free of anything DOM so that it runs unchanged under Node.

import * as ort from 'onnxruntime-web';
import { legalMoves, type Game, type MoveRequest } from '../game/game';
import { encodeMaia1, maia1PolicyIndex, MAIA1_INPUT_NAME, MAIA1_INPUT_SHAPE, MAIA1_POLICY_NAME } from './maia1';
import {
  encodeMaia3,
  maia3PolicyIndex,
  MAIA3_OPPONENT_RATING_NAME,
  MAIA3_POLICY_NAME,
  MAIA3_SELF_RATING_NAME,
  MAIA3_TOKENS_NAME,
  MAIA3_TOKENS_SHAPE,
} from './maia3';

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

export interface BaseModelOptions {
  /**
   * The rating a Maia-3 model plays at, given to it as both players' rating.
   * Maia-1 has one file per rating band and ignores it.
   */
  rating?: number;
}

/**
 * How to talk to one family of network: the inputs it wants for a position,
 * the output holding its move scores, and where in that output each move sits.
 */
interface NetworkFamily {
  inputs(game: Game): Record<string, ort.Tensor>;
  policyOutput: string;
  policyIndex(game: Game, move: MoveRequest): number;
}

/** Loads a Base Model from the bytes of its ONNX file. */
export async function loadBaseModel(onnxFile: Uint8Array, options: BaseModelOptions = {}): Promise<BaseModel> {
  const session = await ort.InferenceSession.create(onnxFile);
  const family = recogniseFamily(session.inputNames, options);

  return {
    movePolicy: async (game) => {
      const outputs = await session.run(family.inputs(game));
      const scores = outputs[family.policyOutput].data as Float32Array;

      const candidates = legalMoves(game);
      const legalScores = candidates.map((move) => scores[family.policyIndex(game, move)]);
      const probabilities = softmax(legalScores);

      const policy = candidates.map((move, index) => ({ move: move, probability: probabilities[index] }));
      policy.sort((first, second) => second.probability - first.probability);
      return policy;
    },
  };
}

function recogniseFamily(inputNames: readonly string[], options: BaseModelOptions): NetworkFamily {
  if (inputNames.includes(MAIA1_INPUT_NAME)) {
    return maia1Family();
  }
  if (inputNames.includes(MAIA3_TOKENS_NAME)) {
    if (options.rating === undefined) {
      throw new Error('A Maia-3 model needs the rating it should play at');
    }
    return maia3Family(options.rating);
  }
  throw new Error(`Not a Base Model the engine can read: its inputs are ${inputNames.join(', ')}`);
}

function maia1Family(): NetworkFamily {
  return {
    inputs: (game) => {
      const planes = new ort.Tensor('float32', encodeMaia1(game), [1, ...MAIA1_INPUT_SHAPE]);
      return { [MAIA1_INPUT_NAME]: planes };
    },
    policyOutput: MAIA1_POLICY_NAME,
    policyIndex: maia1PolicyIndex,
  };
}

function maia3Family(rating: number): NetworkFamily {
  return {
    inputs: (game) => {
      const tokens = new ort.Tensor('float32', encodeMaia3(game), [1, ...MAIA3_TOKENS_SHAPE]);
      // The opponent's rating is not known to the engine, so the model is
      // told both players share the rating it plays at.
      const ratings = new ort.Tensor('int64', BigInt64Array.from([BigInt(rating)]), [1]);
      return {
        [MAIA3_TOKENS_NAME]: tokens,
        [MAIA3_SELF_RATING_NAME]: ratings,
        [MAIA3_OPPONENT_RATING_NAME]: ratings,
      };
    },
    policyOutput: MAIA3_POLICY_NAME,
    policyIndex: maia3PolicyIndex,
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
