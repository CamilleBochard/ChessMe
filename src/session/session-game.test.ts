// Tests for a Session Game: the visitor's actions and the Bot's replies around
// one game. The Bot is replaced by a scripted stand-in, so each test knows which
// reply comes and, when it matters, exactly when it arrives.

import { describe, expect, it } from 'vitest';
import type { BotMove, MoveSource } from '../engine/move-selection';
import { currentFen, moveList, type MoveRequest } from '../game/game';
import { gameStatus } from '../game/game-status';
import { createSessionGame, type FinishedGame } from './session-game';

/** A Bot that plays the given moves in order, whatever the position, all from the given source. */
function scriptedBot(replies: MoveRequest[], source: MoveSource = 'base-model'): (fen: string) => Promise<BotMove> {
  const remaining = [...replies];
  return async () => {
    const reply = remaining.shift();
    if (reply === undefined) {
      throw new Error('The scripted Bot ran out of replies');
    }
    return { move: reply, source: source };
  };
}

/**
 * A Bot whose reply waits until the test sends it, so the test can act while
 * the Bot is still choosing.
 */
function slowBot(): {
  chooseMove: (fen: string) => Promise<BotMove>;
  reply: (move: MoveRequest) => void;
} {
  let sendReply: (botMove: BotMove) => void = () => {
    throw new Error('The slow Bot has not been asked for a move yet');
  };
  const chooseMove = (): Promise<BotMove> => {
    return new Promise((resolve) => {
      sendReply = resolve;
    });
  };
  const reply = (move: MoveRequest): void => {
    sendReply({ move: move, source: 'base-model' });
  };
  return { chooseMove: chooseMove, reply: reply };
}

