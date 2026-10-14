// Copies the browser's build of Stockfish into public/stockfish, where the
// site serves it from. Runs before every dev server and build:
//
//     npm run stage-stockfish
//
// The page fetches it only when the visitor switches analysis mode on, so it
// costs nothing to a visitor who never does. It comes from the stockfish
// package pinned in package.json, the build that measured Camille's moves for
// the yardstick the panel shows.

import { copyFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { BROWSER_ENGINE_DIRECTORY, BROWSER_ENGINE_FILES, BROWSER_ENGINE_SOURCE } from '../src/analysis/browser-engine';

await rm(BROWSER_ENGINE_DIRECTORY, { recursive: true, force: true });
await mkdir(BROWSER_ENGINE_DIRECTORY, { recursive: true });
for (const file of BROWSER_ENGINE_FILES) {
  try {
    await copyFile(join(BROWSER_ENGINE_SOURCE, file), join(BROWSER_ENGINE_DIRECTORY, file));
  } catch {
    console.error(`No ${file} in ${BROWSER_ENGINE_SOURCE}: run npm install.`);
    process.exit(1);
  }
}
console.log(`Serving ${BROWSER_ENGINE_FILES.join(' and ')} from ${BROWSER_ENGINE_DIRECTORY}`);
