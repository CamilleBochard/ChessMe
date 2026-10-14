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
  return { centipawnLoss: centipawnLoss, openPosition: true };
}

function centipawnsOf(score: Score): number {
  if ('centipawns' in score) {
    return score.centipawns;
  }
  return 0;
}
