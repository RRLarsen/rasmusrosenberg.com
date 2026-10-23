// The suggestions inbox: new publications (OpenAlex, Crossref and ORCID, by ORCID iD), new
// videos on the YouTube channel, Google Alerts, and searches of Google News and Apple Podcasts. A check writes what it finds to
// generated/inbox.json; anything already in data/ (matched on DOI or web address) or
// dismissed (data/inbox.yaml) is left out when the inbox is shown. Nothing enters the CV
// until it is approved: approving opens a filled-in form to check and save.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { parse, parseDocument, isSeq } from 'yaml';
import { knownIndex, normDoi, normUrl, type KnownEntry } from './lookup.ts';
import { dueSince } from './schedule.ts';

const ROOT = process.cwd();
const INBOX_FILE = join(ROOT, 'generated', 'inbox.json');
const SETTINGS_FILE = join(ROOT, 'data', 'inbox.yaml');
// Google Alerts feed addresses belong to your Google account, so they stay out of the public repo
const ALERTS_FILE = join(ROOT, 'private', 'alerts.yaml');
const UA = 'rasmusrosenberg.com CV builder (https://www.rasmusrosenberg.com)';

export interface Suggestion {
  key: string; // "doi:…" or "url:…"
  kind: 'publication' | 'media';
  title: string;
  detail?: string;
  date?: string;
  url?: string;
  doi?: string;
  sources: string[];
  /** a ready-made entry, when the source already gives everything (podcast episodes) */
  prefill?: { section: string; data: Record<string, unknown> };
}

interface Stored {
  checked_at?: string;
  problems?: Record<string, string>;
  items: Suggestion[];
  /** Google News article ids already decoded to the real address (decoding costs two requests) */
  news_urls?: Record<string, string>;
}

/** used until searches are set in the app */
export const DEFAULT_SEARCHES = ['"Rasmus Rosenberg Larsen"', '"Rasmus Larsen" psychopathy', '"Psychopathy Unmasked" Larsen'];

// ---------- settings

const profile = () => parse(readFileSync(join(ROOT, 'data', 'profile.yaml'), 'utf8'));
const orcidId = () => String(profile().links?.orcid ?? '').match(/\d{4}-\d{4}-\d{4}-\d{3}[\dX]/)?.[0];
const settings = (): { youtube_channel_id?: string; searches?: string[]; dismissed: string[] } => ({ dismissed: [], ...(existsSync(SETTINGS_FILE) ? parse(readFileSync(SETTINGS_FILE, 'utf8')) ?? {} : {}) });

function writeSetting(key: 'youtube_channel_id' | 'searches' | 'dismissed', value: unknown) {
  const doc = parseDocument(existsSync(SETTINGS_FILE) ? readFileSync(SETTINGS_FILE, 'utf8') : '');
  if (key === 'dismissed') {
    const seq = doc.get('dismissed', true);
    if (isSeq(seq)) { seq.flow = false; seq.add(value); } else doc.set('dismissed', [value]);
  } else doc.set(key, value);
  writeFileSync(SETTINGS_FILE, doc.toString({ lineWidth: 0 }));
}

export const searches = (): string[] => settings().searches ?? DEFAULT_SEARCHES;
export function setSearches(list: string[]) {
  if (list.some((q) => q.length > 200)) throw new Error('A search is too long.');
  if ((list.join(' ').match(/"/g) ?? []).length % 2) throw new Error('A quotation mark is not closed.');
  writeSetting('searches', list);
}

export const alertFeeds = (): string[] => (existsSync(ALERTS_FILE) ? parse(readFileSync(ALERTS_FILE, 'utf8'))?.feeds ?? [] : []);
export function setAlertFeeds(feeds: string[]) {
  const bad = feeds.find((f) => !/^https:\/\/(www\.)?google\.[a-z.]+\/alerts\/feeds\/\d+\/\d+$/.test(f));
  if (bad) throw new Error(`Not a Google Alerts feed address: ${bad}`);
  mkdirSync(dirname(ALERTS_FILE), { recursive: true });
  writeFileSync(ALERTS_FILE, `# PRIVATE: Google Alerts feed addresses for the suggestions inbox. Never uploaded.\nfeeds:\n${feeds.map((f) => `  - ${f}\n`).join('')}`);
}

// ---------- sources

async function getJson(url: string, accept = 'application/json') {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: accept }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`${new URL(url).hostname} answered ${r.status}`);
  return r.json();
}
async function getText(url: string) {
  // some feeds (YouTube's in particular) fail now and then for a few minutes: try three times
  let last = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 4000 * attempt));
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
      if (r.ok) return r.text();
      last = `${new URL(url).hostname} answered ${r.status}`;
    } catch { last = `${new URL(url).hostname} did not answer`; }
  }
  throw new Error(`${last} (three tries; usually temporary)`);
}
const pad = (n: number) => String(n).padStart(2, '0');
const fromParts = (p?: number[]) => (p?.[0] ? [String(p[0]), p[1] ? pad(p[1]) : '', p[2] ? pad(p[2]) : ''].filter(Boolean).join('-') : undefined);
const xmlText = (s?: string) => (s ?? '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&')
  .replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

