// Records where each move played sits in the Base Model's distribution: its
// rank, its probability and the probability of every legal move in the
// position, most likely first.
//
//     npm run move-probabilities -- models/onnx/maia3-5m.onnx --rating 1100 data/dataset/train.jsonl --out data/dataset/move-probabilities/original-train.jsonl
//
// The positions are any file in the dataset's shape: Camille's training
// games, the Test Set, or the Bot's moves written by
// pipeline/export_bot_moves.py. The model runs under Node on
// onnxruntime-web with the engine's own encoding, so the probabilities are
// those the Bot draws from. Each move becomes one JSON line; progress goes to
// standard error. --extend keeps the records --out already holds and runs
// the model on the positions they do not name only, appending theirs: the
// refresh of Camille's games (pipeline/refresh_games.py) grows the records
// that way. Reading the records back (npm run improbability) never
// runs the model again.

import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { gameFromFen, uciName } from '../src/game/game';
import { loadBaseModel } from '../src/engine/base-model';
import { readPositions } from '../src/evaluation/move-matching';
import { positionsNotYetRecorded } from '../src/evaluation/move-records';

const POSITIONS_BETWEEN_PROGRESS_LINES = 1000;

const { values: flags, positionals } = parseArgs({
  options: {
    rating: { type: 'string' },
    out: { type: 'string' },
    extend: { type: 'boolean', default: false },
  },
  allowPositionals: true,
});
const [modelPath, positionsPath] = positionals;
if (modelPath === undefined || positionsPath === undefined || flags.out === undefined) {
  console.error('Usage: npm run move-probabilities -- <model.onnx> <positions.jsonl> --out <file> [--rating <rating>] [--extend]');
  process.exit(1);
}

let rating: number | undefined = undefined;
if (flags.rating !== undefined) {
  rating = Number(flags.rating);
}

const baseModel = await loadBaseModel(await readFile(modelPath), { rating: rating });
let positions = readPositions(await readFile(positionsPath, 'utf-8'));
const extending = flags.extend && existsSync(flags.out);
if (extending) {
  positions = positionsNotYetRecorded(positions, await readFile(flags.out, 'utf-8'));
}

console.error(`Placing ${positions.length} moves of ${positionsPath} in ${modelPath}'s distribution`);
const startedAt = performance.now();
const lines: string[] = [];
for (const position of positions) {
  const policy = await baseModel.movePolicy(gameFromFen(position.fen));
  const index = policy.findIndex((candidate) => uciName(candidate.move) === position.move);
  if (index === -1) {
    throw new Error(`${position.move} is not a legal move in ${position.fen} (${position.game}, ply ${position.ply})`);
  }

  const record = {
    game_id: position.game,
    ply: position.ply,
    phase: position.phase,
    fen: position.fen,
    move: position.move,
    rank: index + 1,
    probability: policy[index].probability,
    policy: policy.map((candidate) => candidate.probability),
  };
  lines.push(JSON.stringify(record));

  if (lines.length % POSITIONS_BETWEEN_PROGRESS_LINES === 0) {
    const seconds = (performance.now() - startedAt) / 1000;
    console.error(`${lines.length}/${positions.length} moves, ${seconds.toFixed(0)} s`);
  }
}

await mkdir(dirname(flags.out), { recursive: true });
const seconds = (performance.now() - startedAt) / 1000;
if (extending) {
  // Nothing new leaves the file exactly as it was.
  if (lines.length > 0) {
    await appendFile(flags.out, lines.join('\n') + '\n');
  }
  console.error(`Added ${lines.length} moves to ${flags.out} in ${seconds.toFixed(0)} s`);
} else {
  await writeFile(flags.out, lines.join('\n') + '\n');
  console.error(`Wrote ${lines.length} moves to ${flags.out} in ${seconds.toFixed(0)} s`);
}
