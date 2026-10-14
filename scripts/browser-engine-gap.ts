// How far the browser's engine reads Camille's losses from the Blunder
// Profile's engine, on the same moves:
//
//     npm run browser-engine-gap -- \
//       --reference data/dataset/centipawn-losses.jsonl --reference-profile data/dataset/blunder-profile.json \
//       --browser data/dataset/centipawn-losses-browser.jsonl --browser-profile data/dataset/blunder-profile-browser.json \
//       --record docs/experiments/results/browser-engine-gap.json
//
// Both loss files come from pipeline/extract_blunder_profile.py, one per
// engine, every one of his moves measured by each. Per Phase, over the moves
// each engine reads as made in an open position: the average loss, the
// shares of moves losing a pawn and three pawns or more, and the spread of
// his games' averages, which is the yardstick the panel shows. Then move by
// move, on the moves both read as open: how far apart the two losses are.

import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { lossYardstick, type LossMove } from '../src/explanation/yardsticks';
import { PHASE_LABELS, PHASES, type Phase } from '../src/evaluation/move-matching';

const { values: flags } = parseArgs({
  options: {
    reference: { type: 'string' },
    'reference-profile': { type: 'string' },
    browser: { type: 'string' },
    'browser-profile': { type: 'string' },
    record: { type: 'string' },
  },
});
if (
  flags.reference === undefined ||
  flags['reference-profile'] === undefined ||
  flags.browser === undefined ||
  flags['browser-profile'] === undefined
) {
  console.error(
    'Usage: npm run browser-engine-gap -- --reference <losses> --reference-profile <profile> --browser <losses> --browser-profile <profile> [--record <file>]',
  );
  process.exit(1);
}

/** One move's loss as the loss files hold it, keyed by its game and ply. */
interface MeasuredMove extends LossMove {
  key: string;
}

const referenceProfile = JSON.parse(await readFile(flags['reference-profile'], 'utf-8'));
const browserProfile = JSON.parse(await readFile(flags['browser-profile'], 'utf-8'));
const referenceName = `${referenceProfile.engine} at depth ${referenceProfile.depth}`;
const browserName = `${browserProfile.engine} at depth ${browserProfile.depth}`;
const referenceMoves = readMeasuredMoves(await readFile(flags.reference, 'utf-8'));
const browserMoves = readMeasuredMoves(await readFile(flags.browser, 'utf-8'));

// The two runs must have measured the same moves, or the gap would mix
// engines with samples.
const browserByKey = new Map(browserMoves.map((move) => [move.key, move]));
const sameMoves = referenceMoves.length === browserMoves.length && referenceMoves.every((move) => browserByKey.has(move.key));
if (!sameMoves) {
  console.error(`The two loss files do not hold the same moves (${referenceMoves.length} and ${browserMoves.length}).`);
  process.exit(1);
}

const referenceYardstick = lossYardstick(referenceMoves);
const browserYardstick = lossYardstick(browserMoves);

/** What each engine reads of a Phase, over the moves it reads as open. */
function summary(moves: MeasuredMove[], phase: Phase) {
  const open = moves.filter((move) => move.phase === phase && move.openPosition);
  const total = open.reduce((sum, move) => sum + move.centipawnLoss, 0);
  return {
    openMoves: open.length,
    averageLoss: total / open.length,
    shareLosingAPawn: open.filter((move) => move.centipawnLoss >= 100).length / open.length,
    shareLosingThreePawns: open.filter((move) => move.centipawnLoss >= 300).length / open.length,
  };
}