describe('createSessionGame', () => {
  it('lets the Bot open when the visitor takes Black', async () => {
    const session = createSessionGame({ chooseMove: scriptedBot([{ from: 'e2', to: 'e4' }]) });

    await session.start('black');

    expect(moveList(session.game())).toEqual([{ moveNumber: 1, white: 'e4', black: null }]);
  });

  it("answers the visitor's move with the Bot's reply", async () => {
    const session = createSessionGame({ chooseMove: scriptedBot([{ from: 'e7', to: 'e5' }]) });
    await session.start('white');

    const accepted = await session.playVisitorMove({ from: 'e2', to: 'e4' });

    expect(accepted).toBe(true);
    expect(moveList(session.game())).toEqual([{ moveNumber: 1, white: 'e4', black: 'e5' }]);
  });

  it('drops a Bot reply that arrives after the visitor resigned', async () => {
    const bot = slowBot();
    const session = createSessionGame({ chooseMove: bot.chooseMove });
    await session.start('white');

    const visitorMove = session.playVisitorMove({ from: 'e2', to: 'e4' });
    session.resign();
    bot.reply({ from: 'e7', to: 'e5' });
    await visitorMove;

    expect(gameStatus(session.game())).toEqual({ kind: 'resignation', winner: 'black' });
    expect(moveList(session.game())).toEqual([{ moveNumber: 1, white: 'e4', black: null }]);
  });

  it('drops a Bot reply that arrives after the visitor started a new game', async () => {
    const bot = slowBot();
    const session = createSessionGame({ chooseMove: bot.chooseMove });
    await session.start('white');

    const visitorMove = session.playVisitorMove({ from: 'e2', to: 'e4' });
    session.startOver();
    await session.start('white');
    bot.reply({ from: 'e7', to: 'e5' });
    await visitorMove;

    expect(moveList(session.game())).toEqual([]);
  });

  it("takes back the visitor's last move together with the Bot's reply", async () => {
    const session = createSessionGame({
      chooseMove: scriptedBot([
        { from: 'e7', to: 'e5' },
        { from: 'b8', to: 'c6' },
      ]),
    });
    await session.start('white');
    await session.playVisitorMove({ from: 'e2', to: 'e4' });
    await session.playVisitorMove({ from: 'g1', to: 'f3' });

    session.takeBack();

    expect(moveList(session.game())).toEqual([{ moveNumber: 1, white: 'e4', black: 'e5' }]);
  });

  it('ignores a takeback while the Bot is still choosing its reply', async () => {
    const bot = slowBot();
    const session = createSessionGame({ chooseMove: bot.chooseMove });
    await session.start('white');

    const visitorMove = session.playVisitorMove({ from: 'e2', to: 'e4' });
    session.takeBack();
    bot.reply({ from: 'e7', to: 'e5' });
    await visitorMove;

    expect(moveList(session.game())).toEqual([{ moveNumber: 1, white: 'e4', black: 'e5' }]);
  });

  it("refuses a move made for the Bot's side while the Bot is choosing", async () => {
    const bot = slowBot();
    const session = createSessionGame({ chooseMove: bot.chooseMove });
    await session.start('white');

    const visitorMove = session.playVisitorMove({ from: 'e2', to: 'e4' });
    const accepted = await session.playVisitorMove({ from: 'c7', to: 'c5' });
    bot.reply({ from: 'e7', to: 'e5' });
    await visitorMove;

    expect(accepted).toBe(false);
    expect(moveList(session.game())).toEqual([{ moveNumber: 1, white: 'e4', black: 'e5' }]);
  });

  it('offers a takeback only once the Bot has answered a move of the visitor', async () => {
    const bot = slowBot();
    const session = createSessionGame({ chooseMove: bot.chooseMove });
    await session.start('white');
    const beforeAnyMove = session.canTakeBack();

    const visitorMove = session.playVisitorMove({ from: 'e2', to: 'e4' });
    const whileBotChooses = session.canTakeBack();
    bot.reply({ from: 'e7', to: 'e5' });
    await visitorMove;
    const afterReply = session.canTakeBack();

    expect(beforeAnyMove).toBe(false);
    expect(whileBotChooses).toBe(false);
    expect(afterReply).toBe(true);
  });

  it('asks the visitor to choose a side until a game is started, and again after starting over', async () => {
    const session = createSessionGame({ chooseMove: scriptedBot([]) });
    const beforeStart = session.status();

    await session.start('white');
    const duringGame = session.status();
    session.startOver();
    const afterStartingOver = session.status();

    expect(beforeStart).toBe('Choose a side to start.');
    expect(duringGame).toBe('White to move: your turn.');
    expect(afterStartingOver).toBe('Choose a side to start.');
  });

  it('leaves the result of a finished game alone when the visitor tries to resign', async () => {
    // Fool's Mate: the Bot, playing Black, mates on its second move.
    const session = createSessionGame({
      chooseMove: scriptedBot([
        { from: 'e7', to: 'e5' },
        { from: 'd8', to: 'h4' },
      ]),
    });
    await session.start('white');
    await session.playVisitorMove({ from: 'f2', to: 'f3' });
    await session.playVisitorMove({ from: 'g2', to: 'g4' });

    const canResign = session.canResign();
    session.resign();

    expect(canResign).toBe(false);
    expect(gameStatus(session.game())).toEqual({ kind: 'checkmate', winner: 'black' });
  });

  it('refuses moves once the visitor has resigned', async () => {
    const session = createSessionGame({ chooseMove: scriptedBot([{ from: 'e7', to: 'e5' }]) });
    await session.start('white');
    session.resign();

    const accepted = await session.playVisitorMove({ from: 'e2', to: 'e4' });

    expect(accepted).toBe(false);
    expect(moveList(session.game())).toEqual([]);
  });

  it("tells the page about the visitor's move and again when the Bot's reply lands", async () => {
    const bot = slowBot();
    const seenMoveLists: unknown[] = [];
    const session = createSessionGame({
      chooseMove: bot.chooseMove,
      onChange: () => {
        seenMoveLists.push(moveList(session.game()));
      },
    });
    await session.start('white');
    seenMoveLists.length = 0;

    const visitorMove = session.playVisitorMove({ from: 'e2', to: 'e4' });
    bot.reply({ from: 'e7', to: 'e5' });
    await visitorMove;

    expect(seenMoveLists).toEqual([
      [{ moveNumber: 1, white: 'e4', black: null }],
      [{ moveNumber: 1, white: 'e4', black: 'e5' }],
    ]);
  });
});

