// Quick add: look up a DOI, ISBN or web address and turn what we find into a new CV entry
// (not saved: the app opens it as a filled-in form to check first). Also the index of
// identifiers already in data/, so the app can say "already in your CV" and the inbox can
// leave out what is known. Matching is on identifiers only (DOI, ISBN, web address).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

const DATA = join(process.cwd(), 'data');
const UA = 'rasmusrosenberg.com CV builder (https://www.rasmusrosenberg.com)';
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';

export interface Found {
  /** the CV app section the entry belongs in, e.g. C.2 */
  section: string;
  data: Record<string, unknown>;
  /** where the details came from, for the status line */
  source: string;
}

export class LookupError extends Error {}

// ---------- identifiers

export const DOI_RE = /\b(10\.\d{4,9}\/[^\s"'<>?#]+)/i;
export const normDoi = (s: string) => decodeURIComponent(s).replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '').replace(/[.,;)]+$/, '').toLowerCase();
export const normIsbn = (s: string) => s.replace(/[^0-9Xx]/g, '').toUpperCase();
const isIsbn = (s: string) => /^(97[89])?\d{9}[\dX]$/.test(normIsbn(s)) && /^[\d\s-]+[\dXx]$/.test(s.trim());

/** A web address in a form that compares well: no protocol, www, tracking parameters or trailing slash. */
export function normUrl(raw: string): string {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return raw.trim().toLowerCase(); }
  // Google Alerts and other redirect links carry the real address in ?url=
  if (/(^|\.)google\.[a-z.]+$/.test(u.hostname) && u.pathname === '/url' && u.searchParams.get('url')) return normUrl(u.searchParams.get('url')!);
  let host = u.hostname.toLowerCase().replace(/^(www|m)\./, '');
  let path = u.pathname.replace(/\/+$/, '');
  const params = new URLSearchParams();
  if (host === 'youtu.be') { params.set('v', path.slice(1)); host = 'youtube.com'; path = '/watch'; }
  else if (host === 'youtube.com' && path === '/watch') { if (u.searchParams.get('v')) params.set('v', u.searchParams.get('v')!); }
  // Apple Podcasts: the same episode under any country store or title slug
  else if (host === 'podcasts.apple.com' && /\/id\d+/.test(path)) { path = `/${path.match(/id\d+/)![0]}`; if (u.searchParams.get('i')) params.set('i', u.searchParams.get('i')!); }
  else for (const [k, v] of u.searchParams) if (!/^(utm_|fbclid|gclid|mc_|si$|feature$|ref$|share)/i.test(k)) params.set(k, v);
  const q = params.toString();
  return `${host}${path}${q ? `?${q}` : ''}`;
}

const readList = (name: string): any[] => parse(readFileSync(join(DATA, `${name}.yaml`), 'utf8')) ?? [];

export const publicationSection = (type: string) => (['op-ed', 'other', 'review'].includes(type) ? 'C.3' : 'C.2');

export interface KnownEntry { section: string; id: string; title: string; collection: string }

/** Every identifier already in data/, keyed "doi:…", "isbn:…" or "url:…". */
export function knownIndex() {
  const index = new Map<string, KnownEntry>();
  const add = (key: string, e: KnownEntry) => { if (!index.has(key)) index.set(key, e); };
  for (const p of readList('publications')) {
    const e = { section: publicationSection(p.type), id: p.id, title: p.title, collection: 'publications' };
    if (p.doi) add(`doi:${normDoi(p.doi)}`, e);
    if (p.isbn) add(`isbn:${normIsbn(String(p.isbn))}`, e);
    for (const u of [p.publisher_url, p.oa_url, /^https?:/.test(p.pdf ?? '') ? p.pdf : undefined, ...(p.links ?? []).map((l: any) => l.url)]) if (u) add(`url:${normUrl(u)}`, e);
  }
  for (const m of readList('media')) if (m.url) add(`url:${normUrl(m.url)}`, { section: 'C.8', id: m.id, title: m.title, collection: 'media' });
  for (const t of readList('talks')) for (const u of [t.url, t.video_url]) if (u) add(`url:${normUrl(u)}`, { section: t.category === 'invited' ? 'C.6' : 'C.5', id: t.id, title: t.title, collection: 'talks' });
  return index;
}

