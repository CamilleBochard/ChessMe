// The Bot's side of the Web Worker: it fetches the Base Model, loads it, and
// answers the page's requests for a move. Running here rather than on the page
// keeps the board responsive while the model thinks.
// Free of anything DOM, so the tests can run it under Node.

import type { BaseModel } from './base-model';
import { loadBaseModel } from './base-model';
import type { BotPort, ModelSource, PageMessage, WorkerMessage } from './bot-protocol';
import type { DownloadProgress } from './model-download';
import { selectMove } from './move-selection';

/** What the worker needs from its surroundings, supplied by the caller so tests can replace it. */
export interface WorkerDependencies {
  /** Fetches the bytes of the model's ONNX file, reporting how far it has come. */
  download(model: ModelSource, onProgress: (progress: DownloadProgress) => void): Promise<Uint8Array>;
}

/** Answers the page's messages arriving on the port. */
export function serveBot(port: BotPort, dependencies: WorkerDependencies): void {
  let baseModel: Promise<BaseModel> | undefined = undefined;

  port.onmessage = async (event) => {
    const message = event.data as PageMessage;

    if (message.kind === 'start') {
      baseModel = loadModel(message.model, port, dependencies);
      return;
    }

    if (message.kind === 'move') {
      // The page sends 'start' before any request, and a port delivers
      // messages in order, so the model has started loading by now.
      const model = await baseModel!;
      const move = await selectMove(message.fen, { baseModel: model });
      send(port, { kind: 'move', id: message.id, move: move });
    }
  };
}

/** Downloads and loads the model, telling the page how it is going. */
async function loadModel(model: ModelSource, port: BotPort, dependencies: WorkerDependencies): Promise<BaseModel> {
  const bytes = await dependencies.download(model, (progress) => {
    send(port, { kind: 'downloading', progress: progress });
  });
  const baseModel = await loadBaseModel(bytes, { rating: model.rating });
  send(port, { kind: 'ready' });
  return baseModel;
}

/** Posts a message, typed so the worker can only send what the page understands. */
function send(port: BotPort, message: WorkerMessage): void {
  port.postMessage(message);
}
