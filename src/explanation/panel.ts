// The panel beside the board: why the Bot played the move on display, and how
// the game so far compares with Camille's own games. It only draws what the
// Move-Selection Engine reported with each move and what the tested functions
// of ./explained-moves.ts and ./yardsticks.ts conclude.

import type { MoveLoss } from '../analysis/engine-analysis';
import { cutName } from '../engine/move-cut';
import type { BotMove, Candidate } from '../engine/move-selection';
import { playMove, type Game } from '../game/game';
import { candidateRows, moveKeyOf, type ExplainedMove } from './explained-moves';
import { LAST_OPENING_PLY } from '../engine/move-selection';
import { PHASES, type Phase } from '../evaluation/move-matching';
import type { Texts } from '../i18n/texts';
import improbabilityFile from './improbability-yardstick.json';
import lossFile from './loss-yardstick.json';
import {
  gameImprobability,
  gameLosses,
  MOVES_FOR_A_VERDICT,
  moveRarity,
  type BotLoss,
  type BotWeighedMove,
  type ShippedImprobabilityYardstick,
  type ShippedLossYardstick,
  type Verdict,
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
  analysisOn: boolean;
  /** What analysis mode knows of each move, filed as moveKeyOf files it. */
  evaluations: Map<string, MoveEvaluation>;
  /** The words of the language the page is in. */
  texts: Texts;
}

/** Draws the panel into its two containers. */
export function showPanel(moveElement: HTMLElement, gameElement: HTMLElement, view: PanelView): void {
  moveElement.replaceChildren(...moveExplanation(view));
  gameElement.replaceChildren(...gameComparison(view));
}

function moveExplanation(view: PanelView): HTMLElement[] {
  const words = view.texts.panel;
  const explained = view.focus;
  if (explained === null) {
    return [paragraph(words.placeholder, 'placeholder')];
  }

  const heading = paragraph(`${moveNumber(explained.ply)} ${view.texts.writeMove(explained.san)}`, 'move-heading');
  const parts: HTMLElement[] = [heading];
  const botMove = explained.botMove;

  if (botMove.source === 'opening-book') {
    parts.push(bookExplanation(view.texts.writeMove(explained.san), botMove.counts, view.texts));
  } else if (botMove.source === 'base-model') {
    parts.push(...baseModelExplanation(explained, botMove, view.texts));
  } else {
    parts.push(paragraph(words.random));
  }

  if (view.analysisOn) {
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
  const rank = paragraph(words.rank(botMove.rank));
  const rarity = rarityLine(explained.phase, playedCandidate(botMove), texts);
  return [how, table, rank, rarity];
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

/** Per Phase, the game's share of improbable moves and, in analysis mode, its average loss, against Camille's games. */
function gameComparison(view: PanelView): HTMLElement[] {
  const words = view.texts.panel;
  const fromModel: BotWeighedMove[] = [];
  for (const explained of view.botMoves) {
    const botMove = explained.botMove;
    if (botMove.source !== 'base-model') {
      continue;
    }
    const played = playedCandidate(botMove);
    fromModel.push({ phase: explained.phase, probability: played.modelProbability });
  }
  const improbability = gameImprobability(fromModel, improbabilityYardstick);

  let losses: Record<Phase, Verdict> | null = null;
  if (view.analysisOn) {
    losses = gameLosses(evaluatedLosses(view), lossYardstick);
  }

  const list = document.createElement('dl');
  list.className = 'phases';
  for (const phase of PHASES) {
    const term = document.createElement('dt');
    term.textContent = words.phase[phase];
    const improbable = document.createElement('dd');
    improbable.textContent = improbabilityText(phase, improbability[phase], view.texts);
    list.append(term, improbable);
    if (losses !== null) {
      const loss = document.createElement('dd');
      loss.textContent = lossText(phase, losses[phase], view.texts);
      list.append(loss);
    }
  }

  const sources = [words.usualRange(MOVES_FOR_A_VERDICT, improbabilityYardstick.games)];
  if (view.analysisOn) {
    sources.push(words.lossesSource(lossYardstick.engine, lossYardstick.depth, lossYardstick.games));
  }
  return [list, paragraph(sources.join(' '), 'sources')];
}

/** The Bot's moves analysis mode has evaluated so far. */
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

function improbabilityText(phase: Phase, verdict: Verdict, texts: Texts): string {
  const words = texts.panel;
  if (verdict.kind === 'too-few-moves') {
    return tooFewText(words.movesUnderOnePercent, phase, words.modelMovesSoFar(verdict.moves), texts);
  }
  const improbableMoves = Math.round(verdict.figure * verdict.moves);
  const share = percent(verdict.figure, texts);
  const range = words.percentRange(percent(verdict.spread.low, texts), percent(verdict.spread.high, texts));
  return words.improbableVerdict(improbableMoves, verdict.moves, share, verdict.kind, range);
}

function lossText(phase: Phase, verdict: Verdict, texts: Texts): string {
  const words = texts.panel;
  if (verdict.kind === 'too-few-moves') {
    return tooFewText(words.averageLoss, phase, words.openMovesEvaluated(verdict.moves), texts);
  }
  const range = words.centipawnRange(Math.round(verdict.spread.low), Math.round(verdict.spread.high));
  return words.lossVerdict(Math.round(verdict.figure), verdict.moves, verdict.kind, range);
}

/**
 * Why a Phase has no verdict yet. The opening is never long enough: it
 * holds at most five of a player's moves, below the eight a verdict needs.
 */
function tooFewText(figure: string, phase: Phase, counted: string, texts: Texts): string {
  if (phase === 'opening') {
    const botMovesInOpening = LAST_OPENING_PLY / 2;
    return texts.panel.openingTooShort(figure, botMovesInOpening);
  }
  return texts.panel.tooFew(figure, counted, MOVES_FOR_A_VERDICT);
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
