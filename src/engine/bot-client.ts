// The Bot as the page sees it: ask for a move in a position, receive it later.
// The work happens in a Web Worker on the other end of the port; this module
// only matches each reply to the request it answers.

import type { MoveRequest } from '../game/game';
import type { BotPort, BotStatus, ModelSource, PageMessage, WorkerMessage } from './bot-protocol';

export interface Bot {
  /** The Bot's move in the position the FEN describes. */
  requestMove(fen: string): Promise<MoveRequest>;
}

export interface BotListeners {
  /** Called each time the Bot's status changes, for the page to show. */
  onStatus?: (status: BotStatus) => void;
}

/** Starts the Bot behind the port loading the model, and returns a way to ask it for moves. */
export function connectBot(port: BotPort, model: ModelSource, listeners: BotListeners = {}): Bot {
  const waitingReplies = new Map<number, (move: MoveRequest) => void>();
  let nextRequestId = 1;

  port.onmessage = (event) => {
    const message = event.data as WorkerMessage;
    if (message.kind === 'move') {
      const resolve = waitingReplies.get(message.id);
      waitingReplies.delete(message.id);
      resolve?.(message.move);
      return;
    }
    listeners.onStatus?.(message);
  };

  send(port, { kind: 'start', model: model });

  return {
    requestMove: (fen) => {
      const id = nextRequestId;
      nextRequestId = nextRequestId + 1;
      return new Promise((resolve) => {
        waitingReplies.set(id, resolve);
        send(port, { kind: 'move', id: id, fen: fen });
      });
    },
  };
}

/** Posts a message, typed so the page can only send what the worker understands. */
function send(port: BotPort, message: PageMessage): void {
  port.postMessage(message);
}
