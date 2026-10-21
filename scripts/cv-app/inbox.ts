// The suggestions inbox: new publications (OpenAlex, Crossref and ORCID, by ORCID iD), new
// videos on the YouTube channel, and Google Alerts. A check writes what it finds to
// generated/inbox.json; anything already in data/ (matched on DOI or web address) or
// dismissed (data/inbox.yaml) is left out when the inbox is shown. Nothing enters the CV
// until it is approved: approving opens a filled-in form to check and save.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { parse, parseDocument, isSeq } from 'yaml';
import { knownIndex, normDoi, normUrl, type KnownEntry } from './lookup.ts';

const ROOT = process.cwd();
const INBOX_FILE = join(ROOT, 'generated', 'inbox.json');
const SETTINGS_FILE = join(ROOT, 'data', 'inbox.yaml');
// Google Alerts feed addresses belong to your Google account, so they stay out of the public repo
const ALERTS_FILE = join(ROOT, 'private', 'alerts.yaml');
const UA = 'rasmusrosenberg.com CV builder (https://rasmusrosenberg.com)';

export interface Suggestion {
  key: string; // "doi:…" or "url:…"
  kind: 'publication' | 'media';
  title: string;
  detail?: string;
  date?: string;
  url?: string;
  doi?: string;
  sources: string[];
}

interface Stored { checked_at?: string; problems?: Record<string, string>; items: Suggestion[] }

// ---------- settings

const profile = () => parse(readFileSync(join(ROOT, 'data', 'profile.yaml'), 'utf8'));
const orcidId = () => String(profile().links?.orcid ?? '').match(/\d{4}-\d{4}-\d{4}-\d{3}[\dX]/)?.[0];
const settings = (): { youtube_channel_id?: string; dismissed: string[] } => ({ dismissed: [], ...(existsSync(SETTINGS_FILE) ? parse(readFileSync(SETTINGS_FILE, 'utf8')) ?? {} : {}) });

function writeSetting(key: 'youtube_channel_id' | 'dismissed', value: unknown) {
  const doc = parseDocument(existsSync(SETTINGS_FILE) ? readFileSync(SETTINGS_FILE, 'utf8') : '');
  if (key === 'dismissed') {
    const seq = doc.get('dismissed', true);
    if (isSeq(seq)) { seq.flow = false; seq.add(value); } else doc.set('dismissed', [value]);
  } else doc.set(key, value);
  writeFileSync(SETTINGS_FILE, doc.toString({ lineWidth: 0 }));
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
  const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`${new URL(url).hostname} answered ${r.status}`);
  return r.text();
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

// ---------- checking and listing

let checking: Promise<Stored> | null = null;

/** Ask every source for new items and store them (one check at a time). */
export function check(): Promise<Stored> {
  checking ??= (async () => {
    const orcid = orcidId();
    const jobs: [string, Promise<Suggestion[]>][] = [
      ...(orcid ? [['OpenAlex', fromOpenAlex(orcid)], ['Crossref', fromCrossref(orcid)], ['ORCID', fromOrcid(orcid)]] as [string, Promise<Suggestion[]>][] : []),
      ['YouTube', fromYouTube()],
      ...alertFeeds().map((f, i) => [`Google Alerts${alertFeeds().length > 1 ? ` ${i + 1}` : ''}`, fromAlert(f)] as [string, Promise<Suggestion[]>]),
    ];
    const results = await Promise.allSettled(jobs.map(([, p]) => p));
    const problems: Record<string, string> = {};
    const byKey = new Map<string, Suggestion>();
    results.forEach((r, i) => {
      if (r.status === 'rejected') { problems[jobs[i][0]] = String(r.reason?.message ?? r.reason); return; }
      for (const s of r.value) {
        if (!s.key || s.key === 'url:' || !s.title) continue;
        const had = byKey.get(s.key);
        if (had) had.sources = [...new Set([...had.sources, ...s.sources])];
        else byKey.set(s.key, s);
      }
    });
    const stored: Stored = { checked_at: new Date().toISOString(), problems, items: [...byKey.values()] };
    mkdirSync(dirname(INBOX_FILE), { recursive: true });
    writeFileSync(INBOX_FILE, JSON.stringify(stored, null, 2));
    return stored;
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
  return { checked_at: s.checked_at, problems: s.problems ?? {}, items, feeds: alertFeeds().length };
}

export function find(key: string) {
  return stored().items.find((x) => x.key === key);
}

export function dismiss(key: string) {
  if (!settings().dismissed.includes(key)) writeSetting('dismissed', key);
}

/** older than a week (or never checked)? */
export const isStale = () => {
  const at = stored().checked_at;
  return !at || Date.now() - Date.parse(at) > 7 * 24 * 3600 * 1000;
};
