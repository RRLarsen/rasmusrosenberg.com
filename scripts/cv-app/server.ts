// The CV app: a small local server (http://localhost:4400, this computer only) that edits the
// files in data/, checks every entry with the site's own rules (src/schemas.ts), keeps student
// names in private/, and rebuilds the PDF CV after each save. Start it with `npm run cv`.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { parseDocument, parse, stringify, isSeq, isMap, type Document } from 'yaml';
import { makeSchemas } from '../../src/schemas.ts';
import { sections, type Section, type Field } from './sections.ts';

const ROOT = process.cwd();
const DATA = join(ROOT, 'data');
const PUBLIC_DIR = join(ROOT, 'scripts', 'cv-app', 'public');
const NAMES_FILE = join(ROOT, 'private', 'supervision-names.yaml');
const PORT = Number(process.env.CV_APP_PORT ?? 4400);

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
        const text = cleaned[f.name] === undefined ? '' : stringify({ [f.name]: cleaned[f.name] }, { lineWidth: 88 });
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
  if (unchanged) {
    // nothing to write; only the private name may have changed
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
const types: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.pdf': 'application/pdf' };
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
      const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      if (file.includes('..')) return json(res, 400, { error: 'Bad path' });
      return sendFile(res, join(PUBLIC_DIR, file));
    }

    const [, what, id, key] = parts;
    if (what === 'config' && req.method === 'GET') {
      const tags = (parse(readFileSync(fileOf('tags'), 'utf8')) ?? []).map((t: any) => ({ id: t.id, label: t.label }));
      const pubs = (parse(readFileSync(fileOf('publications'), 'utf8')) ?? []).map((p: any) => ({ id: p.id, label: `${p.title} (${String(p.date ?? p.stage ?? '').slice(0, 4)})` }));
      const counts = Object.fromEntries(sections.filter((s) => s.mode === 'list').map((s) => [s.id, entriesOf(s).length]));
      return json(res, 200, { sections, tags, publications: pubs, counts });
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
      const message = String(body.message || 'Update CV data').slice(0, 200);
      const run = (args: string[]) => new Promise<string>((resolve, reject) =>
        execFile('git', args, { cwd: ROOT }, (err, out, errOut) => (err ? reject(new Error(errOut || out || err.message)) : resolve(out))));
      await run(['add', 'data']);
      const staged = await run(['diff', '--cached', '--name-only', '--', 'data']);
      if (!staged.trim()) return json(res, 200, { ok: true, message: 'Nothing new to save in a checkpoint.' });
      await run(['commit', '-m', message, '--', 'data']);
      return json(res, 200, { ok: true, message: `Checkpoint saved: ${staged.trim().split('\n').length} file(s).` });
    }
    throw new HttpError(404, 'Unknown request');
  } catch (e: any) {
    json(res, e.status ?? 500, { error: e.message ?? String(e) });
  }
}).listen(PORT, '127.0.0.1', () => {
  const url = `http://localhost:${PORT}`;
  console.log(`CV app running at ${url} (this computer only). Press Ctrl+C to stop.`);
  if (!process.env.CV_APP_NO_OPEN) spawn('open', [url], { stdio: 'ignore', detached: true }).unref();
});
