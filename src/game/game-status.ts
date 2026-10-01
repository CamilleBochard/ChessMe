// Whether a game is still going and, if not, how it ended. chessops detects
// checkmate, stalemate and insufficient material on a single position; the
// fifty-move rule and threefold repetition depend on the game's history, so
// this module is where those two are decided.

import type { Colour } from '../board/starting-position';
import type { Game } from './game';

/** Every way a game can stand. Only checkmate has a winner. */
export type GameStatus =
  | { kind: 'ongoing' }
  | { kind: 'checkmate'; winner: Colour }
  | { kind: 'stalemate' }
  | { kind: 'insufficient-material' }
  | { kind: 'fifty-move-rule' }
  | { kind: 'threefold-repetition' };

/**
 * How the game stands right now. The draw rules end the game automatically
 * rather than waiting for a player to claim them: there is no claim button.
 */
export function gameStatus(game: Game): GameStatus {
  const position = game.position;

  if (position.isCheckmate()) {
    // The side to move is the side that has been mated.
    let winner: Colour = 'white';
    if (position.turn === 'white') {
      winner = 'black';
    }
    return { kind: 'checkmate', winner: winner };
  }

  if (position.isStalemate()) {
    return { kind: 'stalemate' };
  }

  if (position.isInsufficientMaterial()) {
    return { kind: 'insufficient-material' };
  }

  return { kind: 'ongoing' };
}
