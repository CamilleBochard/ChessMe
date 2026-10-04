// Measures what the Opening Book adds to a Base Model on the Test Set: how
// many of Camille's positions the book answers, and Move-Matching per Phase
// with the Base Model alone and with the book consulted first.
//
//     npm run opening-book -- models/onnx/maia3-5m.onnx --rating 1100
//     npm run opening-book -- models/onnx/maia3-5m.onnx --rating 1100 --book <book.json> [test-set.jsonl]
//
// The book is the one pipeline/build_opening_book.py writes, built from the
// training games only. The tables go to standard output as Markdown; progress
// goes to standard error.

import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { loadBaseModel } from '../src/engine/base-model';
import { selectMove } from '../src/engine/move-selection';
import { readOpeningBook } from '../src/engine/opening-book';
import { gameFromFen } from '../src/game/game';
import {
  measureMoveMatching,
  PHASES,
  readPositions,
  type MoveMatchingReport,
  type MoveMatchingScore,
  type Phase,
} from '../src/evaluation/move-matching';
import { measureBookCoverage, type BookCoverage } from '../src/evaluation/opening-book-coverage';

const DEFAULT_TEST_SET = 'data/dataset/test.jsonl';
const DEFAULT_BOOK = 'data/dataset/opening-book.json';

const PHASE_LABELS: Record<Phase, string> = {
  opening: 'Opening (1-10)',
  middlegame: 'Middlegame (11-30)',
  endgame: 'Endgame (31+)',
};

const { values: flags, positionals } = parseArgs({
  options: { rating: { type: 'string' }, book: { type: 'string', default: DEFAULT_BOOK } },
  allowPositionals: true,
});
const [modelPath, testSetPath = DEFAULT_TEST_SET] = positionals;
if (modelPath === undefined) {
  console.error('Usage: npm run opening-book -- <model.onnx> [test-set.jsonl] [--rating <rating>] [--book <book.json>]');
  process.exit(1);
}

let rating: number | undefined = undefined;
if (flags.rating !== undefined) {
  rating = Number(flags.rating);
}

const baseModel = await loadBaseModel(await readFile(modelPath), { rating: rating });
const bookText = await readFile(flags.book, 'utf-8');
const openingBook = readOpeningBook(bookText);
const minOccurrences = JSON.parse(bookText).min_occurrences as number;
const testSet = readPositions(await readFile(testSetPath, 'utf-8'));

const coverage = measureBookCoverage(testSet, openingBook);

progress('Measuring the Base Model alone');
const baseModelAlone = await measureMoveMatching(testSet, (fen) => selectMove(fen, { baseModel }));
progress('Measuring the book, then the Base Model');
const withBook = await measureMoveMatching(testSet, (fen) => selectMove(fen, { openingBook, baseModel }));

// The two runs differ only where the book answers, so those positions are
// also scored on their own: the book's move against the Base Model's.
const answeredByBook = testSet.filter((position) => openingBook.move(gameFromFen(position.fen)) !== undefined);
progress('Measuring the positions the book answers');
const answeredBaseModel = await measureMoveMatching(answeredByBook, (fen) => selectMove(fen, { baseModel }));
const answeredBook = await measureMoveMatching(answeredByBook, (fen) => selectMove(fen, { openingBook, baseModel }));

let modelLine = `Model: ${modelPath}`;
if (rating !== undefined) {
  modelLine = `${modelLine} at ${rating}`;
}
console.log(modelLine);
console.log(`Book: ${flags.book}, positions reached at least ${minOccurrences} times`);
console.log(`Test Set: ${testSetPath}, ${testSet.length} positions`);
console.log('');
console.log(coverageTable(coverage));
console.log('');
console.log(comparisonTable('Every Test Set position', baseModelAlone, withBook));
console.log('');
console.log(comparisonTable('Positions the book answers', answeredBaseModel, answeredBook));

function progress(message: string): void {
  console.error(message);
}

function withError(score: MoveMatchingScore): string {
  if (score.positions === 0) {
    return '-';
  }
  const percentMatched = (100 * score.matched) / score.positions;
  const error = 100 * score.standardError;
  return `${percentMatched.toFixed(2)} ± ${error.toFixed(2)} (${score.positions})`;
}

function coverageTable(coverageByPhase: Record<Phase, BookCoverage>): string {
  const rows = ['| Phase | Answered by the book | Positions | Share |', '|---|---|---|---|'];
  for (const phase of PHASES) {
    const tally = coverageByPhase[phase];
    const percentAnswered = (100 * tally.answered) / tally.positions;
    rows.push(`| ${PHASE_LABELS[phase]} | ${tally.answered} | ${tally.positions} | ${percentAnswered.toFixed(1)}% |`);
  }
  return rows.join('\n');
}

function comparisonTable(title: string, without: MoveMatchingReport, withTheBook: MoveMatchingReport): string {
  const rows = [
    `| ${title} | Base Model alone | Book, then Base Model |`,
    '|---|---|---|',
  ];
  for (const phase of PHASES) {
    rows.push(`| ${PHASE_LABELS[phase]} | ${withError(without.byPhase[phase])} | ${withError(withTheBook.byPhase[phase])} |`);
  }
  rows.push(`| All | ${withError(without.overall)} | ${withError(withTheBook.overall)} |`);
  return rows.join('\n');
}