/** Move by move, on the moves both engines read as open. */
function agreement(phase: Phase) {
  let both = 0;
  let absoluteDifference = 0;
  let within10 = 0;
  let sameMistake = 0;
  let openForOneOnly = 0;
  for (const reference of referenceMoves) {
    if (reference.phase !== phase) {
      continue;
    }
    const browser = browserByKey.get(reference.key)!;
    if (reference.openPosition !== browser.openPosition) {
      openForOneOnly += 1;
      continue;
    }
    if (!reference.openPosition) {
      continue;
    }
    both += 1;
    const difference = Math.abs(browser.centipawnLoss - reference.centipawnLoss);
    absoluteDifference += difference;
    if (difference <= 10) {
      within10 += 1;
    }
    const referenceMistake = reference.centipawnLoss >= 100;
    const browserMistake = browser.centipawnLoss >= 100;
    if (referenceMistake === browserMistake) {
      sameMistake += 1;
    }
  }
  return {
    movesOpenForBoth: both,
    averageAbsoluteDifference: absoluteDifference / both,
    shareWithin10: within10 / both,
    shareSameOnLosingAPawn: sameMistake / both,
    movesOpenForOneOnly: openForOneOnly,
  };
}

const phases: Record<string, unknown> = {};
console.log(`Camille's ${referenceMoves.length} moves, read by ${referenceName} and by ${browserName}.`);
console.log('');
console.log(`| Phase | Engine | Open moves | Average loss | Losing 1 pawn or more | Losing 3 or more | Middle 80% of games |`);
console.log('|---|---|---|---|---|---|---|');
for (const phase of PHASES) {
  const reference = summary(referenceMoves, phase);
  const browser = summary(browserMoves, phase);
  const referenceSpread = referenceYardstick.phases[phase].perGame;
  const browserSpread = browserYardstick.phases[phase].perGame;
  console.log(`| ${PHASE_LABELS[phase]} | ${referenceName} | ${row(reference, referenceSpread)} |`);
  console.log(`| | ${browserName} | ${row(browser, browserSpread)} |`);
  phases[phase] = {
    reference: { ...reference, perGame: referenceSpread },
    browser: { ...browser, perGame: browserSpread },
    agreement: agreement(phase),
  };
}
console.log('');
console.log('| Phase | Moves open for both | Average difference | Within 10 cp | Same side of 1 pawn | Open for one engine only |');
console.log('|---|---|---|---|---|---|');
for (const phase of PHASES) {
  const moveByMove = agreement(phase);
  console.log(
    `| ${PHASE_LABELS[phase]} | ${moveByMove.movesOpenForBoth} | ${moveByMove.averageAbsoluteDifference.toFixed(1)} cp | ` +
      `${percent(moveByMove.shareWithin10)} | ${percent(moveByMove.shareSameOnLosingAPawn)} | ${moveByMove.movesOpenForOneOnly} |`,
  );
}

if (flags.record !== undefined) {
  const record = {
    measuredOn: new Date().toISOString().slice(0, 10),
    reference: referenceName,
    browser: browserName,
    moves: referenceMoves.length,
    phases: phases,
  };
  await writeFile(flags.record, JSON.stringify(record, null, 1) + '\n');
  console.error(`Recorded in ${flags.record}`);
}

function row(figures: ReturnType<typeof summary>, spread: { low: number; high: number } | null): string {
  let range = 'none';
  if (spread !== null) {
    range = `${spread.low.toFixed(0)} to ${spread.high.toFixed(0)} cp`;
  }
  return (
    `${figures.openMoves} | ${figures.averageLoss.toFixed(1)} cp | ${percent(figures.shareLosingAPawn)} | ` +
    `${percent(figures.shareLosingThreePawns)} | ${range}`
  );
}

function percent(share: number): string {
  return `${(100 * share).toFixed(1)}%`;
}

function readMeasuredMoves(jsonLines: string): MeasuredMove[] {
  const moves: MeasuredMove[] = [];
  for (const line of jsonLines.split('\n')) {
    if (line.trim() === '') {
      continue;
    }
    const record = JSON.parse(line);
    moves.push({
      key: `${record.game_id}#${record.ply}`,
      game: record.game_id,
      phase: record.phase,
      centipawnLoss: record.centipawn_loss,
      openPosition: record.open_position,
    });
  }
  return moves;
}
