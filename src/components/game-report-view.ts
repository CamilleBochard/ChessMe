// Lays out the end-of-game report in the page's language: in large, the
// share of the Bot's moves Camille could have played beside the share of his
// own, then how often it plays his move; where it met his own positions;
// each side's average loss; its losses per Phase beside the range of his
// games, and its costly moves; the moves he rarely plays.
// src/explanation/game-report.ts works out every figure; this only writes
// them out.

import botRunsFile from '../../docs/experiments/results/opening-cut-test-set-fine-tuned.json';
import {
  camilleFigures,
  camillePlausibleShare,
  moveMatching,
  SERVED_BOT,
  type CamilleFigures,
  type BotRunResults,
  type GameReport,
} from '../explanation/game-report';
import improbabilityFile from '../explanation/improbability-yardstick.json';
import lossFile from '../explanation/loss-yardstick.json';
import type { ShippedImprobabilityYardstick, ShippedLossYardstick } from '../explanation/yardsticks';
import { PHASES } from '../evaluation/move-matching';
import type { Texts } from '../i18n/texts';

const lossYardstick = lossFile as ShippedLossYardstick;
const camille: CamilleFigures = camilleFigures(lossYardstick);
const improbabilityYardstick = improbabilityFile as ShippedImprobabilityYardstick;
const camillePlausible = camillePlausibleShare(improbabilityYardstick);
// Read from the experiment that measured the Bot as it is served; a test in
// shipped-yardsticks.test.ts fails if the served Bot changes without it.
const matching = moveMatching(botRunsFile as BotRunResults, SERVED_BOT);

// Whether the visitor opened the note on centipawns. The report is written
// again each time Stockfish measures a move, so the note stays as they left it.
let centipawnHelpShown = false;

/** Where the reading of Camille's positions stands. */
export type PositionsState = 'reading' | 'read' | 'unavailable';

/** Writes the report into body, replacing what it held. */
export function showGameReport(body: HTMLElement, report: GameReport, positions: PositionsState, texts: Texts): void {
  const words = texts.report;
  const sections: HTMLElement[] = [];

  // This game's figure first, then the one measured once on games the model
  // never saw, the same in every report.
  sections.push(plausibleBlock(report, texts));
  sections.push(guessedBlock(texts));

  const followed = section(words.followed);
  followed.classList.add('card');
  followed.append(paragraph(words.fromBook(report.fromOpeningBook)));
  followed.append(paragraph(reachedText(report, positions, texts)));
  sections.push(followed);

  sections.push(averageLossBlock(report, texts));

  const losses = section(words.losses);
  losses.append(lossTable(report, texts));
  if (report.overThreePawns.of > 0) {
    const share = texts.percent(report.overThreePawns.count / report.overThreePawns.of, 0);
    const camilleShare = texts.percent(camille.overThreePawnsShare, 0);
    losses.append(paragraph(words.costly(report.overThreePawns.count, report.overThreePawns.of, share, camilleShare)));
  }
  sections.push(losses);

  // A game the visitor ended before the Bot moved has no move to count.
  if (report.moves > 0) {
    sections.push(improbableSection(report, texts));
  }

  if (report.pending > 0) {
    const pending = paragraph(words.pending(report.pending));
    pending.classList.add('pending');
    sections.push(pending);
  }

  const source = paragraph(words.source(lossYardstick.games));
  source.classList.add('source');
  sections.push(source);

  body.replaceChildren(...sections);
}

/** Each side's average loss per move in large, the Bot's in the accent, and what a centipawn is on demand. */
function averageLossBlock(report: GameReport, texts: Texts): HTMLElement {
  const words = texts.report;
  const block = section(words.averageLoss);
  block.classList.add('average-loss');

  const help = document.createElement('p');
  help.className = 'centipawn-help';
  help.id = 'centipawn-help';
  help.textContent = words.centipawnHelp;
  help.hidden = !centipawnHelpShown;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'help-button';
  button.textContent = '?';
  button.setAttribute('aria-label', words.centipawnHelpLabel);
  button.setAttribute('aria-controls', help.id);
  button.setAttribute('aria-expanded', String(centipawnHelpShown));
  button.addEventListener('click', () => {
    centipawnHelpShown = !centipawnHelpShown;
    help.hidden = !centipawnHelpShown;
    button.setAttribute('aria-expanded', String(centipawnHelpShown));
  });
  block.querySelector('h3')!.append(button);

  const sides = document.createElement('div');
  sides.className = 'sides';
  sides.append(sideFigure(words.bot, report.averageLoss.bot, 'bot', texts));
  sides.append(sideFigure(words.visitor, report.averageLoss.visitor, 'visitor', texts));
  block.append(sides, help);
  return block;
}

function sideFigure(name: string, averageLoss: number | null, side: 'bot' | 'visitor', texts: Texts): HTMLElement {
  const figure = document.createElement('div');
  figure.className = `side ${side}`;
  const label = paragraph(name);
  label.className = 'side-name';
  let valueText = texts.report.notMeasured;
  if (averageLoss !== null) {
    valueText = texts.report.centipawns(averageLoss);
  }
  const value = paragraph(valueText);
  value.className = 'side-loss';
  figure.append(label, value);
  return figure;
}

