// Plays the Bot against an opponent under Node and writes the games, so that
// the Style Fingerprint can be measured on games the Bot played, with no
// browser and no visitor.
//
//     npm run bot-games -- [--games 400] [--seed 13] [--opponent-rating 2000] [--out data/dataset/bot-games.jsonl]
//
// The Bot is the Move-Selection Engine as the site serves it: the Opening Book,
// then the served Base Model's top move. The Bot plays the same move every time
// it meets a position, so the variety has to come from its opponent: the same
// Base Model, drawing each move at random from its probabilities, as a crowd of
// players at its rating would choose. The draws are seeded, so a run can be
// replayed exactly.
//
// The opponent's rating is set so that the Bot scores about half the points,
// as Camille does against his own opponents (484 wins, 36 draws, 526 losses in
// the dataset). A drawing opponent at the Bot's own rating loses almost every
// game, because the top move is stronger than a draw at the same rating, and a
// Bot that is always winning would trade, attack and keep material as a
// winning player does rather than as Camille does. In trial runs the Bot
// scored 62% against 1900 and 39% against 2100, hence 2000.
//
// The Bot plays White in even-numbered games and Black in odd-numbered ones.
// Each game is written as one JSON line: its id, the Bot's colour, every move
// in UCI form and how it ended. pipeline/extract_style_fingerprint.py reads
// the file.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { loadBaseModel } from '../src/engine/base-model';
import { selectMove } from '../src/engine/move-selection';
import { readOpeningBook } from '../src/engine/opening-book';
import { SERVED_MODEL_RATING, SERVED_MODEL_SOURCE } from '../src/engine/served-model';
import { drawMove, playGame, type Player } from '../src/evaluation/bot-games';
import { seededRandom } from '../src/evaluation/seeded-random';
import { gameFromFen } from '../src/game/game';

const OPENING_BOOK = 'data/dataset/opening-book.json';

/** The opponent's rating at which the Bot scores about half the points. */
const BALANCED_OPPONENT_RATING = 2000;

const { values: flags } = parseArgs({
  options: {
    games: { type: 'string', default: '400' },
    seed: { type: 'string', default: '13' },
    'opponent-rating': { type: 'string', default: String(BALANCED_OPPONENT_RATING) },
    out: { type: 'string', default: 'data/dataset/bot-games.jsonl' },
  },
});
const gameCount = Number(flags.games);
const seed = Number(flags.seed);
const opponentRating = Number(flags['opponent-rating']);

const baseModel = await loadBaseModel(await readFile(SERVED_MODEL_SOURCE), { rating: SERVED_MODEL_RATING });
const opponentModel = await loadBaseModel(await readFile(SERVED_MODEL_SOURCE), { rating: opponentRating });
const openingBook = readOpeningBook(await readFile(OPENING_BOOK, 'utf-8'));
const random = seededRandom(seed);

const bot: Player = (fen) => selectMove(fen, { openingBook, baseModel });
const opponent: Player = async (fen) => {
  const policy = await opponentModel.movePolicy(gameFromFen(fen));
  return drawMove(policy, random);
};

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

  const record = { game_id: `bot:${seed}-${index}`, bot_colour: botColour, moves: game.moves, ending: game.ending };
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

console.log(`Bot: ${OPENING_BOOK}, then ${SERVED_MODEL_SOURCE} at ${SERVED_MODEL_RATING}, top move`);
console.log(`Opponent: ${SERVED_MODEL_SOURCE} at ${opponentRating}, drawn from its probabilities, seed ${seed}`);
console.log(`Games: ${gameCount}, Bot ${results.win} won, ${results.draw} drawn, ${results.loss} lost`);
console.log(`Average length: ${(totalPlies / gameCount).toFixed(1)} plies`);
console.log(`Written to ${flags.out}`);
