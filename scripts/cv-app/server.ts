// The dashboard: a small local server (http://localhost:4400, this computer only). Its home page
// (/) links the tools; /cv is the CV builder and /website the website content editor (the same
// app, showing different sections). It edits the files in data/, checks every entry with the
// site's own rules (src/schemas.ts), keeps student names in private/, rebuilds the PDF CV and
// site after each save, and can start the local website preview. Start it with
// `npm run dashboard` (or `npm run cv`).
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { spawn, execFile, execFileSync } from 'node:child_process';
import { parseDocument, parse, stringify, isSeq, isMap, Document } from 'yaml';
import { makeSchemas } from '../../src/schemas.ts';
import { sections, type Section, type Field } from './sections.ts';
import { lookup, knownIndex, keysOf, LookupError } from './lookup.ts';
import * as inbox from './inbox.ts';
import * as scholar from './scholar.ts';

const ROOT = process.cwd();
const DATA = join(ROOT, 'data');
const PUBLIC_DIR = join(ROOT, 'scripts', 'cv-app', 'public');
const NAMES_FILE = join(ROOT, 'private', 'supervision-names.yaml');
const PORT = Number(process.env.CV_APP_PORT ?? 4400);
const git = (args: string[]) => new Promise<string>((resolve, reject) =>
  execFile('git', args, { cwd: ROOT }, (err, out, errOut) => (err ? reject(new Error((errOut || out || err.message).trim())) : resolve(out))));

// ---------- files

const fileOf = (collection: string) => join(DATA, `${collection}.yaml`);
const readDoc = (collection: string) => parseDocument(readFileSync(fileOf(collection), 'utf8'));

const sectionById = (id: string) => {
  const s = sections.find((x) => x.id === id);
  if (!s) throw new HttpError(404, `No section ${id}`);
  return s;
};

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

/** the YAML list that holds a section's entries */
function listNode(doc: Document, s: Section) {
  const node = s.path ? doc.getIn(s.path, true) : doc.contents;
  if (!isSeq(node)) throw new HttpError(500, `${s.collection}.yaml${s.path ? ` → ${s.path.join('.')}` : ''} is not a list`);
  return node;
}

/** entries of a list section, each with a key: its id, or its position when entries have no id */
function entriesOf(s: Section) {
  const items = (s.path ? readDoc(s.collection).getIn(s.path) as any : readDoc(s.collection)).toJSON?.() ?? [];
  const list: any[] = Array.isArray(items) ? items : [];
  return list
    .map((data, index) => ({ key: data?.id ?? `#${index}`, data }))
    .filter(({ data }) => !s.filter || s.filter.values.includes(String(data?.[s.filter.field])));
}

// ---------- private names (supervision)

const readNames = (): Record<string, string> => (existsSync(NAMES_FILE) ? parse(readFileSync(NAMES_FILE, 'utf8')) ?? {} : {});
function writeName(id: string, name: string | undefined) {
  const doc = existsSync(NAMES_FILE) ? parseDocument(readFileSync(NAMES_FILE, 'utf8')) : parseDocument('# PRIVATE: student names. Never uploaded.\n{}\n');
  if (!isMap(doc.contents)) doc.contents = doc.createNode({}) as any;
  if (name) doc.set(id, name); else doc.delete(id);
  writeFileSync(NAMES_FILE, doc.toString());
}

// ---------- cleaning and checking

/** Drop empty values and values that equal the site's default, so the files stay tidy. */
function clean(data: Record<string, unknown>, fields: Field[] = []) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    const f = fields.find((x) => x.name === k);
    if (f?.type === 'private-name') continue;
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (f?.default !== undefined && v === f.default && f.name !== 'status') continue;
    out[k] = v;
  }
  return out;
}

/** Field order in the file: an existing entry keeps its order; otherwise id and status first, then the form's order. */
function ordered(data: Record<string, unknown>, fields: Field[] = [], existing: string[] = []) {
  const keys = [...existing, 'id', 'status', ...fields.map((f) => f.name).filter((n) => n !== 'status')];
  const out: Record<string, unknown> = {};
  for (const k of keys) if (k in data) out[k] = data[k];
  for (const k of Object.keys(data)) if (!(k in out)) out[k] = data[k];
  return out;
}

type Errors = Record<string, string>;
const issuesToErrors = (issues: { path: PropertyKey[]; message: string }[], prefix: PropertyKey[] = []): Errors => {
  const errors: Errors = {};
  for (const i of issues) {
    const path = i.path.slice(prefix.length);
    const key = path.length ? String(path[0]) : '_';
    errors[key] ??= key === '_' ? i.message : i.message.replace(/^Invalid input: expected (\w+), received undefined$/, 'Required');
  }
  return errors;
};

