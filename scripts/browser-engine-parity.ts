// Checks that analysis mode's conversation with Stockfish gives the scores
// the pipeline cached for the same moves, so the Bot's losses in the browser
// and Camille's yardstick are one computation:
//
//     npm run browser-engine-parity -- --cache data/analysis/stockfish-19-lite-wasm-depth-14.jsonl --sample 300
//
// It drives the browser's build of Stockfish under Node (scripts/stockfish-lite.sh)
// through src/analysis/engine-analysis.ts, the code the page runs, and
// compares each analysis with the cached one: best move, best score, played
// score. A sample of the cache, drawn with a fixed seed, is enough: any
// difference in the conversation would show on most moves.

import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';
import { connectAnalyser, type EnginePort, type Score } from '../src/analysis/engine-analysis';
import { ANALYSIS_DEPTH } from '../src/analysis/browser-engine';
import { seededRandom } from '../src/evaluation/seeded-random';

const SEED = 13;

const { values: flags } = parseArgs({
  options: {
    cache: { type: 'string' },
    sample: { type: 'string', default: '300' },
  },
});
if (flags.cache === undefined) {
  console.error('Usage: npm run browser-engine-parity -- --cache <analysis cache> [--sample <moves>]');
  process.exit(1);
}

/** A cached analysis as pipeline/stockfish_analysis.py writes it. */
interface CachedAnalysis {
  fen: string;
  move: string;
  engine: string;
  depth: number;
  best_move: string;
  best: { cp: number } | { mate: number };
  played: { cp: number } | { mate: number };
}

const cached = (await readFile(flags.cache, 'utf-8'))
  .split('\n')
  .filter((line) => line !== '')
  .map((line) => JSON.parse(line) as CachedAnalysis)
  .filter((analysis) => analysis.depth === ANALYSIS_DEPTH);
const sample = drawSample(cached, Number(flags.sample));

const stockfish = spawn('scripts/stockfish-lite.sh', [], { stdio: ['pipe', 'pipe', 'inherit'] });
const lines = createInterface({ input: stockfish.stdout });
const port: EnginePort = {
  send: (command) => {
    stockfish.stdin.write(command + '\n');
  },
  onLine: (listener) => {
    lines.on('line', listener);
  },
};
const analyser = connectAnalyser(port, ANALYSIS_DEPTH);

let identical = 0;
for (const expected of sample) {
  const analysis = await analyser.analyse(expected.fen, expected.move);
  const sameBestMove = analysis.bestMove === expected.best_move;
  const sameBest = sameScore(analysis.best, expected.best);
  const samePlayed = sameScore(analysis.played, expected.played);
  if (sameBestMove && sameBest && samePlayed) {
    identical += 1;
  } else {
    console.log(`Different: ${expected.fen} ${expected.move}: ${JSON.stringify(analysis)} against ${JSON.stringify(expected)}`);
  }
}
stockfish.stdin.end('quit\n');

console.log(`${identical}/${sample.length} analyses identical to the pipeline's, with ${sample[0]?.engine} at depth ${ANALYSIS_DEPTH}`);
if (identical !== sample.length) {
  process.exitCode = 1;
}

function sameScore(score: Score, cachedScore: CachedAnalysis['best']): boolean {
  if ('mate' in cachedScore) {
    return 'mateIn' in score && score.mateIn === cachedScore.mate;
  }
  return 'centipawns' in score && score.centipawns === cachedScore.cp;
}

/** A fixed sample of the analyses, without repeats. */
function drawSample(analyses: CachedAnalysis[], size: number): CachedAnalysis[] {
  const random = seededRandom(SEED);
  const remaining = [...analyses];
  const drawn: CachedAnalysis[] = [];
  while (drawn.length < size && remaining.length > 0) {
    const index = Math.floor(random() * remaining.length);
    drawn.push(remaining[index]);
    remaining.splice(index, 1);
  }
  return drawn;
}
