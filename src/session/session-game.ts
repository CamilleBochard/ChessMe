// A Session Game: one game between a visitor and the Bot, with everything that
// happens around the moves. The visitor picks a side, moves, takes back,
// resigns or starts over; the Bot replies through the Move-Selection Engine.
// Free of anything DOM so the rules of the session are tested under Node, and
// the board component only draws what this module says.

import type { Colour } from '../board/starting-position';
import {
  currentFen,
  newGame,
  playMove,
  resign,
  sideToMove,
  takeBack,
  type Game,
  type MoveRequest,
} from '../game/game';
import { describeTurn, gameStatus } from '../game/game-status';

/** How the Bot chooses its move: a position as FEN in, one move out. */
export type ChooseMove = (fen: string) => Promise<MoveRequest>;

export interface SessionGameOptions {
  chooseMove: ChooseMove;
  /**
   * Called after every change to the game, the visitor's side or the position
   * on display, including a Bot reply that lands on its own time, so the page
   * can redraw.
   */
  onChange?: () => void;
}

export interface SessionGame {
  /** The game as it stands now. */
  game(): Game;
  /** The visitor's side, or null while waiting for the visitor to pick one. */
  visitor(): Colour | null;
  /** The line shown under the board: whose turn it is, or how the game ended. */
  status(): string;
  /**
   * Starts a fresh game with the visitor on the given side. Resolves once the
   * Bot has played its opening move, if it has the first move.
   */
  start(visitor: Colour): Promise<void>;
  /**
   * Plays the visitor's move and then the Bot's reply, if the game goes on.
   * Resolves to false when the move is refused, which is the board's signal to
   * put the piece back.
   */
  playVisitorMove(move: MoveRequest): Promise<boolean>;
  /** True when takeBack would change something, for enabling its button. */
  canTakeBack(): boolean;
  /** Reverts the visitor's last move and the Bot's reply to it. */
  takeBack(): void;
  /** True while there is a game in progress the visitor could resign. */
  canResign(): boolean;
  /** Ends the game with the visitor resigning. A finished game keeps its result. */
  resign(): void;
  /** Goes back to the starting position, waiting for the visitor to pick a side. */
  startOver(): void;
  /**
   * The position on display. Usually the current one, but the visitor may
   * step back through the game to look at earlier positions. Looking never
   * changes the game itself.
   */
  viewedGame(): Game;
  /** True when there is an earlier position to show. */
  canViewBack(): boolean;
  /** Shows the position one move earlier than the one on display. */
  viewBack(): void;
  /** True while an earlier position is on display. */
  canViewForward(): boolean;
  /** Shows the position one move later, stopping at the current position. */
  viewForward(): void;
}

export function createSessionGame(options: SessionGameOptions): SessionGame {
  let game = newGame();
  let visitor: Colour | null = null;
  // How many moves before the current position the visitor is looking.
  // Zero means the current position.
  let stepsBack = 0;

  /**
   * The only place the game is replaced, so the page never misses a change.
   * Any change brings the view back to the current position: a visitor looking
   * at an earlier move should see the Bot's reply, a takeback or a new game.
   */
  function setGame(next: Game): void {
    game = next;
    stepsBack = 0;
    notifyPage();
  }

  function notifyPage(): void {
    if (options.onChange !== undefined) {
      options.onChange();
    }
  }

  function viewedGame(): Game {
    let viewed = game;
    for (let step = 0; step < stepsBack; step++) {
      viewed = viewed.previous!;
    }
    return viewed;
  }

  function canViewBack(): boolean {
    return viewedGame().previous !== undefined;
  }

  function canViewForward(): boolean {
    return stepsBack > 0;
  }

  /** True once the visitor has picked a side and until the game ends. */
  function isGameInProgress(): boolean {
    const isOngoing = gameStatus(game).kind === 'ongoing';
    return visitor !== null && isOngoing;
  }

  /** True from the visitor's move until the Bot's reply is on the board. */
  function isBotThinking(): boolean {
    const isBotsTurn = sideToMove(game) !== visitor;
    return isGameInProgress() && isBotsTurn;
  }

  /**
   * Where a takeback would lead, or null when there is nothing to take back.
   * Taking back waits for the Bot's reply, so the reply is taken back with the
   * move it answers instead of landing on the earlier position.
   */
  function gameBeforeVisitorsLastMove(): Game | null {
    if (visitor === null || isBotThinking()) {
      return null;
    }
    return takeBack(game, visitor);
  }

  async function playBotMove(): Promise<void> {
    const askedAbout = game;
    const reply = await options.chooseMove(currentFen(askedAbout));

    // While the Bot was choosing, the visitor may have resigned or started
    // over. The reply answers a game that is gone.
    if (game !== askedAbout) {
      return;
    }

    const next = playMove(game, reply);
    if (next === null) {
      throw new Error(`The Bot chose an illegal move: ${reply.from}-${reply.to} in ${currentFen(game)}`);
    }
    setGame(next);
  }

  return {
    game: () => game,

    visitor: () => visitor,

    status(): string {
      if (visitor === null) {
        return 'Choose a side to start.';
      }
      return describeTurn(game, visitor);
    },

    async start(side: Colour): Promise<void> {
      visitor = side;
      setGame(newGame());

      if (sideToMove(game) !== visitor) {
        await playBotMove();
      }
    },

    async playVisitorMove(move: MoveRequest): Promise<boolean> {
      // A legal move is not enough. It must also be the visitor's own turn,
      // or the visitor could move the Bot's pieces while it is choosing; the
      // game must still be going, since the position does not show a
      // resignation; and the current position must be the one on display,
      // or the move would land somewhere other than where it was made.
      const isVisitorsTurn = sideToMove(game) === visitor;
      const isViewingCurrent = stepsBack === 0;
      if (!isGameInProgress() || !isVisitorsTurn || !isViewingCurrent) {
        return false;
      }

      const next = playMove(game, move);
      if (next === null) {
        return false;
      }
      setGame(next);

      if (gameStatus(game).kind === 'ongoing') {
        await playBotMove();
      }
      return true;
    },

    canTakeBack(): boolean {
      return gameBeforeVisitorsLastMove() !== null;
    },

    takeBack(): void {
      const earlier = gameBeforeVisitorsLastMove();
      if (earlier === null) {
        return;
      }
      setGame(earlier);
    },

    canResign: isGameInProgress,

    resign(): void {
      if (visitor === null || !isGameInProgress()) {
        return;
      }
      setGame(resign(game, visitor));
    },

    viewedGame: viewedGame,

    canViewBack: canViewBack,

    viewBack(): void {
      if (!canViewBack()) {
        return;
      }
      stepsBack = stepsBack + 1;
      notifyPage();
    },

    canViewForward: canViewForward,

    viewForward(): void {
      if (!canViewForward()) {
        return;
      }
      stepsBack = stepsBack - 1;
      notifyPage();
    },

    startOver(): void {
      visitor = null;
      setGame(newGame());
    },
  };
}
