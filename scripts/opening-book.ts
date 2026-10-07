// Measures what the Opening Book adds to a Base Model on the Test Set: how
// many of Camille's positions the book answers, and Move-Matching per Phase
// with the Base Model alone and with the book consulted first.
//
//     npm run opening-book -- models/onnx/maia3-5m.onnx --rating 1100
//     npm run opening-book -- models/onnx/maia3-5m.onnx --rating 1100 --book <book.json> [test-set.jsonl]
//
// The book is the one pipeline/build_opening_book.py writes, built from the
// training games only. The tables go to standard output as Markdown; progress
// goes to standard error. --record <file> also writes the raw counts as JSON,
// the form the write-up page reads (docs/experiments/results/).

import { readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { parseArgs } from 'node:util';
import { loadBaseModel } from '../src/engine/base-model';
import { selectMove } from '../src/engine/move-selection';
import { openingBookFrom, type OpeningBookFile } from '../src/engine/opening-book';
import { gameFromFen } from '../src/game/game';
import {
  measureMoveMatching,
  PHASES,
  readPositions,
  type MoveMatchingReport,
  type MoveMatchingScore,
  type Phase,
} from '../src/evaluation/move-matching';
import {
  measureBookCoverage,
  type BookCoverage,
  type OpeningBookRecord,
} from '../src/evaluation/opening-book-coverage';

const DEFAULT_TEST_SET = 'data/dataset/test.jsonl';
const DEFAULT_BOOK = 'data/dataset/opening-book.json';

const PHASE_LABELS: Record<Phase, string> = {
  opening: 'Opening (1-10)',
  middlegame: 'Middlegame (11-30)',
  endgame: 'Endgame (31+)',
};

const { values: flags, positionals } = parseArgs({
  options: {
    rating: { type: 'string' },
    book: { type: 'string', default: DEFAULT_BOOK },
    record: { type: 'string' },
  },
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
const bookFile = JSON.parse(bookText) as OpeningBookFile;
const openingBook = openingBookFrom(bookFile);
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
console.log(`Book: ${flags.book}, positions reached at least ${openingBook.minOccurrences} times`);
console.log(`Test Set: ${testSetPath}, ${testSet.length} positions`);
console.log('');
console.log(coverageTable(coverage));
console.log('');
console.log(comparisonTable('Every Test Set position', baseModelAlone, withBook));
console.log('');
console.log(comparisonTable('Positions the book answers', answeredBaseModel, answeredBook));

if (flags.record !== undefined) {
  const bookPositions = Object.keys(bookFile.positions).length;
  const today = new Date().toISOString().slice(0, 10);
  const record: OpeningBookRecord = {
    measuredOn: today,
    baseModel: basename(modelPath, '.onnx'),
    rating: rating ?? null,
    bookPositions: bookPositions,
    minOccurrences: openingBook.minOccurrences,
    coverage: coverage,
    baseModelAlone: baseModelAlone,
    bookThenBaseModel: withBook,
    answeredByBook: { baseModelAlone: answeredBaseModel, bookThenBaseModel: answeredBook },
  };
  await writeFile(flags.record, JSON.stringify(record, null, 1) + '\n');
  progress(`Recorded in ${flags.record}`);
}

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
    let percentAnswered = '-';
    if (tally.positions > 0) {
      percentAnswered = `${((100 * tally.answered) / tally.positions).toFixed(1)}%`;
    }
    rows.push(`| ${PHASE_LABELS[phase]} | ${tally.answered} | ${tally.positions} | ${percentAnswered} |`);
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
