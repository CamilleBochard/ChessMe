// The monthly updates: in Camille's tab, a column per update with the total
// above it and a button that opens the last twelve months; in that view, a
// column per month and every update of the year in a table.
// src/record/monthly-updates.ts shapes the figures and ./column-chart.ts
// draws the charts; this lays them out in the page's language.

import type { Texts } from '../i18n/texts';
import { lastTwelveMonths, type MonthlyUpdates } from '../record/monthly-updates';
import { columnChart, type Column } from './column-chart';

/**
 * The updates under Camille's record. The chart and the button under it
 * both call openYear; the button is there for the keyboard and a screen
 * reader, the chart for a pointer.
 */
export function monthlyUpdatesView(record: MonthlyUpdates, texts: Texts, openYear: () => void): HTMLElement {
  const words = texts.updates;
  const view = element('section', 'record-view monthly-updates');

  const title = element('h3', 'group-title');
  title.textContent = words.title;
  const summary = element('p', 'group-summary');
  summary.textContent = words.summary(record.totalGames, record.updates.length);
  view.append(title, summary);

  if (record.updates.length > 0) {
    const columns: Column[] = [];
    for (const update of record.updates) {
      const day = new Date(update.day);
      columns.push({
        label: words.shortDay(day),
        value: update.games,
        reading: words.bar(words.day(day), update.games),
      });
    }
    const chart = columnChart(columns, { axisTitle: words.axis });
    chart.classList.add('opens-year');
    chart.addEventListener('click', openYear);

    const open = element('button', 'open-year');
    open.type = 'button';
    open.setAttribute('aria-haspopup', 'dialog');
    open.textContent = words.openYear;
    open.addEventListener('click', openYear);
    view.append(chart, open);
  }

  const scope = element('p', 'scope');
  scope.textContent = words.scope;
  view.append(scope);
  return view;
}

/**
 * The last twelve months: their total, a column per month, then every update
 * in a table. The chart is drawn at the given width, the room the view has,
 * so its text keeps its size on a phone and on a wide screen alike.
 */
export function yearView(record: MonthlyUpdates, texts: Texts, width: number): HTMLElement {
  const words = texts.updates;
  const year = lastTwelveMonths(record);
  const view = element('div', 'year-view');

  let totalGames = 0;
  for (const update of year.updates) {
    totalGames += update.games;
  }
  const summary = element('p', 'group-summary');
  summary.textContent = words.summary(totalGames, year.updates.length);
  view.append(summary);

  const columns: Column[] = [];
  for (const month of year.months) {
    // The first of the month, so the date names the month in any time zone.
    const first = new Date(`${month.month}-01`);
    columns.push({
      label: words.shortMonth(first),
      value: month.games,
      reading: words.monthReading(words.month(first), month.games),
    });
  }
  view.append(columnChart(columns, { axisTitle: words.axis, width }));

  const table = element('table', 'year-table');
  const head = element('thead', '');
  const headRow = element('tr', '');
  headRow.append(headerCell(words.dayHeader), headerCell(words.gamesHeader));
  head.append(headRow);
  const body = element('tbody', '');
  for (const update of year.updates) {
    const row = element('tr', '');
    const day = element('td', '');
    day.textContent = words.day(new Date(update.day));
    const games = element('td', '');
    games.textContent = String(update.games);
    row.append(day, games);
    body.append(row);
  }
  table.append(head, body);
  view.append(table);
  return view;
}

function headerCell(text: string): HTMLTableCellElement {
  const cell = element('th', '');
  cell.scope = 'col';
  cell.textContent = text;
  return cell;
}

function element<Tag extends keyof HTMLElementTagNameMap>(tag: Tag, className: string): HTMLElementTagNameMap[Tag] {
  const created = document.createElement(tag);
  if (className !== '') {
    created.className = className;
  }
  return created;
}