/** How many of the Bot's moves Camille plays less than once in 100, then each of them. */
function improbableSection(report: GameReport, texts: Texts): HTMLElement {
  const words = texts.report;
  const improbable = document.createElement('section');
  const summary = paragraph(words.improbable(report.improbable.length, report.moves));
  summary.className = 'improbable-summary';
  improbable.append(summary);
  if (report.improbable.length === 0) {
    return improbable;
  }
  const list = document.createElement('ul');
  list.className = 'improbable-moves';
  for (const move of report.improbable) {
    const item = document.createElement('li');
    let pawnsLost: string | null = null;
    if (move.loss !== null) {
      pawnsLost = texts.decimal(move.loss / 100, 1);
    }
    const named = `${moveNumber(move.ply)}${texts.writeMove(move.san)}`;
    item.textContent = words.improbableMove(named, texts.percent(move.probability, 1), pawnsLost);
    list.append(item);
  }
  improbable.append(list);
  return improbable;
}

/** How often the Bot plays his move on games it never saw, in large. */
function guessedBlock(texts: Texts): HTMLElement {
  const share = texts.percent(matching.guessed, 0);
  const block = figureBlock(share);
  block.append(paragraph(texts.report.guessed(matching.games)));
  return block;
}

/**
 * How many moves each side played, then the share of the Bot's moves Camille
 * could have played in large, and beside it the share of his own.
 */
function plausibleBlock(report: GameReport, texts: Texts): HTMLElement {
  const words = texts.report;
  let share = words.notMeasured;
  if (report.moves > 0) {
    share = texts.percent(report.plausible / report.moves, 0);
  }
  const block = figureBlock(share);
  const counts = paragraph(words.moveCounts(report.moves, report.visitorMoves));
  counts.className = 'move-counts';
  block.prepend(counts);

  const reference = document.createElement('div');
  reference.className = 'reference';
  const name = paragraph(texts.report.camille);
  name.className = 'side-name';
  const camilleShare = paragraph(texts.percent(camillePlausible, 0));
  camilleShare.className = 'reference-share';
  reference.append(name, camilleShare);
  block.querySelector('.figures')!.append(reference);

  // A game the visitor ended before the Bot moved has no share to explain.
  let meaning = words.camilleReference(improbabilityYardstick.games);
  if (report.moves > 0) {
    meaning = `${words.plausible(report.moves, share)} ${meaning}`;
  }
  block.append(paragraph(meaning));
  return block;
}

/** A block holding a share in large, the words saying what it counts appended after. */
function figureBlock(figureText: string): HTMLElement {
  const block = document.createElement('div');
  block.className = 'headline';
  const figures = document.createElement('div');
  figures.className = 'figures';
  const figure = paragraph(figureText);
  figure.className = 'share';
  figures.append(figure);
  block.append(figures);
  return block;
}

function reachedText(report: GameReport, positions: PositionsState, texts: Texts): string {
  if (positions === 'reading') {
    return texts.report.readingPositions;
  }
  if (positions === 'unavailable' || report.reachedByCamille === null) {
    return texts.report.positionsUnavailable;
  }
  if (report.reachedByCamille.of === 0) {
    return texts.report.noEarlyModelMove;
  }
  if (report.reachedByCamille.count === 0) {
    return texts.report.noneReached;
  }
  return texts.report.reached(report.reachedByCamille.count);
}

/** Per Phase, the Bot's average loss this game beside the range 8 in 10 of Camille's games cover. */
function lossTable(report: GameReport, texts: Texts): HTMLTableElement {
  const words = texts.report;
  const table = document.createElement('table');
  table.className = 'losses';
  const head = document.createElement('thead');
  head.append(row('th', [words.phase, words.thisGame, words.camilleRange]));
  const body = document.createElement('tbody');
  for (const phase of PHASES) {
    const losses = report.phases[phase];
    let botCell = words.notMeasured;
    if (losses.averageLoss !== null) {
      botCell = words.centipawns(losses.averageLoss);
    }
    let camilleCell = words.notMeasured;
    const range = camille.lossRanges[phase];
    if (range !== null) {
      camilleCell = words.range(range.low, range.high);
    }
    body.append(row('td', [words.phaseName[phase], botCell, camilleCell]));
  }
  table.append(head, body);
  return table;
}

function row(cellName: 'th' | 'td', texts: string[]): HTMLTableRowElement {
  const tableRow = document.createElement('tr');
  for (const text of texts) {
    const cell = document.createElement(cellName);
    if (cellName === 'th') {
      (cell as HTMLTableCellElement).scope = 'col';
    }
    cell.textContent = text;
    tableRow.append(cell);
  }
  return tableRow;
}

function section(title: string): HTMLElement {
  const element = document.createElement('section');
  const heading = document.createElement('h3');
  heading.textContent = title;
  element.append(heading);
  return element;
}

function paragraph(text: string): HTMLParagraphElement {
  const element = document.createElement('p');
  element.textContent = text;
  return element;
}

/** "12." for White's twelfth move, "12…" for Black's. */
function moveNumber(ply: number): string {
  const number = Math.ceil(ply / 2);
  if (ply % 2 === 1) {
    return `${number}.`;
  }
  return `${number}…`;
}
