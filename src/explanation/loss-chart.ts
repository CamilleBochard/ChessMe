// The chart of losses in the panel: Camille's profile drawn first, the band
// chance alone leaves around it, and the Bot's profile over them as its moves
// are evaluated. It only draws; the figures come from ./yardsticks.ts, and the
// colours from the panel's stylesheet, through the classes set here.

import { LOSS_PROFILE_EDGES, type Band, type LossProfile } from './yardsticks';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

// The drawing's own units; the stylesheet scales it to the panel's width.
const WIDTH = 320;
const HEIGHT = 190;
const LEFT = 36;
const RIGHT = 16;
const TOP = 10;
const BOTTOM = 34;

/**
 * The chart: for each loss along the bottom, the share of moves that lost no
 * more. A curve higher up and further left belongs to a player who makes
 * fewer and smaller mistakes. The Bot's curve and the band are left out until
 * one of its moves has been evaluated.
 */
export function lossChart(camille: LossProfile, bot: LossProfile, band: Band | null): SVGSVGElement {
  const svg = svgElement('svg', {
    viewBox: `0 0 ${WIDTH} ${HEIGHT}`,
    role: 'img',
    class: 'loss-chart',
    'aria-label': describe(camille, bot),
  }) as SVGSVGElement;

  for (const share of [0, 0.5, 1]) {
    svg.append(svgElement('line', { x1: LEFT, x2: WIDTH - RIGHT, y1: y(share), y2: y(share), class: 'gridline' }));
    svg.append(label(LEFT - 6, y(share) + 3, `${Math.round(share * 100)}%`, 'end'));
  }
  for (const [index, edge] of LOSS_PROFILE_EDGES.entries()) {
    svg.append(label(x(index), HEIGHT - BOTTOM + 14, String(edge), 'middle'));
  }
  svg.append(label((LEFT + WIDTH - RIGHT) / 2, HEIGHT - 4, 'lost at most, in centipawns', 'middle'));

  if (band !== null) {
    svg.append(bandShape(band));
  }
  svg.append(...curve(camille.atMost, 'camille'));
  if (bot.moves > 0) {
    svg.append(...curve(bot.atMost, 'bot'));
  }
  return svg;
}

function x(index: number): number {
  const step = (WIDTH - LEFT - RIGHT) / (LOSS_PROFILE_EDGES.length - 1);
  return LEFT + index * step;
}

function y(share: number): number {
  return TOP + (1 - share) * (HEIGHT - TOP - BOTTOM);
}

/** The band as one shape: along its top from left to right, then back along its bottom. */
function bandShape(band: Band): SVGElement {
  const points: string[] = [];
  for (const [index, share] of band.high.entries()) {
    points.push(`${x(index)},${y(share)}`);
  }
  for (let index = band.low.length - 1; index >= 0; index--) {
    points.push(`${x(index)},${y(band.low[index])}`);
  }
  return svgElement('polygon', { points: points.join(' '), class: 'band' });
}

/** A profile as a line through a dot at each edge. */
function curve(shares: number[], who: 'camille' | 'bot'): SVGElement[] {
  const points = shares.map((share, index) => `${x(index)},${y(share)}`);
  const line = svgElement('polyline', { points: points.join(' '), class: `curve ${who}` });
  const dots = shares.map((share, index) => svgElement('circle', { cx: x(index), cy: y(share), r: 2.5, class: `dot ${who}` }));
  return [line, ...dots];
}

function label(left: number, baseline: number, text: string, anchor: 'start' | 'middle' | 'end'): SVGElement {
  const element = svgElement('text', { x: left, y: baseline, 'text-anchor': anchor, class: 'axis-label' });
  element.textContent = text;
  return element;
}

/** What the chart shows, for a screen reader: the share of moves losing a pawn or less, each side. */
function describe(camille: LossProfile, bot: LossProfile): string {
  const pawnIndex = LOSS_PROFILE_EDGES.indexOf(100);
  const camilleShare = Math.round(camille.atMost[pawnIndex] * 100);
  let description = `Camille loses a pawn or less on ${camilleShare}% of his moves.`;
  if (bot.moves > 0) {
    const botShare = Math.round(bot.atMost[pawnIndex] * 100);
    description += ` The Bot, on ${botShare}% of its ${bot.moves} evaluated moves this game.`;
  }
  return description;
}

function svgElement(name: string, attributes: Record<string, string | number>): SVGElement {
  const element = document.createElementNS(SVG_NAMESPACE, name);
  for (const [attribute, value] of Object.entries(attributes)) {
    element.setAttribute(attribute, String(value));
  }
  return element;
}
