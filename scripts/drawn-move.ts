// Measures what drawing the Base Model's move costs in Move-Matching: per
// Phase, on the Test Set, the share of Camille's moves the most likely move
// matches, beside the share a move drawn at the given temperature is expected
// to match.
//
//     npm run drawn-move -- models/onnx/maia3-5m.onnx --rating 1100
//     npm run drawn-move -- models/onnx/maia3-5m.onnx --rating 1100 --temperature 0.5 [test-set.jsonl]
//
// Both figures come from one pass: the engine's distribution of moves in each
// position gives its most likely move and the probability it gives Camille's.
// The Base Model is measured alone, as the sweep measured it, so the top-move
// column reproduces the published figures. The table goes to standard output
// as Markdown; progress to standard error. --record <file> also writes the
// raw counts as JSON (docs/experiments/results/).

import { readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { parseArgs } from 'node:util';
import { loadBaseModel } from '../src/engine/base-model';
import { botMoveDistribution } from '../src/engine/move-selection';
import { SERVED_MODEL_TEMPERATURE } from '../src/engine/served-model';
import {
  measureDrawnMoveMatching,
  PHASES,
  readPositions,
  type MoveMatchingScore,
  type Phase,
} from '../src/evaluation/move-matching';

const DEFAULT_TEST_SET = 'data/dataset/test.jsonl';

const PHASE_LABELS: Record<Phase, string> = {
  opening: 'Opening (1-10)',
  middlegame: 'Middlegame (11-30)',
  endgame: 'Endgame (31+)',
};

const { values: flags, positionals } = parseArgs({
  options: {
    rating: { type: 'string' },
    temperature: { type: 'string' },
    record: { type: 'string' },
  },
  allowPositionals: true,
});
const [modelPath, testSetPath = DEFAULT_TEST_SET] = positionals;
if (modelPath === undefined) {
  console.error(
    'Usage: npm run drawn-move -- <model.onnx> [test-set.jsonl] [--rating <rating>] [--temperature <t>] [--record <file>]',
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

const baseModel = await loadBaseModel(await readFile(modelPath), { rating: rating });
const testSet = readPositions(await readFile(testSetPath, 'utf-8'));

progress(`Measuring ${testSet.length} positions at temperature ${temperature}`);
const startedAt = performance.now();
const report = await measureDrawnMoveMatching(testSet, (fen) => botMoveDistribution(fen, { baseModel, temperature }));
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
console.log(`| Phase | Top move | Drawn at temperature ${temperature} |`);
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