/** Check one entry (for whole-file sections, the whole file after the change). */
function check(s: Section, data: Record<string, unknown>, key?: string): Errors {
  const schemas = makeSchemas(DATA) as Record<string, any>;
  const cleaned = clean(data, s.fields);
  // required fields left empty
  const errors: Errors = {};
  for (const f of s.fields ?? []) if (f.required && (cleaned[f.name] === undefined)) errors[f.name] = 'Required';

  if (s.path || s.mode === 'object') {
    // validate the whole file with the change applied
    const doc = readDoc(s.collection);
    const whole = doc.toJSON() ?? {};
    const target = s.path ? s.path.reduce((o: any, k) => o[k], whole) : whole;
    if (s.mode === 'object') Object.assign(target, cleaned);
    else if (Array.isArray(target)) {
      const i = key?.startsWith('#') ? Number(key.slice(1)) : -1;
      if (i >= 0) target[i] = cleaned; else target.unshift(cleaned);
    }
    const r = schemas[s.collection].safeParse(whole);
    if (!r.success) {
      const prefix = s.path ?? [];
      const relevant = r.error.issues.filter((i: any) => prefix.every((p, n) => i.path[n] === p));
      Object.assign(errors, issuesToErrors(relevant.map((i: any) => ({ ...i, path: s.mode === 'list' ? i.path.slice(1) : i.path })), prefix));
    }
  } else {
    const r = schemas[s.collection].safeParse(cleaned);
    if (!r.success) Object.assign(errors, issuesToErrors(r.error.issues));
  }
  for (const k of Object.keys(errors)) if (errors[k] === 'Required' && cleaned[k] !== undefined) delete errors[k];
  return errors;
}

// ---------- saving
// Saving replaces only the text of the entry being saved; every other character of the file
// stays exactly as it was (comments, wrapping, quoting), so hand edits and the app coexist.

const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48).replace(/-$/, '');

function newId(s: Section, data: Record<string, unknown>) {
  const existing = new Set(entriesOf({ ...s, filter: undefined }).map((e) => e.key));
  const year = String(data.date ?? data.start ?? '').slice(0, 4);
  const words = String(data[s.summary?.title ?? 'title'] ?? s.collection);
  const prefix: Record<string, string> = { supervision: 'sup', awards: 'award', grants: 'grant', talks: String(data.category ?? 'talk') };
  const base = [prefix[s.collection] ?? '', year, slug(words)].filter(Boolean).join('-') || s.collection;
  let id = base, n = 2;
  while (existing.has(id)) id = `${base}-${n++}`;
  return id;
}

/** the same entry? (compared as the site sees it: numbers and dates as text) */
const norm = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(norm) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined && x !== '' && !(Array.isArray(x) && x.length === 0)).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, norm(x)])) : typeof v === 'number' ? String(v) : v;
const sameEntry = (a: unknown, b: unknown) => JSON.stringify(norm(a)) === JSON.stringify(norm(b));

const lineStart = (src: string, pos: number) => src.lastIndexOf('\n', pos - 1) + 1;
const lineEnd = (src: string, pos: number) => { const i = src.indexOf('\n', pos); return i < 0 ? src.length : i + 1; };
/** the text of a list item, from its "- " line to the end of its last line */
const span = (src: string, node: any) => ({ start: lineStart(src, node.range[0]), end: lineEnd(src, Math.max(node.range[0], node.range[1] - 1)) });
const indentOf = (src: string, pos: number) => pos - lineStart(src, pos);
const indentText = (text: string, n: number) => text.split('\n').map((l) => (l ? ' '.repeat(n) + l : l)).join('\n');
/** one list item as YAML text, e.g. "- id: x\n  title: y\n" */
const itemText = (data: unknown, indent: number) => indentText(stringify([data], { lineWidth: 88 }), indent);

/** One field as YAML: long text wrapped in a block (>- or, with line breaks, |-), like the hand-written files. */
function fieldYaml(k: string, v: unknown) {
  // numbers by year ({ "2025": 81 }) are written with plain year keys (2025: 81)
  const yearMap = v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).every((y) => /^\d{4}$/.test(y));
  const d = new Document({ [k]: yearMap ? new Map(Object.entries(v as object).map(([y, n]) => [Number(y), n])) : v });
  if (typeof v === 'string' && (v.includes('\n') || v.length > 80)) (d.get(k, true) as any).type = v.includes('\n') ? 'BLOCK_LITERAL' : 'BLOCK_FOLDED';
  return d.toString({ lineWidth: typeof v === 'string' && v.includes('\n') ? 0 : 88 });
}

/**
 * Change only the fields that differ: each changed field's lines are replaced, removed fields
 * are cut and new fields are added at the end of the entry, so the rest of the entry keeps its
 * exact text (style, quoting, comments). Returns null when the entry cannot be patched this way
 * (e.g. it is written on one line as { … }); the caller then rewrites the whole entry.
 */
