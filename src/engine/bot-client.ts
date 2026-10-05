// The Bot as the page sees it: ask for a move in a position, receive it later.
// The work happens in a Web Worker on the other end of the port; this module
// only matches each reply to the request it answers.

import type { BotPort, BotStatus, ModelSource, PageMessage, WorkerMessage } from './bot-protocol';
import type { BotMove } from './move-selection';

export interface Bot {
  /** The Bot's move in the position the FEN describes, and where it came from. */
  requestMove(fen: string): Promise<BotMove>;
}

export interface BotListeners {
  /** Called each time the Bot's status changes, for the page to show. */
  onStatus?: (status: BotStatus) => void;
}

/** Starts the Bot behind the port loading the model, and returns a way to ask it for moves. */
export function connectBot(port: BotPort, model: ModelSource, listeners: BotListeners = {}): Bot {
  const waitingReplies = new Map<number, WaitingReply>();
  let nextRequestId = 1;

  port.onmessage = (event) => {
    const message = event.data as WorkerMessage;
    if (message.kind === 'move') {
      takeWaitingReply(message.id)?.resolve(message.botMove);
      return;
    }
    if (message.kind === 'no-move') {
      takeWaitingReply(message.id)?.reject(new Error(message.reason));
      return;
    }
    listeners.onStatus?.(message);
  };

  /** The request a reply answers, which is no longer waiting once answered. */
  function takeWaitingReply(id: number): WaitingReply | undefined {
    const reply = waitingReplies.get(id);
    waitingReplies.delete(id);
    return reply;
  }

  send(port, { kind: 'start', model: model });

  return {
    requestMove: (fen) => {
      const id = nextRequestId;
      nextRequestId = nextRequestId + 1;
      return new Promise((resolve, reject) => {
        waitingReplies.set(id, { resolve: resolve, reject: reject });
        send(port, { kind: 'move', id: id, fen: fen });
      });
    },
  };
}

/** How to settle the promise of a request still waiting for its reply. */
interface WaitingReply {
  resolve(botMove: BotMove): void;
  reject(error: Error): void;
}

/** Posts a message, typed so the page can only send what the worker understands. */
function send(port: BotPort, message: PageMessage): void {
  port.postMessage(message);
}
