// When the dashboard's online checks are due: once a week, on Fridays. A check is due if the
// last one happened before the most recent Friday (midnight, this computer's time), so a missed
// Friday is caught up the next time the dashboard runs.
export function lastFriday(now = new Date()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() - 5 + 7) % 7)); // 5 = Friday
  return d.getTime();
}

/** due if never checked, or last checked before the most recent Friday */
export const dueSince = (lastCheck: number) => !lastCheck || lastCheck < lastFriday();
