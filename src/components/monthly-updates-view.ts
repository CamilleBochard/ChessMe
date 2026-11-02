// The monthly updates under Camille's record: a bar per update, newest on
// top, as long as the games it added against the update that added the
// most, with the count at its tip, and how many games in all.
// src/record/monthly-updates.ts shapes the figures; this only writes them out.

import type { Texts } from '../i18n/texts';
import type { MonthlyUpdate, MonthlyUpdates } from '../record/monthly-updates';

/** The updates in the page's language, under a heading of their own. */
export function monthlyUpdatesView(record: MonthlyUpdates, texts: Texts): HTMLElement {
  const words = texts.updates;
  const view = element('section', 'record-view monthly-updates');

  const title = element('h3', 'group-title');
  title.textContent = words.title;
  const summary = element('p', 'group-summary');
  summary.textContent = words.summary(record.totalGames, record.updates.length);
  view.append(title, summary);

  const bars = element('ol', 'update-bars');
  for (const update of record.updates) {
    bars.append(updateBar(update, texts));
  }
  view.append(bars);

  const scope = element('p', 'scope');
  scope.textContent = words.scope;
  view.append(scope);
  return view;
}

/**
 * One update: its day, then its bar with the count at the tip. A screen
 * reader and the hover tip read the whole sentence; the parts it is made of
 * are hidden from the first, so the figure is not read twice.
 */
function updateBar(update: MonthlyUpdate, texts: Texts): HTMLLIElement {
  const words = texts.updates;
  const day = words.day(new Date(update.day));
  const reading = words.bar(day, update.games);

  const row = element('li', '');
  row.title = reading;
  const spoken = element('span', 'visually-hidden');
  spoken.textContent = reading;

  const dayLabel = element('span', 'update-day');
  dayLabel.textContent = day;
  dayLabel.setAttribute('aria-hidden', 'true');

  const track = element('span', 'update-track');
  track.setAttribute('aria-hidden', 'true');
  const bar = element('span', 'update-bar');
  bar.style.setProperty('--share', String(update.shareOfLargest));
  const games = element('span', 'update-games');
  games.textContent = String(update.games);
  track.append(bar, games);

  row.append(spoken, dayLabel, track);
  return row;
}

function element<Tag extends keyof HTMLElementTagNameMap>(tag: Tag, className: string): HTMLElementTagNameMap[Tag] {
  const created = document.createElement(tag);
  if (className !== '') {
    created.className = className;
  }
  return created;
}
