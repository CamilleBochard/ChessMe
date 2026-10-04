// Tests for downloading the Base Model's file. They hand the download a fake
// network and an in-memory cache, and assert the bytes it returns and the
// progress it reports.

import { describe, expect, it } from 'vitest';
import { downloadModel, type DownloadProgress, type ModelCache } from './model-download';

const MODEL_URL = 'https://chessme.example/models/model.onnx';

/** A cache held in memory, behaving like the browser's Cache API for one file. */
function memoryCache(): ModelCache {
  const stored = new Map<string, Response>();
  return {
    match: async (url) => stored.get(url)?.clone(),
    put: async (url, response) => {
      stored.set(url, response);
    },
  };
}

/** A network that serves the file in the given chunks, counting how often it is asked. */
function fakeNetwork(chunks: number[][], headers: Record<string, string> = {}) {
  const network = {
    requests: 0,
    fetch: async (_url: string): Promise<Response> => {
      network.requests = network.requests + 1;
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          for (const chunk of chunks) {
            controller.enqueue(Uint8Array.from(chunk));
          }
          controller.close();
        },
      });
      return new Response(body, { status: 200, headers: headers });
    },
  };
  return network;
}

describe('downloadModel', () => {
  it('returns the file and reports progress as each chunk arrives', async () => {
    const network = fakeNetwork([[1, 2, 3], [4, 5], [6]], { 'Content-Length': '6' });
    const progress: DownloadProgress[] = [];

    const bytes = await downloadModel(MODEL_URL, {
      cache: memoryCache(),
      fetch: network.fetch,
      onProgress: (report) => progress.push(report),
    });

    expect(Array.from(bytes)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(progress).toEqual([
      { receivedBytes: 3, totalBytes: 6 },
      { receivedBytes: 5, totalBytes: 6 },
      { receivedBytes: 6, totalBytes: 6 },
    ]);
  });

  it('serves a second download from the cache without touching the network', async () => {
    const network = fakeNetwork([[1, 2, 3], [4, 5, 6]], { 'Content-Length': '6' });
    const cache = memoryCache();
    await downloadModel(MODEL_URL, { cache: cache, fetch: network.fetch });

    const secondVisit = await downloadModel(MODEL_URL, { cache: cache, fetch: network.fetch });

    expect(Array.from(secondVisit)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(network.requests).toBe(1);
  });

  it('counts progress against the file size it is given when the server compresses the file', async () => {
    // A browser hands the page the decompressed bytes, while Content-Length
    // still gives the compressed size, so the header cannot be the total.
    const network = fakeNetwork([[1, 2, 3], [4, 5, 6]], { 'Content-Encoding': 'br', 'Content-Length': '4' });
    const progress: DownloadProgress[] = [];

    await downloadModel(MODEL_URL, {
      cache: memoryCache(),
      fetch: network.fetch,
      fileBytes: 6,
      onProgress: (report) => progress.push(report),
    });

    expect(progress).toEqual([
      { receivedBytes: 3, totalBytes: 6 },
      { receivedBytes: 6, totalBytes: 6 },
    ]);
  });

  it('leaves the total unknown when the server compresses the file and no size is given', async () => {
    const network = fakeNetwork([[1, 2, 3], [4, 5, 6]], { 'Content-Encoding': 'br', 'Content-Length': '4' });
    const progress: DownloadProgress[] = [];

    await downloadModel(MODEL_URL, {
      cache: memoryCache(),
      fetch: network.fetch,
      onProgress: (report) => progress.push(report),
    });

    expect(progress).toEqual([
      { receivedBytes: 3, totalBytes: undefined },
      { receivedBytes: 6, totalBytes: undefined },
    ]);
  });

  it('fails, caching nothing, when the server does not have the file', async () => {
    const cache = memoryCache();
    const missing = async (_url: string) => new Response('Not Found', { status: 404, statusText: 'Not Found' });

    await expect(downloadModel(MODEL_URL, { cache: cache, fetch: missing })).rejects.toThrow(
      `Could not download ${MODEL_URL}: 404 Not Found`,
    );
    expect(await cache.match(MODEL_URL)).toBeUndefined();
  });
});
