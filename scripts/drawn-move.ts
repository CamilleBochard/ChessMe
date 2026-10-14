// Measures what drawing the Base Model's move costs in Move-Matching: per
// Phase, on the Test Set, the share of Camille's moves the most likely move
// matches, beside the share a move drawn at the given temperature is expected
// to match.
//
//     npm run drawn-move -- models/onnx/maia3-5m.onnx --rating 1100
//     npm run drawn-move -- models/onnx/maia3-5m.onnx --rating 1100 --temperature 0.5 [test-set.jsonl]
//     npm run drawn-move -- models/onnx/maia3-5m.onnx --rating 1100 --opening-cut top-k=10
//
// Both figures come from one pass: the engine's distribution of moves in each
// position gives its most likely move and the probability it gives Camille's.
// The Base Model is measured alone, as the sweep measured it, so the top-move
// column reproduces the published figures. With --opening-cut the move is
// drawn, up to ply 10, only among the moves the cut keeps; the most likely
// move is always kept, so the top-move column does not change. The table
// goes to standard output as Markdown; progress to standard error.
// --record <file> also writes the raw counts as JSON
// (docs/experiments/results/).

import { readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { parseArgs } from 'node:util';
import { loadBaseModel } from '../src/engine/base-model';
import { readMoveCut, type MoveCut } from '../src/engine/move-cut';
import { drawDescription } from '../src/engine/move-draw';
import { botMoveDistribution } from '../src/engine/move-selection';
import { SERVED_MODEL_TEMPERATURE } from '../src/engine/served-model';
import {
  measureDrawnMoveMatching,
  PHASE_LABELS,
  PHASES,
  readPositions,
  type MoveMatchingScore,
} from '../src/evaluation/move-matching';

const DEFAULT_TEST_SET = 'data/dataset/test.jsonl';


const { values: flags, positionals } = parseArgs({
  options: {
    rating: { type: 'string' },
    temperature: { type: 'string' },
    'opening-cut': { type: 'string' },
    record: { type: 'string' },
  },
  allowPositionals: true,
});
const [modelPath, testSetPath = DEFAULT_TEST_SET] = positionals;
if (modelPath === undefined) {
  console.error(
    'Usage: npm run drawn-move -- <model.onnx> [test-set.jsonl] [--rating <rating>] [--temperature <t>] [--opening-cut <cut>] [--record <file>]',
  );
  process.exit(1);
}

let rating: number | undefined = undefined;
if (flags.rating !== undefined) {
  rating = Number(flags.rating);
}
let temperature = SERVED_MODEL_TEMPERATURE;
if (flags.temperature !== undefined) {
  temperature = Number(flags.temperature);
}
let openingCut: MoveCut = { kind: 'none' };
if (flags['opening-cut'] !== undefined) {
  openingCut = readMoveCut(flags['opening-cut']);
}
const howItDraws = drawDescription(temperature, openingCut);

const baseModel = await loadBaseModel(await readFile(modelPath), { rating: rating });
const testSet = readPositions(await readFile(testSetPath, 'utf-8'));

progress(`Measuring ${testSet.length} positions, ${howItDraws}`);
const startedAt = performance.now();
const report = await measureDrawnMoveMatching(testSet, (fen) => botMoveDistribution(fen, { baseModel, temperature, openingCut }));
const seconds = (performance.now() - startedAt) / 1000;
progress(`Took ${seconds.toFixed(0)} s`);

let modelLine = `Base Model: ${modelPath}`;
if (rating !== undefined) {
  modelLine = `${modelLine} at ${rating}`;
}
console.log(modelLine);
console.log(`Test Set: ${testSetPath}, ${testSet.length} positions`);
console.log('');
console.log('Move-Matching in percent, ± one standard error clustered by game, positions in brackets.');
console.log('');
const drawnColumn = howItDraws.charAt(0).toUpperCase() + howItDraws.slice(1);
console.log(`| Phase | Top move | ${drawnColumn} |`);
console.log('|---|---|---|');
for (const phase of PHASES) {
  console.log(`| ${PHASE_LABELS[phase]} | ${withError(report.topMove.byPhase[phase])} | ${withError(report.drawn.byPhase[phase])} |`);
}
console.log(`| After ply 10 | ${withError(report.topMove.afterPly10)} | ${withError(report.drawn.afterPly10)} |`);
console.log(`| All | ${withError(report.topMove.overall)} | ${withError(report.drawn.overall)} |`);

if (flags.record !== undefined) {
  const today = new Date().toISOString().slice(0, 10);
  const record = {
    measuredOn: today,
    baseModel: basename(modelPath, '.onnx'),
    rating: rating ?? null,
    temperature: temperature,
    openingCut: openingCut,
    topMove: report.topMove,
    drawn: report.drawn,
  };
  await writeFile(flags.record, JSON.stringify(record, null, 1) + '\n');
  progress(`Recorded in ${flags.record}`);
}

function progress(message: string): void {
  console.error(message);
}

function withError(score: MoveMatchingScore): string {
  const percentMatched = (100 * score.matched) / score.positions;
  const error = 100 * score.standardError;
  return `${percentMatched.toFixed(2)} ± ${error.toFixed(2)} (${score.positions})`;
}
