// Writes Camille's yardsticks, which the panel beside the board ships with:
//
//     npm run yardsticks -- --model models/onnx/maia3-5m-fine-tuned.onnx \
//       --probabilities data/dataset/move-probabilities/fine-tuned-test.jsonl
//     npm run yardsticks -- --losses data/dataset/centipawn-losses-browser.jsonl \
//       --loss-profile data/dataset/blunder-profile-browser.json
//
// --probabilities holds the records npm run move-probabilities wrote for the
// model the site serves, at the rating it plays at, on the Test Set: the
// fine-tuned model was trained on the other games, and finds them more
// probable than it would find a new game of his. His moves in positions the
// Opening Book holds are left out, since the Bot never asks the Base Model
// there. Written to src/explanation/improbability-yardstick.json.
//
// --losses holds every move's loss as pipeline/extract_blunder_profile.py
// writes it, measured with the engine and depth analysis mode runs in the
// browser; --loss-profile is the profile written beside it, which names
// them. Written to src/explanation/loss-yardstick.json.
//
// --since 2025-06-15T10:00:00 builds either from the games begun at that
// moment or later, such as the games since the Level Break
// (docs/experiments/level-break.md), when each began read from the dataset.
// It needs --out: the site keeps serving the yardsticks of every game until
// a refresh publishes new ones.

import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { ANALYSIS_DEPTH } from '../src/analysis/browser-engine';
import { readOpeningBook } from '../src/engine/opening-book';
import { SERVED_MODEL_RATING, SERVED_MODEL_SOURCE } from '../src/engine/served-model';
import {
  improbabilityYardstick,
  LOSS_PROFILE_EDGES,
  lossYardstick,
  MOVES_FOR_A_VERDICT,
  type LossMove,
  type ShippedImprobabilityYardstick,
  type ShippedLossYardstick,
} from '../src/explanation/yardsticks';
import { gameFromFen } from '../src/game/game';
import { readPlacedMoves } from '../src/evaluation/improbability';
import { playedSince, readGameStarts } from '../src/evaluation/played-since';
import { PHASE_LABELS, PHASES } from '../src/evaluation/move-matching';

const OPENING_BOOK = 'data/dataset/opening-book.json';
const IMPROBABILITY_YARDSTICK = 'src/explanation/improbability-yardstick.json';
const LOSS_YARDSTICK = 'src/explanation/loss-yardstick.json';
const DATASET_FILES = ['data/dataset/train.jsonl', 'data/dataset/test.jsonl'];

const { values: flags } = parseArgs({
  options: {
    model: { type: 'string' },
    probabilities: { type: 'string' },
    losses: { type: 'string' },
    'loss-profile': { type: 'string' },
    since: { type: 'string' },
    out: { type: 'string' },
  },
});
const writesImprobability = flags.probabilities !== undefined && flags.model !== undefined;
const writesLosses = flags.losses !== undefined && flags['loss-profile'] !== undefined;
if (!writesImprobability && !writesLosses) {
  console.error('Usage: npm run yardsticks -- --model <model.onnx> --probabilities <records>');
  console.error('       npm run yardsticks -- --losses <losses.jsonl> --loss-profile <profile.json>');
  process.exit(1);
}

if (writesImprobability && writesLosses && flags.out !== undefined) {
  console.error('--out names one file: write the two yardsticks in two runs.');
  process.exit(1);
}
const since = flags.since ?? null;
if (since !== null && flags.out === undefined) {
  console.error('--since needs --out: the site keeps its yardsticks of every game until a refresh publishes new ones.');
  process.exit(1);
}
let gameStarts = new Map<string, string>();
if (since !== null) {
  for (const path of DATASET_FILES) {
    gameStarts = new Map([...gameStarts, ...readGameStarts(await readFile(path, 'utf-8'))]);
  }
}

const measuredOn = new Date().toISOString().slice(0, 10);

