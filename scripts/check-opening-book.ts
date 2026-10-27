// Checks that an Opening Book reads as one and that every move in it is legal
// in its position, before the monthly refresh publishes it.
//
//     npm run check-opening-book -- [data/dataset/opening-book.json]
//
// Exits with 1 and names each problem when the book is wrong.

import { readFile } from 'node:fs/promises';
import { openingBookProblems } from '../src/engine/opening-book-check';

const path = process.argv[2] ?? 'data/dataset/opening-book.json';
const problems = openingBookProblems(await readFile(path, 'utf-8'));
if (problems.length > 0) {
  console.error(`${path} is not a sound Opening Book:`);
  for (const problem of problems) {
    console.error(`  ${problem}`);
  }
  process.exit(1);
}
const positions = Object.keys(JSON.parse(await readFile(path, 'utf-8')).positions).length;
console.log(`${path}: ${positions} positions, every move legal`);
