// The panel beside the board: why the Bot played the move on display, with
// where it stood among the legal moves in large, and a chart of the Bot's
// losses this game drawn over Camille's, live but a few moves behind. It only draws what the
// Move-Selection Engine reported with each move and what the tested functions
// of ./explained-moves.ts and ./yardsticks.ts conclude.

import type { MoveLoss } from '../analysis/engine-analysis';
import { cutName } from '../engine/move-cut';
import type { BotMove, Candidate } from '../engine/move-selection';
import { playMove, type Game } from '../game/game';
import { CANDIDATES_LISTED, candidateRows, CHART_LAG, moveKeyOf, movesOnTheChart, rankOf, type ExplainedMove } from './explained-moves';
import type { Phase } from '../evaluation/move-matching';
import type { Texts } from '../i18n/texts';
import improbabilityFile from './improbability-yardstick.json';
import { lossChart } from './loss-chart';
import lossFile from './loss-yardstick.json';
import {
  chanceBand,
  lossProfile,
  moveRarity,
  type Band,
  type BotLoss,
  type ShippedImprobabilityYardstick,
  type ShippedLossYardstick,
} from './yardsticks';

const improbabilityYardstick = improbabilityFile as ShippedImprobabilityYardstick;
const lossYardstick = lossFile as ShippedLossYardstick;

/** A Base Model move, as the Move-Selection Engine reports it. */
type ModelMove = Extract<BotMove, { source: 'base-model' }>;

/** What analysis mode knows of a move: its loss, or that it is still being evaluated. */
export type MoveEvaluation = MoveLoss | 'pending' | 'failed';

export interface PanelView {
  /** The Bot's move to explain: the last one played up to the position on display, if any. */
  focus: ExplainedMove | null;
  /** Every move the Bot has played in the game so far, oldest first. */
  botMoves: ExplainedMove[];
  /**
   * True in analysis mode and once the game is over, when every evaluation
   * may be shown. Otherwise the chart leaves out the Bot's latest moves and
   * no move's loss is given.
   */
  revealed: boolean;
  /** What Stockfish knows of each move, filed as moveKeyOf files it. */
  evaluations: Map<string, MoveEvaluation>;
  /** The words of the language the page is in. */
  texts: Texts;
}

/** Draws the panel into its two containers. */
export function showPanel(moveElement: HTMLElement, chartElement: HTMLElement, view: PanelView): void {
  moveElement.replaceChildren(...moveExplanation(view));
  chartElement.replaceChildren(...lossComparison(view));
}

function moveExplanation(view: PanelView): HTMLElement[] {
  const words = view.texts.panel;
  const explained = view.focus;
  if (explained === null) {
    return [paragraph(words.placeholder, 'placeholder')];
  }

  const heading = paragraph(`${moveNumber(explained.ply)} ${view.texts.writeMove(explained.san)}`, 'move-heading');
  const botMove = explained.botMove;
  const parts: HTMLElement[] = [rankBlock(botMove, view.texts), heading];

  if (botMove.source === 'opening-book') {
    parts.push(bookExplanation(view.texts.writeMove(explained.san), botMove.counts, view.texts));
  } else if (botMove.source === 'base-model') {
    parts.push(...baseModelExplanation(explained, botMove, view.texts));
  } else {
    parts.push(paragraph(words.random));
  }

  if (view.revealed) {
    parts.push(lossLine(view.evaluations.get(moveKeyOf(explained)), view.texts));
  }
  return parts;
}

function bookExplanation(san: string, counts: { reached: number; played: number } | undefined, texts: Texts): HTMLElement {
  if (counts === undefined) {
    return paragraph(texts.panel.bookWithoutCounts);
  }
  return paragraph(texts.panel.bookWithCounts(san, counts.reached, counts.played));
}

function baseModelExplanation(explained: ExplainedMove, botMove: ModelMove, texts: Texts): HTMLElement[] {
  const words = texts.panel;
  let drawnAmong = words.amongEveryMove;
  if (botMove.cut.kind !== 'none') {
    drawnAmong = words.amongCut(cutName(botMove.cut));
  }
  const how = paragraph(words.fromModel(botMove.legalMoves, botMove.temperature, drawnAmong));
  const table = candidateTable(explained.before, botMove, texts);
  const legend = candidateLegend(texts);
  const rarity = rarityLine(explained.phase, playedCandidate(botMove), texts);
  return [how, table, legend, rarity];
}

