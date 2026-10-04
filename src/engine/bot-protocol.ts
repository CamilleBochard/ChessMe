// The messages the page and the Bot's Web Worker exchange. The two share no
// memory: everything passes as one of these messages, copied from one thread
// to the other.

import type { MoveRequest } from '../game/game';

/** Where the Base Model comes from and how it plays. */
export interface ModelSource {
  url: string;
  /** The file's size once decompressed, for the download's progress. */
  fileBytes: number | undefined;
  /** The rating the Base Model plays at. */
  rating: number;
}

/** What the page asks of the worker. */
export type PageMessage =
  | { kind: 'start'; model: ModelSource }
  | { kind: 'move'; id: number; fen: string };

/** What the worker tells the page. */
export type WorkerMessage = { kind: 'move'; id: number; move: MoveRequest };

/**
 * One end of the channel between the page and the worker. A Worker on the
 * page's side and the worker's global scope on the other both have this shape,
 * and so does a MessagePort, which the tests use.
 */
export interface BotPort {
  postMessage(message: unknown): void;
  onmessage: ((event: MessageEvent) => void) | null;
}
