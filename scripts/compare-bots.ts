// Measures two Bots side by side on the Test Set: each is the Opening Book,
// then its own Base Model, as the site serves the Bot. Per Phase it reports
// Move-Matching for the most likely move and for the move drawn at each
// Bot's temperature, and what the second Bot gains over the first, measured
// position by position.
//
//     npm run compare-bots -- models/onnx/maia3-5m.onnx models/onnx/maia3-5m-fine-tuned.onnx
//     npm run compare-bots -- <first.onnx> <second.onnx> --first-temperature 1 --second-temperature 1.25 --record <file.json> [--test-set <test.jsonl>]
//     npm run compare-bots -- models/onnx/maia3-5m.onnx models/onnx/maia3-5m.onnx --second-opening-cut top-k=10
//
// Both models play at the served rating. Each Bot draws at its own
// temperature, by default the served one, since each model has the
// temperature that brings its mistakes to Camille's Level. The drawn move is
// scored by the probability the draw lands on Camille's move. With
// --first-opening-cut or --second-opening-cut that Bot draws, up to ply 10,
// only among the moves the cut keeps; giving the same model twice then
// measures what the cut changes. --first-book and --second-book give each
// Bot its own Opening Book, by default the one the pipeline built; with the
// served book first and a refreshed one second, the gain is what the new
// book changes, the figure the monthly refresh's regression gate reads
// (npm run regression-gate). The tables go
// to standard output as Markdown, progress to standard error; --record also
// writes the raw counts as JSON.

import { readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { parseArgs } from 'node:util';
import { loadBaseModel } from '../src/engine/base-model';
import { readMoveCut, type MoveCut } from '../src/engine/move-cut';
import { drawDescription } from '../src/engine/move-draw';
import { botMoveDistribution } from '../src/engine/move-selection';
import { readOpeningBook } from '../src/engine/opening-book';
import { SERVED_MODEL_RATING, SERVED_MODEL_TEMPERATURE } from '../src/engine/served-model';
import {
  compareBots,
  PHASE_LABELS,
  PHASES,
  readPositions,
  type MoveMatchingReport,
  type MoveMatchingScore,
} from '../src/evaluation/move-matching';

const DEFAULT_TEST_SET = 'data/dataset/test.jsonl';
const OPENING_BOOK = 'data/dataset/opening-book.json';

const { values: flags, positionals } = parseArgs({
  options: {
    'first-temperature': { type: 'string' },
    'second-temperature': { type: 'string' },
    'first-opening-cut': { type: 'string' },
    'second-opening-cut': { type: 'string' },
    'first-book': { type: 'string', default: OPENING_BOOK },
    'second-book': { type: 'string', default: OPENING_BOOK },
    record: { type: 'string' },
    'test-set': { type: 'string', default: DEFAULT_TEST_SET },
  },
  allowPositionals: true,
});
const [firstPath, secondPath] = positionals;
if (firstPath === undefined || secondPath === undefined) {
  console.error(
    'Usage: npm run compare-bots -- <first.onnx> <second.onnx> [--first-temperature <t>] [--second-temperature <t>] [--first-opening-cut <cut>] [--second-opening-cut <cut>] [--first-book <file>] [--second-book <file>] [--record <file>] [--test-set <file>]',
  );
  process.exit(1);
}

let firstTemperature = SERVED_MODEL_TEMPERATURE;
if (flags['first-temperature'] !== undefined) {
  firstTemperature = Number(flags['first-temperature']);
}
let secondTemperature = SERVED_MODEL_TEMPERATURE;
if (flags['second-temperature'] !== undefined) {
  secondTemperature = Number(flags['second-temperature']);
}
let firstCut: MoveCut = { kind: 'none' };
if (flags['first-opening-cut'] !== undefined) {
  firstCut = readMoveCut(flags['first-opening-cut']);
}
let secondCut: MoveCut = { kind: 'none' };
if (flags['second-opening-cut'] !== undefined) {
  secondCut = readMoveCut(flags['second-opening-cut']);
}

const firstBookPath = flags['first-book'];
const secondBookPath = flags['second-book'];
const firstBook = readOpeningBook(await readFile(firstBookPath, 'utf-8'));
const secondBook = readOpeningBook(await readFile(secondBookPath, 'utf-8'));
const firstModel = await loadBaseModel(await readFile(firstPath), { rating: SERVED_MODEL_RATING });
const secondModel = await loadBaseModel(await readFile(secondPath), { rating: SERVED_MODEL_RATING });
const testSet = readPositions(await readFile(flags['test-set'], 'utf-8'));

progress(`Measuring ${testSet.length} positions, the Bots at temperatures ${firstTemperature} and ${secondTemperature}`);
const startedAt = performance.now();
const comparison = await compareBots(
  testSet,
  (fen) =>
    botMoveDistribution(fen, {
      openingBook: firstBook,
      baseModel: firstModel,
      temperature: firstTemperature,
      openingCut: firstCut,
    }),
  (fen) =>
    botMoveDistribution(fen, {
      openingBook: secondBook,
      baseModel: secondModel,
      temperature: secondTemperature,
      openingCut: secondCut,
    }),
);
progress(`Took ${((performance.now() - startedAt) / 1000).toFixed(0)} s`);

const firstName = basename(firstPath, '.onnx');
const secondName = basename(secondPath, '.onnx');
console.log(`First Bot: ${firstBookPath}, then ${firstPath} at ${SERVED_MODEL_RATING}, ${drawDescription(firstTemperature, firstCut)}`);
console.log(`Second Bot: ${secondBookPath}, then ${secondPath} at ${SERVED_MODEL_RATING}, ${drawDescription(secondTemperature, secondCut)}`);
console.log(`Test Set: ${flags['test-set']}, ${testSet.length} positions`);
console.log('');
printTable('Top move', comparison.first.topMove, comparison.second.topMove, comparison.gain.topMove);
console.log('');
printTable('Drawn at each Bot\'s temperature', comparison.first.drawn, comparison.second.drawn, comparison.gain.drawn);

if (flags.record !== undefined) {
  const record = {
    measuredOn: new Date().toISOString().slice(0, 10),
    rating: SERVED_MODEL_RATING,
    first: { baseModel: firstName, openingBook: firstBookPath, temperature: firstTemperature, openingCut: firstCut, ...comparison.first },
    second: { baseModel: secondName, openingBook: secondBookPath, temperature: secondTemperature, openingCut: secondCut, ...comparison.second },
    gain: comparison.gain,
  };
  await writeFile(flags.record, JSON.stringify(record, null, 1) + '\n');
  progress(`Recorded in ${flags.record}`);
}

function printTable(title: string, first: MoveMatchingReport, second: MoveMatchingReport, gain: MoveMatchingReport): void {
  console.log(`${title}: Move-Matching in percent, gain in points, ± one standard error clustered by game.`);
  console.log('');
  console.log(`| Phase | ${firstName} | ${secondName} | Gain |`);
  console.log('|---|---|---|---|');
  for (const phase of PHASES) {
    console.log(`| ${PHASE_LABELS[phase]} | ${withError(first.byPhase[phase])} | ${withError(second.byPhase[phase])} | ${gainWithError(gain.byPhase[phase])} |`);
  }
  console.log(`| After ply 10 | ${withError(first.afterPly10)} | ${withError(second.afterPly10)} | ${gainWithError(gain.afterPly10)} |`);
  console.log(`| All | ${withError(first.overall)} | ${withError(second.overall)} | ${gainWithError(gain.overall)} |`);
}

function progress(message: string): void {
  console.error(message);
}

function withError(score: MoveMatchingScore): string {
  const percentMatched = (100 * score.matched) / score.positions;
  const error = 100 * score.standardError;
  return `${percentMatched.toFixed(2)} ± ${error.toFixed(2)}`;
}

function gainWithError(score: MoveMatchingScore): string {
  const pointsGained = (100 * score.matched) / score.positions;
  const error = 100 * score.standardError;
  let sign = '';
  if (pointsGained >= 0) {
    sign = '+';
  }
  return `${sign}${pointsGained.toFixed(2)} ± ${error.toFixed(2)}`;
}