describe('browsing earlier positions', () => {
  it('shows the position before the last move without changing the game', async () => {
    const session = createSessionGame({ chooseMove: scriptedBot([{ from: 'e7', to: 'e5' }]) });
    await session.start('white');
    await session.playVisitorMove({ from: 'e2', to: 'e4' });

    session.viewBack();

    expect(currentFen(session.viewedGame())).toBe('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');
    expect(moveList(session.game())).toEqual([{ moveNumber: 1, white: 'e4', black: 'e5' }]);
  });

  it('steps forward again up to the current position and no further', async () => {
    const session = createSessionGame({ chooseMove: scriptedBot([{ from: 'e7', to: 'e5' }]) });
    await session.start('white');
    await session.playVisitorMove({ from: 'e2', to: 'e4' });
    session.viewBack();
    session.viewBack();

    session.viewForward();
    session.viewForward();
    session.viewForward();

    expect(session.viewedGame()).toBe(session.game());
  });

  it('offers each arrow only when it leads somewhere', async () => {
    const session = createSessionGame({ chooseMove: scriptedBot([{ from: 'e7', to: 'e5' }]) });
    await session.start('white');
    await session.playVisitorMove({ from: 'e2', to: 'e4' });

    const atCurrent = [session.canViewBack(), session.canViewForward()];
    session.viewBack();
    const inBetween = [session.canViewBack(), session.canViewForward()];
    session.viewBack();
    const atStart = [session.canViewBack(), session.canViewForward()];

    expect(atCurrent).toEqual([true, false]);
    expect(inBetween).toEqual([true, true]);
    expect(atStart).toEqual([false, true]);
  });

  it("returns to the current position when the Bot's reply lands", async () => {
    const bot = slowBot();
    const session = createSessionGame({ chooseMove: bot.chooseMove });
    await session.start('white');

    const visitorMove = session.playVisitorMove({ from: 'e2', to: 'e4' });
    session.viewBack();
    bot.reply({ from: 'e7', to: 'e5' });
    await visitorMove;

    expect(session.viewedGame()).toBe(session.game());
  });

  it('tells the page each time the position on display changes', async () => {
    let changes = 0;
    const session = createSessionGame({
      chooseMove: scriptedBot([{ from: 'e7', to: 'e5' }]),
      onChange: () => {
        changes = changes + 1;
      },
    });
    await session.start('white');
    await session.playVisitorMove({ from: 'e2', to: 'e4' });
    changes = 0;

    session.viewBack();
    session.viewForward();

    expect(changes).toBe(2);
  });

  it('refuses a move while an earlier position is on display', async () => {
    const session = createSessionGame({ chooseMove: scriptedBot([{ from: 'e7', to: 'e5' }]) });
    await session.start('white');
    await session.playVisitorMove({ from: 'e2', to: 'e4' });
    session.viewBack();

    const accepted = await session.playVisitorMove({ from: 'g1', to: 'f3' });

    expect(accepted).toBe(false);
    expect(moveList(session.game())).toEqual([{ moveNumber: 1, white: 'e4', black: 'e5' }]);
  });
});

describe('the finished game', () => {
  /** A Bot that plays the given answers in order, each with its own source. */
  function botAnswering(answers: BotMove[]): (fen: string) => Promise<BotMove> {
    const remaining = [...answers];
    return async () => remaining.shift()!;
  }

  it("hands over every move once the game ends, the Bot's marked with where they came from", async () => {
    const finishedGames: FinishedGame[] = [];
    const session = createSessionGame({
      chooseMove: botAnswering([
        { move: { from: 'e7', to: 'e5' }, source: 'opening-book' },
        { move: { from: 'd8', to: 'h4' }, source: 'base-model' },
      ]),
      onGameEnd: (finished) => {
        finishedGames.push(finished);
      },
    });
    await session.start('white');

    await session.playVisitorMove({ from: 'f2', to: 'f3' });
    await session.playVisitorMove({ from: 'g2', to: 'g4' });

    expect(finishedGames).toEqual([
      {
        visitor: 'white',
        moves: [
          { move: { from: 'f2', to: 'f3' } },
          { move: { from: 'e7', to: 'e5' }, source: 'opening-book' },
          { move: { from: 'g2', to: 'g4' } },
          { move: { from: 'd8', to: 'h4' }, source: 'base-model' },
        ],
        visitorResigned: false,
      },
    ]);
  });

  it('hands over a resigned game as resigned, with the moves played until then', async () => {
    const finishedGames: FinishedGame[] = [];
    const session = createSessionGame({
      chooseMove: botAnswering([{ move: { from: 'e7', to: 'e5' }, source: 'opening-book' }]),
      onGameEnd: (finished) => {
        finishedGames.push(finished);
      },
    });
    await session.start('white');
    await session.playVisitorMove({ from: 'e2', to: 'e4' });

    session.resign();

    expect(finishedGames).toEqual([
      {
        visitor: 'white',
        moves: [{ move: { from: 'e2', to: 'e4' } }, { move: { from: 'e7', to: 'e5' }, source: 'opening-book' }],
        visitorResigned: true,
      },
    ]);
  });

  it('leaves out the moves taken back, and marks a Bot move played again with its new source', async () => {
    const finishedGames: FinishedGame[] = [];
    const session = createSessionGame({
      chooseMove: botAnswering([
        { move: { from: 'e7', to: 'e5' }, source: 'opening-book' },
        { move: { from: 'c7', to: 'c5' }, source: 'base-model' },
      ]),
      onGameEnd: (finished) => {
        finishedGames.push(finished);
      },
    });
    await session.start('white');
    await session.playVisitorMove({ from: 'f2', to: 'f3' });
    session.takeBack();
    await session.playVisitorMove({ from: 'e2', to: 'e4' });

    session.resign();

    expect(finishedGames[0].moves).toEqual([
      { move: { from: 'e2', to: 'e4' } },
      { move: { from: 'c7', to: 'c5' }, source: 'base-model' },
    ]);
  });
});
