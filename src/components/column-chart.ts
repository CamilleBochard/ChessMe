// A column chart in the page's style: round ticks up the side, a column per
// entry in the accent colour, its count on the cap and a short date under it
// when there is room. The monthly updates draw it twice, small in Camille's
// tab and large in the view of the last twelve months. ./chart-axis.ts picks
// the ticks and the dated columns; the colours come from the stylesheet
// through the classes set here.

import { labelledColumns, valueTicks } from './chart-axis';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

// The drawing's own units; the stylesheet scales it to the width it is given.
// A chart drawn at the width it is shown at keeps its text at the size the
// stylesheet sets.
const DEFAULT_WIDTH = 320;
const HEIGHT = 180;
const LEFT = 32;
// Room for half of the newest column's label, which is centred on it.
const RIGHT = 16;
const TOP = 22;
const BOTTOM = 22;

/** The widest a column gets, so two entries do not look like two slabs. */
const WIDEST_COLUMN = 36;

export interface Column {
  /** Under the column, short enough to stand beside its neighbours. */
  label: string;
  value: number;
  /** The column read out whole, for a screen reader and the hover tip. */
  reading: string;
}

export interface ColumnChartOptions {
  /** What the values count, written at the top of their axis. */
  axisTitle: string;
  /** The width to draw at, in the drawing's units; 320 when not given. */
  width?: number;
}

/** The room a label along the bottom needs, a short month or date and a gap. */
const LABEL_ROOM = 64;

/**
 * The chart, oldest column on the left. A column of 0 is left empty, so a
 * month without games reads as a gap; it keeps its place along the bottom.
 */
export function columnChart(columns: Column[], options: ColumnChartOptions): SVGSVGElement {
  const width = options.width ?? DEFAULT_WIDTH;
  const plotWidth = width - LEFT - RIGHT;
  const mostLabels = Math.max(1, Math.floor(plotWidth / LABEL_ROOM));
  const readings: string[] = [];
  for (const column of columns) {
    readings.push(column.reading);
  }
  const svg = svgElement('svg', {
    viewBox: `0 0 ${width} ${HEIGHT}`,
    role: 'img',
    class: 'column-chart',
    'aria-label': readings.join('. '),
  }) as SVGSVGElement;

  let largest = 0;
  for (const column of columns) {
    largest = Math.max(largest, column.value);
  }
  const ticks = valueTicks(largest);
  const top = ticks[ticks.length - 1];
  for (const tick of ticks) {
    const height = y(tick, top);
    svg.append(svgElement('line', { x1: LEFT, x2: width - RIGHT, y1: height, y2: height, class: 'gridline' }));
    svg.append(label(LEFT - 6, height + 3, String(tick), 'end', 'axis-label'));
  }
  svg.append(label(0, TOP - 10, options.axisTitle, 'start', 'axis-label'));

  const slot = plotWidth / columns.length;
  const columnWidth = Math.min(WIDEST_COLUMN, slot * 0.6);
  const labelled = labelledColumns(columns.length, mostLabels);
  for (const [index, column] of columns.entries()) {
    const middle = LEFT + slot * (index + 0.5);
    if (labelled.includes(index)) {
      svg.append(label(middle, HEIGHT - BOTTOM + 14, column.label, 'middle', 'axis-label'));
    }
    if (column.value === 0) {
      continue;
    }
    const capHeight = y(column.value, top);
    const bar = svgElement('rect', {
      x: middle - columnWidth / 2,
      y: capHeight,
      width: columnWidth,
      height: HEIGHT - BOTTOM - capHeight,
      class: 'column',
    });
    const tip = svgElement('title', {});
    tip.textContent = column.reading;
    bar.append(tip);
    svg.append(bar);
    svg.append(label(middle, capHeight - 4, String(column.value), 'middle', 'cap-label'));
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
