// The monthly updates under Camille's record: how many of his games each
// update added, newest first, and how many in all. src/record/monthly-updates.ts
// shapes the figures; this only writes them out.

import type { Texts } from '../i18n/texts';
import type { MonthlyUpdates } from '../record/monthly-updates';

/** The updates in the page's language, under a heading of their own. */
export function monthlyUpdatesView(record: MonthlyUpdates, texts: Texts): HTMLElement {
  const words = texts.updates;
  const view = element('section', 'record-view monthly-updates');

  const title = element('h3', 'group-title');
  title.textContent = words.title;
  const summary = element('p', 'group-summary');
  summary.textContent = words.summary(record.totalGames, record.updates.length);
  view.append(title, summary);

  const table = element('table', 'updates-table');
  const head = element('thead', '');
  const headRow = element('tr', '');
  headRow.append(headerCell(words.dayHeader), headerCell(words.gamesHeader));
  head.append(headRow);
  const body = element('tbody', '');
  for (const update of record.updates) {
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

  const scope = element('p', 'scope');
  scope.textContent = words.scope;
  view.append(scope);
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