/** How Rasmus is written in the author lists already in data/ (so new entries match). */
function myAuthor() {
  for (const p of readList('publications')) for (const a of p.authors ?? []) if (a.me) return { family: a.family, given: a.given, me: true };
  return { family: 'Larsen', given: 'Rasmus Rosenberg', me: true };
}
const isMe = (family = '', given = '', orcid = '') =>
  orcid.includes('0000-0002-9294-8645') || (/larsen$/i.test(family) && /^r/i.test(given));

// ---------- helpers

async function get(url: string, opts: { json?: boolean; browser?: boolean; accept?: string } = {}) {
  let r: Response;
  try {
    r = await fetch(url, {
      headers: { 'User-Agent': opts.browser ? BROWSER_UA : UA, Accept: opts.accept ?? (opts.json ? 'application/json' : 'text/html,application/xhtml+xml,*/*') },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });
  } catch (e: any) {
    throw new LookupError(e?.name === 'TimeoutError' ? `No answer from ${new URL(url).hostname}.` : `Could not reach ${new URL(url).hostname}.`);
  }
  if (!r.ok) throw new LookupError(r.status === 404 ? 'Not found.' : `${new URL(url).hostname} answered ${r.status}.`);
  return opts.json ? r.json() : r.text();
}

const pad = (n: number) => String(n).padStart(2, '0');
const fromParts = (p?: number[]) => (p?.[0] ? [String(p[0]), p[1] ? pad(p[1]) : '', p[2] ? pad(p[2]) : ''].filter(Boolean).join('-') : undefined);
/** any date text → YYYY-MM-DD, YYYY-MM or YYYY */
function isoFrom(s?: string): string | undefined {
  if (!s) return undefined;
  const m = s.match(/^(\d{4})(?:[-/](\d{1,2})(?:[-/](\d{1,2}))?)?/);
  if (m) return [m[1], m[2] && pad(Number(m[2])), m[3] && pad(Number(m[3]))].filter(Boolean).join('-');
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return new Date(t).toISOString().slice(0, 10);
  return s.match(/\b(19|20)\d{2}\b/)?.[0];
}
const NAMED: Record<string, string> = { lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»', eacute: 'é', aacute: 'á', oslash: 'ø', aring: 'å', aelig: 'æ', ouml: 'ö', auml: 'ä', uuml: 'ü' };
const decode = (s: string) => s
  .replace(/&([a-z]+);/gi, (m, n) => NAMED[n.toLowerCase()] ?? m)
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
const stripTags = (s: string) => decode(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const tidy = (s?: string) => (s ? decode(s).replace(/\s+/g, ' ').trim() : undefined);
const dash = (s?: string) => s?.replace(/\s*[-‐‑]\s*/g, '–');
const clean = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== '' && !(Array.isArray(v) && !v.length)));

/** "Jose Luis Bermudez" → { family: "Bermudez", given: "Jose Luis" }; "Larsen, Rasmus" also works */
function splitName(name: string) {
  const n = name.trim();
  if (n.includes(',')) { const [family, given] = n.split(',', 2).map((x) => x.trim()); return { family, given }; }
  const parts = n.split(/\s+/);
  return { family: parts.pop() ?? n, given: parts.join(' ') };
}
const withMe = (authors: { family: string; given: string }[], orcids: string[] = []) => {
  const me = myAuthor();
  return authors.map((a, i) => (isMe(a.family, a.given, orcids[i]) ? me : a));
};

// ---------- DOI (Crossref)

const crossrefType: Record<string, string> = {
  'journal-article': 'article', 'proceedings-article': 'article', 'book-chapter': 'chapter', 'book-section': 'chapter',
  'reference-entry': 'chapter', book: 'book', monograph: 'book', 'edited-book': 'book', 'reference-book': 'book',
  'posted-content': 'other', 'peer-review': 'review',
};

