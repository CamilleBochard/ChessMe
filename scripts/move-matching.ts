// Measures a Base Model's Move-Matching on the Test Set: the share of
// Camille's positions in which the Move-Selection Engine, consulting that
// model, plays the move he played.
//
//     npm run move-matching -- models/onnx/maia1-1500.onnx [data/dataset/test.jsonl]
//
// The model is named by its path, so measuring another candidate needs no code
// change. The engine is the same code the page runs, executed under Node.

import { readFile } from 'node:fs/promises';
import { loadBaseModel } from '../src/engine/base-model';
import { selectMove } from '../src/engine/move-selection';
import { measureMoveMatching, readTestSet, type MoveMatchingScore } from '../src/evaluation/move-matching';

const DEFAULT_TEST_SET = 'data/dataset/test.jsonl';

function asPercent(score: MoveMatchingScore): string {
  const share = (100 * score.matched) / score.positions;
  return `${share.toFixed(2)}%  (${score.matched} of ${score.positions} positions)`;
}

const [modelPath, testSetPath = DEFAULT_TEST_SET] = process.argv.slice(2);
if (modelPath === undefined) {
  console.error('Usage: npm run move-matching -- <model.onnx> [test-set.jsonl]');
  process.exit(1);
}

const baseModel = await loadBaseModel(await readFile(modelPath));
const testSet = readTestSet(await readFile(testSetPath, 'utf-8'));

const startedAt = performance.now();
const report = await measureMoveMatching(testSet, (fen) => selectMove(fen, { baseModel }));
const seconds = (performance.now() - startedAt) / 1000;

console.log(`Model          ${modelPath}`);
console.log(`Test Set       ${testSetPath}`);
console.log(`Overall        ${asPercent(report.overall)}`);
console.log(`After ply 10   ${asPercent(report.afterPly10)}`);
console.log(`Took ${seconds.toFixed(0)} s`);
