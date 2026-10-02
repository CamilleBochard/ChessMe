// Measures a Base Model's Move-Matching on the Test Set: the share of
// Camille's positions in which the Move-Selection Engine, consulting that
// model, plays the move he played.
//
//     npm run move-matching -- models/onnx/maia1-1500.onnx [data/dataset/test.jsonl]
//     npm run move-matching -- models/onnx/maia3-5m.onnx --rating 1500
//
// The model is named by its path, so measuring another candidate needs no code
// change. A Maia-3 model also needs the rating it plays at. The engine is the
// same code the page runs, executed under Node.

import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { loadBaseModel } from '../src/engine/base-model';
import { selectMove } from '../src/engine/move-selection';
import { measureMoveMatching, readTestSet, type MoveMatchingScore } from '../src/evaluation/move-matching';

const DEFAULT_TEST_SET = 'data/dataset/test.jsonl';

function asPercent(score: MoveMatchingScore): string {
  const share = (100 * score.matched) / score.positions;
  return `${share.toFixed(2)}%  (${score.matched} of ${score.positions} positions)`;
}

const { values: flags, positionals } = parseArgs({
  options: { rating: { type: 'string' } },
  allowPositionals: true,
});
const [modelPath, testSetPath = DEFAULT_TEST_SET] = positionals;
if (modelPath === undefined) {
  console.error('Usage: npm run move-matching -- <model.onnx> [test-set.jsonl] [--rating <rating>]');
  process.exit(1);
}

let rating: number | undefined = undefined;
if (flags.rating !== undefined) {
  rating = Number(flags.rating);
}

const baseModel = await loadBaseModel(await readFile(modelPath), { rating: rating });
const testSet = readTestSet(await readFile(testSetPath, 'utf-8'));

const startedAt = performance.now();
const report = await measureMoveMatching(testSet, (fen) => selectMove(fen, { baseModel }));
const seconds = (performance.now() - startedAt) / 1000;

console.log(`Model          ${modelPath}`);
if (rating !== undefined) {
  console.log(`Rating         ${rating}`);
}
console.log(`Test Set       ${testSetPath}`);
console.log(`Overall        ${asPercent(report.overall)}`);
console.log(`After ply 10   ${asPercent(report.afterPly10)}`);
console.log(`Took ${seconds.toFixed(0)} s`);
