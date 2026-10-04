// The entry point of the Bot's Web Worker. It connects the worker's side of the
// Bot to the browser: the real network, and the Cache API for keeping the
// model between visits.

import { serveBot } from './bot-worker';
import { downloadModel, type ModelCache } from './model-download';

/** The Cache API storage holding the Base Model. */
const CACHE_NAME = 'chessme-base-model';

serveBot(self, {
  download: async (model, onProgress) => {
    const cache = await openCache(model.url);
    return downloadModel(model.url, {
      cache: cache,
      fetch: (url) => fetch(url),
      fileBytes: model.fileBytes,
      onProgress: onProgress,
    });
  },
});

/**
 * The browser's cache for the model, or one that keeps nothing when the
 * browser offers none: the Cache API is missing on pages not served over
 * HTTPS, and some private windows refuse it. The Bot still plays; the model is
 * downloaded again on the next visit.
 */
async function openCache(currentModelUrl: string): Promise<ModelCache> {
  try {
    const cache = await caches.open(CACHE_NAME);
    await forgetOtherModels(cache, currentModelUrl);
    return {
      match: (url) => cache.match(url),
      put: (url, response) => cache.put(url, response),
    };
  } catch {
    return {
      match: async () => undefined,
      put: async () => {},
    };
  }
}

/**
 * Deletes any model an earlier version of the site cached. Each model is
 * served under its own URL, so without this every replaced model would keep
 * its tens of megabytes on the visitor's disk.
 */
async function forgetOtherModels(cache: Cache, currentModelUrl: string): Promise<void> {
  const requests = await cache.keys();
  for (const request of requests) {
    if (request.url !== currentModelUrl) {
      await cache.delete(request);
    }
  }
}
