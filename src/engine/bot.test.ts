// Tests for the Bot as the page sees it: a client on one end of a message
// channel, the worker's side on the other. Node's MessageChannel carries the
// messages exactly as a Web Worker would, so the tests exercise the same
// protocol the page uses, with a stand-in Base Model and no real download.

import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it } from 'vitest';
import { connectBot } from './bot-client';
import type { BotPort, BotStatus } from './bot-protocol';
import { serveBot } from './bot-worker';
import { readOpeningBook } from './opening-book';

/**
 * A stand-in Maia-3 model written by pipeline/fixture_models.py. Whatever the
 * position, it ranks e2e4 first among moves legal from the starting position,
 * seen from the side to move.
 */
const FIXED_PREFERENCE_MODEL = new URL('./fixtures/maia3-fixed-preferences.onnx', import.meta.url);

const STARTING_POSITION = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const MODEL = { url: 'https://chessme.example/models/model.onnx', fileBytes: undefined, rating: 1100 };

const openChannels: MessageChannel[] = [];

/**
 * The two ends of a message channel, the worker's and the page's, closed after
 * the test so Node can exit. Node's MessagePort has the shape the Bot needs,
 * though its type is not declared as such.
 */
function openChannel(): { workerEnd: BotPort; pageEnd: BotPort } {
  const channel = new MessageChannel();
  openChannels.push(channel);
  return {
    workerEnd: channel.port1 as unknown as BotPort,
    pageEnd: channel.port2 as unknown as BotPort,
  };
}

afterEach(() => {
  for (const channel of openChannels) {
    channel.port1.close();
    channel.port2.close();
  }
  openChannels.length = 0;
});

describe('the Bot', () => {
  it("plays the Base Model's move once the model has downloaded", async () => {
    const channel = openChannel();
    serveBot(channel.workerEnd, {
      download: async () => new Uint8Array(await readFile(FIXED_PREFERENCE_MODEL)),
    });
    const bot = connectBot(channel.pageEnd, MODEL);

    const botMove = await bot.requestMove(STARTING_POSITION);

    expect(botMove).toEqual({ move: { from: 'e2', to: 'e4' }, source: 'base-model' });
  });

  it('plays a book move while the model is still downloading', async () => {
    const channel = openChannel();
    const openingBook = readOpeningBook(
      JSON.stringify({
        min_occurrences: 3,
        positions: { 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -': 'd2d4' },
      }),
    );
    serveBot(channel.workerEnd, {
      // A download that never finishes.
      download: () => new Promise(() => {}),
      openingBook: openingBook,
    });
    const bot = connectBot(channel.pageEnd, MODEL);

    const botMove = await bot.requestMove(STARTING_POSITION);

    expect(botMove).toEqual({ move: { from: 'd2', to: 'd4' }, source: 'opening-book' });
  });

  it('reports the download as it progresses, then preparing the model, then that it is ready', async () => {
    const channel = openChannel();
    const modelBytes = new Uint8Array(await readFile(FIXED_PREFERENCE_MODEL));
    serveBot(channel.workerEnd, {
      download: async (_model, onProgress) => {
        onProgress({ receivedBytes: 100, totalBytes: 200 });
        onProgress({ receivedBytes: 200, totalBytes: 200 });
        return modelBytes;
      },
    });

    const statuses: BotStatus[] = [];
    const ready = new Promise<void>((resolve) => {
      connectBot(channel.pageEnd, MODEL, {
        onStatus: (status) => {
          statuses.push(status);
          if (status.kind === 'ready') {
            resolve();
          }
        },
      });
    });
    await ready;

    expect(statuses).toEqual([
      { kind: 'downloading', progress: { receivedBytes: 100, totalBytes: 200 } },
      { kind: 'downloading', progress: { receivedBytes: 200, totalBytes: 200 } },
      { kind: 'preparing' },
      { kind: 'ready' },
    ]);
  });

  it('reports a model that could not be downloaded, and refuses to move', async () => {
    const channel = openChannel();
    serveBot(channel.workerEnd, {
      download: async () => {
        throw new Error('Could not download the model: 404 Not Found');
      },
    });

    const statuses: BotStatus[] = [];
    const bot = connectBot(channel.pageEnd, MODEL, {
      onStatus: (status) => statuses.push(status),
    });

    await expect(bot.requestMove(STARTING_POSITION)).rejects.toThrow('Could not download the model: 404 Not Found');
    expect(statuses).toEqual([{ kind: 'failed', reason: 'Could not download the model: 404 Not Found' }]);
  });
});
