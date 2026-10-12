// Plays the Bot against an opponent under Node and writes the games, so that
// what the Bot plays (its Style Fingerprint, its evaluation losses) can be
// measured with no browser and no visitor.
//
//     npm run bot-games -- [--games 400] [--seed 13] [--temperature 0] [--opponent-rating 2000] [--baseline] [--out data/dataset/bot-games.jsonl]
//
// The Bot is the Move-Selection Engine with the Opening Book, then the served
// Base Model's move drawn at --temperature. The default, 0, is the top move:
// the Bot the Style Fingerprint and the Style Discriminator were measured on,
// so the recorded games can be played again exactly. The site draws at the
// served temperature; pass it to play the Bot as the site serves it. With
// --baseline the Opening Book is left out and the Baseline plays instead: the
// Base Model alone, against the same opponent, so that what the book changes
// can be measured on whole games. The opponent is the same Base Model at
// --opponent-rating, drawing each move at random from its probabilities, as a
// crowd of players at that rating would choose. Both sides' draws are seeded,
// each from a stream of its own, so a run can be replayed exactly and a Bot
// at temperature 0 meets the opponent the recorded games were played against.
//
// The default opponent rating is set so that the top-move Bot scores about
// half the points, as Camille does against his own opponents (484 wins, 36
// draws, 526 losses in the dataset). A drawing opponent at the Bot's own
// rating loses almost every game to the top move, and a Bot that is always
// winning would trade, attack and keep material as a winning player does
// rather than as Camille does. The trial runs that set the rating are in
// docs/experiments/style-fingerprint.md.
//
// The Bot plays White in even-numbered games and Black in odd-numbered ones.
// Each game is written as one JSON line: its id, the Bot's colour, every move
// in UCI form and how it ended. pipeline/extract_style_fingerprint.py reads
// the file.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { loadBaseModel } from '../src/engine/base-model';
import { readOpeningBook, type OpeningBook } from '../src/engine/opening-book';
import { SERVED_MODEL_RATING, SERVED_MODEL_SOURCE } from '../src/engine/served-model';
import { playGame, seededPlayers } from '../src/evaluation/bot-games';

const OPENING_BOOK = 'data/dataset/opening-book.json';

/** The opponent's rating at which the Bot scores about half the points. */
const BALANCED_OPPONENT_RATING = 2000;

const { values: flags } = parseArgs({
  options: {
    games: { type: 'string', default: '400' },
    seed: { type: 'string', default: '13' },
    temperature: { type: 'string', default: '0' },
    'opponent-rating': { type: 'string', default: String(BALANCED_OPPONENT_RATING) },
    baseline: { type: 'boolean', default: false },
    out: { type: 'string', default: 'data/dataset/bot-games.jsonl' },
  },
});
const gameCount = Number(flags.games);
const seed = Number(flags.seed);
const temperature = Number(flags.temperature);
const opponentRating = Number(flags['opponent-rating']);

const baseModel = await loadBaseModel(await readFile(SERVED_MODEL_SOURCE), { rating: SERVED_MODEL_RATING });
const opponentModel = await loadBaseModel(await readFile(SERVED_MODEL_SOURCE), { rating: opponentRating });
// Who plays: the Bot with its Opening Book, or the Baseline without one. The
// name labels the games and the summary.
let playerName = 'bot';
let openingBook: OpeningBook | undefined = undefined;
let drawDescription = `drawn at temperature ${temperature}`;
if (temperature === 0) {
  drawDescription = 'top move';
}
let playerDescription = `${OPENING_BOOK}, then ${SERVED_MODEL_SOURCE} at ${SERVED_MODEL_RATING}, ${drawDescription}`;
if (flags.baseline) {
  playerName = 'baseline';
  playerDescription = `${SERVED_MODEL_SOURCE} at ${SERVED_MODEL_RATING}, ${drawDescription}, no Opening Book`;
} else {
  openingBook = readOpeningBook(await readFile(OPENING_BOOK, 'utf-8'));
}
const { bot, opponent } = seededPlayers({
  bot: { openingBook: openingBook, baseModel: baseModel, temperature: temperature },
  opponentModel: opponentModel,
  seed: seed,
});

const lines: string[] = [];
const results = { win: 0, draw: 0, loss: 0 };
let totalPlies = 0;
const startedAt = performance.now();

for (let index = 0; index < gameCount; index++) {
  let botColour: 'white' | 'black' = 'white';
  if (index % 2 === 1) {
    botColour = 'black';
  }

  let game;
  if (botColour === 'white') {
    game = await playGame(bot, opponent);
  } else {
    game = await playGame(opponent, bot);
  }

  const record = { game_id: `${playerName}:${seed}-${index}`, bot_colour: botColour, moves: game.moves, ending: game.ending };
  lines.push(JSON.stringify(record));

  totalPlies += game.moves.length;
  if (game.ending.kind !== 'checkmate') {
    results.draw += 1;
  } else if (game.ending.winner === botColour) {
    results.win += 1;
  } else {
    results.loss += 1;
  }

  const minutes = (performance.now() - startedAt) / 60000;
  console.error(`${index + 1}/${gameCount} games, ${game.moves.length} plies, ${game.ending.kind}, ${minutes.toFixed(1)} min`);
}

await mkdir(dirname(flags.out), { recursive: true });
await writeFile(flags.out, lines.join('\n') + '\n');

console.log(`${playerName}: ${playerDescription}`);
console.log(`Opponent: ${SERVED_MODEL_SOURCE} at ${opponentRating}, drawn from its probabilities, seed ${seed}`);
console.log(`Games: ${gameCount}, ${playerName} ${results.win} won, ${results.draw} drawn, ${results.loss} lost`);
console.log(`Average length: ${(totalPlies / gameCount).toFixed(1)} plies`);
console.log(`Written to ${flags.out}`);
