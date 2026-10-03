// Measures the Move-Matching of every candidate Base Model and chooses one.
//
//     npm run base-model-sweep > sweep.md
//
// Every position of the dataset is used, the training games as well as the
// Test Set: the candidates are pretrained on other players' games, so none of
// Camille's games can have shaped them, and the larger sample narrows every
// estimate. The tables go to standard output as Markdown; progress goes to
// standard error.
//
// Candidates are read from pipeline/base_model_candidates.json and their
// converted files from models/onnx. Maia-3 takes its rating as an input, so
// it is measured at several ratings, each counted as a candidate. Candidates
// run one after another: ONNX Runtime already spreads one model over several
// cores, and running two at once slows both.

import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { brotliCompressSync, constants as zlibConstants } from 'node:zlib';
import { loadBaseModel } from '../src/engine/base-model';
import { selectMove } from '../src/engine/move-selection';
import { chooseBaseModel, type CandidateResult } from '../src/evaluation/base-model-sweep';
import { measureMoveMatching, readTestSet, type MoveMatchingScore, type TestPosition } from '../src/evaluation/move-matching';

const CANDIDATES_FILE = 'pipeline/base_model_candidates.json';
const ONNX_DIR = 'models/onnx';
const DATASET_FILES = ['data/dataset/train.jsonl', 'data/dataset/test.jsonl'];
const MAIA3_RATINGS = [1100, 1300, 1500, 1700, 1900];
/** Camille's Lichess rating, the scale Maia is trained on, when the sweep was planned. */
const LICHESS_RATING = 1331;
const MEGABYTE = 1_000_000;

interface CandidateEntry {
  name: string;
  family: string;
  licence: string;
}

/** One model file at one rating: a Maia-1 bin, or the Maia-3 file at one of the swept ratings. */
interface CandidateRun {
  name: string;
  entry: CandidateEntry;
  rating: number;
}

const { values: flags } = parseArgs({
  options: { positions: { type: 'string', multiple: true } },
});
const datasetFiles = flags.positions ?? DATASET_FILES;

const entries: CandidateEntry[] = JSON.parse(await readFile(CANDIDATES_FILE, 'utf-8'));
const runs = candidateRuns(entries);

let positions: TestPosition[] = [];
for (const path of datasetFiles) {
  const filePositions = readTestSet(await readFile(path, 'utf-8'));
  positions = positions.concat(filePositions);
}
progress(`${positions.length} positions from ${datasetFiles.join(', ')}; ${runs.length} candidates`);

const downloadSizes = new Map<string, number>();
const results: CandidateResult[] = [];
for (const run of runs) {
  const onnxFile = await readFile(`${ONNX_DIR}/${run.entry.name}.onnx`);
  if (!downloadSizes.has(run.entry.name)) {
    downloadSizes.set(run.entry.name, brotliSize(onnxFile));
  }

  const startedAt = performance.now();
  const baseModel = await loadBaseModel(onnxFile, { rating: run.rating });
  const report = await measureMoveMatching(positions, (fen) => selectMove(fen, { baseModel }));
  const seconds = (performance.now() - startedAt) / 1000;
  progress(`${run.name}: ${percent(report.afterPly10)} after ply 10, ${seconds.toFixed(0)} s`);

  results.push({
    name: run.name,
    family: run.entry.family,
    rating: run.rating,
    licence: run.entry.licence,
    downloadBytes: downloadSizes.get(run.entry.name) as number,
    report: report,
  });
}

const decision = chooseBaseModel(results);
console.log(resultsTable(results));
console.log();
console.log(slicesTable(results[0]));
console.log();
console.log(decisionTable(decision));