if (writesImprobability) {
  // The yardstick reads the probabilities of one model; the panel sets the
  // served model's against it, so no other model's records will do.
  if (flags.model !== SERVED_MODEL_SOURCE) {
    console.error(`The site serves ${SERVED_MODEL_SOURCE}; records of ${flags.model} would measure another model.`);
    process.exit(1);
  }
  const openingBook = readOpeningBook(await readFile(OPENING_BOOK, 'utf-8'));
  const camilleMoves = playedSince(readPlacedMoves(await readFile(flags.probabilities!, 'utf-8')), gameStarts, since);
  const outsideBook = camilleMoves.filter((move) => openingBook.move(gameFromFen(move.fen)) === undefined);
  const yardstick = improbabilityYardstick(outsideBook);
  const games = new Set(outsideBook.map((move) => move.game)).size;

  const record: ShippedImprobabilityYardstick = {
    measuredOn: measuredOn,
    baseModel: SERVED_MODEL_SOURCE,
    rating: SERVED_MODEL_RATING,
    records: flags.probabilities!,
    games: games,
    moves: camilleMoves.length,
    movesOutsideOpeningBook: outsideBook.length,
    movesForAVerdict: MOVES_FOR_A_VERDICT,
    ...yardstick,
  };
  if (since !== null) {
    record.since = since;
  }
  const written = flags.out ?? IMPROBABILITY_YARDSTICK;
  await writeFile(written, JSON.stringify(record, null, 1) + '\n');

  console.log(`Camille's improbability yardstick, ${outsideBook.length} of his ${camilleMoves.length} Test Set moves outside the book, ${games} games.`);
  console.log('');
  console.log('| Phase | Moves | Games with 8 moves or more | Middle 80% of games, share under 1% |');
  console.log('|---|---|---|---|');
  for (const phase of PHASES) {
    const inPhase = yardstick.phases[phase];
    console.log(`| ${PHASE_LABELS[phase]} | ${inPhase.moves} | ${spreadGames(inPhase.perGame)} | ${spreadRange(inPhase.perGame, percent)} |`);
  }
  console.log('');
  console.error(`Written to ${written}`);
}

if (writesLosses) {
  const profile = JSON.parse(await readFile(flags['loss-profile']!, 'utf-8'));
  // The panel compares the browser's evaluations with this yardstick, so it
  // must have been measured at the depth the browser searches to.
  if (profile.depth !== ANALYSIS_DEPTH) {
    console.error(`The losses were measured at depth ${profile.depth}; analysis mode searches to depth ${ANALYSIS_DEPTH}.`);
    process.exit(1);
  }
  const camilleMoves = playedSince(readLossMoves(await readFile(flags.losses!, 'utf-8')), gameStarts, since);
  const yardstick = lossYardstick(camilleMoves);
  const games = new Set(camilleMoves.map((move) => move.game)).size;

  const record: ShippedLossYardstick = {
    measuredOn: measuredOn,
    engine: profile.engine,
    depth: profile.depth,
    losses: flags.losses!,
    games: games,
    moves: camilleMoves.length,
    movesForAVerdict: MOVES_FOR_A_VERDICT,
    ...yardstick,
  };
  if (since !== null) {
    record.since = since;
  }
  const written = flags.out ?? LOSS_YARDSTICK;
  await writeFile(written, JSON.stringify(record, null, 1) + '\n');

  console.log(`Camille's loss yardstick, ${profile.engine} at depth ${profile.depth}, ${camilleMoves.length} moves in ${games} games.`);
  console.log('');
  console.log('| Phase | Games with 8 open moves or more | Middle 80% of games, average loss |');
  console.log('|---|---|---|');
  for (const phase of PHASES) {
    const perGame = yardstick.phases[phase].perGame;
    console.log(`| ${PHASE_LABELS[phase]} | ${spreadGames(perGame)} | ${spreadRange(perGame, centipawns)} |`);
  }
  console.log('');
  console.log(`His profile, ${yardstick.profile.moves} moves in open positions:`);
  console.log('');
  console.log('| Lost at most | Share of his moves |');
  console.log('|---|---|');
  for (const [index, edge] of LOSS_PROFILE_EDGES.entries()) {
    console.log(`| ${edge} cp | ${percent(yardstick.profile.atMost[index])} |`);
  }
  console.log('');
  console.error(`Written to ${written}`);
}

/** Every move's loss as pipeline/extract_blunder_profile.py writes them, one JSON line each. */
function readLossMoves(jsonLines: string): LossMove[] {
  const moves: LossMove[] = [];
  for (const line of jsonLines.split('\n')) {
    if (line.trim() === '') {
      continue;
    }
    const record = JSON.parse(line);
    moves.push({
      game: record.game_id,
      phase: record.phase,
      centipawnLoss: record.centipawn_loss,
      openPosition: record.open_position,
    });
  }
  return moves;
}

function spreadGames(spread: { games: number } | null): string {
  if (spread === null) {
    return '0';
  }
  return `${spread.games}`;
}

function spreadRange(spread: { low: number; high: number } | null, format: (value: number) => string): string {
  if (spread === null) {
    return 'none';
  }
  return `${format(spread.low)} to ${format(spread.high)}`;
}

function percent(share: number): string {
  return `${(100 * share).toFixed(1)}%`;
}

function centipawns(value: number): string {
  return `${value.toFixed(0)} cp`;
}
