// Analysis mode's engine in the browser: the staged build of Stockfish runs
// as its own Web Worker, started only when the visitor switches the mode on,
// and stopped when they switch it off so it holds no memory or processor
// time while unused.

import { ANALYSIS_DEPTH } from './browser-engine';
import { connectAnalyser, type Analyser } from './engine-analysis';

export interface BrowserAnalyser {
  analyser: Analyser;
  stop(): void;
}

/**
 * Starts Stockfish from the URL of its script, which finds its WebAssembly
 * beside it. Stockfish.js is a worker script of its own: commands go in as
 * messages, and every line it writes comes back as one.
 */
export function startBrowserAnalyser(engineUrl: string, onFailure: () => void): BrowserAnalyser {
  const worker = new Worker(engineUrl);
  worker.addEventListener('error', onFailure);

  const analyser = connectAnalyser(
    {
      send: (command) => {
        worker.postMessage(command);
      },
      onLine: (listener) => {
        worker.addEventListener('message', (event: MessageEvent) => {
          listener(String(event.data));
        });
      },
    },
    ANALYSIS_DEPTH,
  );

  return {
    analyser: analyser,
    stop: () => {
      worker.terminate();
    },
  };
}
