// The chart of the style discriminator in the end-of-game report: how the
// scores of Camille's real games and of other players' at his level spread,
// drawn on one scale so their overlap shows, and the Bot's game as a mark
// among them. It only draws; the shares come from ./style-discriminator.ts,
// the colours from the report's stylesheet, through the classes set here.

import type { Texts } from '../i18n/texts';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

/**
 * The bands the scores are counted in: every game shipped scores between
 * about 0.1 and 0.75, and a score past either end counts in the end band.
 */
export const STYLE_CHART_EDGES: readonly number[] = [
  0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8,
];

// The drawing's own units; the stylesheet scales it to the report's width.
const WIDTH = 320;
const HEIGHT = 150;
const LEFT = 12;
const RIGHT = 12;
const TOP = 12;
const BOTTOM = 34;

/** The scores the axis is labelled at. */
const AXIS_LABELS = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7];

/**
 * Both groups' shares of games in each band, as lines through the middle of
 * each band, and the game's score, when it has one, as an upright line.
 */
export function styleChart(
  camilleShares: number[],
  otherShares: number[],
  gameScore: number | null,
  texts: Texts,
): SVGSVGElement {
  let scoreText: string | null = null;
  if (gameScore !== null) {
    scoreText = texts.decimal(gameScore, 2);
  }
  const svg = svgElement('svg', {
    viewBox: `0 0 ${WIDTH} ${HEIGHT}`,
    role: 'img',
    class: 'style-chart',
    'aria-label': texts.report.styleChartDescription(scoreText),
  }) as SVGSVGElement;

  const tallest = Math.max(...camilleShares, ...otherShares);
  svg.append(svgElement('line', { x1: LEFT, x2: WIDTH - RIGHT, y1: y(0, tallest), y2: y(0, tallest), class: 'baseline' }));
  for (const score of AXIS_LABELS) {
    svg.append(label(x(score), HEIGHT - BOTTOM + 14, texts.decimal(score, 1), 'middle'));
  }
  svg.append(label((LEFT + WIDTH - RIGHT) / 2, HEIGHT - 4, texts.report.styleAxis, 'middle'));

  svg.append(spread(otherShares, tallest, 'others'));
  svg.append(spread(camilleShares, tallest, 'camille'));

  if (gameScore !== null) {
    const clamped = Math.min(Math.max(gameScore, STYLE_CHART_EDGES[0]), STYLE_CHART_EDGES[STYLE_CHART_EDGES.length - 1]);
    svg.append(svgElement('line', { x1: x(clamped), x2: x(clamped), y1: TOP - 6, y2: y(0, tallest), class: 'game' }));
  }
  return svg;
}

function x(score: number): number {
  const first = STYLE_CHART_EDGES[0];
  const last = STYLE_CHART_EDGES[STYLE_CHART_EDGES.length - 1];
  return LEFT + ((score - first) / (last - first)) * (WIDTH - LEFT - RIGHT);
}

function y(share: number, tallest: number): number {
  return TOP + (1 - share / tallest) * (HEIGHT - TOP - BOTTOM);
}

/** A group's shares as one line through the middle of each band. */
function spread(shares: number[], tallest: number, who: 'camille' | 'others'): SVGElement {
  const points: string[] = [];
  for (const [band, share] of shares.entries()) {
    const middle = (STYLE_CHART_EDGES[band] + STYLE_CHART_EDGES[band + 1]) / 2;
    points.push(`${x(middle)},${y(share, tallest)}`);
  }
  return svgElement('polyline', { points: points.join(' '), class: `spread ${who}` });
}

function label(left: number, baseline: number, text: string, anchor: 'start' | 'middle' | 'end'): SVGElement {
  const element = svgElement('text', { x: left, y: baseline, 'text-anchor': anchor, class: 'axis-label' });
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
