// Full references in APA style (titles of books and journals in italics, Rasmus's own name
// in bold). Built as "runs" of styled text, so the website (HTML) and the PDF CV (Typst)
// render the same reference from one implementation.
import type { Publication } from './data';

/** A piece of text with its styling. `slot` marks a place the PDF builder may fill (e.g. a student name). */
export interface Run {
  t: string;
  i?: boolean;
  b?: boolean;
  href?: string;
  slot?: string;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Runs to HTML for the website. Slots are left empty. */
export function runsToHtml(runs: Run[]): string {
  return runs
    .filter((r) => !r.slot)
    .map((r) => {
      let h = esc(r.t);
      if (r.href) h = `<a href="${esc(r.href)}">${h}</a>`;
      if (r.i) h = `<i>${h}</i>`;
      if (r.b) h = `<strong>${h}</strong>`;
      return h;
    })
    .join('');
}

/** "Rasmus Rosenberg" → "R. R."; "J." stays "J." */
const initials = (given: string) =>
  given.includes('.') ? given : given.split(/[\s-]+/).map((n) => `${n[0]}.`).join(' ');

function authorRuns(p: Publication): Run[] {
  const names: Run[] = p.data.authors.map((a) => ({ t: `${a.family}, ${initials(a.given)}`, b: a.me || undefined }));
  if (names.length === 1) return names;
  const out: Run[] = [];
  names.forEach((n, k) => {
    if (k > 0) out.push({ t: k === names.length - 1 ? ', & ' : ', ' });
    out.push(n);
  });
  return out;
}

const sentence = (s: string) => (/[.?!]$/.test(s) ? s : `${s}.`);

export function apaRuns(p: Publication): Run[] {
  const d = p.data;
  // APA gives the full date for newspaper, magazine and blog pieces
  const year = d.stage ? d.stage : ['op-ed', 'other'].includes(d.type) && d.date && d.date.length === 10 ? formatApaDate(d.date) : (d.date ?? '').slice(0, 4);
  const title = d.subtitle ? `${d.title}: ${d.subtitle}` : d.title;
  const link = d.doi ? `https://doi.org/${d.doi}` : d.type !== 'book' ? d.publisher_url : undefined;
  const tail: Run[] = link ? [{ t: ' ' }, { t: link, href: link }] : [];
  const note: Run[] = d.note ? [{ t: ` (${d.note})` }] : [];
  const head: Run[] = [...authorRuns(p), { t: ` (${year}). ` }];

  if (d.type === 'book') {
    return [...head, { t: sentence(title), i: true }, { t: d.publisher ? ` ${d.publisher}.` : '' }, ...tail];
  }
  if (d.type === 'chapter') {
    const eds = d.editors?.length ? `${d.editors.join(', ')} (${d.editors.length > 1 ? 'Eds.' : 'Ed.'}), ` : '';
    const pages = d.pages ? ` (pp. ${d.pages})` : '';
    return [...head, { t: `${sentence(title)} In ${eds}` }, { t: d.venue ?? '', i: true }, { t: `${pages}. ${d.publisher ?? ''}.` }, ...note, ...tail];
  }
  const vol: Run[] = d.volume ? [{ t: ', ' }, { t: d.volume, i: true }, { t: d.issue ? `(${d.issue})` : '' }] : [];
  return [...head, { t: `${sentence(title)} ` }, { t: d.venue ?? '', i: true }, ...vol, { t: `${d.pages ? `, ${d.pages}` : ''}.` }, ...note, ...tail];
}

/** The APA reference as HTML, for the website. */
export const apa = (p: Publication): string => runsToHtml(apaRuns(p));

/** "2025-07-22" → "2025, July 22" */
function formatApaDate(iso: string) {
  const [y, m, day] = iso.split('-').map(Number);
  const month = new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
  return `${y}, ${month} ${day}`;
}