/** Every Maia-1 bin at its own rating, and every Maia-3 model at each swept rating. */
function candidateRuns(candidateEntries: CandidateEntry[]): CandidateRun[] {
  const candidateList: CandidateRun[] = [];
  for (const entry of candidateEntries) {
    if (entry.family === 'maia1') {
      const binRating = Number(entry.name.split('-')[1]);
      candidateList.push({ name: entry.name, entry: entry, rating: binRating });
    } else {
      for (const rating of MAIA3_RATINGS) {
        candidateList.push({ name: `${entry.name} at ${rating}`, entry: entry, rating: rating });
      }
    }
  }
  return candidateList;
}

/** The file as a server precompressing static files would send it. */
function brotliSize(content: Uint8Array): number {
  const compressed = brotliCompressSync(content, {
    params: {
      [zlibConstants.BROTLI_PARAM_QUALITY]: zlibConstants.BROTLI_MAX_QUALITY,
      [zlibConstants.BROTLI_PARAM_SIZE_HINT]: content.length,
    },
  });
  return compressed.length;
}

function progress(message: string): void {
  console.error(message);
}

function percent(score: MoveMatchingScore): string {
  const share = (100 * score.matched) / score.positions;
  return `${share.toFixed(2)}%`;
}

/** The share matched with one standard error, both in percent. */
function withError(score: MoveMatchingScore): string {
  const share = (100 * score.matched) / score.positions;
  const error = 100 * score.standardError;
  return `${share.toFixed(2)} ± ${error.toFixed(2)}`;
}

function resultsTable(candidateResults: CandidateResult[]): string {
  const lines = [
    'Move-Matching in percent, ± one standard error clustered by game.',
    '',
    '| Candidate | Opening (1-10) | Middlegame (11-30) | Endgame (31+) | After ply 10 | All |',
    '|---|---|---|---|---|---|',
  ];
  for (const result of candidateResults) {
    const report = result.report;
    const cells = [
      result.name,
      withError(report.byPhase.opening),
      withError(report.byPhase.middlegame),
      withError(report.byPhase.endgame),
      withError(report.afterPly10),
      withError(report.overall),
    ];
    lines.push(`| ${cells.join(' | ')} |`);
  }
  return lines.join('\n');
}

/** The slices are the same for every candidate, so any one result describes them. */
function slicesTable(result: CandidateResult): string {
  const report = result.report;
  const slices: [string, MoveMatchingScore][] = [
    ['Opening (1-10)', report.byPhase.opening],
    ['Middlegame (11-30)', report.byPhase.middlegame],
    ['Endgame (31+)', report.byPhase.endgame],
    ['After ply 10', report.afterPly10],
    ['All', report.overall],
  ];
  const lines = ['| Slice | Positions | Games |', '|---|---|---|'];
  for (const [name, score] of slices) {
    lines.push(`| ${name} | ${score.positions.toLocaleString('en')} | ${score.games.toLocaleString('en')} |`);
  }
  return lines.join('\n');
}

function decisionTable(decision: ReturnType<typeof chooseBaseModel>): string {
  const best = decision.best;
  const chosen = decision.chosen;

  let tiedNames = 'none';
  if (decision.tied.length > 0) {
    tiedNames = decision.tied.map((result) => result.name).join(', ');
  }

  const distance = best.rating - LICHESS_RATING;
  let signedDistance = `${distance}`;
  if (distance > 0) {
    signedDistance = `+${distance}`;
  }

  const rows: [string, string][] = [
    ['Best candidate (after ply 10)', `${best.name}, ${withError(best.report.afterPly10)}`],
    ['Tied with it (within 0.5 points)', tiedNames],
    ['Maia-Equivalent Rating', `${best.rating}`],
    [`Distance from the Lichess rating (${LICHESS_RATING})`, signedDistance],
    ['Chosen as Base Model', `${chosen.name}, ${withError(chosen.report.afterPly10)}`],
    ['Its download (brotli)', `${(chosen.downloadBytes / MEGABYTE).toFixed(2)} MB`],
    ['Its licence', chosen.licence],
  ];
  const lines = ['| | Value |', '|---|---|'];
  for (const [label, value] of rows) {
    lines.push(`| ${label} | ${value} |`);
  }
  return lines.join('\n');
}
