// Measures the Move-Matching of every candidate Base Model and chooses one.
//
//     npm run base-model-sweep > sweep.md
//
// Every position of the dataset is used, the training games as well as the
// Test Set: the candidates are pretrained on other players' games, so none of
// Camille's games can have shaped them, and the larger sample narrows every
// estimate. The tables go to standard output as Markdown; progress goes to
// standard error. --positions <file> replaces the dataset with other JSON
// Lines files, for a quick run on a few positions.
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
import { chooseBaseModel, type BaseModelDecision, type CandidateResult } from '../src/evaluation/base-model-sweep';
import {
  measureMoveMatching,
  PHASES,
  readPositions,
  share,
  type MoveMatchingScore,
  type Phase,
  type PlayedPosition,
} from '../src/evaluation/move-matching';

const CANDIDATES_FILE = 'pipeline/base_model_candidates.json';
const ONNX_DIR = 'models/onnx';
const DATASET_FILES = ['data/dataset/train.jsonl', 'data/dataset/test.jsonl'];
const MAIA3_RATINGS = [700, 900, 1100, 1300, 1500, 1700, 1900];
/** Camille's Lichess rating, the scale Maia is trained on, when the sweep was planned. */
const LICHESS_RATING = 1331;
const MEGABYTE = 1_000_000;

const PHASE_LABELS: Record<Phase, string> = {
  opening: 'Opening (1-10)',
  middlegame: 'Middlegame (11-30)',
  endgame: 'Endgame (31+)',
};

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

let positions: PlayedPosition[] = [];
for (const path of datasetFiles) {
  const filePositions = readPositions(await readFile(path, 'utf-8'));
  positions = positions.concat(filePositions);
}
progress(`${positions.length} positions from ${datasetFiles.join(', ')}; ${runs.length} candidates`);

const downloadSizes = new Map<string, number>();
const results: CandidateResult[] = [];
for (const run of runs) {
  const onnxFile = await readFile(`${ONNX_DIR}/${run.entry.name}.onnx`);
  // Maia-3 runs at several ratings from one file, which is compressed once.
  let downloadBytes = downloadSizes.get(run.entry.name);
  if (downloadBytes === undefined) {
    downloadBytes = brotliSize(onnxFile);
    downloadSizes.set(run.entry.name, downloadBytes);
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
    downloadBytes: downloadBytes,
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
  const percentMatched = 100 * share(score);
  return `${percentMatched.toFixed(2)}%`;
}

/** The share matched with one standard error, both in percent. */
function withError(score: MoveMatchingScore): string {
  const percentMatched = 100 * share(score);
  const error = 100 * score.standardError;
  return `${percentMatched.toFixed(2)} ± ${error.toFixed(2)}`;
}

function resultsTable(candidateResults: CandidateResult[]): string {
  const lines = [
    'Move-Matching in percent, ± one standard error clustered by game.',
    '',
    `| Candidate | ${PHASES.map((phase) => PHASE_LABELS[phase]).join(' | ')} | After ply 10 | All |`,
    '|---|---|---|---|---|---|',
  ];
  for (const result of candidateResults) {
    const report = result.report;
    const cells = [result.name];
    for (const phase of PHASES) {
      cells.push(withError(report.byPhase[phase]));
    }
    cells.push(withError(report.afterPly10));
    cells.push(withError(report.overall));
    lines.push(`| ${cells.join(' | ')} |`);
  }
  return lines.join('\n');
}

/** The slices are the same for every candidate, so any one result describes them. */
function slicesTable(result: CandidateResult): string {
  const report = result.report;
  const slices: [string, MoveMatchingScore][] = [];
  for (const phase of PHASES) {
    slices.push([PHASE_LABELS[phase], report.byPhase[phase]]);
  }
  slices.push(['After ply 10', report.afterPly10]);
  slices.push(['All', report.overall]);
  const lines = ['| Slice | Positions | Games |', '|---|---|---|'];
  for (const [name, score] of slices) {
    lines.push(`| ${name} | ${score.positions.toLocaleString('en')} | ${score.games.toLocaleString('en')} |`);
  }
  return lines.join('\n');
}

function decisionTable(decision: BaseModelDecision): string {
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
    ['Its rating', `${chosen.rating}`],
    ['Its download (brotli)', `${(chosen.downloadBytes / MEGABYTE).toFixed(2)} MB`],
    ['Its licence', chosen.licence],
  ];
  const lines = ['| | Value |', '|---|---|'];
  for (const [label, value] of rows) {
    lines.push(`| ${label} | ${value} |`);
  }
  return lines.join('\n');
}
