// Checks whether the opening cut is served, by the rule in
// docs/experiments/model-choice-on-open-positions.md: on the Test Set, the
// cut must bring the Bot's share of opening moves under 1% closer to
// Camille's, and must not cost opening Move-Matching beyond two standard
// errors.
//
//     npm run opening-cut-check -- --cut top-k=10 \
//       --test data/dataset/move-probabilities/fine-tuned-test.jsonl \
//       --matching docs/experiments/results/opening-cut-test-set.json \
//       --record docs/experiments/results/opening-cut-check.json
//
// --test holds the records npm run move-probabilities wrote for the model
// chosen, on the Test Set. --matching is the record npm run compare-bots
// wrote for that model and temperature twice, the second Bot with the cut:
// its opening gain on the drawn move is the change the cut brings.

import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { cutName, readMoveCut } from '../src/engine/move-cut';
import { checkOpeningCut, readPlacedMoves } from '../src/evaluation/improbability';

const { values: flags } = parseArgs({
  options: {
    cut: { type: 'string' },
    test: { type: 'string' },
    matching: { type: 'string' },
    record: { type: 'string' },
  },
});
if (flags.cut === undefined || flags.test === undefined || flags.matching === undefined) {
  console.error('Usage: npm run opening-cut-check -- --cut <cut> --test <records> --matching <compare-bots record> [--record <file>]');
  process.exit(1);
}

const cut = readMoveCut(flags.cut);
const testSet = readPlacedMoves(await readFile(flags.test, 'utf-8'));
const comparison = JSON.parse(await readFile(flags.matching, 'utf-8'));

// The comparison must be the cut against no cut, all else equal, or its gain is not the cut's.
const first = comparison.first;
const second = comparison.second;
const sameBot = first.baseModel === second.baseModel && first.temperature === second.temperature;
const cutAgainstNone = first.openingCut.kind === 'none' && cutName(second.openingCut) === cutName(cut);
if (!sameBot || !cutAgainstNone) {
  console.error(`${flags.matching} does not compare one Bot without the cut and with ${cutName(cut)}.`);
  process.exit(1);
}

const openingGain = comparison.gain.drawn.byPhase.opening;
const matchingChange = {
  gain: openingGain.matched / openingGain.positions,
  standardError: openingGain.standardError,
};
const check = checkOpeningCut(testSet, cut, matchingChange);

const openingMoves = testSet.filter((move) => move.phase === 'opening').length;
console.log(`The opening cut ${cutName(cut)}, for ${second.baseModel} drawn at ${second.temperature}, on ${openingMoves} Test Set opening moves.`);
console.log('');
console.log('| Measure | Without the cut | With the cut | Change |');
console.log('|---|---|---|---|');
const gapWithoutCutCell = points(check.uncut.gap, check.uncut.standardError);
const gapWithCutCell = points(check.cut.gap, check.cut.standardError);
const shareChangeCell = points(check.shareChange.change, check.shareChange.standardError);
const matchingChangeCell = points(check.matchingChange.gain, check.matchingChange.standardError);
console.log(`| Bot's share under 1% minus Camille's, points | ${gapWithoutCutCell} | ${gapWithCutCell} | ${shareChangeCell} |`);
console.log(`| Opening Move-Matching, drawn, Opening Book in front | | | ${matchingChangeCell} |`);
console.log('');
console.log(`Closer to Camille: ${yesOrNo(check.closer)}. Move-Matching within two standard errors: ${yesOrNo(check.matchingHolds)}.`);
if (check.served) {
  console.log(`The cut passes: ${cutName(cut)} is served.`);
} else {
  console.log(`The cut does not pass: it is not served.`);
}

if (flags.record !== undefined) {
  const record = {
    measuredOn: new Date().toISOString().slice(0, 10),
    baseModel: second.baseModel,
    temperature: second.temperature,
    openingCut: { cut: cut, name: cutName(cut) },
    openingMoves: openingMoves,
    ...check,
  };
  await writeFile(flags.record, JSON.stringify(record, null, 1) + '\n');
  console.error(`Recorded in ${flags.record}`);
}

/** A share as signed percentage points, with one standard error. */
function points(share: number, standardError: number): string {
  let sign = '';
  if (share >= 0) {
    sign = '+';
  }
  return `${sign}${(100 * share).toFixed(2)} ± ${(100 * standardError).toFixed(2)}`;
}

function yesOrNo(value: boolean): string {
  if (value) {
    return 'yes';
  }
  return 'no';
}
