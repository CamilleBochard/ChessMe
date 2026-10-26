// The games visitors played against the Bot as Stockfish measured them, the
// second part of the Bot's tab under its live record: how many games were
// measured and when, the average loss per move of the visitors, the Bot and
// Camille in each Phase, and how often a game was gone before move 15 for
// each. Every figure comes with its margin, so a gap within it does not read
// as one. The results are left to the live record, which counts every game
// as it is played. src/record/played-games.json holds the figures; this only
// writes them out.

import { PHASES } from '../evaluation/move-matching';
import type { Texts } from '../i18n/texts';
import type { Measured, PlayedGamesRecord, Side } from '../record/played-games';

// The visitors first: the tab is about them, set beside the Bot they played
// and the player it is built from.
const SIDES: readonly Side[] = ['visitors', 'bot', 'camille'];

// Whether the visitor opened the note on centipawns. The view is written again
// when the language changes, so the note stays as they left it.
let centipawnHelpShown = false;

/** The measured figures in the page's language, under a heading of their own. */
export function playedGamesView(record: PlayedGamesRecord, texts: Texts): HTMLElement {
  const view = element('section', 'record-view');
  const title = element('h3', 'group-title');
  title.textContent = texts.played.measuredTitle;
  const summary = element('p', 'group-summary');
  summary.textContent = texts.played.measuredSummary(record.games, new Date(record.measuredOn));
  view.append(title, summary);
  const help = centipawnHelp(texts);
  const table = lossTable(record, texts);
  table.caption!.append(helpButton(help, texts));
  view.append(table, help);
  view.append(slippedAway(record, texts));

  const margin = element('p', 'note');
  margin.textContent = texts.played.margin;
  const scope = element('p', 'scope');
  scope.textContent = texts.played.scope(record.engine, record.depth, record.camilleGames);
  view.append(margin, scope);
  return view;
}

/** What a centipawn is, under the table and hidden until the visitor asks. */
function centipawnHelp(texts: Texts): HTMLElement {
  const help = element('p', 'centipawn-help');
  help.id = 'played-centipawn-help';
  help.textContent = texts.report.centipawnHelp;
  help.hidden = !centipawnHelpShown;
  return help;
}

/** The "?" beside the table's title that shows or hides the note on centipawns. */
function helpButton(help: HTMLElement, texts: Texts): HTMLButtonElement {
  const button = element('button', 'help-button');
  button.type = 'button';
  button.textContent = '?';
  button.setAttribute('aria-label', texts.report.centipawnHelpLabel);
  button.setAttribute('aria-controls', help.id);
  button.setAttribute('aria-expanded', String(centipawnHelpShown));
  button.addEventListener('click', () => {
    centipawnHelpShown = !centipawnHelpShown;
    help.hidden = !centipawnHelpShown;
    button.setAttribute('aria-expanded', String(centipawnHelpShown));
  });
  return button;
}

/**
 * Each side's average loss per move in each Phase, with its margin under it:
 * a row per side and a column per Phase, so that the side's name has room in
 * the narrow panel and the Phases fit under short names.
 */
function lossTable(record: PlayedGamesRecord, texts: Texts): HTMLTableElement {
  const words = texts.played;
  const table = element('table', 'played-losses');
  const caption = document.createElement('caption');
  caption.textContent = words.lossTitle;
  table.append(caption);

  const head = document.createElement('thead');
  const headRow = document.createElement('tr');
  headRow.append(document.createElement('td'));
  for (const phase of PHASES) {
    const cell = document.createElement('th');
    cell.scope = 'col';
    cell.title = texts.report.phaseName[phase];
    cell.textContent = words.phaseShort[phase];
    headRow.append(cell);
  }
  head.append(headRow);
  table.append(head);

  const body = document.createElement('tbody');
  for (const side of SIDES) {
    const row = document.createElement('tr');
    row.className = side;
    const name = document.createElement('th');
    name.scope = 'row';
    name.textContent = sideName(side, texts);
    row.append(name);
    for (const phase of PHASES) {
      row.append(measuredCell(record.sides[side].phases[phase], texts));
    }
    body.append(row);
  }
  table.append(body);
  return table;
}

/** An average loss in large, and under it its margin and how many moves it is read from. */
function measuredCell(measured: Measured, texts: Texts): HTMLTableCellElement {
  const cell = document.createElement('td');
  if (measured.averageLoss === null) {
    cell.textContent = texts.report.notMeasured;
    return cell;
  }
  const value = element('span', 'value');
  value.textContent = `${Math.round(measured.averageLoss)}`;
  const margin = element('span', 'margin');
  if (measured.margin !== null) {
    margin.textContent = `±${Math.round(measured.margin)}`;
  }
  cell.append(value, margin);
  return cell;
}

/** For each side, a line with the share of its games gone before move 15, its margin and the count it is read from. */
function slippedAway(record: PlayedGamesRecord, texts: Texts): HTMLElement {
  const block = element('section', 'slipped');
  const title = element('h4', 'block-title');
  title.textContent = texts.played.slippedTitle;
  const list = element('dl', 'slipped-sides');
  for (const side of SIDES) {
    const slipped = record.sides[side].slippedAway;
    const entry = document.createElement('div');
    entry.className = side;
    const name = document.createElement('dt');
    name.textContent = sideName(side, texts);
    const figure = document.createElement('dd');
    const share = element('span', 'value');
    share.textContent = texts.percent(slipped.games / slipped.of, 0);
    const detail = element('span', 'margin');
    detail.textContent = `±${Math.round(100 * slipped.margin)} · ${slipped.games}/${slipped.of}`;
    figure.append(share, detail);
    entry.append(name, figure);
    list.append(entry);
  }
  block.append(title, list);
  return block;
}

function sideName(side: Side, texts: Texts): string {
  if (side === 'visitors') {
    return texts.played.visitors;
  }
  if (side === 'bot') {
    return texts.played.bot;
  }
  return texts.played.camille;
}

function element<Tag extends keyof HTMLElementTagNameMap>(tag: Tag, className: string): HTMLElementTagNameMap[Tag] {
  const created = document.createElement(tag);
  created.className = className;
  return created;
}
