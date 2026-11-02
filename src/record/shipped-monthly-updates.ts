// The monthly updates as the site ships them: every summary the monthly
// refresh wrote into docs/refreshes/, read when the site is built, so the
// deployment of each refresh carries its own row.

import { monthlyUpdates, type MonthlyUpdates, type RefreshSummary } from './monthly-updates';

const summaryFiles = import.meta.glob<RefreshSummary>('../../docs/refreshes/*.json', {
  eager: true,
  import: 'default',
});

export const SHIPPED_MONTHLY_UPDATES: MonthlyUpdates = monthlyUpdates(Object.values(summaryFiles));