/** What the table lists and what its two columns of probabilities mean. */
function candidateLegend(texts: Texts): HTMLElement {
  const words = texts.panel;
  const legend = document.createElement('div');
  legend.className = 'candidates-legend';
  legend.append(paragraph(words.listedLegend(CANDIDATES_LISTED)));

  const columns = document.createElement('dl');
  const entries = [
    { name: words.model, meaning: words.modelLegend },
    { name: words.drawn, meaning: words.drawnLegend },
  ];
  for (const entry of entries) {
    const name = document.createElement('dt');
    name.textContent = entry.name;
    const meaning = document.createElement('dd');
    meaning.textContent = entry.meaning;
    columns.append(name, meaning);
  }
  legend.append(columns);
  return legend;
}

/** Where the move stood, in large, and what the figure means beside it. */
function rankBlock(botMove: BotMove, texts: Texts): HTMLElement {
  const block = document.createElement('p');
  block.className = 'move-rank';
  const figure = document.createElement('span');
  figure.className = 'rank-figure';
  figure.textContent = rankFigure(botMove, texts);
  const meaning = document.createElement('span');
  meaning.className = 'rank-meaning';
  meaning.textContent = rankMeaning(botMove, texts);
  block.append(figure, meaning);
  return block;
}

/** The figure in large: the rank among the legal moves, or, for a move the model did not choose, where it came from. */
function rankFigure(botMove: BotMove, texts: Texts): string {
  if (botMove.source === 'opening-book') {
    return texts.panel.bookFigure;
  }
  if (botMove.source === 'random') {
    return texts.panel.randomFigure;
  }
  return rankOf(botMove);
}

function rankMeaning(botMove: BotMove, texts: Texts): string {
  if (botMove.source === 'opening-book') {
    return texts.panel.bookMeaning;
  }
  if (botMove.source === 'random') {
    return texts.panel.randomMeaning;
  }
  return texts.panel.rankMeaning(botMove.rank, botMove.legalMoves);
}

/** The candidate the Bot played, among those the model weighed. */
function playedCandidate(botMove: ModelMove): Candidate {
  return botMove.candidates[botMove.rank - 1];
}

/** The model's most likely moves with both probabilities, the move played marked and added if it ranks lower. */
function candidateTable(before: Game, botMove: ModelMove, texts: Texts): HTMLElement {
  const words = texts.panel;
  const table = document.createElement('table');
  table.className = 'candidates';
  const head = table.createTHead().insertRow();
  for (const title of [words.move, words.model, words.drawn]) {
    const cell = document.createElement('th');
    cell.scope = 'col';
    cell.textContent = title;
    head.append(cell);
  }

  const body = table.createTBody();
  const played = playedCandidate(botMove);
  const rows = candidateRows(botMove.candidates, botMove.rank);
  for (const candidate of rows.mostLikely) {
    addCandidateRow(body, before, candidate, candidate === played, texts);
  }
  if (rows.playedFurtherDown !== null) {
    const gap = body.insertRow();
    const cell = gap.insertCell();
    cell.colSpan = 3;
    cell.textContent = '…';
    addCandidateRow(body, before, rows.playedFurtherDown, true, texts);
  }
  return table;
}

function addCandidateRow(body: HTMLTableSectionElement, before: Game, candidate: Candidate, isPlayed: boolean, texts: Texts): void {
  const row = body.insertRow();
  if (isPlayed) {
    row.className = 'played';
    row.setAttribute('aria-label', texts.panel.playedMove);
  }
  const after = playMove(before, candidate.move);
  row.insertCell().textContent = texts.writeMove(after?.lastMoveSan ?? '');
  row.insertCell().textContent = probability(candidate.modelProbability, texts);
  row.insertCell().textContent = probability(candidate.drawnProbability, texts);
}

/** How often Camille plays a move the model finds as unlikely, in the move's Phase. */
function rarityLine(phase: Phase, played: Candidate, texts: Texts): HTMLElement {
  const share = moveRarity(improbabilityYardstick, phase, played.modelProbability);
  if (share === 0) {
    return paragraph(texts.panel.rarityNone(phase), 'rarity');
  }
  return paragraph(texts.panel.rarity(percent(share, texts), phase), 'rarity');
}

function lossLine(evaluation: MoveEvaluation | undefined, texts: Texts): HTMLElement {
  const words = texts.panel;
  if (evaluation === undefined || evaluation === 'pending') {
    return paragraph(words.evaluating, 'loss');
  }
  if (evaluation === 'failed') {
    return paragraph(words.evaluationFailed, 'loss');
  }
  if (!evaluation.openPosition) {
    return paragraph(words.decided, 'loss');
  }
  return paragraph(words.lost(evaluation.centipawnLoss), 'loss');
}

