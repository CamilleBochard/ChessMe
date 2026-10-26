// The figures of a player's record as the stats panel lays them out, the
// same for Camille and the Bot: the games in total and with each colour,
// their results as one bar, any figures only that player has, the openings
// played most with each colour, and a note on which games are counted.
// Built here rather than in the component's markup because the Bot's record
// reaches the page only once it is read from the service.

import type { Texts } from '../i18n/texts';
import { score, type ColourRecord, type PlayerRecord } from '../record/player-record';

/** A figure only one player has, such as the Bot's share of moves from the Opening Book. */
export interface ExtraFigure {
  label: string;
  value: string;
}

const COLOURS = ['white', 'black'] as const;
const OUTCOMES = ['wins', 'draws', 'losses'] as const;

/**
 * The record laid out in the page's language. It has no heading: the tab it
 * sits under names whose record it is. openingsShown caps how many openings
 * each colour lists, most played first; left out, every opening the record
 * holds is listed.
 */
export function recordView(
  record: PlayerRecord,
  texts: Texts,
  extraFigures: ExtraFigure[],
  scope: string,
  openingsShown?: number,
): HTMLElement {
  const view = element('div', 'record-view');
  view.append(totalOf(record, texts));
  view.append(byColour(record, texts));

  if (record.games > 0) {
    view.append(resultsOf(record, texts));
  }

  if (extraFigures.length > 0) {
    view.append(extras(extraFigures));
  }

  for (const colour of COLOURS) {
    const colourRecord = record[colour];
    if (colourRecord.openings.length > 0) {
      view.append(openingsTable(colourRecord, texts.page[withColour(colour)], texts, openingsShown));
    }
  }

  const note = element('p', 'scope');
  note.textContent = scope;
  view.append(note);
  return view;
}

function totalOf(record: PlayerRecord, texts: Texts): HTMLElement {
  const total = element('p', 'total');
  const figure = element('span', 'total-figure');
  figure.textContent = `${record.games}`;
  const unit = element('span', 'total-unit');
  unit.textContent = texts.page.games;
  total.append(figure, unit);
  return total;
}

function byColour(record: PlayerRecord, texts: Texts): HTMLElement {
  const list = element('dl', 'by-colour');
  for (const colour of COLOURS) {
    list.append(term(texts.page[withColour(colour)], `${record[colour].games}`));
  }
  return list;
}

/** Wins, draws and losses as one bar, each part as long as its count, with the counts under it. */
function resultsOf(record: PlayerRecord, texts: Texts): HTMLElement {
  const results = element('div', 'results');
  const bar = element('div', 'results-bar');
  bar.setAttribute('aria-hidden', 'true');
  const counts = element('dl', 'results-counts');
  for (const outcome of OUTCOMES) {
    const count = record.results[outcome];
    const part = element('span', outcome);
    part.style.flexGrow = `${count}`;
    bar.append(part);

    const entry = term(texts.page[outcome], `${count}`);
    entry.classList.add(outcome);
    counts.append(entry);
  }
  results.append(bar, counts);
  return results;
}

function extras(extraFigures: ExtraFigure[]): HTMLElement {
  const list = element('dl', 'extras');
  for (const figure of extraFigures) {
    list.append(term(figure.label, figure.value));
  }
  return list;
}

function openingsTable(
  colourRecord: ColourRecord,
  colourName: string,
  texts: Texts,
  openingsShown: number | undefined,
): HTMLElement {
  const table = element('table', 'openings');

  const caption = document.createElement('caption');
  const name = element('span', 'colour-name');
  name.textContent = colourName;
  caption.append(`${texts.page.mostPlayedOpenings}, `, name);
  table.append(caption);

  const head = document.createElement('thead');
  const headRow = document.createElement('tr');
  for (const heading of [texts.page.opening, texts.page.games, texts.page.score]) {
    const cell = document.createElement('th');
    cell.scope = 'col';
    cell.textContent = heading;
    headRow.append(cell);
  }
  head.append(headRow);
  table.append(head);

  const body = document.createElement('tbody');
  const listed = colourRecord.openings.slice(0, openingsShown);
  for (const opening of listed) {
    const row = document.createElement('tr');
    const shownScore = texts.percent(score(opening.results), 0);
    for (const text of [opening.name, `${opening.games}`, shownScore]) {
      const cell = document.createElement('td');
      cell.textContent = text;
      row.append(cell);
    }
    body.append(row);
  }
  table.append(body);
  return table;
}

function withColour(colour: 'white' | 'black'): 'withWhite' | 'withBlack' {
  if (colour === 'white') {
    return 'withWhite';
  }
  return 'withBlack';
}

/** A name and its figure, grouped so that a grid can place each pair as one. */
function term(label: string, value: string): HTMLElement {
  const group = document.createElement('div');
  const name = document.createElement('dt');
  name.textContent = label;
  const figure = document.createElement('dd');
  figure.textContent = value;
  group.append(name, figure);
  return group;
}

function element<Name extends keyof HTMLElementTagNameMap>(name: Name, className: string): HTMLElementTagNameMap[Name] {
  const created = document.createElement(name);
  created.className = className;
  return created;
}
