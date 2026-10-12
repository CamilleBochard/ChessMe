// Plays the Bot's games under Node, with no browser and no visitor, so that the
// Style Fingerprint can be measured on games the Bot played. The Bot is the
// Move-Selection Engine as the page runs it; its opponent is the caller's
// choice.
// Free of anything DOM or Node, so the same code could run wherever the engine
// does; writing the games out is left to the caller.

import { currentFen, newGame, playMove, sideToMove, uciName, type MoveRequest } from '../game/game';
import { gameStatus, type GameStatus } from '../game/game-status';

/** One side of a game: given the position as FEN, the move it plays there. */
export type Player = (fen: string) => Promise<MoveRequest>;

/** How a finished game ended. */
export type GameEnding = Exclude<GameStatus, { kind: 'ongoing' }>;

/** A game played from the starting position to its end. */
export interface PlayedGame {
  /** Every move of the game in order, in UCI form such as e2e4 or e7e8q. */
  moves: string[];
  ending: GameEnding;
}

/**
 * Plays a game from the starting position, asking each side for its move in
 * turn, until the rules end it. Throws if a player answers an illegal move,
 * since that is a bug in the player rather than a way for a game to end.
 */
export async function playGame(white: Player, black: Player): Promise<PlayedGame> {
  let game = newGame();
  const moves: string[] = [];

  let status = gameStatus(game);
  while (status.kind === 'ongoing') {
    let player = white;
    if (sideToMove(game) === 'black') {
      player = black;
    }

    const fen = currentFen(game);
    const move = await player(fen);
    const next = playMove(game, move);
    if (next === null) {
      throw new Error(`Illegal move ${uciName(move)} in ${fen}`);
    }

    game = next;
    moves.push(uciName(move));
    status = gameStatus(game);
  }
  return { moves: moves, ending: status };
}
