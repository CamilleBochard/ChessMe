// The Bot's side of the Web Worker: it fetches the Base Model, loads it, and
// answers the page's requests for a move. Running here rather than on the page
// keeps the board responsive while the model thinks.
// Free of anything DOM, so the tests can run it under Node.

import type { BaseModel } from './base-model';
import { loadBaseModel } from './base-model';
import type { BotPort, ModelSource, PageMessage, WorkerMessage } from './bot-protocol';
import { selectMove } from './move-selection';

/** What the worker needs from its surroundings, supplied by the caller so tests can replace it. */
export interface WorkerDependencies {
  /** Fetches the bytes of the model's ONNX file. */
  download(model: ModelSource): Promise<Uint8Array>;
}

/** Answers the page's messages arriving on the port. */
export function serveBot(port: BotPort, dependencies: WorkerDependencies): void {
  let baseModel: Promise<BaseModel> | undefined = undefined;

  port.onmessage = async (event) => {
    const message = event.data as PageMessage;

    if (message.kind === 'start') {
      baseModel = loadModel(message.model, dependencies);
      return;
    }

    if (message.kind === 'move') {
      // The page sends 'start' before any request, and a port delivers
      // messages in order, so the model has started loading by now.
      const model = await baseModel!;
      const move = await selectMove(message.fen, { baseModel: model });
      const reply: WorkerMessage = { kind: 'move', id: message.id, move: move };
      port.postMessage(reply);
    }
  };
}

async function loadModel(model: ModelSource, dependencies: WorkerDependencies): Promise<BaseModel> {
  const bytes = await dependencies.download(model);
  return loadBaseModel(bytes, { rating: model.rating });
}