export async function lookupDoi(doi: string): Promise<Found> {
  const id = normDoi(doi);
  const { message: m } = await get(`https://api.crossref.org/works/${encodeURIComponent(id)}`, { json: true }).catch((e) => {
    throw e instanceof LookupError && e.message === 'Not found.' ? new LookupError(`No record for DOI ${id} at Crossref.`) : e;
  });
  const type = crossrefType[m.type] ?? 'article';
  const authors = withMe((m.author ?? []).filter((a: any) => a.family).map((a: any) => ({ family: a.family, given: a.given ?? '' })), (m.author ?? []).filter((a: any) => a.family).map((a: any) => a.ORCID ?? ''));
  const initials = (g = '') => g.split(/[\s-]+/).filter(Boolean).map((x) => `${x[0]}.`).join(' ');
  const data = clean({
    type,
    title: tidy(m.title?.[0]),
    subtitle: tidy(m.subtitle?.[0]),
    authors: authors.length ? authors : [myAuthor()],
    editors: type === 'chapter' ? (m.editor ?? []).map((e: any) => `${initials(e.given)} ${e.family}`.trim()) : undefined,
    date: fromParts((m['published-print'] ?? m['published-online'] ?? m.issued)?.['date-parts']?.[0]),
    venue: type === 'book' ? undefined : tidy(m['container-title']?.[0]),
    volume: m.volume,
    issue: m.issue,
    pages: dash(m.page),
    publisher: type === 'book' || type === 'chapter' ? m.publisher : undefined,
    doi: m.DOI ?? id,
    isbn: type === 'book' ? m.ISBN?.[0] : undefined,
    abstract: m.abstract ? stripTags(m.abstract).replace(/^abstract\s*/i, '') : undefined,
  });
  return { section: publicationSection(type), data, source: 'Crossref' };
}

// ---------- ISBN (Open Library, then Google Books)

export async function lookupIsbn(isbn: string): Promise<Found> {
  const id = normIsbn(isbn);
  const ol = await get(`https://openlibrary.org/api/books?bibkeys=ISBN:${id}&format=json&jscmd=data`, { json: true }).catch(() => ({}));
  const b = ol[`ISBN:${id}`];
  if (b) {
    return { section: 'C.2', source: 'Open Library', data: clean({
      type: 'book', title: tidy(b.title), subtitle: tidy(b.subtitle),
      authors: withMe((b.authors ?? []).map((a: any) => splitName(a.name))),
      date: isoFrom(b.publish_date), publisher: b.publishers?.[0]?.name, place: b.publish_places?.[0]?.name, isbn: id,
    }) };
  }
  const gb = await get(`https://www.googleapis.com/books/v1/volumes?q=isbn:${id}`, { json: true }).catch(() => ({}));
  const v = gb.items?.[0]?.volumeInfo;
  if (!v) throw new LookupError(`No book found for ISBN ${id} (Open Library and Google Books).`);
  return { section: 'C.2', source: 'Google Books', data: clean({
    type: 'book', title: tidy(v.title), subtitle: tidy(v.subtitle),
    authors: withMe((v.authors ?? []).map(splitName)), date: isoFrom(v.publishedDate), publisher: v.publisher, isbn: id,
    abstract: v.description ? stripTags(v.description) : undefined,
  }) };
}

// ---------- web address (page metadata)