function patchItem(src: string, item: any, entry: Record<string, unknown>): string | null {
  if (!isMap(item) || item.flow || !item.items.length) return null;
  const pairs = item.items as any[];
  if (pairs.some((p) => !p.key?.range || !(p.value?.range ?? p.key.range))) return null;
  const col = indentOf(src, pairs[0].key.range[0]);
  if (pairs.some((p) => indentOf(src, p.key.range[0]) !== col || lineStart(src, p.key.range[0]) !== p.key.range[0] - col)) return null;
  const fieldText = (k: string, v: unknown) => indentText(fieldYaml(k, v), col);
  const pairEnd = (p: any) => lineEnd(src, Math.max(p.key.range[0], (p.value?.range ?? p.key.range)[1] - 1));
  const edits: { from: number; to: number; text: string }[] = [];
  const old = item.toJSON();
  for (const p of pairs) {
    const k = String(p.key.value);
    const from = lineStart(src, p.key.range[0]);
    if (!(k in entry)) edits.push({ from, to: pairEnd(p), text: '' });
    else if (!sameEntry(old[k], entry[k])) edits.push({ from, to: pairEnd(p), text: fieldText(k, entry[k]) });
  }
  const added = Object.keys(entry).filter((k) => !(k in old));
  if (added.length) {
    const at = pairEnd(pairs[pairs.length - 1]);
    edits.push({ from: at, to: at, text: added.map((k) => fieldText(k, entry[k])).join('') });
  }
  if (!edits.length) return src;
  let out = src;
  for (const e of edits.sort((a, b) => b.from - a.from)) out = out.slice(0, e.from) + e.text + out.slice(e.to);
  // the patched entry must read back exactly as intended
  const check = parseDocument(out);
  return check.errors.length ? null : out;
}

function save(s: Section, body: { key?: string; data: Record<string, unknown> }) {
  const errors = check(s, body.data, body.key);
  if (Object.keys(errors).length) return { ok: false, errors };
  const file = fileOf(s.collection);
  let src = readFileSync(file, 'utf8');
  const doc = parseDocument(src);
  const cleaned = clean(body.data, s.fields);

  if (s.mode === 'object') {
    if (s.path) {
      // replace the whole map under the key (e.g. research_interests)
      const pair = (doc.contents as any).items.find((p: any) => p.key?.value === s.path![0]);
      if (pair && sameEntry(pair.value.toJSON(), cleaned)) return { ok: true, key: 'object' };
      // change only the fields that differ, keeping comments and style (as for list entries)
      const entry = ordered(cleaned, s.fields, pair && isMap(pair.value) ? Object.keys(pair.value.toJSON()) : []);
      const patched = pair && isMap(pair.value) ? patchItem(src, pair.value, entry) : null;
      if (patched !== null && sameEntry((parseDocument(patched).get(s.path[0]) as any)?.toJSON?.(), cleaned)) {
        writeFileSync(file, patched);
        return { ok: true, key: 'object' };
      }
      const text = indentText(stringify(cleaned, { lineWidth: 88 }), 2);
      if (pair) {
        const from = lineEnd(src, pair.key.range[0]);
        const to = lineEnd(src, Math.max(pair.value.range[0], pair.value.range[1] - 1));
        src = src.slice(0, from) + text + src.slice(to);
      } else {
        src = `${src.replace(/\n*$/, '\n')}\n${s.path[0]}:\n${text}`;
      }
    } else {
      // replace each changed top-level field (e.g. quotes, intro)
      for (const f of s.fields ?? []) {
        const d = parseDocument(src);
        const pair = (d.contents as any).items.find((p: any) => p.key?.value === f.name);
        if (sameEntry(pair?.value?.toJSON?.() ?? pair?.value, cleaned[f.name])) continue;
        const text = cleaned[f.name] === undefined ? '' : fieldYaml(f.name, cleaned[f.name]);
        if (pair) {
          const from = lineStart(src, pair.key.range[0]);
          const to = lineEnd(src, Math.max(pair.value.range[0], pair.value.range[1] - 1));
          src = src.slice(0, from) + text + src.slice(to);
        } else if (text) {
          src = `${src.replace(/\n*$/, '\n')}${text}`;
        }
      }
    }
    writeFileSync(file, src);
    return { ok: true, key: 'object' };
  }

  const list = listNode(doc, s);
  const hasIds = !s.path;
  let key = body.key;
  let index: number;
  let entry: Record<string, unknown>;
  if (hasIds) {
    const id = key && !key.startsWith('#') ? key : newId(s, cleaned);
    index = list.items.findIndex((it: any) => it?.get?.('id') === id);
    if (key && !key.startsWith('#') && index < 0) throw new HttpError(404, `No entry with id ${key}`);
    const old = index >= 0 ? (list.items[index] as any).toJSON() : {};
    entry = ordered({ ...cleaned, id }, s.fields, Object.keys(old));
    key = id;
  } else {
    index = key?.startsWith('#') ? Number(key.slice(1)) : -1;
    const old = index >= 0 ? (list.items[index] as any).toJSON() : {};
    entry = ordered(cleaned, s.fields, Object.keys(old));
    key = `#${index >= 0 ? index : 0}`;
  }

  const unchanged = index >= 0 && sameEntry((list.items[index] as any).toJSON(), entry);
  let patched: string | null = null;
  if (unchanged) {
    // nothing to write; only the private name may have changed
  } else if (index >= 0 && (patched = patchItem(src, list.items[index], entry)) !== null
    && sameEntry((listNode(parseDocument(patched), s).items[index] as any)?.toJSON(), entry)) {
    src = patched;
  } else if (index >= 0) {
    const { start, end } = span(src, list.items[index]);
    src = src.slice(0, start) + itemText(entry, indentOf(src, start + (src.slice(start).search(/\S/)))) + src.slice(end);
  } else if (list.items.length) {
    // a new entry goes first, separated like the existing ones (blank line or not)
    const first = list.items[0] as any;
    const { start } = span(src, first);
    const indent = src.slice(start).search(/\S/);
    const blank = list.items.length > 1 && /\n\s*\n\s*-/.test(src.slice(span(src, first).end - 1, span(src, list.items[1]).start + indent + 1));
    src = src.slice(0, start) + itemText(entry, indent) + (blank ? '\n' : '') + src.slice(start);
  } else {
    // an empty list ([]) becomes a block list
    const node = list as any;
    const indent = s.path ? 2 : 0;
    src = src.slice(0, node.range[0]) + (s.path ? '\n' : '') + itemText(entry, indent) + src.slice(lineEnd(src, node.range[1] - 1));
  }
  if (!unchanged) writeFileSync(file, src);

  if (s.fields?.some((f) => f.type === 'private-name')) {
    const name = String(body.data.student ?? '').trim();
    writeName(key!, name || undefined);
  }
  return { ok: true, key };
}

