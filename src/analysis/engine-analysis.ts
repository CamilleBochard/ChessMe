// Analysis mode's measure of one move: Stockfish searches the position for
// the best move, then the played move alone, and the move's loss is how far
// the second score falls below the first. It is the Blunder Profile's
// measure (pipeline/blunder_profile.py and pipeline/stockfish_analysis.py),
// rebuilt here so that the browser evaluates the Bot's moves exactly as
// Camille's were evaluated for the yardstick.
// Free of anything DOM: the engine is reached through a port, a Web Worker on
// the page and a child process under Node.

/** A score from the point of view of the side to move. */
export type Score = { centipawns: number } | { mateIn: number };

/** How the best move and the played move score, from the side that moved. */
export interface Analysis {
  best: Score;
  played: Score;
}

/** What the Blunder Profile records of a move. */
export interface MoveLoss {
  /** How much evaluation the move gave up against the best move, in centipawns. */
  centipawnLoss: number;
  /** False once both moves score ten pawns or more for the same side, where the cap reads every move as losing nothing. */
  openPosition: boolean;
}

/** The loss of the played move against the best one. */
export function moveLoss(analysis: Analysis): MoveLoss {
  const best = centipawnsOf(analysis.best);
  const played = centipawnsOf(analysis.played);
  // The played move is searched on its own, so its score can come out a
  // little above the best move's; it still lost nothing.
  let centipawnLoss = best - played;
  if (centipawnLoss < 0) {
    centipawnLoss = 0;
  }
  const bothWinning = best === EVALUATION_CAP && played === EVALUATION_CAP;
  const bothLosing = best === -EVALUATION_CAP && played === -EVALUATION_CAP;
  const decided = bothWinning || bothLosing;
  return { centipawnLoss: centipawnLoss, openPosition: !decided };
}

/**
 * Beyond ten pawns a position is decided either way, and a mate has no
 * centipawn value of its own: both are read as this many centipawns, as the
 * Blunder Profile reads them. Without the cap, dropping from +25 to +15 in a
 * won position would count as a ten-pawn blunder.
 */
export const EVALUATION_CAP = 1000;

/** The score in centipawns, held within the cap. A mate given counts as the cap, a mate taken as minus the cap. */
function centipawnsOf(score: Score): number {
  if ('mateIn' in score) {
    // Mate in 0 is the side to move already mated, as python-chess reads it.
    if (score.mateIn > 0) {
      return EVALUATION_CAP;
    }
    return -EVALUATION_CAP;
  }
  if (score.centipawns > EVALUATION_CAP) {
    return EVALUATION_CAP;
  }
  if (score.centipawns < -EVALUATION_CAP) {
    return -EVALUATION_CAP;
  }
  return score.centipawns;
}

/** One end of a line-by-line conversation with a UCI engine. */
export interface EnginePort {
  send(command: string): void;
  /** Sets the listener each line the engine writes is handed to. */
  onLine(listener: (line: string) => void): void;
}

/** The best move in a position, in UCI form, and how it and the played move score. */
export interface MoveAnalysis extends Analysis {
  bestMove: string;
}

/** Analyses moves through one engine at a fixed depth. */
export interface Analyser {
  /** The best move in the position the FEN describes, and how it and the move given, in UCI form, score. */
  analyse(fen: string, move: string): Promise<MoveAnalysis>;
}

/** A conversation still waiting for the line that ends it, with the lines received so far. */
interface Exchange {
  isLast(line: string): boolean;
  lines: string[];
  finish(lines: string[]): void;
}

/**
 * Talks to the engine as pipeline/stockfish_analysis.py does through
 * python-chess: a new game, which clears the hash, before each position;
 * a search of the whole position at the depth given; then, unless the played
 * move is the best one, a search restricted to it.
 */
export function connectAnalyser(port: EnginePort, depth: number): Analyser {
  let waiting: Exchange | undefined = undefined;

  port.onLine((line) => {
    if (waiting === undefined) {
      return;
    }
    waiting.lines.push(line);
    if (waiting.isLast(line)) {
      const finished = waiting;
      waiting = undefined;
      finished.finish(finished.lines);
    }
  });

  /** Sends the commands and resolves with the engine's lines up to and including the one that ends its answer. */
  function exchange(commands: string[], isLast: (line: string) => boolean): Promise<string[]> {
    const answer = new Promise<string[]>((resolve) => {
      waiting = { isLast: isLast, lines: [], finish: resolve };
    });
    for (const command of commands) {
      port.send(command);
    }
    return answer;
  }

  /** A search of the position, of every move or of the one move given. */
  async function search(fen: string, onlyMove?: string): Promise<{ bestMove: string; score: Score }> {
    let go = `go depth ${depth}`;
    if (onlyMove !== undefined) {
      go = `${go} searchmoves ${onlyMove}`;
    }
    const lines = await exchange([`position fen ${fen}`, go], (line) => line.startsWith('bestmove'));
    const bestMoveLine = lines[lines.length - 1];
    const bestMove = bestMoveLine.split(' ')[1];
    return { bestMove: bestMove, score: lastScore(lines) };
  }

  async function analyseNow(fen: string, move: string): Promise<MoveAnalysis> {
    await exchange(['ucinewgame', 'isready'], (line) => line === 'readyok');
    const best = await search(fen);
    if (best.bestMove === move) {
      return { bestMove: best.bestMove, best: best.score, played: best.score };
    }
    const played = await search(fen, move);
    return { bestMove: best.bestMove, best: best.score, played: played.score };
  }

  // The engine holds one conversation at a time, so each analysis waits for
  // the one before it, starting with the engine's own introduction.
  let previous: Promise<unknown> = exchange(['uci'], (line) => line === 'uciok');

  return {
    analyse: (fen, move) => {
      const analysis = previous.then(() => analyseNow(fen, move));
      // A failed analysis must not stop the ones queued after it.
      previous = analysis.catch(() => {});
      return analysis;
    },
  };
}

/**
 * The score of the deepest search the lines report: the last info line with
 * a score, as python-chess keeps the latest one it reads.
 */
function lastScore(lines: string[]): Score {
  for (let index = lines.length - 1; index >= 0; index--) {
    const words = lines[index].split(' ');
    const scoreAt = words.indexOf('score');
    if (words[0] !== 'info' || scoreAt === -1) {
      continue;
    }
    const kind = words[scoreAt + 1];
    const value = Number(words[scoreAt + 2]);
    if (kind === 'mate') {
      return { mateIn: value };
    }
    return { centipawns: value };
  }
  throw new Error('The engine finished its search without giving a score');
}
