import { describe, expect, it } from 'vitest';
import { labelledColumns, valueTicks } from './chart-axis';

describe('the ticks of a value axis', () => {
  it('runs from zero to a round step past the largest value', () => {
    expect(valueTicks(114)).toEqual([0, 50, 100, 150]);
  });

  it('never steps by less than one, since games are counted whole', () => {
    expect(valueTicks(3)).toEqual([0, 1, 2, 3]);
  });
});

describe('the columns that keep a date along the bottom', () => {
  it('are all of them when they fit', () => {
    expect(labelledColumns(4, 5)).toEqual([0, 1, 2, 3]);
  });

  it('are evenly spaced back from the newest when they do not', () => {
    expect(labelledColumns(12, 5)).toEqual([2, 5, 8, 11]);
  });
});
