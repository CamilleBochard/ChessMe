// Tests for the Bot as the page sees it: a client on one end of a message
// channel, the worker's side on the other. Node's MessageChannel carries the
// messages exactly as a Web Worker would, so the tests exercise the same
// protocol the page uses, with a stand-in Base Model and no real download.

import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it } from 'vitest';
import { connectBot } from './bot-client';
import type { BotPort } from './bot-protocol';
import { serveBot } from './bot-worker';

/**
 * A stand-in Maia-3 model written by pipeline/fixture_models.py. Whatever the
 * position, it ranks e2e4 first among moves legal from the starting position,
 * seen from the side to move.
 */
const FIXED_PREFERENCE_MODEL = new URL('./fixtures/maia3-fixed-preferences.onnx', import.meta.url);

const STARTING_POSITION = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const MODEL = { url: 'https://chessme.example/models/model.onnx', fileBytes: undefined, rating: 1100 };

const openChannels: MessageChannel[] = [];

/** A message channel whose ends are closed after the test, so Node can exit. */
function openChannel(): MessageChannel {
  const channel = new MessageChannel();
  openChannels.push(channel);
  return channel;
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
    serveBot(channel.port1 as unknown as BotPort, {
      download: async () => new Uint8Array(await readFile(FIXED_PREFERENCE_MODEL)),
    });
    const bot = connectBot(channel.port2 as unknown as BotPort, MODEL);

    const move = await bot.requestMove(STARTING_POSITION);

    expect(move).toEqual({ from: 'e2', to: 'e4' });
  });
});
