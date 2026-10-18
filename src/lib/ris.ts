// RIS citation files, for importing a publication into Zotero, EndNote, Mendeley and the like.
import type { Publication } from './data';

const types: Record<Publication['data']['type'], string> = {
  book: 'BOOK',
  article: 'JOUR',
  chapter: 'CHAP',
  review: 'JOUR',
  commentary: 'JOUR',
  'op-ed': 'NEWS',
  other: 'GEN',
};

export function ris(p: Publication): string {
  const d = p.data;
  const lines: [string, string | undefined][] = [
    ['TY', types[d.type]],
    ...d.authors.map((a): [string, string] => ['AU', `${a.family}, ${a.given}`]),
    ...(d.editors ?? []).map((e): [string, string] => ['ED', e]),
    ['TI', d.subtitle ? `${d.title}: ${d.subtitle}` : d.title],
    ['T2', d.type === 'book' ? undefined : d.venue],
    ['PY', d.stage ? undefined : d.date?.slice(0, 4)],
    ['DA', d.date && d.date.length > 4 ? d.date.replace(/-/g, '/') : undefined],
    ['VL', d.volume],
    ['IS', d.issue],
    ...pageLines(d.pages, d.type),
    ['PB', d.publisher],
    ['CY', d.place],
    ['SN', d.isbn],
    ['DO', d.doi],
    ['UR', d.doi ? `https://doi.org/${d.doi}` : d.publisher_url],
    ['L1', d.pdf],
    ['AB', d.abstract],
    ['N1', d.stage ? `${d.stage[0].toUpperCase()}${d.stage.slice(1)}` : d.note],
  ];
  return lines
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}  - ${v!.replace(/\s+/g, ' ').trim()}`)
    .concat('ER  - ', '')
    .join('\r\n');
}

/** "297–311" → SP 297, EP 311; a book's page count is not a page range. */
function pageLines(pages: string | undefined, type: string): [string, string][] {
  if (!pages || type === 'book') return [];
  const [sp, ep] = pages.split(/[–-]/);
  return ep ? [['SP', sp.trim()], ['EP', ep.trim()]] : [['SP', sp.trim()]];
}
