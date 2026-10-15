// The panel beside the board: why the Bot played the move on display, with
// where it stood among the legal moves in large, and a chart of the Bot's
// losses this game drawn over Camille's. It only draws what the
// Move-Selection Engine reported with each move and what the tested functions
// of ./explained-moves.ts and ./yardsticks.ts conclude.

import type { MoveLoss } from '../analysis/engine-analysis';
import { cutName } from '../engine/move-cut';
import type { BotMove, Candidate } from '../engine/move-selection';
import { playMove, type Game } from '../game/game';
import { candidateRows, moveKeyOf, rankOf, type ExplainedMove } from './explained-moves';
import type { Phase } from '../evaluation/move-matching';
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
  /** True while Stockfish evaluates the Bot's moves: in analysis mode, and once a game is over. */
  analysisOn: boolean;
  /** What Stockfish knows of each move, filed as moveKeyOf files it. */
  evaluations: Map<string, MoveEvaluation>;
}

/** Draws the panel into its two containers. */
export function showPanel(moveElement: HTMLElement, chartElement: HTMLElement, view: PanelView): void {
  moveElement.replaceChildren(...moveExplanation(view));
  chartElement.replaceChildren(...lossComparison(view));
}

function moveExplanation(view: PanelView): HTMLElement[] {
  const explained = view.focus;
  if (explained === null) {
    return [paragraph('Each of the Bot\'s moves is explained here as the game goes.', 'placeholder')];
  }

  const heading = paragraph(`${moveNumber(explained.ply)} ${explained.san}`, 'move-heading');
  const botMove = explained.botMove;
  const parts: HTMLElement[] = [rankBlock(botMove), heading];

  if (botMove.source === 'opening-book') {
    parts.push(bookExplanation(explained.san, botMove.counts));
  } else if (botMove.source === 'base-model') {
    parts.push(...baseModelExplanation(explained, botMove));
  } else {
    parts.push(paragraph('A legal move picked at random: the Base Model was not available.'));
  }

  if (view.analysisOn) {
    parts.push(lossLine(view.evaluations.get(moveKeyOf(explained))));
  }
  return parts;
}

function bookExplanation(san: string, counts: { reached: number; played: number } | undefined): HTMLElement {
  if (counts === undefined) {
    return paragraph("From the Opening Book: Camille's own reply in this position.");
  }
  return paragraph(
    `From the Opening Book: Camille reached this position ${times(counts.reached)} in his games ` +
      `and played ${san} ${times(counts.played)}.`,
  );
}

function baseModelExplanation(explained: ExplainedMove, botMove: ModelMove): HTMLElement[] {
  let drawnAmong = 'among every legal move';
  if (botMove.cut.kind !== 'none') {
    drawnAmong = `among the model's ${cutName(botMove.cut)} moves, the cut the Bot plays its opening with`;
  }
  const how = paragraph(
    `From the Base Model, out of ${botMove.legalMoves} legal moves, drawn at temperature ${botMove.temperature} ${drawnAmong}.`,
  );

  const table = candidateTable(explained.before, botMove);
  const rarity = rarityLine(explained.phase, playedCandidate(botMove));
  return [how, table, rarity];
}

/** Where the move stood, in large, and what the figure means beside it. */
function rankBlock(botMove: BotMove): HTMLElement {
  const block = document.createElement('p');
  block.className = 'move-rank';
  const figure = document.createElement('span');
  figure.className = 'rank-figure';
  figure.textContent = rankOf(botMove);
  const meaning = document.createElement('span');
  meaning.className = 'rank-meaning';
  meaning.textContent = rankMeaning(botMove);
  block.append(figure, meaning);
  return block;
}

function rankMeaning(botMove: BotMove): string {
  if (botMove.source === 'opening-book') {
    return "Camille's own reply, from the Opening Book";
  }
  if (botMove.source === 'random') {
    return 'Picked at random: the Base Model was not available';
  }
  if (botMove.rank === 1) {
    return `The model's most likely of ${botMove.legalMoves} legal moves`;
  }
  return `The model's ${ordinal(botMove.rank)} most likely of ${botMove.legalMoves} legal moves`;
}

/** The candidate the Bot played, among those the model weighed. */
function playedCandidate(botMove: ModelMove): Candidate {
  return botMove.candidates[botMove.rank - 1];
}

/** The model's most likely moves with both probabilities, the move played marked and added if it ranks lower. */
function candidateTable(before: Game, botMove: ModelMove): HTMLElement {
  const table = document.createElement('table');
  table.className = 'candidates';
  const head = table.createTHead().insertRow();
  for (const title of ['Move', 'Model', 'Drawn']) {
    const cell = document.createElement('th');
    cell.scope = 'col';
    cell.textContent = title;
    head.append(cell);
  }

  const body = table.createTBody();
  const played = playedCandidate(botMove);
  const rows = candidateRows(botMove.candidates, botMove.rank);
  for (const candidate of rows.mostLikely) {
    addCandidateRow(body, before, candidate, candidate === played);
  }
  if (rows.playedFurtherDown !== null) {
    const gap = body.insertRow();
    const cell = gap.insertCell();
    cell.colSpan = 3;
    cell.textContent = '…';
    addCandidateRow(body, before, rows.playedFurtherDown, true);
  }
  return table;
}