function remove(s: Section, key: string) {
  const file = fileOf(s.collection);
  let src = readFileSync(file, 'utf8');
  const list = listNode(parseDocument(src), s);
  const index = key.startsWith('#') ? Number(key.slice(1)) : list.items.findIndex((it: any) => it?.get?.('id') === key);
  if (index < 0 || index >= list.items.length) throw new HttpError(404, 'Entry not found');
  let { start, end } = span(src, list.items[index]);
  // take one neighbouring blank line with it
  if (src.slice(end).startsWith('\n')) end += 1;
  else if (start > 1 && src.slice(start - 2, start) === '\n\n') start -= 1;
  src = src.slice(0, start) + src.slice(end);
  writeFileSync(file, src);
  if (s.collection === 'supervision') writeName(key, undefined);
  return { ok: true };
}

// ---------- PDF rebuilds (one at a time; a request during a build queues one more)

let building = false, again = false, lastBuild = { ok: true, at: '', log: '' };
function rebuild() {
  if (building) { again = true; return; }
  building = true;
  const p = spawn('npm', ['run', 'build', '--silent'], { cwd: ROOT, env: process.env });
  let log = '';
  p.stdout.on('data', (d) => (log += d));
  p.stderr.on('data', (d) => (log += d));
  p.on('close', (code) => {
    lastBuild = { ok: code === 0, at: new Date().toISOString(), log: log.split('\n').filter((l) => /error|Error|CV \(/.test(l)).slice(-12).join('\n') };
    building = false;
    if (again) { again = false; rebuild(); }
  });
}

/** Add a DOI to a publication already in the CV, so OpenAlex and Crossref can match it from now on. */
function addDoi(sectionId: string, id: string, doi: string) {
  const s = sectionById(sectionId);
  if (s.collection !== 'publications') throw new HttpError(400, 'Only publications have DOIs.');
  const entry = entriesOf({ ...s, filter: undefined }).find((e) => e.key === id);
  if (!entry) throw new HttpError(404, 'That entry is no longer in the CV.');
  const r = save(s, { key: id, data: { ...entry.data, doi } });
  if (r.ok) rebuild();
  return r.ok ? { ok: true, section: sectionId, id } : { ok: false, error: Object.values(r.errors ?? {}).join(' ') };
}

// ---------- thumbnail suggestions: the preview images a web page offers (og:image and the like)

const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
async function suggestImages(page: string) {
  if (!/^https?:\/\//.test(page)) return { ok: false, message: 'Add the web address first; suggestions come from that page.', images: [] };
  let html = '', base = page;
  try {
    const r = await fetch(page, { headers: { 'User-Agent': BROWSER_UA, 'Accept-Language': 'en' }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
    if (!r.ok) return { ok: false, message: `The page answered ${r.status}; some sites block automated visits. Upload the image instead.`, images: [] };
    html = await r.text(); base = r.url;
  } catch { return { ok: false, message: 'The page could not be reached. Upload the image instead.', images: [] }; }
  const found: string[] = [];
  for (const tag of html.match(/<meta\b[^>]*>|<link\b[^>]*>/gi) ?? []) {
    const key = tag.match(/\b(?:property|name|rel)\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase() ?? '';
    const val = tag.match(/\b(?:content|href)\s*=\s*["']([^"']+)["']/i)?.[1];
    if (val && /^(og:image(:url|:secure_url)?|twitter:image(:src)?|image_src)$/.test(key)) found.push(val);
  }
  // also the first few large images in the article
  for (const m of html.matchAll(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
    const w = Number(m[0].match(/\bwidth\s*=\s*["']?(\d+)/i)?.[1] ?? 0);
    if (w >= 400) found.push(m[1]);
    if (found.length > 8) break;
  }
  const images = [...new Set(found.map((u) => { try { return new URL(u.replace(/&amp;/g, '&'), base).href; } catch { return ''; } }).filter(Boolean))].slice(0, 6);
  return { ok: true, message: images.length ? '' : 'The page offers no preview image. Upload one instead.', images };
}

// ---------- the local website preview (astro dev), started from the dashboard

const PREVIEW_URL = 'http://localhost:4321';
const PUBLIC_PDF = join(ROOT, 'public', 'rasmus-rosenberg-larsen-cv.pdf');
let previewProcess: ReturnType<typeof spawn> | null = null;
const previewRunning = () => fetch(PREVIEW_URL, { signal: AbortSignal.timeout(800) }).then(() => true, () => false);
async function startPreview() {
  if (previewProcess || (await previewRunning())) return;
  previewProcess = spawn('npm', ['run', 'dev', '--', '--port', '4321'], { cwd: ROOT, env: process.env, stdio: 'ignore' });
  previewProcess.on('exit', () => { previewProcess = null; });
}
// stop the preview with the dashboard
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) process.on(sig, () => { previewProcess?.kill(); process.exit(0); });

// ---------- opening the dashboard in a new browser window (not a tab)

function defaultBrowser(): string {
  try {
    const out = execFileSync('defaults', ['read', 'com.apple.LaunchServices/com.apple.launchservices.secure', 'LSHandlers'], { encoding: 'utf8' });
    return out.match(/LSHandlerRoleAll = "([^"]+)";\s*LSHandlerURLScheme = https;/)?.[1] ?? out.match(/LSHandlerURLScheme = https;\s*}?[^}]*?LSHandlerRoleAll = "([^"]+)"/)?.[1] ?? '';
  } catch { return ''; }
}
function openWindow(url: string) {
  const browser = defaultBrowser().toLowerCase();
  const run = (cmd: string, args: string[]) => spawn(cmd, args, { stdio: 'ignore', detached: true }).unref();
  if (browser.includes('chrome')) run('open', ['-na', 'Google Chrome', '--args', '--new-window', url]);
  else if (browser.includes('safari')) run('osascript', ['-e', `tell application "Safari" to make new document with properties {URL:"${url}"}`, '-e', 'tell application "Safari" to activate']);
  else if (browser.includes('firefox')) run('open', ['-na', 'Firefox', '--args', '--new-window', url]);
  else if (browser.includes('edge')) run('open', ['-na', 'Microsoft Edge', '--args', '--new-window', url]);
  else run('open', [url]);
}

// ---------- checkpoints (a git commit of data/)

async function checkpoint(message: string) {
  await git(['add', 'data']);
  const staged = await git(['diff', '--cached', '--name-only', '--', 'data']);
  if (!staged.trim()) return { ok: true, message: 'Nothing new to save in a checkpoint.' };
  await git(['commit', '-m', message.slice(0, 200), '--', 'data']);
  return { ok: true, message: `Checkpoint saved: ${staged.trim().split('\n').length} file(s).` };
}

// ---------- HTTP

const readBody = (req: IncomingMessage) => new Promise<any>((resolve, reject) => {
  let b = '';
  req.on('data', (c) => (b += c));
  req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch (e) { reject(new HttpError(400, 'Bad JSON')); } });
});
const json = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
};
const types: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.pdf': 'application/pdf', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };
const sendFile = (res: ServerResponse, path: string) => {
  if (!existsSync(path) || !statSync(path).isFile()) return json(res, 404, { error: 'Not found' });
  res.writeHead(200, { 'Content-Type': types[extname(path)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(readFileSync(path));
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
    const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);

    if (parts[0] !== 'api') {
      if (url.pathname === '/pdf/public') return sendFile(res, join(ROOT, 'public', 'rasmus-rosenberg-larsen-cv.pdf'));
      if (url.pathname === '/pdf/private') return sendFile(res, join(ROOT, 'private', 'rasmus-rosenberg-larsen-cv-private.pdf'));
      const pages: Record<string, string> = { '/': 'dashboard.html', '/cv': 'index.html', '/cv/': 'index.html', '/website': 'index.html', '/website/': 'index.html' };
      const file = pages[url.pathname] ?? url.pathname.slice(1);
      if (file.includes('..')) return json(res, 400, { error: 'Bad path' });
      // pdf.js, for the PDF preview (so links in the CV open in a new tab)
      if (file.startsWith('vendor/pdfjs/')) return sendFile(res, join(ROOT, 'node_modules', 'pdfjs-dist', file.slice('vendor/pdfjs/'.length)));
      // the site's own images (public/images), for thumbnail previews in the editor
      if (file.startsWith('site/images/')) return sendFile(res, join(ROOT, 'public', decodeURIComponent(file.slice('site/'.length))));
      // the website's serif, for the name wordmark in the banner
      if (file.startsWith('vendor/newsreader/')) return sendFile(res, join(ROOT, 'node_modules', '@fontsource-variable', 'newsreader', file.slice('vendor/newsreader/'.length)));
      return sendFile(res, join(PUBLIC_DIR, file));
    }

    const [, what, id, key] = parts;
    if (what === 'config' && req.method === 'GET') {
      const tags = (parse(readFileSync(fileOf('tags'), 'utf8')) ?? []).map((t: any) => ({ id: t.id, label: t.label }));
      const pubs = (parse(readFileSync(fileOf('publications'), 'utf8')) ?? []).map((p: any) => ({ id: p.id, label: `${p.title} (${String(p.date ?? p.stage ?? '').slice(0, 4)})` }));
      const counts = Object.fromEntries(sections.filter((s) => s.mode === 'list').map((s) => [s.id, entriesOf(s).length]));
      // media items and talks, newest first, for choosing promotions on the home page
      const byDate = (a: any, b: any) => String(b.date ?? '').localeCompare(String(a.date ?? ''));
      const media = (parse(readFileSync(fileOf('media'), 'utf8')) ?? []).filter((m: any) => m.status === 'published').sort(byDate)
        .map((m: any) => ({ id: m.id, label: `${String(m.date).slice(0, 7)} · ${m.outlet}: ${String(m.title).replace(/\*/g, '')}` }));
      const talks = (parse(readFileSync(fileOf('talks'), 'utf8')) ?? []).filter((t: any) => t.status === 'published').sort(byDate)
        .map((t: any) => ({ id: t.id, label: `${String(t.date).slice(0, 10)} · ${t.event}: ${t.title}` }));
      const research = (parse(readFileSync(fileOf('publications'), 'utf8')) ?? []).filter((p: any) => p.status === 'published')
        .sort((a: any, b: any) => String(b.date ?? '9999').localeCompare(String(a.date ?? '9999')))
        .map((p: any) => ({ id: p.id, label: `${String(p.date ?? p.stage ?? '').slice(0, 4)} · ${p.title}${p.venue ? ` (${p.venue})` : ''}` }));
      return json(res, 200, { sections, tags, publications: pubs, research, media, talks, counts });
    }
    if (what === 'section') {
      const s = sectionById(id);
      if (req.method === 'GET') {
        if (s.mode === 'yaml') return json(res, 200, { text: readFileSync(fileOf(s.collection), 'utf8') });
        if (s.mode === 'object') {
          const whole = readDoc(s.collection).toJSON() ?? {};
          return json(res, 200, { data: s.path ? s.path.reduce((o: any, k) => o?.[k], whole) ?? {} : whole });
        }
        const names = s.collection === 'supervision' ? readNames() : {};
        return json(res, 200, { entries: entriesOf(s).map((e) => (s.collection === 'supervision' ? { ...e, data: { ...e.data, student: names[e.key] ?? '' } } : e)) });
      }
      const body = await readBody(req);
      if (req.method === 'POST' && key === 'check') return json(res, 200, { errors: check(s, body.data ?? {}, body.key) });
      if (req.method === 'PUT' && s.mode === 'yaml') {
        let parsed: unknown;
        try { parsed = parse(body.text); } catch (e: any) { return json(res, 200, { ok: false, errors: { _: `YAML: ${e.message}` } }); }
        const r = (makeSchemas(DATA) as any)[s.collection].safeParse(parsed);
        if (!r.success) return json(res, 200, { ok: false, errors: { _: r.error.issues.map((i: any) => `${i.path.join('.')}: ${i.message}`).join('\n') } });
        writeFileSync(fileOf(s.collection), body.text);
        rebuild();
        return json(res, 200, { ok: true });
      }
      if (req.method === 'PUT') { const r = save(s, body); if (r.ok) rebuild(); return json(res, 200, r); }
      if (req.method === 'DELETE' && key) { const r = remove(s, key); rebuild(); return json(res, 200, r); }
    }
    if (what === 'build') {
      if (req.method === 'POST') rebuild();
      return json(res, 200, { building, ...lastBuild });
    }
    if (what === 'checkpoint' && req.method === 'POST') {
      const body = await readBody(req);
      return json(res, 200, await checkpoint(String(body.message || 'Update CV data')));
    }

    // thumbnails: suggestions from a page, a proxy so the editor can crop remote images, and saving
    if (what === 'image') {
      if (id === 'fetch' && req.method === 'GET') {
        const src = url.searchParams.get('url') ?? '';
        if (!/^https?:\/\//.test(src)) throw new HttpError(400, 'Not a web address.');
        const r = await fetch(src, { headers: { 'User-Agent': BROWSER_UA, Accept: 'image/*' }, signal: AbortSignal.timeout(20000) }).catch(() => null);
        const type = r?.headers.get('content-type') ?? '';
        if (!r?.ok || !type.startsWith('image/')) throw new HttpError(502, 'The image could not be downloaded (the site may block it).');
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.length > 15e6) throw new HttpError(413, 'The image is too large.');
        res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
        return res.end(buf);
      }
      if (id === 'suggest' && req.method === 'POST') {
        const body = await readBody(req);
        return json(res, 200, await suggestImages(String(body.url ?? '')));
      }
      if (id === 'save' && req.method === 'POST') {
        const body = await readBody(req);
        const name = String(body.name ?? '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
        const m = String(body.data ?? '').match(/^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/);
        if (!name || !m) throw new HttpError(400, 'Nothing to save.');
        const rel = `/images/media/${name}.jpg`;
        writeFileSync(join(ROOT, 'public', rel), Buffer.from(m[1], 'base64'));
        return json(res, 200, { ok: true, path: rel });
      }
    }

    // the dashboard's overview: build, git, inbox and local website
    if (what === 'status' && req.method === 'GET') {
      const remote = await git(['remote', 'get-url', 'origin']).then((x) => x.trim()).catch(() => '');
      const changed = (await git(['status', '--porcelain', '--', 'data'])).trim().split('\n').filter(Boolean).length;
      const [when, message] = (await git(['log', '-1', '--format=%cI%x09%s', '--', 'data']).catch(() => '')).trim().split('\t');
      const box = inbox.list();
      const upstream = remote ? await git(['rev-parse', '--abbrev-ref', '@{u}']).then((x) => x.trim()).catch(() => '') : '';
      const ahead = upstream ? Number((await git(['rev-list', '--count', '@{u}..HEAD'])).trim()) : 0;
      // the notifications feed: anything that needs attention, newest concerns first
      type Note = { level: 'info' | 'action' | 'error'; title: string; detail?: string; href?: string; action?: 'checkpoint' | 'publish' | 'check' | 'scholar' };
      const notes: Note[] = [];
      if (!lastBuild.ok) notes.push({ level: 'error', title: 'The last update of the PDF and website failed', detail: lastBuild.log || 'See the dashboard’s terminal for details.' });
      if (changed) notes.push({ level: 'action', title: `${changed} changed file${changed > 1 ? 's' : ''} not yet saved in a checkpoint`, detail: 'A checkpoint keeps a copy you can return to.', action: 'checkpoint' });
      if (ahead) notes.push({ level: 'action', title: `${ahead} checkpoint${ahead > 1 ? 's' : ''} not yet published`, detail: 'Publish to update the live website.', action: 'publish' });
      for (const [src, msg] of Object.entries(box.problems ?? {})) notes.push({ level: 'error', title: `Could not reach ${src}`, detail: msg, action: 'check' });
      const sch = scholar.lastAttempt();
      if (sch && Date.now() - Date.parse(sch.at) < 14 * 24 * 3600 * 1000 && (!sch.ok || sch.changes?.length)) {
        notes.push(sch.ok
          ? { level: 'info', title: sch.message, detail: `Checked ${new Date(sch.at).toLocaleDateString('en-CA')}.`, href: '/website#W.4' }
          : { level: 'error', title: 'Google Scholar figures could not be updated', detail: sch.message, action: 'scholar' });
      }
      for (const x of box.items) notes.push({ level: 'info', title: x.title, detail: `New ${x.kind === 'publication' ? 'publication' : 'media mention'} · ${x.sources.join(', ')}${x.date ? ` · ${x.date}` : ''}`, href: `/cv#inbox:${encodeURIComponent(x.key)}` });
      return json(res, 200, {
        name: parse(readFileSync(fileOf('profile'), 'utf8')).name,
        notifications: notes,
        // before the first rebuild in this session, report when the PDF file was last written
        build: { building, ...lastBuild, at: lastBuild.at || (existsSync(PUBLIC_PDF) ? statSync(PUBLIC_PDF).mtime.toISOString() : '') },
        git: { remote, changed, ahead, last: when ? { when, message } : null },
        inbox: { count: box.items.length, checked_at: box.checked_at },
        preview: { running: await previewRunning(), url: PREVIEW_URL, starting: !!previewProcess && !(await previewRunning()) },
        counts: Object.fromEntries(sections.filter((x) => x.mode === 'list').map((x) => [x.id, entriesOf(x).length])),
      });
    }
    if (what === 'preview' && id === 'start' && req.method === 'POST') {
      startPreview();
      return json(res, 200, { ok: true });
    }

    // Google Scholar figures: one fetch of the public profile page (see scholar.ts for the limits)
    if (what === 'scholar' && id === 'update' && req.method === 'POST') {
      const r = await scholar.update();
      if (r.ok) rebuild();
      return json(res, 200, r);
    }

    // quick add: DOI, ISBN or web address → a filled-in form (not saved)
    if (what === 'lookup' && req.method === 'POST') {
      const body = await readBody(req);
      try {
        const found = await lookup(String(body.q ?? ''), body.as === 'op-ed' ? 'op-ed' : 'media');
        const known = knownIndex();
        const match = keysOf(found.data).map((k) => known.get(k)).find(Boolean);
        const similar = match || !found.data.title ? undefined : inbox.similarEntry(String(found.data.title), found.section === 'C.8' ? 'media' : 'publication', known);
        return json(res, 200, { ok: true, found, known: match, similar });
      } catch (e: any) {
        if (e instanceof LookupError) return json(res, 200, { ok: false, error: e.message });
        throw e;
      }
    }

    // add a DOI to an existing publication (from quick add)
    if (what === 'add-doi' && req.method === 'POST') {
      const body = await readBody(req);
      return json(res, 200, addDoi(String(body.section), String(body.id), String(body.doi)));
    }

    // suggestions inbox
    if (what === 'inbox') {
      if (req.method === 'GET' && !id) {
        const stale = inbox.isStale();
        if (stale) inbox.check().catch(() => {}); // a weekly check, in the background
        return json(res, 200, { ...inbox.list(), checking: stale });
      }
      if (req.method === 'POST' && id === 'check') { await inbox.check(); return json(res, 200, inbox.list()); }
      if (id === 'searches') {
        if (req.method === 'GET') return json(res, 200, { searches: inbox.searches() });
        const body = await readBody(req);
        try { inbox.setSearches((body.searches ?? []).map((q: string) => q.trim()).filter(Boolean)); }
        catch (e: any) { return json(res, 200, { ok: false, error: e.message }); }
        return json(res, 200, { ok: true });
      }
      if (id === 'feeds') {
        if (req.method === 'GET') return json(res, 200, { feeds: inbox.alertFeeds() });
        const body = await readBody(req);
        try { inbox.setAlertFeeds((body.feeds ?? []).map((f: string) => f.trim()).filter(Boolean)); }
        catch (e: any) { return json(res, 200, { ok: false, error: e.message }); }
        return json(res, 200, { ok: true });
      }
      const body = await readBody(req);
      const item = inbox.find(String(body.key ?? ''));
      if (!item) throw new HttpError(404, 'That suggestion is no longer in the inbox.');
      if (id === 'dismiss' && req.method === 'POST') { inbox.dismiss(item.key); return json(res, 200, { ok: true }); }
      if (id === 'prepare' && req.method === 'POST') {
        if (item.prefill && body.as !== 'op-ed') return json(res, 200, { ok: true, found: { ...item.prefill, source: item.sources.join(', ') } });
        try {
          const found = await lookup(item.doi ?? item.url ?? '', body.as === 'op-ed' ? 'op-ed' : 'media');
          if (item.sources.includes('YouTube') && found.section === 'C.8') found.data.type = 'video';
          if (!found.data.title) found.data.title = item.title;
          if (!found.data.date && item.date) found.data.date = item.date;
          return json(res, 200, { ok: true, found });
        } catch (e: any) {
          if (!(e instanceof LookupError)) throw e;
          // the page could not be read: start from what the source gave us
          if (item.kind === 'media') return json(res, 200, { ok: true, found: { section: 'C.8', source: item.sources.join(', '), data: { type: item.sources.includes('YouTube') ? 'video' : 'press', title: item.title, date: item.date, url: item.url, outlet: '' } } });
          return json(res, 200, { ok: false, error: e.message });
        }
      }
      if (id === 'link' && req.method === 'POST') {
        const similar = inbox.list().items.find((x) => x.key === item.key)?.similar;
        if (!similar || similar.collection !== 'publications' || !item.doi) throw new HttpError(400, 'No matching entry to add the DOI to.');
        return json(res, 200, addDoi(similar.section, similar.id, item.doi));
      }
    }

    // publish: save a checkpoint of data/ and upload to GitHub (which rebuilds the live site)
    if (what === 'publish') {
      const remote = await git(['remote', 'get-url', 'origin']).then((x) => x.trim()).catch(() => '');
      const changed = (await git(['status', '--porcelain', '--', 'data'])).trim().split('\n').filter(Boolean).length;
      const upstream = remote ? await git(['rev-parse', '--abbrev-ref', '@{u}']).then((x) => x.trim()).catch(() => '') : '';
      const ahead = upstream ? Number((await git(['rev-list', '--count', '@{u}..HEAD'])).trim()) : remote ? Number((await git(['rev-list', '--count', 'HEAD'])).trim()) : 0;
      if (req.method === 'GET') return json(res, 200, { remote, changed, ahead });
      if (req.method === 'POST') {
        if (!remote) return json(res, 200, { ok: false, message: 'Not connected to GitHub yet. Publishing starts working once the site has a GitHub repository.' });
        const body = await readBody(req);
        if (changed) await checkpoint(String(body.message || 'Update CV data'));
        await git(upstream ? ['push'] : ['push', '-u', 'origin', 'HEAD']);
        return json(res, 200, { ok: true, message: 'Published. GitHub is rebuilding the website; the changes are live in a few minutes.' });
      }
    }
    throw new HttpError(404, 'Unknown request');
  } catch (e: any) {
    json(res, e.status ?? 500, { error: e.message ?? String(e) });
  }
}).on('error', async (err: NodeJS.ErrnoException) => {
  // already running (e.g. started earlier in another terminal): just open it
  if (err.code !== 'EADDRINUSE') throw err;
  const url = `http://localhost:${PORT}`;
  const ours = await fetch(`${url}/api/status`, { signal: AbortSignal.timeout(1500) }).then((r) => r.ok, () => false);
  if (!ours) { console.error(`Port ${PORT} is in use by another program. Close it, or start with CV_APP_PORT=4401 npm run dashboard.`); process.exit(1); }
  console.log(`The dashboard is already running at ${url}. Opening it.`);
  if (!process.env.CV_APP_NO_OPEN) openWindow(url);
  setTimeout(() => process.exit(0), 500);
}).listen(PORT, '127.0.0.1', () => {
  const url = `http://localhost:${PORT}`;
  console.log(`Dashboard running at ${url} (this computer only). Press Ctrl+C to stop.`);
  // the weekly online checks (Fridays): Google Scholar figures and the suggestions inbox. Run now
  // if due, and look again every hour, so a dashboard left open still checks on Friday.
  const weekly = () => {
    if (scholar.isDue()) scholar.update().then((r) => { console.log(r.message); if (r.ok) rebuild(); });
    if (inbox.isStale()) inbox.check().catch(() => {});
  };
  weekly();
  setInterval(weekly, 3600 * 1000);
  if (!process.env.CV_APP_NO_OPEN) openWindow(url);
});
