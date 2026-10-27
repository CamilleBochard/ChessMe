// The monthly refresh's regression gate: reads the record npm run
// compare-bots wrote for the served Bot (first) and the same Bot with the
// refreshed Opening Book (second), and fails when the second matches Camille's
// drawn moves on the Test Set less often by more than two standard errors of
// the change.
//
//     npm run regression-gate -- --matching <compare-bots record> [--record <verdict.json>]
//
// The two Bots must differ by their book alone, or the change is not the
// book's. Exits with 1 when the gate fails.

import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { regressionGate } from '../src/evaluation/regression-gate';

const { values: flags } = parseArgs({
  options: {
    matching: { type: 'string' },
    record: { type: 'string' },
  },
});
if (flags.matching === undefined) {
  console.error('Usage: npm run regression-gate -- --matching <compare-bots record> [--record <file>]');
  process.exit(1);
}

const comparison = JSON.parse(await readFile(flags.matching, 'utf-8'));
const first = comparison.first;
const second = comparison.second;
const sameBot =
  first.baseModel === second.baseModel &&
  first.temperature === second.temperature &&
  JSON.stringify(first.openingCut) === JSON.stringify(second.openingCut);
if (!sameBot) {
  console.error('The two Bots differ by more than their Opening Book: the change would not be the book\'s.');
  process.exit(1);
}

const verdict = regressionGate(comparison.gain.drawn.overall);
const points = (share: number) => `${(100 * share).toFixed(2)} points`;
console.log(`Served book: ${first.openingBook}; new book: ${second.openingBook}`);
console.log(`Drawn Move-Matching on the Test Set: ${points(first.drawn.overall.matched / first.drawn.overall.positions)} -> ${points(second.drawn.overall.matched / second.drawn.overall.positions)}`);
console.log(`Change ${points(verdict.change)} ± ${points(verdict.standardError)}; the gate refuses a fall below ${points(verdict.limit)}`);
console.log(verdict.passes ? 'Passes.' : 'FAILS: the new Opening Book costs more Move-Matching than chance allows.');

if (flags.record !== undefined) {
  await writeFile(flags.record, JSON.stringify({ ...verdict, matching: flags.matching }, null, 1) + '\n');
}
if (!verdict.passes) {
  process.exit(1);
}