function addCandidateRow(body: HTMLTableSectionElement, before: Game, candidate: Candidate, isPlayed: boolean): void {
  const row = body.insertRow();
  if (isPlayed) {
    row.className = 'played';
    row.setAttribute('aria-label', 'the move played');
  }
  const after = playMove(before, candidate.move);
  row.insertCell().textContent = after?.lastMoveSan ?? '';
  row.insertCell().textContent = probability(candidate.modelProbability);
  row.insertCell().textContent = probability(candidate.drawnProbability);
}

/** How often Camille plays a move the model finds as unlikely, in the move's Phase. */
function rarityLine(phase: Phase, played: Candidate): HTMLElement {
  const share = moveRarity(improbabilityYardstick, phase, played.modelProbability);
  if (share === 0) {
    return paragraph(`None of Camille's ${phase} moves measured was this unlikely to the model.`, 'rarity');
  }
  return paragraph(`Camille plays a move this unlikely on ${percent(share)} of his ${phase} moves.`, 'rarity');
}

function lossLine(evaluation: MoveEvaluation | undefined): HTMLElement {
  if (evaluation === undefined || evaluation === 'pending') {
    return paragraph('Stockfish is evaluating the move…', 'loss');
  }
  if (evaluation === 'failed') {
    return paragraph('Stockfish could not evaluate the move.', 'loss');
  }
  if (!evaluation.openPosition) {
    return paragraph(
      `The game was already decided: both moves score ten pawns or more for the same side, so the loss is not counted.`,
      'loss',
    );
  }
  return paragraph(`Stockfish: the move lost ${evaluation.centipawnLoss} centipawns against the best move.`, 'loss');
}

/**
 * The chart of the Bot's losses this game over Camille's, with a legend
 * naming how many moves each curve is read from and a line saying when the
 * Bot's curve is drawn.
 */
function lossComparison(view: PanelView): HTMLElement[] {
  const camille = lossYardstick.profile;
  const bot = lossProfile(evaluatedLosses(view));
  let band: Band | null = null;
  if (bot.moves > 0) {
    band = chanceBand(camille, bot.moves);
  }

  const legend = document.createElement('ul');
  legend.className = 'chart-legend';
  legend.append(legendItem('camille', `Camille, ${camille.moves.toLocaleString('en')} moves`));
  if (bot.moves > 0) {
    legend.append(legendItem('bot', `The Bot this game, ${bot.moves} ${moves(bot.moves)}`));
    legend.append(legendItem('band', `Where chance alone puts Camille on ${bot.moves} ${moves(bot.moves)}`));
  }

  const figure = document.createElement('div');
  figure.className = 'chart';
  figure.append(lossChart(camille, bot, band));

  const notes = [
    'Share of moves that lost at most so many centipawns, in positions still open. ' +
      'Higher and further left: fewer and smaller mistakes.',
  ];
  if (!view.analysisOn) {
    notes.push("The Bot's curve is drawn move by move in analysis mode, and for every game once it is over.");
  } else if (bot.moves === 0) {
    notes.push("Stockfish is evaluating the Bot's moves…");
  }
  notes.push(
    `Camille: all ${lossYardstick.games} of his games, ${lossYardstick.engine} at depth ${lossYardstick.depth}, ` +
      'the settings used here.',
  );
  return [legend, figure, paragraph(notes.join(' '), 'sources')];
}

function legendItem(who: 'camille' | 'bot' | 'band', text: string): HTMLLIElement {
  const item = document.createElement('li');
  const swatch = document.createElement('span');
  swatch.className = `swatch ${who}`;
  swatch.setAttribute('aria-hidden', 'true');
  item.append(swatch, text);
  return item;
}

/** The Bot's moves Stockfish has evaluated so far. */
function evaluatedLosses(view: PanelView): BotLoss[] {
  const losses: BotLoss[] = [];
  for (const explained of view.botMoves) {
    const evaluation = view.evaluations.get(moveKeyOf(explained));
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

function probability(share: number): string {
  if (share === 0) {
    return '–';
  }
  if (share < 0.001) {
    return '<0.1%';
  }
  return `${(100 * share).toFixed(1)}%`;
}

function percent(share: number): string {
  const points = 100 * share;
  if (points > 0 && points < 1) {
    return `${points.toFixed(1)}%`;
  }
  return `${Math.round(points)}%`;
}

function ordinal(rank: number): string {
  const lastTwo = rank % 100;
  if (lastTwo >= 11 && lastTwo <= 13) {
    return `${rank}th`;
  }
  const last = rank % 10;
  if (last === 1) {
    return `${rank}st`;
  }
  if (last === 2) {
    return `${rank}nd`;
  }
  if (last === 3) {
    return `${rank}rd`;
  }
  return `${rank}th`;
}

function times(count: number): string {
  if (count === 1) {
    return 'once';
  }
  return `${count} times`;
}

function moves(count: number): string {
  if (count === 1) {
    return 'move';
  }
  return 'moves';
}

function paragraph(text: string, className?: string): HTMLParagraphElement {
  const element = document.createElement('p');
  element.textContent = text;
  if (className !== undefined) {
    element.className = className;
  }
  return element;
}
