// Per Phase, the share of moves one Base Model gives less than 1%, 2% and 5%,
// for Camille and for Bots, all read on that one model's scale.
//
//     npm run improbable-moves -- \
//       --camille data/dataset/move-probabilities/original-test.jsonl \
//       --bot original=data/dataset/move-probabilities/original-bot.jsonl \
//       --bot fine-tuned=data/dataset/move-probabilities/original-on-fine-tuned-bot-at-1.jsonl \
//       --record docs/experiments/results/improbable-moves.json
//
// The records come from npm run move-probabilities, every file scored by the
// same model, so a Bot playing another model is measured on the scale of the
// model the comparison is about. A Bot's moves from the Opening Book are left
// out: they are Camille's own replies, and no cut or model plays them.

import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { readOpeningBook } from '../src/engine/opening-book';
import { gameFromFen } from '../src/game/game';
import { IMPROBABILITY_THRESHOLDS, improbabilityProfile, readPlacedMoves } from '../src/evaluation/improbability';
import { PHASE_LABELS, PHASES } from '../src/evaluation/move-matching';

const OPENING_BOOK = 'data/dataset/opening-book.json';

const { values: flags } = parseArgs({
  options: {
    camille: { type: 'string' },
    bot: { type: 'string', multiple: true },
    record: { type: 'string' },
  },
});
if (flags.camille === undefined || flags.bot === undefined) {
  console.error('Usage: npm run improbable-moves -- --camille <records> --bot <name>=<records> [--bot <name>=<records>] [--record <file>]');
  process.exit(1);
}

const openingBook = readOpeningBook(await readFile(OPENING_BOOK, 'utf-8'));
const profiles: Record<string, ReturnType<typeof improbabilityProfile>> = {};
profiles['Camille'] = improbabilityProfile(readPlacedMoves(await readFile(flags.camille, 'utf-8')));
for (const argument of flags.bot) {
  const [name, path] = argument.split('=');
  const botMoves = readPlacedMoves(await readFile(path, 'utf-8'));
  const fromModel = botMoves.filter((move) => openingBook.move(gameFromFen(move.fen)) === undefined);
  profiles[name] = improbabilityProfile(fromModel);
}

for (const phase of PHASES) {
  console.log(PHASE_LABELS[phase]);
  console.log('');
  const thresholds = IMPROBABILITY_THRESHOLDS.map((threshold) => `Under ${100 * threshold}%`);
  console.log(`| Player | Moves | ${thresholds.join(' | ')} |`);
  const separators = thresholds.map(() => '---');
  console.log(`|---|---|${separators.join('|')}|`);
  for (const [name, profile] of Object.entries(profiles)) {
    const shares = profile[phase].below.map((share) => `${(100 * share).toFixed(2)}%`);
    console.log(`| ${name} | ${profile[phase].moves.toLocaleString('en-GB')} | ${shares.join(' | ')} |`);
  }
  console.log('');
}

if (flags.record !== undefined) {
  const record = { measuredOn: new Date().toISOString().slice(0, 10), thresholds: IMPROBABILITY_THRESHOLDS, profiles: profiles };
  await writeFile(flags.record, JSON.stringify(record, null, 1) + '\n');
  console.error(`Recorded in ${flags.record}`);
}
