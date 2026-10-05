import { describe, expect, it } from 'vitest';
import { seededRandom } from './seeded-random';

function firstNumbers(random: () => number, count: number): number[] {
  const numbers = [];
  for (let index = 0; index < count; index++) {
    numbers.push(random());
  }
  return numbers;
}

describe('a seeded random source', () => {
  it('gives the same numbers in [0, 1) for the same seed, and others for another seed', () => {
    const first = firstNumbers(seededRandom(13), 1000);
    const again = firstNumbers(seededRandom(13), 1000);
    const other = firstNumbers(seededRandom(14), 1000);

    expect(again).toEqual(first);
    expect(other).not.toEqual(first);
    expect(first.every((number) => number >= 0 && number < 1)).toBe(true);
  });
});