/**
 * The chart of the Bot's losses this game over Camille's, with a legend
 * naming how many moves each curve is read from and a line saying when the
 * Bot's curve is drawn.
 */
function lossComparison(view: PanelView): HTMLElement[] {
  const words = view.texts.panel;
  const camille = lossYardstick.profile;
  const charted = movesOnTheChart(view.botMoves, view);
  const bot = lossProfile(evaluatedLosses(charted, view.evaluations));
  let band: Band | null = null;
  if (bot.moves > 0) {
    band = chanceBand(camille, bot.moves);
  }

  const legend = document.createElement('ul');
  legend.className = 'chart-legend';
  legend.append(legendItem('camille', words.legendCamille(camille.moves)));
  if (bot.moves > 0) {
    legend.append(legendItem('bot', words.legendBot(bot.moves)));
    legend.append(legendItem('band', words.legendBand(bot.moves)));
  }

  const figure = document.createElement('div');
  figure.className = 'chart';
  figure.append(lossChart(camille, bot, band, view.texts));

  // How to read the chart stands on its own; what the curves leave out and
  // where Camille's comes from follow on a line of their own.
  const reading = paragraph(words.chartReading, 'sources');
  const notes: string[] = [];
  if (!view.revealed) {
    notes.push(words.chartLag(CHART_LAG));
  }
  const waiting = unevaluatedMoves(charted, view.evaluations);
  if (waiting > 0) {
    // Stockfish takes the moves one at a time, a few seconds each, so a
    // game joined late in analysis mode takes a while to catch up.
    notes.push(words.stillToEvaluate(waiting));
  }
  const failed = failedMoves(charted, view.evaluations);
  if (failed > 0) {
    notes.push(words.notEvaluated(failed));
  }
  notes.push(words.camilleSource(lossYardstick.games, lossYardstick.engine, lossYardstick.depth));
  return [legend, figure, reading, paragraph(notes.join(' '), 'sources')];
}

function legendItem(who: 'camille' | 'bot' | 'band', text: string): HTMLLIElement {
  const item = document.createElement('li');
  const swatch = document.createElement('span');
  swatch.className = `swatch ${who}`;
  swatch.setAttribute('aria-hidden', 'true');
  item.append(swatch, text);
  return item;
}

/** How many of the Bot's moves Stockfish has yet to answer for. */
function unevaluatedMoves(botMoves: ExplainedMove[], evaluations: Map<string, MoveEvaluation>): number {
  let waiting = 0;
  for (const explained of botMoves) {
    const evaluation = evaluations.get(moveKeyOf(explained));
    if (evaluation === undefined || evaluation === 'pending') {
      waiting += 1;
    }
  }
  return waiting;
}

/** How many of the Bot's moves Stockfish failed to evaluate. */
function failedMoves(botMoves: ExplainedMove[], evaluations: Map<string, MoveEvaluation>): number {
  let failed = 0;
  for (const explained of botMoves) {
    if (evaluations.get(moveKeyOf(explained)) === 'failed') {
      failed += 1;
    }
  }
  return failed;
}

/** The losses of the given moves Stockfish has evaluated so far. */
function evaluatedLosses(botMoves: ExplainedMove[], evaluations: Map<string, MoveEvaluation>): BotLoss[] {
  const losses: BotLoss[] = [];
  for (const explained of botMoves) {
    const evaluation = evaluations.get(moveKeyOf(explained));
    if (evaluation === undefined || evaluation === 'pending' || evaluation === 'failed') {
      continue;
    }
    losses.push({ phase: explained.phase, ...evaluation });
  }
  return losses;
}

/** "12." for White's twelfth move, "12…" for Black's. */
function moveNumber(ply: number): string {
  const number = Math.ceil(ply / 2);
  if (ply % 2 === 1) {
    return `${number}.`;
  }
  return `${number}…`;
}

/** A probability in the candidates' table: one decimal, and a dash for a move the cut left out. */
function probability(share: number, texts: Texts): string {
  if (share === 0) {
    return '–';
  }
  if (share < 0.001) {
    return `<${texts.percent(0.001, 1)}`;
  }
  return texts.percent(share, 1);
}

/** A share in a sentence: one decimal below 1%, whole points above. */
function percent(share: number, texts: Texts): string {
  if (share > 0 && share < 0.01) {
    return texts.percent(share, 1);
  }
  return texts.percent(share, 0);
}

function paragraph(text: string, className?: string): HTMLParagraphElement {
  const element = document.createElement('p');
  element.textContent = text;
  if (className !== undefined) {
    element.className = className;
  }
  return element;
}
