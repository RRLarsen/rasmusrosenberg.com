import { getCollection, getEntry, type CollectionEntry } from 'astro:content';

export type Publication = CollectionEntry<'publications'>;

export async function getProfile() {
  const entry = await getEntry('profile', 'main');
  if (!entry) throw new Error('data/profile.yaml is missing');
  return entry.data;
}

export async function getSite() {
  const entry = await getEntry('site', 'main');
  if (!entry) throw new Error('data/site.yaml is missing');
  return entry.data;
}

/** Only records with status: published ever reach a page. */
export const isPublished = ({ data }: { data: { status: string } }) => data.status === 'published';

/** Published and meant for the website (on_website: false keeps an entry in the CV only). */
export const onWebsite = (e: { data: { status: string; on_website?: boolean } }) => isPublished(e) && e.data.on_website !== false;

/** Newest first; work not yet published before everything else. */
export function byDateDesc<T extends { data: { date?: string; stage?: string } }>(a: T, b: T) {
  const key = (e: T) => (e.data.stage ? '9999' : (e.data.date ?? '0000'));
  return key(b).localeCompare(key(a));
}

export async function getPublications() {
  return (await getCollection('publications', isPublished)).sort(byDateDesc);
}

export const yearOf = (p: Publication) => p.data.stage ?? (p.data.date ?? '').slice(0, 4);

export const typeLabels: Record<Publication['data']['type'], string> = {
  book: 'Book',
  article: 'Article',
  chapter: 'Chapter',
  review: 'Book review',
  commentary: 'Commentary',
  'op-ed': 'Op-ed',
  other: 'Other',
};

/** "J. Jalava and S. Griffiths": everyone except Rasmus, as a readable list. */
export function coauthors(p: Publication) {
  const names = p.data.authors.filter((a) => !a.me).map((a) => `${a.given} ${a.family}`);
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

/** The best link for a publication: DOI, then publisher, then open-access copy. */
export function linkFor(p: Publication) {
  if (p.data.doi) return `https://doi.org/${p.data.doi}`;
  return p.data.publisher_url ?? p.data.oa_url;
}

/** "2025-06-17" → "17 June 2025"; "2025-06" → "June 2025"; "2025" stays "2025". */
export function formatDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  const month = m ? new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' }) : '';
  return [d, month, y].filter(Boolean).join(' ');
}

/** "https://www.psychopathyunmasked.com/" → "psychopathyunmasked.com", for link text */
export const bareHost = (url: string) => url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');

export const fullTitle = (p: Publication) => (p.data.subtitle ? `${p.data.title}: ${p.data.subtitle}` : p.data.title);

/** Profile links in display order, with readable names. */
export const linkNames = {
  google_scholar: 'Google Scholar',
  researchgate: 'ResearchGate',
  linkedin: 'LinkedIn',
  youtube: 'YouTube',
  orcid: 'ORCID',
  philpapers: 'PhilPapers',
  github: 'GitHub',
  bluesky: 'Bluesky',
} as const;
