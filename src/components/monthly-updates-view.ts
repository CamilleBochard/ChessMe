// The monthly updates under Camille's record: a column per update, oldest on
// the left, its height the games it added against the value axis, the count
// on its cap, and how many games in all above the chart.
// src/record/monthly-updates.ts shapes the figures and ./chart-axis.ts picks
// the ticks and the dated columns; this only draws them.

import type { Texts } from '../i18n/texts';
import type { MonthlyUpdate, MonthlyUpdates } from '../record/monthly-updates';
import { labelledColumns, valueTicks } from './chart-axis';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

// The drawing's own units; the stylesheet scales it to the panel's width,
// like the other charts of the page.
const WIDTH = 320;
const HEIGHT = 180;
const LEFT = 32;
const RIGHT = 8;
const TOP = 22;
const BOTTOM = 22;

/** The widest a column gets, so two updates do not look like two slabs. */
const WIDEST_COLUMN = 36;

/** The most dates along the bottom before they would run into each other. */
const MOST_DATES = 4;

/** The updates in the page's language, under a heading of their own. */
export function monthlyUpdatesView(record: MonthlyUpdates, texts: Texts): HTMLElement {
  const words = texts.updates;
  const view = document.createElement('section');
  view.className = 'record-view monthly-updates';

  const title = document.createElement('h3');
  title.className = 'group-title';
  title.textContent = words.title;
  const summary = document.createElement('p');
  summary.className = 'group-summary';
  summary.textContent = words.summary(record.totalGames, record.updates.length);
  view.append(title, summary);

  if (record.updates.length > 0) {
    view.append(chart(record.updates, texts));
  }

  const scope = document.createElement('p');
  scope.className = 'scope';
  scope.textContent = words.scope;
  view.append(scope);
  return view;
}

function chart(updates: MonthlyUpdate[], texts: Texts): SVGSVGElement {
  const words = texts.updates;
  const readings: string[] = [];
  for (const update of updates) {
    readings.push(words.bar(words.day(new Date(update.day)), update.games));
  }
  const svg = svgElement('svg', {
    viewBox: `0 0 ${WIDTH} ${HEIGHT}`,
    role: 'img',
    class: 'updates-chart',
    'aria-label': readings.join('. '),
  }) as SVGSVGElement;

  let largest = 0;
  for (const update of updates) {
    largest = Math.max(largest, update.games);
  }
  const ticks = valueTicks(largest);
  const top = ticks[ticks.length - 1];
  for (const tick of ticks) {
    const height = y(tick, top);
    svg.append(svgElement('line', { x1: LEFT, x2: WIDTH - RIGHT, y1: height, y2: height, class: 'gridline' }));
    svg.append(label(LEFT - 6, height + 3, String(tick), 'end', 'axis-label'));
  }
  svg.append(label(0, TOP - 10, words.axis, 'start', 'axis-label'));

  const slot = (WIDTH - LEFT - RIGHT) / updates.length;
  const columnWidth = Math.min(WIDEST_COLUMN, slot * 0.6);
  const dated = labelledColumns(updates.length, MOST_DATES);
  for (const [index, update] of updates.entries()) {
    const middle = LEFT + slot * (index + 0.5);
    const capHeight = y(update.games, top);
    const column = svgElement('rect', {
      x: middle - columnWidth / 2,
      y: capHeight,
      width: columnWidth,
      height: HEIGHT - BOTTOM - capHeight,
      class: 'column',
    });
    // The hover tip: the whole sentence, as a screen reader hears it.
    const tip = svgElement('title', {});
    tip.textContent = readings[index];
    column.append(tip);
    svg.append(column);
    svg.append(label(middle, capHeight - 4, String(update.games), 'middle', 'cap-label'));
    if (dated.includes(index)) {
      svg.append(label(middle, HEIGHT - BOTTOM + 14, words.shortDay(new Date(update.day)), 'middle', 'axis-label'));
    }
  }
  return svg;
}

/** Where a value sits on the drawing, from the bottom line up to the top tick. */
function y(value: number, top: number): number {
  return TOP + (1 - value / top) * (HEIGHT - TOP - BOTTOM);
}

function label(left: number, baseline: number, text: string, anchor: 'start' | 'middle' | 'end', className: string): SVGElement {
  const element = svgElement('text', { x: left, y: baseline, 'text-anchor': anchor, class: className });
  element.textContent = text;
  return element;
}

function svgElement(name: string, attributes: Record<string, string | number>): SVGElement {
  const element = document.createElementNS(SVG_NAMESPACE, name);
  for (const [attribute, value] of Object.entries(attributes)) {
    element.setAttribute(attribute, String(value));
  }
  return element;
}