/** the page's <meta> tags as name → values (lower-case names; name, property and itemprop) */
function metaTags(html: string) {
  const out = new Map<string, string[]>();
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attr = (a: string) => tag.match(new RegExp(`\\b${a}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i'))?.slice(2).find((x) => x !== undefined);
    const key = (attr('name') ?? attr('property') ?? attr('itemprop'))?.toLowerCase();
    const content = attr('content');
    if (key && content !== undefined) out.set(key, [...(out.get(key) ?? []), decode(content).trim()]);
  }
  return out;
}

const mediaType = (host: string): string =>
  /youtube\.com|youtu\.be|vimeo\.com|tiktok\.com/.test(host) ? 'video'
    : /podcasts\.apple|spotify\.com|podbean|buzzsprout|libsyn|anchor\.fm|simplecast|podcast/.test(host) ? 'podcast'
      : /cbc\.ca\/listen|bbc\.co\.uk\/sounds|npr\.org|radio/.test(host) ? 'radio' : 'press';

/**
 * A web address: a scholarly page (with a DOI or citation_* tags) becomes a publication;
 * anything else becomes a media item, or an op-ed when `as` is "op-ed".
 */
export async function lookupUrl(raw: string, as: 'media' | 'op-ed' = 'media'): Promise<Found> {
  let url: URL;
  try { url = new URL(raw.trim()); } catch { throw new LookupError('That is not a DOI, an ISBN or a full web address (starting with https://).'); }
  if (/(^|\.)google\.[a-z.]+$/.test(url.hostname) && url.searchParams.get('url')) return lookupUrl(url.searchParams.get('url')!, as);
  if (/(^|\.)doi\.org$/.test(url.hostname)) return lookupDoi(url.pathname.slice(1));

  const html: string = await get(url.href, { browser: true });
  const meta = metaTags(html);
  const one = (...keys: string[]) => { for (const k of keys) { const v = meta.get(k)?.find(Boolean); if (v) return v; } return undefined; };

  // scholarly pages: a DOI in the metadata (or in the address) goes through Crossref
  const doi = one('citation_doi', 'dc.identifier', 'prism.doi', 'bepress_citation_doi')?.match(DOI_RE)?.[1] ?? (as === 'media' ? url.pathname.match(DOI_RE)?.[1] : undefined);
  if (doi && as === 'media') {
    try { return await lookupDoi(doi); } catch { /* fall back to the page's own tags */ }
  }
  const citationTitle = one('citation_title');
  if (citationTitle && as === 'media') {
    const type = meta.has('citation_book_title') ? 'chapter' : meta.has('citation_journal_title') ? 'article' : 'other';
    const first = one('citation_firstpage'), last = one('citation_lastpage');
    return { section: publicationSection(type), source: 'the page’s citation details', data: clean({
      type, title: tidy(citationTitle), authors: withMe((meta.get('citation_author') ?? []).map(splitName)),
      date: isoFrom(one('citation_publication_date', 'citation_date', 'citation_online_date')),
      venue: one('citation_journal_title', 'citation_book_title'), volume: one('citation_volume'), issue: one('citation_issue'),
      pages: first ? (last ? `${first}–${last}` : first) : undefined, publisher: one('citation_publisher'),
      doi: doi ? normDoi(doi) : undefined, isbn: one('citation_isbn'), publisher_url: url.href,
      abstract: one('citation_abstract'),
    }) };
  }

  // everything else: a media item or an op-ed
  const host = url.hostname.replace(/^www\./, '');
  const jsonLdDate = html.match(/"datePublished"\s*:\s*"([^"]+)"/)?.[1] ?? html.match(/"uploadDate"\s*:\s*"([^"]+)"/)?.[1];
  const title = tidy(one('og:title', 'twitter:title', 'title') ?? html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]);
  const outlet = tidy(one('og:site_name', 'application-name')) ?? host;
  // drop a site name tacked on to the title ("… | Aeon Essays", "… - YouTube")
  const shortTitle = title?.replace(/\s+[|–—-]\s+[^|–—-]{2,40}$/, (m) => (title.length - m.length > 20 ? '' : m));
  const date = isoFrom(one('article:published_time', 'datepublished', 'uploaddate', 'date', 'pubdate', 'publish-date', 'dc.date', 'dcterms.created', 'parsely-pub-date', 'sailthru.date') ?? jsonLdDate);
  const summary = tidy(one('og:description', 'description', 'twitter:description'));
  if (as === 'op-ed') {
    return { section: 'C.3', source: 'the page', data: clean({
      type: 'op-ed', title: shortTitle, authors: [myAuthor()], date, venue: outlet, publisher_url: url.href, abstract: summary,
    }) };
  }
  return { section: 'C.8', source: 'the page', data: clean({
    type: mediaType(url.href), title: shortTitle, outlet, date, url: url.href, summary,
  }) };
}

/** Decide what the text is (DOI, ISBN or web address) and look it up. */
export async function lookup(q: string, as: 'media' | 'op-ed' = 'media'): Promise<Found> {
  const s = q.trim();
  if (!s) throw new LookupError('Paste a DOI, an ISBN or a web address.');
  if (/^https?:\/\//i.test(s) && !/(^|\.)doi\.org\//i.test(s)) return lookupUrl(s, as);
  const doi = s.match(DOI_RE)?.[1];
  if (doi) return lookupDoi(doi);
  if (isIsbn(s)) return lookupIsbn(s);
  if (/^[\w-]+(\.[\w-]+)+\//.test(s)) return lookupUrl(`https://${s}`, as);
  throw new LookupError('That is not a DOI, an ISBN or a full web address (starting with https://).');
}

/** The identifiers a looked-up entry carries, to check against what is already in data/. */
export function keysOf(data: Record<string, any>): string[] {
  const keys: string[] = [];
  if (data.doi) keys.push(`doi:${normDoi(data.doi)}`);
  if (data.isbn) keys.push(`isbn:${normIsbn(String(data.isbn))}`);
  for (const u of [data.url, data.publisher_url]) if (u) keys.push(`url:${normUrl(u)}`);
  return keys;
}