async function fromOpenAlex(orcid: string): Promise<Suggestion[]> {
  const j = await getJson(`https://api.openalex.org/works?filter=author.orcid:${orcid}&per-page=200&select=doi,display_name,publication_date,type,primary_location`);
  return j.results.filter((w: any) => w.doi).map((w: any) => ({
    key: `doi:${normDoi(w.doi)}`, kind: 'publication', title: w.display_name, date: w.publication_date, doi: normDoi(w.doi),
    detail: [w.primary_location?.source?.display_name, w.type].filter(Boolean).join(' · '), sources: ['OpenAlex'],
  }));
}

async function fromCrossref(orcid: string): Promise<Suggestion[]> {
  const j = await getJson(`https://api.crossref.org/works?filter=orcid:${orcid}&rows=200&select=DOI,title,container-title,issued,type`);
  return j.message.items.map((w: any) => ({
    key: `doi:${normDoi(w.DOI)}`, kind: 'publication', title: w.title?.[0] ?? '(untitled)', date: fromParts(w.issued?.['date-parts']?.[0]), doi: normDoi(w.DOI),
    detail: [w['container-title']?.[0], w.type].filter(Boolean).join(' · '), sources: ['Crossref'],
  }));
}

async function fromOrcid(orcid: string): Promise<Suggestion[]> {
  const j = await getJson(`https://pub.orcid.org/v3.0/${orcid}/works`);
  const out: Suggestion[] = [];
  for (const g of j.group ?? []) {
    const doi = g['external-ids']?.['external-id']?.find((x: any) => x['external-id-type'] === 'doi')?.['external-id-value'];
    const w = g['work-summary']?.[0];
    if (!doi || !w) continue;
    const d = w['publication-date'];
    out.push({
      key: `doi:${normDoi(doi)}`, kind: 'publication', title: w.title?.title?.value ?? '(untitled)', doi: normDoi(doi),
      date: d?.year?.value ? [d.year.value, d.month?.value, d.day?.value].filter(Boolean).join('-') : undefined,
      detail: [w['journal-title']?.value, w.type].filter(Boolean).join(' · '), sources: ['ORCID'],
    });
  }
  return out;
}

/** the channel id behind the YouTube address in profile.yaml (looked up once, then kept in data/inbox.yaml) */
async function youtubeChannel(): Promise<string | undefined> {
  const saved = settings().youtube_channel_id;
  if (saved) return saved;
  const page = profile().links?.youtube;
  if (!page) return undefined;
  const html = await getText(page);
  const id = html.match(/"channelId":"(UC[\w-]{22})"/)?.[1] ?? html.match(/channel\/(UC[\w-]{22})/)?.[1];
  if (id) writeSetting('youtube_channel_id', id);
  return id;
}

