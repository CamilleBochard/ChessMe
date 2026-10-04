// Copies the Base Model into public/models, where the site serves it from.
// Runs before every dev server and build:
//
//     npm run stage-model
//
// The model is too large for the repository, so it is copied from models/onnx,
// where the conversion scripts write it. The copy is named after a hash of its
// contents: browsers keep the model in their cache under its URL, so a new
// model must arrive under a new URL to be downloaded at all.
//
// The Opening Book needs no copying, since the Bot's worker bundles it from
// where the pipeline writes it, but a missing book is reported here, with how
// to build it, rather than as an unresolved import halfway through the build.

import { createHash } from 'node:crypto';
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { SERVED_MODEL_DIRECTORY, SERVED_MODEL_SOURCE } from '../src/engine/served-model';

let model: Buffer;
try {
  model = await readFile(SERVED_MODEL_SOURCE);
} catch {
  console.error(`No Base Model at ${SERVED_MODEL_SOURCE}.`);
  console.error('Create it with: python -m pipeline.fetch_models && python -m pipeline.convert_maia3');
  process.exit(1);
}

/** Where pipeline/build_opening_book.py writes the book, and src/engine/bot-worker-entry.ts imports it from. */
const OPENING_BOOK = 'data/dataset/opening-book.json';

try {
  await access(OPENING_BOOK);
} catch {
  console.error(`No Opening Book at ${OPENING_BOOK}.`);
  console.error('Create it with: python -m pipeline.build_dataset && python -m pipeline.build_opening_book');
  process.exit(1);
}

const hash = createHash('sha256').update(model).digest('hex').slice(0, 12);
const stem = basename(SERVED_MODEL_SOURCE, '.onnx');
const servedName = `${stem}-${hash}.onnx`;

// Anything left from an earlier model goes, so exactly one model is served.
await rm(SERVED_MODEL_DIRECTORY, { recursive: true, force: true });
await mkdir(SERVED_MODEL_DIRECTORY, { recursive: true });
await writeFile(join(SERVED_MODEL_DIRECTORY, servedName), model);

console.log(`Serving ${SERVED_MODEL_SOURCE} as ${join(SERVED_MODEL_DIRECTORY, servedName)}`);
