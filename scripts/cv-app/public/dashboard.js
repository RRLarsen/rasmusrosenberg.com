// The dashboard: the notifications feed, the tool tiles, and the Checkpoint and Publish buttons.
import { drawWordmark } from '/wordmark.js';

const $ = (sel) => document.querySelector(sel);
const el = (tag, attrs = {}, ...children) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k === 'text') n.textContent = v;
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c !== undefined && c !== null && c !== false) n.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return n;
};
const api = async (path, opts = {}) => {
  const r = await fetch(`/api/${path}`, { headers: { 'Content-Type': 'application/json' }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? r.statusText);
  return j;
};
const setStatus = (text, kind = '') => { $('#status').textContent = text; $('#status').className = `status ${kind}`; };
const ago = (iso) => {
  if (!iso) return 'never';
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} minutes ago`;
  if (s < 86400) return `${Math.round(s / 3600)} hours ago`;
  return new Date(iso).toLocaleDateString([], { dateStyle: 'medium' });
};

let st, named = false;
async function refresh() {
  try { st = await api('status'); } catch (err) { setStatus(`Could not load the status: ${err.message}`, 'error'); return; }
  if (!named) { drawWordmark(st.name); named = true; }

  // notifications feed
  const notes = $('#notes');
  notes.replaceChildren();
  for (const n of st.notifications) {
    const body = [el('span', { class: 't', text: n.title }), n.detail ? el('span', { class: 'd', text: n.detail }) : null];
    if (n.action) body.push(el('button', { type: 'button', class: 'act', onclick: () => actions[n.action]() }, { checkpoint: 'Checkpoint', publish: 'Publish', check: 'Check again', scholar: 'Try again' }[n.action]));
    notes.append(el('li', {}, n.href ? el('a', { class: `note ${n.level}`, href: n.href }, body) : el('div', { class: `note ${n.level}` }, body)));
  }
  if (!st.notifications.length) notes.append(el('li', { class: 'empty', text: 'Nothing needs your attention.' }));
  $('#feed-count').textContent = st.notifications.length;
  $('#feed-count').hidden = !st.notifications.length;
  const g = st.git;
  $('#feed-meta').textContent = `Online sources last checked ${ago(st.inbox.checked_at)}. Last checkpoint: ${g.last ? `“${g.last.message}”, ${ago(g.last.when)}` : 'none'}.`;

  // tiles
  const cvCount = Object.entries(st.counts).filter(([id]) => /^[A-E]/.test(id)).reduce((n, [, c]) => n + c, 0);
  $('#cv-meta').textContent = `${cvCount} entries.`;
  const b = st.build;
  $('#build-meta').textContent = b.building ? 'Updating the PDF and website…' : b.at ? `PDF ${b.ok ? 'updated' : 'update failed'} ${ago(b.at)}.` : '';
  $('#preview-meta').textContent = st.preview.running ? `Local website running at ${st.preview.url}.` : st.preview.starting ? 'Starting the local website…' : 'Open Website starts the local preview if needed.';

  // banner buttons
  $('#checkpoint').disabled = !g.changed;
  $('#publish').disabled = !g.remote;
  $('#publish').title = g.remote ? 'Upload your checkpoints to the live website' : 'Publishing starts working once the site is on GitHub';
}

const actions = {
  async checkpoint() {
    const message = prompt('Describe this checkpoint (e.g. "Added CBC Ideas interview"):', 'Update CV');
    if (message === null) return;
    try { const r = await api('checkpoint', { method: 'POST', body: { message } }); setStatus(r.message); }
    catch (err) { setStatus(`Checkpoint failed: ${err.message}`, 'error'); }
    refresh();
  },
  async publish() {
    const s = await api('publish');
    if (!s.remote) { setStatus('Publishing starts working once the site is on GitHub.', 'error'); return; }
    if (!s.changed && !s.ahead) { setStatus('Nothing new to publish: the live website is up to date.'); return; }
    let message = 'Update CV data';
    if (s.changed) {
      message = prompt(`Describe the changes for the checkpoint made before publishing (${s.changed} changed file(s) in data/):`, 'Update CV');
      if (message === null) return;
    }
    if (!confirm('Publish to the live website? Your checkpoints are uploaded to GitHub, which rebuilds the site.')) return;
    setStatus('Publishing…');
    try { const r = await api('publish', { method: 'POST', body: { message } }); setStatus(r.message, r.ok ? '' : 'error'); }
    catch (err) { setStatus(`Publishing failed: ${err.message}`, 'error'); }
    refresh();
  },
  async scholar() {
    setStatus('Reading your Google Scholar profile…');
    try { const r = await api('scholar/update', { method: 'POST' }); setStatus(r.message, r.ok ? '' : 'error'); }
    catch (err) { setStatus(`Update failed: ${err.message}`, 'error'); }
    refresh();
  },
  async check() {
    $('#check-now').disabled = true;
    setStatus('Checking online sources… (this can take a minute)');
    try { await api('inbox/check', { method: 'POST' }); setStatus('Online sources checked.'); }
    catch (err) { setStatus(`Check failed: ${err.message}`, 'error'); }
    $('#check-now').disabled = false;
    refresh();
  },
};

$('#checkpoint').addEventListener('click', actions.checkpoint);
$('#publish').addEventListener('click', actions.publish);
$('#check-now').addEventListener('click', actions.check);

// Open Website: start the local preview if needed, then open it
$('#open-site').addEventListener('click', async () => {
  const tab = window.open('about:blank', '_blank'); // opened now, so the browser does not block it
  if (!st?.preview.running) {
    await api('preview/start', { method: 'POST' });
    setStatus('Starting the local website…');
    for (let i = 0; i < 30 && !st?.preview.running; i++) { await new Promise((r) => setTimeout(r, 1000)); await refresh(); }
    if (!st?.preview.running) { tab?.close(); setStatus('The local website did not start. Try `npm run dev` in a terminal to see why.', 'error'); return; }
    setStatus('The local website is running.');
  }
  if (tab) tab.location = st.preview.url; else window.open(st.preview.url, '_blank');
});

// ---------- educational tools: a count on the tile (the tools have their own page, /edtools)

async function toolsMeta() {
  const { tools } = await api('tools');
  const pending = tools.filter((t) => t.changed || t.ahead).length;
  $('#tools-meta').textContent = `${tools.length} tool${tools.length === 1 ? '' : 's'}${pending ? `; ${pending} with changes not yet published` : ''}.`;
}

setStatus('');
toolsMeta();
refresh();
setInterval(refresh, 10000);
