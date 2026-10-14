// Finds, in the game on the board, the Bot's moves and the reply the engine
// gave with each, which says why the move was played. The page keeps every
// reply by the position and the move, so a move taken back and played again
// is explained by the reply that put it on the board.
// Free of anything DOM.

import type { Colour } from '../board/starting-position';
import type { BotMove } from '../engine/move-selection';
import { currentFen, sideToMove, uciName, type Game, type MoveRequest } from '../game/game';
import { phaseOfPly, type Phase } from '../evaluation/move-matching';

/** One of the Bot's moves in the game on the board, with the reply that explains it. */
export interface ExplainedMove {
  /** The position the Bot moved from. */
  before: Game;
  ply: number;
  phase: Phase;
  /** The move in algebraic notation. */
  san: string;
  botMove: BotMove;
}

/** How the page files a reply: by the position the Bot was asked about and the move it gave. */
export function replyKey(fen: string, move: MoveRequest): string {
  return `${fen} ${uciName(move)}`;
}

/** The moves the Bot's side played in the game, oldest first, each with the reply recorded for it. */
export function botMovesOf(game: Game, botColour: Colour, replies: Map<string, BotMove>): ExplainedMove[] {
  const explained: ExplainedMove[] = [];
  // Walked from the last move back, so the ply counts down from the game's length.
  let ply = pliesPlayed(game);
  let moment = game;
  while (moment.previous !== undefined && moment.lastMove !== undefined) {
    const before = moment.previous;
    const reply = replies.get(replyKey(currentFen(before), moment.lastMove));
    if (sideToMove(before) === botColour && reply !== undefined) {
      explained.push({ before: before, ply: ply, phase: phaseOfPly(ply), san: moment.lastMoveSan!, botMove: reply });
    }
    moment = before;
    ply -= 1;
  }
  explained.reverse();
  return explained;
}

/** How many moves led to the position. */
function pliesPlayed(game: Game): number {
  let plies = 0;
  let moment = game;
  while (moment.previous !== undefined) {
    plies += 1;
    moment = moment.previous;
  }
  return plies;
}
