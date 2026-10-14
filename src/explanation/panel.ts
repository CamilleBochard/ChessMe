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
import { PHASE_LABELS, PHASES, type Phase } from '../evaluation/move-matching';
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
}

/** Draws the panel into its two containers. */
export function showPanel(moveElement: HTMLElement, gameElement: HTMLElement, view: PanelView): void {
  moveElement.replaceChildren(...moveExplanation(view));
  gameElement.replaceChildren(...gameComparison(view));
}

function moveExplanation(view: PanelView): HTMLElement[] {
  const explained = view.focus;
  if (explained === null) {
    return [paragraph('Each of the Bot\'s moves is explained here as the game goes.', 'placeholder')];
  }

  const heading = paragraph(`${moveNumber(explained.ply)} ${explained.san}`, 'move-heading');
  const parts: HTMLElement[] = [heading];
  const botMove = explained.botMove;

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

  let rankText = `It was the model's most likely move.`;
  if (botMove.rank > 1) {
    rankText = `It was the model's ${ordinal(botMove.rank)} most likely move.`;
  }

  const table = candidateTable(explained.before, botMove);
  const rarity = rarityLine(explained.phase, playedCandidate(botMove));
  return [how, table, paragraph(rankText), rarity];
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

/** Per Phase, the game's share of improbable moves and, in analysis mode, its average loss, against Camille's games. */
function gameComparison(view: PanelView): HTMLElement[] {
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
    term.textContent = PHASE_LABELS[phase];
    const improbable = document.createElement('dd');
    improbable.textContent = improbabilityText(phase, improbability[phase]);
    list.append(term, improbable);
    if (losses !== null) {
      const loss = document.createElement('dd');
      loss.textContent = lossText(phase, losses[phase]);
      list.append(loss);
    }
  }

  const sources = [
    `His usual range is the middle 80% of his games, from ${MOVES_FOR_A_VERDICT} moves in a Phase up. ` +
      `Moves under 1%: the Base Model's own probabilities, on his ${improbabilityYardstick.games} games held back for testing.`,
  ];
  if (view.analysisOn) {
    sources.push(
      `Losses: ${lossYardstick.engine} at depth ${lossYardstick.depth}, the settings used here, on all ${lossYardstick.games} of his games, ` +
        `counting only the moves made in open positions.`,
    );
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

function improbabilityText(phase: Phase, verdict: Verdict): string {
  if (verdict.kind === 'too-few-moves') {
    return tooFewText('Moves under 1%', phase, `${verdict.moves} Base Model ${moves(verdict.moves)} so far`);
  }
  const improbableMoves = Math.round(verdict.figure * verdict.moves);
  const range = `${percent(verdict.spread.low)} to ${percent(verdict.spread.high)}`;
  return `Moves under 1%: ${improbableMoves} of ${verdict.moves} (${percent(verdict.figure)}), ${placement(verdict)} (${range}).`;
}

function lossText(phase: Phase, verdict: Verdict): string {
  if (verdict.kind === 'too-few-moves') {
    const evaluated = `${verdict.moves} ${moves(verdict.moves)} in open positions evaluated so far`;
    return tooFewText('Average loss', phase, evaluated);
  }
  const range = `${Math.round(verdict.spread.low)} to ${Math.round(verdict.spread.high)} cp`;
  return `Average loss: ${Math.round(verdict.figure)} cp over ${verdict.moves} moves, ${placement(verdict)} (${range}).`;
}

/**
 * Why a Phase has no verdict yet. The opening is never long enough: it
 * holds at most five of a player's moves, below the eight a verdict needs.
 */
function tooFewText(figure: string, phase: Phase, counted: string): string {
  if (phase === 'opening') {
    const botMovesInOpening = LAST_OPENING_PLY / 2;
    return `${figure}: the opening holds at most ${botMovesInOpening} of the Bot's moves, too few to tell from one game.`;
  }
  return `${figure}: ${counted}, too few to tell (${MOVES_FOR_A_VERDICT} needed).`;
}

function placement(verdict: Extract<Verdict, { kind: 'inside' | 'below' | 'above' }>): string {
  if (verdict.kind === 'below') {
    return 'below his usual range';
  }
  if (verdict.kind === 'above') {
    return 'above his usual range';
  }
  return 'inside his usual range';
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