async function fromYouTube(): Promise<Suggestion[]> {
  const id = await youtubeChannel();
  if (!id) return [];
  const xml = await getText(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`);
  return (xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? []).map((e) => {
    const url = e.match(/<link rel="alternate" href="([^"]+)"/)?.[1] ?? '';
    return { key: `url:${normUrl(url)}`, kind: 'media' as const, title: xmlText(e.match(/<title>([\s\S]*?)<\/title>/)?.[1]), url,
      date: e.match(/<published>([^<]+)/)?.[1]?.slice(0, 10), detail: 'Video on your YouTube channel', sources: ['YouTube'] };
  });
}

async function fromAlert(feed: string): Promise<Suggestion[]> {
  const xml = await getText(feed);
  return (xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? []).map((e) => {
    const link = (e.match(/<link[^>]*href="([^"]+)"/)?.[1] ?? '').replace(/&amp;/g, '&');
    let url = link;
    try { url = new URL(link).searchParams.get('url') ?? link; } catch { /* keep as is */ }
    return { key: `url:${normUrl(url)}`, kind: 'media' as const, title: xmlText(e.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1]), url,
      date: e.match(/<published>([^<]+)/)?.[1]?.slice(0, 10), detail: xmlText(e.match(/<content[^>]*>([\s\S]*?)<\/content>/)?.[1]).slice(0, 220), sources: ['Google Alerts'] };
  });
}

// Google News search (no account needed). Its links are Google redirects; each is decoded once
// to the article's own address, so it can be matched against data/.
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
async function decodeNewsLink(id: string): Promise<string | undefined> {
  try {
    const page = await (await fetch(`https://news.google.com/rss/articles/${id}`, { headers: { 'User-Agent': BROWSER_UA }, signal: AbortSignal.timeout(15000) })).text();
    const sig = page.match(/data-n-a-sg="([^"]+)"/)?.[1], ts = page.match(/data-n-a-ts="([^"]+)"/)?.[1];
    if (!sig || !ts) return undefined;
    const inner = JSON.stringify(['garturlreq', [['X', 'X', ['X', 'X'], null, null, 1, 1, 'US:en', null, 1, null, null, null, null, null, 0, 1], 'X', 'X', 1, [1, 1, 1], 1, 1, null, 0, 0, null, 0], id, Number(ts), sig]);
    const r = await (await fetch('https://news.google.com/_/DotsSplashUi/data/batchexecute', {
      method: 'POST', signal: AbortSignal.timeout(15000),
      headers: { 'User-Agent': BROWSER_UA, 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: `f.req=${encodeURIComponent(JSON.stringify([[['Fbv4je', inner, null, 'generic']]]))}`,
    })).text();
    const url = JSON.parse(JSON.parse(r.split('\n\n')[1])[0][2])[1];
    return typeof url === 'string' && /^https?:\/\//.test(url) ? url : undefined;
  } catch { return undefined; }
}

async function fromGoogleNews(q: string, cache: Record<string, string>): Promise<Suggestion[]> {
  const r = await fetch(`https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-CA&gl=CA&ceid=CA:en`, { headers: { 'User-Agent': BROWSER_UA }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`news.google.com answered ${r.status}`);
  const items = ((await r.text()).match(/<item>[\s\S]*?<\/item>/g) ?? []).map((e) => {
    const id = e.match(/<guid[^>]*>([^<]+)<\/guid>/)?.[1] ?? '';
    const outlet = xmlText(e.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1]);
    const title = xmlText(e.match(/<title>([\s\S]*?)<\/title>/)?.[1]).replace(new RegExp(`\\s+-\\s+${outlet.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`), '');
    const pub = e.match(/<pubDate>([^<]+)/)?.[1];
    return { id, outlet, title, date: pub ? new Date(pub).toISOString().slice(0, 10) : undefined, link: (e.match(/<link>([^<]+)/)?.[1] ?? '').replace(/&amp;/g, '&') };
  });
  // decode new links, a few at a time
  const todo = items.filter((x) => x.id && !cache[x.id]);
  for (let i = 0; i < todo.length; i += 4) {
    await Promise.all(todo.slice(i, i + 4).map(async (x) => { const url = await decodeNewsLink(x.id); if (url) cache[x.id] = url; }));
  }
  return items.map((x) => {
    const url = cache[x.id] ?? x.link;
    return { key: `url:${normUrl(url)}`, kind: 'media' as const, title: x.title, url, date: x.date, detail: x.outlet, sources: ['Google News'] };
  });
}

/** every quoted phrase and other word of the search appears in the text (Apple's search is loose) */
function matches(q: string, text: string) {
  const t = text.toLowerCase();
  const phrases = [...q.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  const words = q.replace(/"[^"]*"/g, ' ').split(/\s+/).filter(Boolean);
  return [...phrases, ...words].every((w) => t.includes(w.toLowerCase()));
}

async function fromApplePodcasts(q: string): Promise<Suggestion[]> {
  const term = q.replace(/"/g, '').trim();
  const j = await getJson(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=podcast&entity=podcastEpisode&limit=100&country=CA`);
  return (j.results ?? [])
    .filter((r: any) => r.trackViewUrl && matches(q, `${r.trackName} ${r.collectionName} ${r.description ?? ''} ${r.shortDescription ?? ''}`))
    .map((r: any) => {
      const url = r.trackViewUrl.replace(/[?&]uo=\d+/, '');
      const date = String(r.releaseDate ?? '').slice(0, 10) || undefined;
      const summary = xmlText(r.shortDescription || r.description || '').slice(0, 400) || undefined;
      return {
        key: `url:${normUrl(url)}`, kind: 'media' as const, title: r.trackName, url, date, detail: `Podcast: ${r.collectionName}`, sources: ['Apple Podcasts'],
        prefill: { section: 'C.8', data: Object.fromEntries(Object.entries({ type: 'podcast', title: r.trackName, outlet: r.collectionName, date, url, summary }).filter(([, v]) => v)) },
      };
    });
}

// ---------- checking and listing

let checking: Promise<Stored> | null = null;

/** Ask every source for new items and store them (one check at a time). */
export function check(): Promise<Stored> {
  checking ??= (async () => {
    const orcid = orcidId();
    const newsUrls = { ...(stored().news_urls ?? {}) };
    const jobs: [string, Promise<Suggestion[]>][] = [
      ...(orcid ? [['OpenAlex', fromOpenAlex(orcid)], ['Crossref', fromCrossref(orcid)], ['ORCID', fromOrcid(orcid)]] as [string, Promise<Suggestion[]>][] : []),
      ['YouTube', fromYouTube()],
      ...alertFeeds().map((f, i) => [`Google Alerts${alertFeeds().length > 1 ? ` ${i + 1}` : ''}`, fromAlert(f)] as [string, Promise<Suggestion[]>]),
      ...searches().map((q) => [`Google News (${q})`, fromGoogleNews(q, newsUrls)] as [string, Promise<Suggestion[]>]),
      ...searches().map((q) => [`Apple Podcasts (${q})`, fromApplePodcasts(q)] as [string, Promise<Suggestion[]>]),
    ];
    const results = await Promise.allSettled(jobs.map(([, p]) => p));
    const problems: Record<string, string> = {};
    const byKey = new Map<string, Suggestion>();
    results.forEach((r, i) => {
      if (r.status === 'rejected') { problems[jobs[i][0]] = String(r.reason?.message ?? r.reason); return; }
      for (const s of r.value) {
        if (!s.key || s.key === 'url:' || !s.title) continue;
        const had = byKey.get(s.key);
        if (had) { had.sources = [...new Set([...had.sources, ...s.sources])]; had.prefill ??= s.prefill; }
        else byKey.set(s.key, s);
      }
    });
    const result: Stored = { checked_at: new Date().toISOString(), problems, items: [...byKey.values()], news_urls: newsUrls };
    mkdirSync(dirname(INBOX_FILE), { recursive: true });
    writeFileSync(INBOX_FILE, JSON.stringify(result, null, 2));
    return result;
  })().finally(() => { checking = null; });
  return checking;
}

const stored = (): Stored => (existsSync(INBOX_FILE) ? JSON.parse(readFileSync(INBOX_FILE, 'utf8')) : { items: [] });

// a rough title match, only to point at an entry that may be the same work (it is never merged automatically)
const words = (s: string) => new Set(s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length > 3));
function similarity(a: string, b: string) {
  const A = words(a), B = words(b);
  if (!A.size || !B.size) return 0;
  let n = 0;
  for (const w of A) if (B.has(w)) n++;
  return n / Math.min(A.size, B.size);
}

/**
 * An existing entry that may be the same work (a publication without a DOI, or a media item or
 * talk), found by title. Only a pointer for the user: entries are never merged automatically.
 */
export function similarEntry(title: string, kind: 'publication' | 'media', known = knownIndex()): KnownEntry | undefined {
  if (kind === 'publication') {
    const pubs = (parse(readFileSync(join(ROOT, 'data', 'publications.yaml'), 'utf8')) ?? []) as any[];
    const best = pubs.filter((p) => !p.doi).map((p) => ({ p, score: similarity(title, `${p.title} ${p.subtitle ?? ''}`) })).sort((a, b) => b.score - a.score)[0];
    return best && best.score >= 0.7 ? { section: ['op-ed', 'other', 'review'].includes(best.p.type) ? 'C.3' : 'C.2', id: best.p.id, title: best.p.title, collection: 'publications' } : undefined;
  }
  const entries = [...new Map([...known.values()].filter((e) => e.collection !== 'publications').map((e) => [`${e.collection}:${e.id}`, e])).values()];
  const best = entries.map((e) => ({ e, score: similarity(title, e.title) })).sort((a, b) => b.score - a.score)[0];
  return best && best.score >= 0.7 ? best.e : undefined;
}

/** The inbox as shown: new items only, newest first, each with a possible match among existing entries. */
export function list() {
  const s = stored();
  const known = knownIndex();
  const dismissed = new Set(settings().dismissed);
  const items = s.items
    .filter((x) => !known.has(x.key) && !dismissed.has(x.key))
    .map((x) => ({ ...x, similar: similarEntry(x.title, x.kind, known) }))
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  return { checked_at: s.checked_at, problems: s.problems ?? {}, items, feeds: alertFeeds().length, searches: searches() };
}

export function find(key: string) {
  return stored().items.find((x) => x.key === key);
}

export function dismiss(key: string) {
  if (!settings().dismissed.includes(key)) writeSetting('dismissed', key);
}

/** older than a week (or never checked)? */
/** due this week? (checked on Fridays, see schedule.ts) */
export const isStale = () => {
  const at = stored().checked_at;
  return dueSince(at ? Date.parse(at) : 0);
};
