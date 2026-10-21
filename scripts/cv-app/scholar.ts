// Google Scholar figures: citations, h-index, i10-index, and citations per year, read from the
// public profile page and written to data/scholar.yaml. Limits, by design:
//   - only the profile page itself (robots.txt allows /citations?user=; no searches, no paging);
//   - from this computer, through the dashboard (never from a server), about once a month
//     when the dashboard opens, or when Rasmus presses "Update from Google Scholar";
//   - if Google answers with a robot check or a changed page, nothing is written.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { parseDocument } from 'yaml';

const ROOT = process.cwd();
const FILE = join(ROOT, 'data', 'scholar.yaml');
const LOG = join(ROOT, 'generated', 'scholar.json'); // the last attempt, for the dashboard's notifications
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const MONTH = 30 * 24 * 3600 * 1000;

export interface Figures { citations: number; h_index: number; i10_index: number; citations_per_year: Record<string, number> }
export interface Attempt { at: string; ok: boolean; message: string; changes?: string[] }

const today = () => new Date().toISOString().slice(0, 10);
const current = () => parseDocument(readFileSync(FILE, 'utf8'));

export const lastAttempt = (): Attempt | null => (existsSync(LOG) ? JSON.parse(readFileSync(LOG, 'utf8')) : null);
function remember(a: Attempt) {
  mkdirSync(dirname(LOG), { recursive: true });
  writeFileSync(LOG, JSON.stringify(a, null, 2));
  return a;
}

/** Read the figures from the profile page; throws with a plain message if they cannot be read. */
export async function fetchFigures(profileUrl: string): Promise<Figures> {
  const url = new URL(profileUrl);
  if (url.hostname !== 'scholar.google.com' || url.pathname !== '/citations' || !url.searchParams.get('user')) throw new Error('The Google Scholar address in data/scholar.yaml is not a profile page.');
  const page = `https://scholar.google.com/citations?user=${encodeURIComponent(url.searchParams.get('user')!)}&hl=en`;
  let html: string;
  try {
    const r = await fetch(page, { headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(`Google Scholar answered ${r.status}.`);
    html = await r.text();
  } catch (e: any) {
    throw new Error(e?.name === 'TimeoutError' ? 'Google Scholar did not answer.' : e.message?.startsWith('Google') ? e.message : 'Could not reach Google Scholar.');
  }
  if (/unusual traffic|captcha|not a robot/i.test(html)) throw new Error('Google Scholar asked for a robot check. Try again later, or update the figures by hand.');
  // the stats box: citations, h-index, i10-index, each "all" and "since …"
  const stats = [...html.matchAll(/class="gsc_rsb_std">(\d+)</g)].map((m) => Number(m[1]));
  if (stats.length < 6) throw new Error('The Google Scholar page has changed, so the figures could not be read.');
  const years = [...html.matchAll(/class="gsc_g_t"[^>]*>(\d{4})</g)].map((m) => m[1]);
  const counts = [...html.matchAll(/class="gsc_g_al">(\d+)</g)].map((m) => Number(m[1]));
  // the chart lists every year, but years without citations have no bar; bars are labelled by their position
  const perYear: Record<string, number> = {};
  const bars = [...html.matchAll(/<a[^>]*class="gsc_g_a"[^>]*style="[^"]*z-index:(\d+)[^"]*"[^>]*><span class="gsc_g_al">(\d+)</g)];
  if (bars.length && years.length) for (const b of bars) perYear[years[years.length - Number(b[1])]] = Number(b[2]);
  else years.slice(-counts.length).forEach((y, i) => (perYear[y] = counts[i]));
  return { citations: stats[0], h_index: stats[2], i10_index: stats[4], citations_per_year: perYear };
}

/** Fetch the figures and write any that changed (line by line, keeping the file's comments). */
export async function update(): Promise<Attempt> {
  const doc = current();
  let figures: Figures;
  try { figures = await fetchFigures(String(doc.get('profile_url'))); }
  catch (e: any) { return remember({ at: new Date().toISOString(), ok: false, message: e.message }); }
  const old = doc.toJSON();
  const changes: string[] = [];
  const label: Record<string, string> = { citations: 'Citations', h_index: 'h-index', i10_index: 'i10-index' };
  for (const k of ['citations', 'h_index', 'i10_index'] as const) {
    if (old[k] !== figures[k]) changes.push(`${label[k]} ${old[k] ?? '–'} → ${figures[k]}`);
    doc.set(k, figures[k]);
  }
  const years = Object.fromEntries(Object.entries(old.citations_per_year ?? {}).map(([y, n]) => [String(y), n]));
  if (JSON.stringify(years) !== JSON.stringify(figures.citations_per_year)) {
    const map = doc.createNode(Object.fromEntries(Object.entries(figures.citations_per_year).map(([y, n]) => [Number(y), n])));
    doc.set('citations_per_year', map);
    if (!changes.length) changes.push('Citations per year updated');
  }
  doc.set('as_of', today());
  writeFileSync(FILE, doc.toString({ lineWidth: 0 }));
  return remember({ at: new Date().toISOString(), ok: true, message: changes.length ? `Google Scholar figures updated: ${changes.join(', ')}.` : 'Google Scholar figures checked: no change.', changes });
}

/** About a month since the figures were last checked (or the last failed attempt)? */
export function isDue() {
  const asOf = Date.parse(String(current().get('as_of')));
  const last = lastAttempt();
  const lastTry = last ? Date.parse(last.at) : 0;
  return Date.now() - Math.max(asOf || 0, lastTry) > MONTH;
}
